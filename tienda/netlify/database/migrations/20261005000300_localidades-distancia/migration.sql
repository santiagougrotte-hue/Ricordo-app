-- ════════════════════════════════════════════════════════════════════
-- Zonas por LOCALIDAD y envío por distancia (integra zonas_envio.sql y pedidos_entrega.sql del dueño).
--  · La zona la define la localidad que elige el cliente: los CP de 4 dígitos se superponen
--    entre localidades de Berazategui. El CP queda en el pedido solo como parte de la dirección.
--  · Envío = (km ida y vuelta × consumo × nafta + peaje de la zona) / pedidos promedio por ruta,
--    redondeado hacia arriba. Lo calcula el servidor (OpenRouteService); si no puede, usa el costo fijo.
--  · La configuración del cálculo (ubicación de origen) es privada: nunca sale en el catálogo.
-- ════════════════════════════════════════════════════════════════════

-- ── Localidades → zona ───────────────────────────────────────────────
create table localities (
  id         smallint generated always as identity primary key,
  name       text not null,
  partido    text not null,
  zone_id    uuid not null references shipping_zones (id) on delete restrict,
  active     boolean not null default true,
  sort_order int not null default 0,
  unique (name, partido)
);
create index localities_zone_idx on localities (zone_id);

-- ── Zonas: cálculo por distancia; afuera CP y lista de localidades en texto ──
drop function zone_for_cp(text);
drop function zone_matches_cp(text[], text);
alter table shipping_zones drop constraint postal_codes_format;
drop index shipping_zones_cp_idx;
alter table shipping_zones drop column postal_codes, drop column localities;
alter table shipping_zones
  add column distance_pricing     boolean      not null default true,   -- false = costo fijo (ej.: CABA)
  add column toll_round_trip      int          not null default 0 check (toll_round_trip >= 0),
  add column avg_orders_per_route numeric(4,1) not null default 1 check (avg_orders_per_route >= 1);
alter table shipping_zones add constraint free_after_min check (free_from_boxes is null or free_from_boxes > min_boxes);

-- ── Configuración del cálculo (una sola fila, privada) ───────────────
create table shipping_config (
  id                boolean primary key default true check (id),
  origin_lat        numeric(9,6) not null,
  origin_lng        numeric(9,6) not null,
  fuel_price        int          not null check (fuel_price > 0),             -- $ por litro
  consumption_100km numeric(4,1) not null default 7 check (consumption_100km > 0),
  rounding          int          not null default 500 check (rounding >= 1),  -- redondea el envío hacia arriba
  updated_at        timestamptz  not null default now()
);
insert into shipping_config (origin_lat, origin_lng, fuel_price) values (-34.765000, -58.212000, 1700);  -- REEMPLAZAR desde el panel
create trigger t_shipcfg_touch before update on shipping_config for each row execute function touch_updated_at();

-- ── Zonas y localidades reales (costos fijos y peajes de ejemplo: se editan en el panel) ──
delete from shipping_zones;
insert into shipping_zones (name, shipping_cost, min_boxes, free_from_boxes, delivery_weekday, delivery_moment,
                            discount_per_box, discount_max, distance_pricing, sort_order) values
  ('Hudson / Plátanos / Ranelagh', 1500, 3, 4, 5, 'a la noche',  5, 10, true,  1),
  ('Berazategui',                  2500, 3, 4, 6, 'a la mañana', 5, 10, true,  2),
  ('Quilmes / Bernal / Wilde',     4500, 4, 6, 6, 'a la mañana', 5, 10, true,  3),
  ('CABA',                         5000, 5, 6, 6, 'a la mañana', 5, 10, false, 4),
  ('City Bell / La Plata',         6000, 5, 8, 0, '',            5, 10, true,  5);

