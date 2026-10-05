-- ════════════════════════════════════════════════════════════════════
-- Zonas por cajas, descuento por volumen, cierre semanal y retiro por cajas.
--  · Mínimos y envío gratis se cuentan en CAJAS (solo productos con counts_as_box).
--  · Cada zona tiene su día de entrega; los pedidos cierran el jueves 13 h (editable).
--  · Descuento: X % por cada caja que pasa el umbral de envío gratis, con tope.
--  · Retiro en Berazategui: mínimo en cajas, sin envío, sin zona; se coordina por WhatsApp.
-- Reemplaza los turnos fijos (delivery_windows) y los mínimos en pesos.
-- ════════════════════════════════════════════════════════════════════

-- ── Productos: qué cuenta como caja (salsas y complementos no) ──────
alter table products add column counts_as_box boolean not null default true;

-- ── Ajustes: retiro por cajas y cierre semanal ──────────────────────
alter table store_settings
  add column pickup_min_boxes int not null default 2 check (pickup_min_boxes >= 0),
  add column cutoff_weekday smallint not null default 4 check (cutoff_weekday between 0 and 6),  -- 4 = jueves
  add column cutoff_time time not null default '13:00';
alter table store_settings drop column pickup_min_order;
update store_settings set pickup_address = 'Berazategui (te pasamos la dirección por WhatsApp)' where pickup_address = '';

drop function store_public_settings();
create function store_public_settings()
returns table (pickup_enabled boolean, pickup_min_boxes int, pickup_address text, whatsapp_phone text,
               transfer_info text, mercadopago_enabled boolean, cutoff_weekday smallint, cutoff_time time)
language sql stable set search_path = public as $$
  select pickup_enabled, pickup_min_boxes, pickup_address, whatsapp_phone, transfer_info, mercadopago_enabled, cutoff_weekday, cutoff_time
  from store_settings limit 1;
$$;

-- ── Zonas ────────────────────────────────────────────────────────────
drop function quote_shipping(text, int);
alter table shipping_zones drop constraint postal_codes_4_digits;
alter table shipping_zones
  add column localities       text[]   not null default '{}',             -- el cliente confirma la suya
  add column min_boxes        int      not null default 0 check (min_boxes >= 0),
  add column free_from_boxes  int      check (free_from_boxes is null or free_from_boxes >= 1),
  add column delivery_weekday smallint not null default 6 check (delivery_weekday between 0 and 6),
  add column delivery_moment  text     not null default '',               -- 'a la mañana', 'a la noche' o vacío
  add column discount_per_box int      not null default 5 check (discount_per_box between 0 and 100),  -- % por caja
  add column discount_max     int      not null default 10 check (discount_max between 0 and 100);    -- tope %
alter table shipping_zones drop column min_order, drop column free_shipping_from;
-- CP sueltos ('1884') o rangos ('1000-1499')
alter table shipping_zones add constraint postal_codes_format
  check (array_to_string(postal_codes, ',') ~ '^([0-9]{4}(-[0-9]{4})?(,[0-9]{4}(-[0-9]{4})?)*)?$');

create function zone_matches_cp(p_codes text[], p_cp text) returns boolean
language sql immutable as $$
  select p_cp is not null and exists (
    select 1 from unnest(p_codes) c
    where c = p_cp
       or (c ~ '^[0-9]{4}-[0-9]{4}$' and p_cp::int between split_part(c, '-', 1)::int and split_part(c, '-', 2)::int));
$$;

-- Primera zona activa (por orden) que incluye el CP. Sin zona → fila con id null.
create function zone_for_cp(p_postal_code text) returns shipping_zones
language sql stable set search_path = public as $$
  select * from shipping_zones
  where active and zone_matches_cp(postal_codes, normalize_postal_code(p_postal_code))
  order by sort_order, name limit 1;
$$;

-- ── Cierre y fecha de entrega (hora de Buenos Aires) ────────────────
-- Próximo cierre (hora local): el jueves 13 h de esta semana o, si ya pasó, el de la siguiente.
create function next_cutoff(p_now timestamptz default now()) returns timestamp
language sql stable set search_path = public as $$
  with s as (select cutoff_weekday w, cutoff_time t from store_settings limit 1),
       l as (select (p_now at time zone 'America/Argentina/Buenos_Aires') n),
       c as (select (l.n::date + ((s.w - extract(dow from l.n)::int + 7) % 7)) + s.t as cut from s, l)
  select case when c.cut <= l.n then c.cut + interval '7 days' else c.cut end from c, l;
$$;

-- Día de entrega de una zona: el primer <día de la zona> después del próximo cierre.
create function delivery_date_for(p_weekday smallint, p_now timestamptz default now()) returns date
language sql stable set search_path = public as $$
  select (next_cutoff(p_now)::date + (((p_weekday - s.cutoff_weekday + 6) % 7) + 1))::date
  from store_settings s limit 1;
$$;

-- ── Pedidos ──────────────────────────────────────────────────────────
alter table orders
  add column locality          text,
  add column box_count         int  not null default 0 check (box_count >= 0),
  add column discount          int  not null default 0 check (discount >= 0),
  add column discount_pct      int  not null default 0 check (discount_pct between 0 and 100),
  add column flexible_delivery boolean not null default false,   -- "si pasamos antes, ¿te lo llevamos otro día?"
  add column delivered_on      date;                              -- fecha real de entrega (la carga el admin)
