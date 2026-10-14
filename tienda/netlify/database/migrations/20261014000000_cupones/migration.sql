-- Cupones por código. Toda la validación es del servidor: el navegador solo manda el código.
-- Las tablas nuevas llevan RLS: solo las usan las funciones del servidor (dueño de la base); nadie más las lee.

-- Celular argentino normalizado (solo dígitos, sin 54/9, sin 0 ni 15): 11 15 5555-1234 → 1155551234.
create or replace function normalize_ar_phone(p text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); a int;
begin
  if d like '54%' then d := substr(d, 3); end if;
  if d like '9%' then d := substr(d, 2); end if;
  if d like '0%' then d := substr(d, 2); end if;
  if length(d) = 12 then
    foreach a in array array[2, 3, 4] loop
      if substr(d, a + 1, 2) = '15' then d := substr(d, 1, a) || substr(d, a + 3); exit; end if;
    end loop;
  end if;
  return d;
end $$;

create table cupones (
  id                  bigint generated always as identity primary key,
  codigo              text not null unique check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo                text not null check (tipo in ('porcentaje', 'monto')),
  valor               int  not null check (valor > 0),
  compra_minima       int  check (compra_minima is null or compra_minima > 0),
  vence_el            date,                                   -- válido hasta ese día inclusive (hora de Argentina)
  usos_maximos        int  check (usos_maximos is null or usos_maximos > 0),
  usos                int  not null default 0 check (usos >= 0),
  un_uso_por_cliente  boolean not null default false,
  cliente_telefono    text,                                   -- cupón personal: normalizado con normalize_ar_phone
  activo              boolean not null default true,
  creado_el           timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100)
);

create table cupones_usos (
  id                bigint generated always as identity primary key,
  cupon_id          bigint not null references cupones (id) on delete restrict,
  pedido_id         uuid not null references orders (id) on delete cascade,
  cliente_telefono  text not null,
  monto_descontado  int  not null check (monto_descontado >= 0),
  fecha             timestamptz not null default now(),
  unique (cupon_id, pedido_id)
);
create index cupones_usos_cupon_tel_idx on cupones_usos (cupon_id, cliente_telefono);

alter table cupones enable row level security;
alter table cupones_usos enable row level security;

alter table orders
  add column coupon_code text,
  add column discount_reason text;

-- "$12.500"
create or replace function peso_ar(n int) returns text language sql immutable as
$$ select '$' || replace(to_char(n, 'FM999,999,999'), ',', '.') $$;

/**
 * Valida un cupón para un teléfono y un carrito. mensaje = null → vale, con el descuento calculado.
 *   p_subtotal: subtotal de productos (para la compra mínima) · p_base: lo que lleva descuento (sin precio especial)
 *   p_lock: true dentro de create_order (bloquea el cupón para que los usos no se pasen del máximo).
 */
create or replace function cupon_evaluar(p_codigo text, p_telefono text, p_subtotal int, p_base int, p_lock boolean default false)
returns table (cupon_id bigint, codigo text, tipo text, valor int, compra_minima int, descuento int, mensaje text)
language plpgsql set search_path = public as $$
declare c cupones; v_tel text := normalize_ar_phone(p_telefono); v_desc int;
begin
  if p_lock then
    select * into c from cupones where cupones.codigo = upper(trim(p_codigo)) for update;
  else
    select * into c from cupones where cupones.codigo = upper(trim(p_codigo));
  end if;
  if c.id is null or not c.activo then
    return query select null::bigint, null::text, null::text, null::int, null::int, 0, 'Ese cupón no existe o ya no está activo.'::text; return;
  end if;
  if c.vence_el is not null and (now() at time zone 'America/Argentina/Buenos_Aires')::date > c.vence_el then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Este cupón venció.'::text; return;
  end if;
  if c.usos_maximos is not null and c.usos >= c.usos_maximos then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Este cupón ya no tiene usos disponibles.'::text; return;
  end if;
  if c.cliente_telefono is not null or c.un_uso_por_cliente then
    if length(v_tel) < 8 then
      return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Poné tu celular para usar este cupón.'::text; return;
    end if;
  end if;
  if c.cliente_telefono is not null and c.cliente_telefono <> v_tel then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Este cupón es personal y no corresponde a este celular.'::text; return;
  end if;
  if c.un_uso_por_cliente and exists (select 1 from cupones_usos u where u.cupon_id = c.id and u.cliente_telefono = v_tel) then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Ya usaste este cupón.'::text; return;
  end if;
  if c.compra_minima is not null and p_subtotal < c.compra_minima then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, ('La compra mínima es ' || peso_ar(c.compra_minima) || '.')::text; return;
  end if;
  v_desc := case when c.tipo = 'porcentaje' then round(p_base::numeric * c.valor / 100)::int else least(c.valor, p_base) end;
  if v_desc <= 0 then
    return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, 0, 'Este cupón no aplica a los productos con precio especial.'::text; return;
  end if;
  return query select c.id, c.codigo, c.tipo, c.valor, c.compra_minima, v_desc, null::text;
end $$;

-- create_order suma el cupón (parámetro nuevo): se borra la versión anterior para que no queden dos.
drop function if exists create_order(text, text, text, delivery_method, text, text, smallint, text, payment_method, jsonb, boolean, int, numeric, numeric, numeric);

