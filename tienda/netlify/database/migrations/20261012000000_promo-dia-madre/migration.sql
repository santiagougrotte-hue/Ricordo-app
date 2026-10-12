-- Promo Día de la Madre (domingo 18/10/2026):
--   desde 3 cajas 10% sobre el total de la compra · desde 4 cajas 15% + 1 salsa de regalo · desde 5 cajas 15% + 2 salsas.
-- Se prende/apaga desde Ajustes y se apaga sola al terminar el domingo 18.

alter table store_settings
  add column promo_enabled boolean not null default true,
  add column promo_name text not null default 'Día de la Madre',
  add column promo_starts_at timestamptz not null default '2026-10-01 00:00-03',
  add column promo_ends_at timestamptz not null default '2026-10-19 00:00-03',
  add column promo_tiers jsonb not null default '[{"minBoxes":3,"pct":10,"gifts":0},{"minBoxes":4,"pct":15,"gifts":1},{"minBoxes":5,"pct":15,"gifts":2}]',
  add column promo_gift_product_id uuid references products (id) on delete set null;

update store_settings set promo_gift_product_id = '00000000-0000-4000-8000-000000000020'
where exists (select 1 from products where id = '00000000-0000-4000-8000-000000000020');

alter table orders
  add column promo_name text,
  add column gift_count int not null default 0 check (gift_count >= 0);

create or replace function create_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_method delivery_method, p_address text, p_postal_code text, p_locality_id smallint,
  p_notes text, p_payment_method payment_method, p_items jsonb, p_flexible boolean default false,
  p_distance_cost int default null, p_lat numeric default null, p_lng numeric default null, p_km numeric default null
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql set search_path = public as $$
declare
  v_cfg store_settings; v_zone shipping_zones; v_loc localities; v_order orders; v_short jsonb;
  v_cp text; v_phone text; v_subtotal int := 0; v_boxes int := 0; v_box_subtotal int := 0;
  v_shipping int := 0; v_pct int := 0; v_discount int := 0; v_date date; v_label text; v_min int;
  v_days text[] := array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  v_ship shipping_config; v_trip int; v_slack bigint;
  v_promo_pct int := 0; v_gifts int := 0; v_promo text; v_gift products;