alter table orders alter column delivery_date drop not null;      -- retiro: se coordina por WhatsApp
alter table orders drop constraint orders_check;
alter table orders add constraint orders_total_check check (total = subtotal - discount + shipping_cost);
-- La zona puede borrarse después (zone_id queda null): el pedido conserva zone_name.
alter table orders drop constraint delivery_needs_address;
alter table orders add constraint delivery_needs_address
  check (delivery_method = 'pickup' or (address is not null and postal_code is not null));
alter table orders drop column delivery_window_id;
update orders o set box_count = coalesce((select sum(quantity) from order_items where order_id = o.id), 0);
update orders set customer_phone = regexp_replace(customer_phone, '\D', '', 'g');

drop function available_delivery_slots(delivery_method, int);
drop table delivery_windows;

-- ── Crear pedido ─────────────────────────────────────────────────────
-- Misma idea que antes: una sola transacción, precios y totales calculados acá.
-- Errores: RC001 sin stock · RC002 CP fuera de zona · RC003 no llega al mínimo de cajas
--          RC004 datos inválidos · RC005 método de pago o retiro no disponible
drop function create_order(text, text, text, delivery_method, text, text, text, payment_method, jsonb, date, uuid);

create function create_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_method delivery_method, p_address text, p_postal_code text, p_locality text,
  p_notes text, p_payment_method payment_method, p_items jsonb, p_flexible boolean default false
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql set search_path = public as $$
declare
  v_cfg store_settings; v_zone shipping_zones; v_order orders; v_short jsonb;
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

  -- 2) Montos y cajas con lo que hay en la base (nunca con lo del navegador)
  select coalesce(sum(p.price * r.quantity), 0)::int,
         coalesce(sum(r.quantity) filter (where p.counts_as_box), 0)::int,
         coalesce(sum(p.price * r.quantity) filter (where p.counts_as_box), 0)::int
    into v_subtotal, v_boxes, v_box_subtotal
  from _req r join products p on p.id = r.product_id;

  if p_delivery_method = 'delivery' then
    v_cp := normalize_postal_code(p_postal_code);
    v_zone := zone_for_cp(v_cp);
    if v_zone.id is null then
      raise exception 'No llegamos a ese código postal' using errcode = 'RC002';
    end if;
    if p_address is null or length(trim(p_address)) < 5 then
      raise exception 'Falta la dirección' using errcode = 'RC004';
    end if;
    if cardinality(v_zone.localities) > 0 and not (coalesce(trim(p_locality), '') = any (v_zone.localities)) then
      raise exception 'Elegí tu localidad' using errcode = 'RC004';
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
    else
      v_shipping := v_zone.shipping_cost;
    end if;
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
                      postal_code, postal_code_raw, zone_id, zone_name, locality, notes,
                      delivery_date, delivery_window_label, box_count, flexible_delivery,
                      subtotal, discount, discount_pct, shipping_cost, total, payment_method)
  values (trim(p_customer_name), v_phone, nullif(trim(p_customer_email), ''), p_delivery_method,
          case when p_delivery_method = 'delivery' then trim(p_address) end,
          v_cp, case when p_delivery_method = 'delivery' then p_postal_code end,
          v_zone.id, v_zone.name,
          case when p_delivery_method = 'delivery' then nullif(trim(p_locality), '') end,
          nullif(trim(p_notes), ''),
          v_date, v_label, v_boxes, p_delivery_method = 'delivery' and coalesce(p_flexible, false),
          v_subtotal, v_discount, v_pct, v_shipping, v_subtotal - v_discount + v_shipping, p_payment_method)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;

  -- 4) Descontar stock
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;

  return query select v_order.id, v_order.number, v_order.total;
end $$;

-- ── Zonas reales (costos de envío de ejemplo: se editan en el panel) ──
delete from shipping_zones;
insert into shipping_zones (name, postal_codes, localities, shipping_cost, min_boxes, free_from_boxes,
                            delivery_weekday, delivery_moment, discount_per_box, discount_max, sort_order) values
  ('Hudson / Plátanos',             '{1885,1880}',       '{Hudson,Plátanos}',                      2000, 3, 4, 5, 'a la noche',  5, 10, 1),
  ('Berazategui',                   '{1884,1886}',       '{Berazategui,Ranelagh,Sourigues,Villa España}', 1500, 3, 4, 6, 'a la mañana', 5, 10, 2),
  ('Quilmes / Bernal / Wilde',      '{1878,1876,1875}',  '{Quilmes,Bernal,Wilde}',                 3000, 4, 6, 6, 'a la mañana', 5, 10, 3),
  ('CABA',                          '{1000-1499}',       '{"Ciudad de Buenos Aires"}',             5000, 5, 6, 6, 'a la mañana', 5, 10, 4),
  ('La Plata / City Bell / Gonnet', '{1900,1896,1897}',  '{"La Plata","City Bell","Gonnet"}',      5000, 5, 8, 0, '',            5, 10, 5);
