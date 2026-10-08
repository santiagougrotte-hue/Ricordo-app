-- Envío por localidad: cada localidad tiene sus km (ida, aproximados) y su peaje, editables en el panel.
-- El cliente elige la localidad en el checkout y manda la dirección por WhatsApp después de confirmar.
-- El envío cuida un margen mínimo (28%) en cada pedido, aunque en la salida vaya un solo cliente, con un tope ($12.000):
--   viaje = km ida y vuelta × consumo × nafta + peaje (de la localidad)
--   holgura = cajas × (margen de las cajas − margen mínimo) − viaje
--   si la holgura no alcanza, el envío cobra lo justo para llegar al mínimo; si alcanza, envío mínimo ($1.000)
--   hasta el envío gratis de la zona y después gratis. El descuento por volumen solo si no baja del mínimo.
--   Ningún envío pasa del tope (equilibrio para zonas lejanas: ahí el margen puede quedar más bajo si va un solo pedido).
alter table orders drop constraint delivery_needs_address;   -- la dirección llega por WhatsApp

alter table localities
  add column km_round_trip      numeric(5,1) check (km_round_trip is null or km_round_trip >= 0),
  add column toll_round_trip int not null default 0 check (toll_round_trip >= 0);
alter table shipping_zones add column min_fee int not null default 1000 check (min_fee >= 0);
-- Margen de las cajas después de insumos y mano de obra (promedio del CRM: 43%) y margen mínimo por pedido.
alter table shipping_config
  add column product_margin_pct int not null default 43 check (product_margin_pct between 0 and 100),
  add column min_margin_pct     int not null default 28 check (min_margin_pct between 0 and 99),
  add column max_shipping       int not null default 12000 check (max_shipping >= 0);   -- 0 = sin tope

-- Todas las zonas calculan por localidad, con envío mínimo de $1.000.
update shipping_zones set distance_pricing = true;

update localities set name = 'Berazategui Centro' where name = 'Berazategui' and partido = 'Berazategui';
update localities set name = 'Quilmes Centro' where name = 'Quilmes' and partido = 'Quilmes';
update localities set sort_order = sort_order + 2 where sort_order >= 17;
insert into localities (name, partido, zone_id, sort_order)
select v.name, 'Avellaneda', z.id, v.ord from (values ('Sarandí', 17), ('Avellaneda', 18)) as v(name, ord)
join shipping_zones z on z.name = 'Quilmes / Bernal / Wilde'
where not exists (select 1 from localities l where l.name = v.name);

-- Km ida y vuelta desde la casa del dueño (los marcados ~ son estimados: corregir en el panel) y peaje ida y vuelta
-- en hora pico (dueño, 9/10): Capital $12.000, Quilmes/Bernal $8.000. La Plata a confirmar.
update localities l set km_round_trip = v.km, toll_round_trip = v.toll
from (values
  ('Ranelagh', 12, 0), ('Ezpeleta', 11, 0), ('Plátanos', 17, 0), ('Quilmes Centro', 40, 8000), ('Quilmes Oeste', 28, 0),
  ('Bernal', 48, 8000), ('Wilde', 56, 8000), ('Sarandí', 60, 8000), ('Avellaneda', 75, 8000),
  -- ~ estimados
  ('Guillermo E. Hudson', 16, 0), ('Juan María Gutiérrez', 18, 0), ('Berazategui Centro', 8, 0), ('Berazategui Oeste', 12, 0),
  ('Villa España', 10, 0), ('Sourigues', 14, 0), ('Ezpeleta Oeste', 16, 0), ('Bernal Oeste', 36, 0), ('Don Bosco', 52, 8000),
  ('CABA', 85, 12000), ('City Bell', 60, 16000), ('Gonnet', 64, 16000), ('La Plata', 80, 16000)
) as v(name, km, toll)
where l.name = v.name;

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

  -- 3) Pedido + items
  insert into orders (customer_name, customer_phone, customer_email, delivery_method, address,
                      postal_code, postal_code_raw, zone_id, zone_name, locality_id, locality, partido, notes,
                      delivery_date, delivery_window_label, box_count, flexible_delivery,
                      lat, lng, km_round_trip, distance_priced,
                      subtotal, discount, discount_pct, shipping_cost, total, payment_method)
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
          v_subtotal, v_discount, v_pct, v_shipping, v_subtotal - v_discount + v_shipping, p_payment_method)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;

  -- 4) Descontar stock
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;

  return query select v_order.id, v_order.number, v_order.total;
end $$;