begin
  select * into v_cfg from store_settings limit 1;
  select * into v_ship from shipping_config limit 1;
  if p_payment_method = 'mercadopago' and not v_cfg.mercadopago_enabled then
    raise exception 'Mercado Pago todavía no está disponible' using errcode = 'RC005';
  end if;
  if p_delivery_method = 'pickup' and not v_cfg.pickup_enabled then
    raise exception 'El retiro no está disponible' using errcode = 'RC005';
  end if;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');   -- se guarda solo con números
  if length(v_phone) not between 8 and 15 then
    raise exception 'Teléfono inválido' using errcode = 'RC004';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Carrito vacío o inválido' using errcode = 'RC004';
  end if;
  create temp table _req on commit drop as
    select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1;
  if exists (select 1 from _req where quantity is null or quantity < 1 or quantity > 99) then
    raise exception 'Cantidad inválida' using errcode = 'RC004';
  end if;

  -- 1) Bloquear productos (orden fijo → sin deadlocks) y validar stock
  perform 1 from products p join _req r on r.product_id = p.id order by p.id for update of p;
  select jsonb_agg(jsonb_build_object('product_id', r.product_id, 'name', p.name,
                   'requested', r.quantity, 'available', coalesce(p.stock, 0)))
    into v_short
  from _req r left join products p on p.id = r.product_id and p.active
  where p.id is null or p.stock < r.quantity;
  if v_short is not null then
    raise exception 'Sin stock suficiente' using errcode = 'RC001', detail = v_short::text;
  end if;

  -- 2) Montos y cajas con lo que hay en la base
  select coalesce(sum(p.price * r.quantity), 0)::int,
         coalesce(sum(r.quantity) filter (where p.counts_as_box), 0)::int,
         coalesce(sum(p.price * r.quantity) filter (where p.counts_as_box), 0)::int
    into v_subtotal, v_boxes, v_box_subtotal
  from _req r join products p on p.id = r.product_id;

  if p_delivery_method = 'delivery' then
    select l.* into v_loc from localities l join shipping_zones z on z.id = l.zone_id
     where l.id = p_locality_id and l.active and z.active;
    if v_loc.id is null then
      raise exception 'Todavía no llegamos a esa localidad' using errcode = 'RC002';
    end if;
    select * into v_zone from shipping_zones where id = v_loc.zone_id;
    -- La dirección la manda el cliente por WhatsApp después de confirmar (opcional acá).
    v_cp := normalize_postal_code(p_postal_code);
    v_min := v_zone.min_boxes;
    if v_boxes < v_min then
      raise exception 'No alcanza el mínimo de cajas' using errcode = 'RC003',
        detail = json_build_object('min_boxes', v_min, 'missing', v_min - v_boxes, 'boxes', v_boxes,
                                   'pickup_min_boxes', case when v_cfg.pickup_enabled then v_cfg.pickup_min_boxes end)::text;
    end if;
    if v_zone.distance_pricing and v_ship.pricing_mode = 'boxes' and v_loc.km_round_trip is not null then
      -- Margen mínimo por pedido, aunque vaya un solo cliente. Cuentas enteras (× 100) para que el carrito dé igual.
      v_trip := round(v_loc.km_round_trip * v_ship.consumption_100km / 100 * v_ship.fuel_price + v_loc.toll_round_trip)::int;
      v_slack := (v_ship.product_margin_pct - v_ship.min_margin_pct)::bigint * v_box_subtotal - 100::bigint * v_trip;
      if v_slack < 0 then
        -- el margen de las cajas no cubre el viaje: el envío cobra lo justo para llegar al mínimo
        v_shipping := greatest(v_zone.min_fee,
          (ceil(-v_slack::numeric / ((100 - v_ship.min_margin_pct) * v_ship.rounding)) * v_ship.rounding)::int);
        if v_ship.max_shipping > 0 then v_shipping := greatest(v_zone.min_fee, least(v_shipping, v_ship.max_shipping)); end if;
      elsif v_zone.free_from_boxes is null or v_boxes < v_zone.free_from_boxes then
        v_shipping := v_zone.min_fee;   -- lo cubre, pero hasta el envío gratis se cobra el mínimo (conviene sumar cajas)
      else
        v_shipping := 0;
        v_pct := least(v_zone.discount_max, v_zone.discount_per_box * (v_boxes - v_zone.free_from_boxes));
        if v_pct > 0 then
          v_discount := round(v_box_subtotal::numeric * (v_boxes - v_zone.free_from_boxes) * v_pct / (v_boxes * 100))::int;
          if v_discount::bigint * (100 - v_ship.min_margin_pct) > v_slack then
            v_pct := 0; v_discount := 0;   -- el descuento bajaría el margen del mínimo
          end if;
        end if;
      end if;
    elsif v_zone.free_from_boxes is not null and v_boxes >= v_zone.free_from_boxes then
      v_shipping := 0;
      v_pct := least(v_zone.discount_max, v_zone.discount_per_box * (v_boxes - v_zone.free_from_boxes));
      -- El descuento va solo sobre las cajas extra, a precio promedio de caja (las salsas no entran).
      if v_pct > 0 then
        v_discount := round(v_box_subtotal::numeric * (v_boxes - v_zone.free_from_boxes) * v_pct / (v_boxes * 100))::int;
      end if;
    elsif v_zone.distance_pricing and p_distance_cost is not null and p_distance_cost >= 0 then
      v_shipping := p_distance_cost;
    else
      v_shipping := v_zone.shipping_cost;
    end if;
    v_date := delivery_date_for(v_zone.delivery_weekday);
    v_label := v_days[extract(dow from v_date)::int + 1] || ' ' || to_char(v_date, 'FMDD/FMMM')
               || case when v_zone.delivery_moment <> '' then ' ' || v_zone.delivery_moment else '' end;
  else
    v_min := v_cfg.pickup_min_boxes;
    if v_boxes < v_min then
      raise exception 'No alcanza el mínimo de cajas para retiro' using errcode = 'RC003',
        detail = json_build_object('min_boxes', v_min, 'missing', v_min - v_boxes, 'boxes', v_boxes)::text;
    end if;
    v_label := 'Retiro en Berazategui · día y horario a coordinar por WhatsApp';
  end if;

  -- 2b) Promo (Día de la Madre): % sobre el total de los productos + salsas de regalo, según cajas.
  -- Reemplaza el descuento por cajas extra (no se suman). El envío no cambia.
  if v_cfg.promo_enabled and now() >= v_cfg.promo_starts_at and now() < v_cfg.promo_ends_at then
    select coalesce((t->>'pct')::int, 0), coalesce((t->>'gifts')::int, 0) into v_promo_pct, v_gifts
    from jsonb_array_elements(v_cfg.promo_tiers) t
    where (t->>'minBoxes')::int <= v_boxes
    order by (t->>'minBoxes')::int desc limit 1;
    v_promo_pct := coalesce(v_promo_pct, 0); v_gifts := coalesce(v_gifts, 0);
    if v_promo_pct > 0 or v_gifts > 0 then
      v_promo := v_cfg.promo_name;
      v_pct := v_promo_pct;
      v_discount := round(v_subtotal::numeric * v_promo_pct / 100)::int;
    end if;
    if v_gifts > 0 then
      select * into v_gift from products where id = v_cfg.promo_gift_product_id;
      if v_gift.id is null then v_gifts := 0; end if;
    end if;
  end if;

  -- 3) Pedido + items
  insert into orders (customer_name, customer_phone, customer_email, delivery_method, address,
                      postal_code, postal_code_raw, zone_id, zone_name, locality_id, locality, partido, notes,
                      delivery_date, delivery_window_label, box_count, flexible_delivery,
                      lat, lng, km_round_trip, distance_priced,
                      subtotal, discount, discount_pct, shipping_cost, total, payment_method, promo_name, gift_count)
  values (trim(p_customer_name), v_phone, nullif(trim(p_customer_email), ''), p_delivery_method,
          case when p_delivery_method = 'delivery' then trim(p_address) end,
          v_cp, case when p_delivery_method = 'delivery' then p_postal_code end,
          v_zone.id, v_zone.name, v_loc.id, v_loc.name, v_loc.partido,
          nullif(trim(p_notes), ''),
          v_date, v_label, v_boxes, p_delivery_method = 'delivery' and coalesce(p_flexible, false),
          case when p_delivery_method = 'delivery' then p_lat end,
          case when p_delivery_method = 'delivery' then p_lng end,
          case when p_delivery_method = 'delivery' then p_km end,
          p_delivery_method = 'delivery' and v_shipping > 0 and v_zone.distance_pricing and p_distance_cost is not null,
          v_subtotal, v_discount, v_pct, v_shipping, v_subtotal - v_discount + v_shipping, p_payment_method, v_promo, v_gifts)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;
  if v_gifts > 0 then
    insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
    values (v_order.id, v_gift.id, v_gift.name, v_gift.units_per_box, v_gifts, 0);
  end if;

  -- 4) Descontar stock (el regalo descuenta lo que haya: si falta, se prepara aparte)
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;
  if v_gifts > 0 then
    update products set stock = greatest(stock - v_gifts, 0) where id = v_gift.id;
  end if;

  return query select v_order.id, v_order.number, v_order.total;
end $$;