insert into localities (name, partido, zone_id, sort_order)
select v.name, v.partido, z.id, v.ord
from (values
  -- Viernes a la noche
  ('Guillermo E. Hudson',  'Berazategui', 'Hudson / Plátanos / Ranelagh', 1),
  ('Plátanos',             'Berazategui', 'Hudson / Plátanos / Ranelagh', 2),
  ('Ranelagh',             'Berazategui', 'Hudson / Plátanos / Ranelagh', 3),
  ('Juan María Gutiérrez', 'Berazategui', 'Hudson / Plátanos / Ranelagh', 4),   -- CONFIRMAR
  -- Sábado a la mañana
  ('Berazategui',          'Berazategui', 'Berazategui', 5),
  ('Berazategui Oeste',    'Berazategui', 'Berazategui', 6),
  ('Villa España',         'Berazategui', 'Berazategui', 7),
  ('Sourigues',            'Berazategui', 'Berazategui', 8),
  ('Quilmes',              'Quilmes',     'Quilmes / Bernal / Wilde', 9),
  ('Quilmes Oeste',        'Quilmes',     'Quilmes / Bernal / Wilde', 10),
  ('Bernal',               'Quilmes',     'Quilmes / Bernal / Wilde', 11),
  ('Bernal Oeste',         'Quilmes',     'Quilmes / Bernal / Wilde', 12),
  ('Don Bosco',            'Quilmes',     'Quilmes / Bernal / Wilde', 13),
  ('Ezpeleta',             'Quilmes',     'Quilmes / Bernal / Wilde', 14),   -- CONFIRMAR
  ('Ezpeleta Oeste',       'Quilmes',     'Quilmes / Bernal / Wilde', 15),   -- CONFIRMAR
  ('Wilde',                'Avellaneda',  'Quilmes / Bernal / Wilde', 16),
  ('CABA',                 'CABA',        'CABA', 17),
  -- Domingo
  ('City Bell',            'La Plata',    'City Bell / La Plata', 18),
  ('Gonnet',               'La Plata',    'City Bell / La Plata', 19),
  ('La Plata',             'La Plata',    'City Bell / La Plata', 20)
) as v(name, partido, zone, ord)
join shipping_zones z on z.name = v.zone;

-- ── Pedidos ──────────────────────────────────────────────────────────
alter table orders
  add column locality_id   smallint references localities (id) on delete set null,
  add column partido       text,
  add column lat           numeric(9,6),
  add column lng           numeric(9,6),
  add column km_round_trip numeric(6,1),
  add column distance_priced boolean not null default false;   -- el envío salió del cálculo por distancia

-- ── Crear pedido (v3): zona por localidad; el envío por distancia lo calcula el servidor ──
drop function create_order(text, text, text, delivery_method, text, text, text, text, payment_method, jsonb, boolean);

-- p_distance_cost: costo calculado por la función de Netlify (nafta + peaje). null = costo fijo de la zona.
-- La base no es accesible desde el navegador, así que nadie puede mandar un costo inventado.
create function create_order(
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
begin
  select * into v_cfg from store_settings limit 1;
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
    if p_address is null or length(trim(p_address)) < 5 then
      raise exception 'Falta la dirección' using errcode = 'RC004';
    end if;
    v_cp := normalize_postal_code(p_postal_code);
    if v_cp is null then
      raise exception 'Revisá el código postal' using errcode = 'RC004';
    end if;
    v_min := v_zone.min_boxes;
    if v_boxes < v_min then
      raise exception 'No alcanza el mínimo de cajas' using errcode = 'RC003',
        detail = json_build_object('min_boxes', v_min, 'missing', v_min - v_boxes, 'boxes', v_boxes,
                                   'pickup_min_boxes', case when v_cfg.pickup_enabled then v_cfg.pickup_min_boxes end)::text;
    end if;
    if v_zone.free_from_boxes is not null and v_boxes >= v_zone.free_from_boxes then
      v_shipping := 0;
      v_pct := least(v_zone.discount_max, v_zone.discount_per_box * (v_boxes - v_zone.free_from_boxes));
    elsif v_zone.distance_pricing and p_distance_cost is not null and p_distance_cost >= 0 then
      v_shipping := p_distance_cost;
    else
      v_shipping := v_zone.shipping_cost;
    end if;
    -- El descuento va sobre las cajas (las salsas y complementos no entran).
    v_discount := round(v_box_subtotal * v_pct / 100.0)::int;
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

-- ── Caché de ubicaciones: la misma dirección no se vuelve a consultar (cuota gratuita de OpenRouteService) ──
create table geo_cache (
  key           text primary key,          -- dirección normalizada + localidad
  lat           numeric(9,6) not null,
  lng           numeric(9,6) not null,
  km_round_trip numeric(6,1) not null,
  origin        text not null,              -- origen usado ('lat,lng'): si cambia, se recalcula
  created_at    timestamptz not null default now()
);