create or replace function create_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_method delivery_method, p_address text, p_postal_code text, p_locality_id smallint,
  p_notes text, p_payment_method payment_method, p_items jsonb, p_flexible boolean default false,
  p_distance_cost int default null, p_lat numeric default null, p_lng numeric default null, p_km numeric default null,
  p_coupon text default null
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql set search_path = public as $$
declare
  v_cfg store_settings; v_zone shipping_zones; v_loc localities; v_order orders; v_short jsonb;
  v_cp text; v_phone text; v_subtotal int := 0; v_boxes int := 0; v_box_subtotal int := 0;
  v_shipping int := 0; v_pct int := 0; v_discount int := 0; v_date date; v_label text; v_min int;
  v_days text[] := array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  v_ship shipping_config; v_trip int; v_slack bigint;
  v_promo_pct int := 0; v_gifts int := 0; v_promo text; v_gift products;
  v_promo_boxes int := 0; v_promo_base int := 0;
  v_cup record; v_coupon_id bigint; v_coupon_code text; v_reason text;
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
         coalesce(sum(p.price * r.quantity) filter (where p.counts_as_box), 0)::int,
         coalesce(sum(r.quantity) filter (where p.counts_as_box and p.promo_eligible), 0)::int,
         coalesce(sum(p.price * r.quantity) filter (where p.promo_eligible), 0)::int
    into v_subtotal, v_boxes, v_box_subtotal, v_promo_boxes, v_promo_base
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
  -- Los productos con precio especial propio (lasaña de lanzamiento) no suman cajas ni llevan el %.
  -- Reemplaza el descuento por cajas extra (no se suman). El envío no cambia.
  if v_cfg.promo_enabled and now() >= v_cfg.promo_starts_at and now() < v_cfg.promo_ends_at then
    select coalesce((t->>'pct')::int, 0), coalesce((t->>'gifts')::int, 0) into v_promo_pct, v_gifts
    from jsonb_array_elements(v_cfg.promo_tiers) t
    where (t->>'minBoxes')::int <= v_promo_boxes
    order by (t->>'minBoxes')::int desc limit 1;
    v_promo_pct := coalesce(v_promo_pct, 0); v_gifts := coalesce(v_gifts, 0);
    if v_promo_pct > 0 or v_gifts > 0 then
      v_promo := v_cfg.promo_name;
      v_pct := v_promo_pct;
      v_discount := round(v_promo_base::numeric * v_promo_pct / 100)::int;
    end if;
    if v_gifts > 0 then
      select * into v_gift from products where id = v_cfg.promo_gift_product_id;
      if v_gift.id is null then v_gifts := 0; end if;
    end if;
  end if;

  -- Motivo del descuento que quedó (para el pedido, el panel y la app de gestión).
  if v_discount > 0 then
    v_reason := case when v_promo is not null then 'Promo ' || v_promo else 'Descuento por cajas extra' end;
  end if;

  -- 2c) Cupón: se vuelve a validar acá (nunca se confía en lo que manda el navegador).
  -- No se suma a otros descuentos: queda el mayor. Va sobre el subtotal de productos sin envío
  -- (sin los que ya tienen precio especial).
  if nullif(trim(p_coupon), '') is not null then
    select * into v_cup from cupon_evaluar(p_coupon, v_phone, v_subtotal, v_promo_base, true);
    if v_cup.mensaje is not null then
      raise exception '%', v_cup.mensaje using errcode = 'RC007';
    end if;
    if v_cup.descuento > v_discount then
      v_discount := v_cup.descuento;
      v_pct := case when v_cup.tipo = 'porcentaje' then v_cup.valor else 0 end;
      v_promo := null; v_gifts := 0;
      v_coupon_id := v_cup.cupon_id; v_coupon_code := v_cup.codigo;
      v_reason := 'Cupón ' || v_cup.codigo;
    end if;
  end if;

  -- 3) Pedido + items
  insert into orders (customer_name, customer_phone, customer_email, delivery_method, address,
                      postal_code, postal_code_raw, zone_id, zone_name, locality_id, locality, partido, notes,
                      delivery_date, delivery_window_label, box_count, flexible_delivery,
                      lat, lng, km_round_trip, distance_priced,
                      subtotal, discount, discount_pct, shipping_cost, total, payment_method, promo_name, gift_count,
                      coupon_code, discount_reason)
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
          v_subtotal, v_discount, v_pct, v_shipping, v_subtotal - v_discount + v_shipping, p_payment_method, v_promo, v_gifts,
          v_coupon_code, v_reason)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;
  if v_gifts > 0 then
    insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
    values (v_order.id, v_gift.id, v_gift.name, v_gift.units_per_box, v_gifts, 0);
  end if;

  -- Uso del cupón, en la misma transacción que el pedido.
  if v_coupon_id is not null then
    insert into cupones_usos (cupon_id, pedido_id, cliente_telefono, monto_descontado)
    values (v_coupon_id, v_order.id, normalize_ar_phone(v_phone), v_discount);
    update cupones set usos = usos + 1 where id = v_coupon_id;
  end if;

  -- 4) Descontar stock (el regalo descuenta lo que haya: si falta, se prepara aparte)
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;
  if v_gifts > 0 then
    update products set stock = greatest(stock - v_gifts, 0) where id = v_gift.id;
  end if;

  return query select v_order.id, v_order.number, v_order.total;
end $$;
