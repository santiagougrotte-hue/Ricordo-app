-- ════════════════════════════════════════════════════════════════════
-- RICORDO · Tienda + Panel — esquema (Netlify Database / Postgres)
-- Netlify aplica esta migración sola en cada deploy de producción.
-- La base NO es accesible desde el navegador: todo pasa por las funciones
-- de netlify/functions (catálogo público, crear pedido, panel con login).
-- Montos en pesos enteros (ARS). Horarios en America/Argentina/Buenos_Aires.
-- ════════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────────
create type pasta_type      as enum ('ravioles', 'sorrentinos', 'cappellacci');
create type media_kind      as enum ('photo', 'video');
create type delivery_method as enum ('delivery', 'pickup');
create type payment_method  as enum ('transfer', 'cash', 'mercadopago');
create type order_status    as enum ('new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled');
create type payment_status  as enum ('pending', 'paid', 'refunded');

-- ── Configuración de la tienda (una sola fila) ──────────────────────
create table store_settings (
  id                   boolean primary key default true check (id),   -- fuerza fila única
  pickup_enabled       boolean not null default true,
  pickup_min_order     int not null default 0 check (pickup_min_order >= 0),   -- v1: sin mínimo
  pickup_address       text not null default '',
  whatsapp_phone       text not null default '',      -- formato internacional: 5491155551234
  transfer_info        text not null default '',      -- alias/CBU que ve el cliente al confirmar
  notify_email         text,                          -- privado: a dónde llega el aviso de pedido
  mercadopago_enabled  boolean not null default false, -- v2
  updated_at           timestamptz not null default now()
);
insert into store_settings default values;

-- ── Productos ────────────────────────────────────────────────────────
create table products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name           text not null,
  pasta_type     pasta_type not null,
  filling        text not null,
  description    text not null default '',
  units_per_box  int  not null default 12 check (units_per_box = 12),   -- todas las cajas son de 12
  price          int  not null check (price >= 0),
  stock          int  not null default 0 check (stock >= 0),   -- en cajas
  low_stock_threshold int not null default 3 check (low_stock_threshold >= 0),  -- alerta en el panel
  active         boolean not null default true,
  featured       boolean not null default false,               -- "destacados" del Home
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index products_listing_idx on products (active, pasta_type, sort_order);

create table product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id) on delete cascade,
  url         text not null,          -- clave en Netlify Blobs (store product-media), servida en /media/<clave>
  kind        media_kind not null default 'photo',
  alt         text not null default '',
  sort_order  int  not null default 0,
  is_cover    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index product_media_product_idx on product_media (product_id, sort_order);
-- Una sola portada por producto
create unique index product_media_one_cover on product_media (product_id) where is_cover;

-- ── Zonas de envío ───────────────────────────────────────────────────
create table shipping_zones (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  postal_codes        text[] not null default '{}',   -- siempre 4 dígitos: {'1884','1885'}
  shipping_cost       int not null check (shipping_cost >= 0),
  min_order           int not null default 0 check (min_order >= 0),
  free_shipping_from  int check (free_shipping_from is null or free_shipping_from >= 0),
  active              boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint postal_codes_4_digits check (array_to_string(postal_codes, ',') ~ '^([0-9]{4}(,[0-9]{4})*)?$')
);
create index shipping_zones_cp_idx on shipping_zones using gin (postal_codes);

-- ── Turnos de entrega ────────────────────────────────────────────────
-- Viernes a la noche y sábado a la mañana. Editables desde el panel.
create table delivery_windows (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                                  -- "Viernes a la noche"
  weekday       smallint not null check (weekday between 0 and 6), -- 0 = domingo … 5 = viernes, 6 = sábado
  starts_at     time not null,
  ends_at       time not null,
  cutoff_hours  int not null default 24 check (cutoff_hours >= 0),  -- se puede pedir hasta N horas antes
  for_delivery  boolean not null default true,
  for_pickup    boolean not null default true,
  active        boolean not null default true,
  sort_order    int not null default 0,
  constraint window_range check (ends_at > starts_at)
);
-- Horarios a confirmar por el dueño
insert into delivery_windows (label, weekday, starts_at, ends_at, sort_order) values
  ('Viernes a la noche', 5, '20:00', '23:00', 1),
  ('Sábado a la mañana', 6, '09:00', '13:00', 2);

-- ── Pedidos ──────────────────────────────────────────────────────────
create sequence order_number_seq start 1001;

create table orders (
  id               uuid primary key default gen_random_uuid(),
  number           bigint not null unique default nextval('order_number_seq'),
  customer_name    text not null check (length(trim(customer_name)) between 2 and 120),
  customer_phone   text not null check (length(regexp_replace(customer_phone, '\D', '', 'g')) between 8 and 15),
  customer_email   text check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  delivery_method  delivery_method not null,
  address          text,                     -- obligatorio si delivery
  postal_code      text check (postal_code ~ '^[0-9]{4}$'),
  postal_code_raw  text,                     -- lo que escribió el cliente (B1884ABC)
  zone_id          uuid references shipping_zones (id) on delete set null,
  zone_name        text,                     -- copia al momento del pedido
  delivery_date    date not null,            -- día del turno elegido
  delivery_window_id uuid references delivery_windows (id) on delete set null,
  delivery_window_label text not null,       -- copia: "Viernes 9/10 a la noche · 20 a 23 h"
  notes            text check (length(notes) <= 1000),
  subtotal         int not null check (subtotal >= 0),
  shipping_cost    int not null check (shipping_cost >= 0),
  total            int not null check (total = subtotal + shipping_cost),
  payment_method   payment_method not null,
  payment_status   payment_status not null default 'pending',  -- el admin marca "pagado" a mano
  mp_preference_id text,                     -- reservado para Mercado Pago (v2)
  mp_payment_id    text,                     -- reservado para Mercado Pago (v2)
  status           order_status not null default 'new',
  stock_returned   boolean not null default false,   -- evita devolver stock dos veces
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint delivery_needs_address check (
    delivery_method = 'pickup'
    or (address is not null and postal_code is not null and zone_id is not null)
  )
);
create index orders_status_created_idx on orders (status, created_at desc);
create index orders_created_idx on orders (created_at desc);
create index orders_delivery_idx on orders (delivery_date, status);   -- "qué sale el viernes"

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders (id) on delete cascade,
  product_id     uuid not null references products (id) on delete restrict,
  product_name   text not null,        -- copia: el nombre puede cambiar después
  units_per_box  int  not null,
  quantity       int  not null check (quantity > 0),
  unit_price     int  not null check (unit_price >= 0),   -- precio al momento
  line_total     int  generated always as (quantity * unit_price) stored
);
create index order_items_order_idx on order_items (order_id);
create index order_items_product_idx on order_items (product_id);

-- ── updated_at automático ───────────────────────────────────────────
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger t_products_touch before update on products       for each row execute function touch_updated_at();
create trigger t_zones_touch    before update on shipping_zones for each row execute function touch_updated_at();
create trigger t_orders_touch   before update on orders         for each row execute function touch_updated_at();
create trigger t_settings_touch before update on store_settings for each row execute function touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- LÓGICA EN EL SERVIDOR
-- ════════════════════════════════════════════════════════════════════

-- CP: "1884", "B1884ABC", "b 1884 abc", "1884-ABC" → '1884'. Si no hay 4 dígitos → null.
create function normalize_postal_code(raw text) returns text
language sql immutable as $$
  select substring(upper(regexp_replace(coalesce(raw, ''), '[\s\-\.]', '', 'g')) from '^[A-Z]?([0-9]{4})(?:[A-Z]{3})?$');
$$;

-- Datos públicos de la tienda (sin el email de aviso).
create function store_public_settings()
returns table (pickup_enabled boolean, pickup_min_order int, pickup_address text,
               whatsapp_phone text, transfer_info text, mercadopago_enabled boolean)
language sql stable set search_path = public as $$
  select pickup_enabled, pickup_min_order, pickup_address, whatsapp_phone, transfer_info, mercadopago_enabled
  from store_settings limit 1;
$$;

-- Cotización para el carrito (informativa; el valor real lo fija create_order).
create function quote_shipping(p_postal_code text, p_subtotal int)
returns table (found boolean, postal_code text, zone_id uuid, zone_name text,
               shipping_cost int, min_order int, free_shipping_from int,
               missing_for_min int, missing_for_free int)
language sql stable set search_path = public as $$
  with cp as (select normalize_postal_code(p_postal_code) as v),
  z as (
    select sz.* from shipping_zones sz, cp
    where sz.active and cp.v is not null and cp.v = any (sz.postal_codes)
    order by sz.sort_order limit 1
  )
  select (z.id is not null), (select v from cp), z.id, z.name,
         case when z.id is null then null
              when z.free_shipping_from is not null and p_subtotal >= z.free_shipping_from then 0
              else z.shipping_cost end,
         z.min_order, z.free_shipping_from,
         greatest(coalesce(z.min_order, 0) - p_subtotal, 0),
         case when z.free_shipping_from is null then null else greatest(z.free_shipping_from - p_subtotal, 0) end
  from (select 1) one left join z on true;
$$;

-- Próximos turnos disponibles (para el checkout). Excluye los que ya cerraron.
create function available_delivery_slots(p_method delivery_method default 'delivery', p_days int default 14)
returns table (window_id uuid, delivery_date date, label text, starts_at time, ends_at time, closes_at timestamptz)
language sql stable set search_path = public as $$
  select w.id, d::date, w.label, w.starts_at, w.ends_at,
         ((d::date + w.starts_at) at time zone 'America/Argentina/Buenos_Aires') - make_interval(hours => w.cutoff_hours)
  from delivery_windows w
  cross join generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date,
                             (now() at time zone 'America/Argentina/Buenos_Aires')::date + least(greatest(p_days, 1), 60),
                             interval '1 day') d
  where w.active
    and extract(dow from d) = w.weekday
    and (case when p_method = 'delivery' then w.for_delivery else w.for_pickup end)
    and ((d::date + w.starts_at) at time zone 'America/Argentina/Buenos_Aires') - make_interval(hours => w.cutoff_hours) > now()
  order by d, w.starts_at;
$$;

-- Crear pedido: una sola transacción. Si algo falla, no se crea nada.
-- NO se llama desde el navegador: la llama la función de Netlify /api/create-order
-- después de validar el token de Cloudflare Turnstile, con la service key.
-- p_items = [{"product_id": "...", "quantity": 2}, ...]
-- Errores con código propio (el front los traduce a mensajes amables):
--   RC001 sin stock (detail = JSON con productos y stock disponible)
--   RC002 CP fuera de zona · RC003 no llega al mínimo · RC004 datos inválidos
--   RC005 método de pago o retiro no disponible · RC006 turno de entrega inválido o ya cerrado
create function create_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_method delivery_method, p_address text, p_postal_code text,
  p_notes text, p_payment_method payment_method, p_items jsonb,
  p_delivery_date date, p_delivery_window_id uuid
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql set search_path = public as $$
declare
  v_cp text; v_zone shipping_zones; v_subtotal int := 0; v_shipping int := 0;
  v_order orders; v_short jsonb; v_cfg store_settings; v_slot record;
begin
  select * into v_cfg from store_settings limit 1;
  if p_payment_method = 'mercadopago' and not v_cfg.mercadopago_enabled then
    raise exception 'Mercado Pago todavía no está disponible' using errcode = 'RC005';
  end if;
  if p_delivery_method = 'pickup' and not v_cfg.pickup_enabled then
    raise exception 'El retiro en el local no está disponible' using errcode = 'RC005';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Carrito vacío o inválido' using errcode = 'RC004';
  end if;

  -- Items agrupados por producto; cantidades enteras 1..99
  create temp table _req on commit drop as
    select (e->>'product_id')::uuid as product_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1;
  if exists (select 1 from _req where quantity is null or quantity < 1 or quantity > 99) then
    raise exception 'Cantidad inválida' using errcode = 'RC004';
  end if;

  -- 1) Bloquear las filas de producto (orden fijo → sin deadlocks) y validar stock
  perform 1 from products p join _req r on r.product_id = p.id order by p.id for update of p;

  select jsonb_agg(jsonb_build_object('product_id', r.product_id, 'name', p.name,
                   'requested', r.quantity, 'available', coalesce(p.stock, 0)))
    into v_short
  from _req r left join products p on p.id = r.product_id and p.active
  where p.id is null or p.stock < r.quantity;
  if v_short is not null then
    raise exception 'Sin stock suficiente' using errcode = 'RC001', detail = v_short::text;
  end if;

  -- 2) Recalcular precios con lo que hay en la base (nunca con lo del navegador)
  select sum(p.price * r.quantity)::int into v_subtotal
  from _req r join products p on p.id = r.product_id;

  if p_delivery_method = 'delivery' then
    v_cp := normalize_postal_code(p_postal_code);
    select * into v_zone from shipping_zones
     where active and v_cp is not null and v_cp = any (postal_codes)
     order by sort_order limit 1;
    if v_zone.id is null then
      raise exception 'No llegamos a ese código postal' using errcode = 'RC002';
    end if;
    if p_address is null or length(trim(p_address)) < 5 then
      raise exception 'Falta la dirección' using errcode = 'RC004';
    end if;
    if v_subtotal < v_zone.min_order then
      raise exception 'No alcanza la compra mínima' using errcode = 'RC003',
        detail = json_build_object('min_order', v_zone.min_order, 'missing', v_zone.min_order - v_subtotal)::text;
    end if;
    v_shipping := case when v_zone.free_shipping_from is not null and v_subtotal >= v_zone.free_shipping_from
                       then 0 else v_zone.shipping_cost end;
  elsif v_subtotal < v_cfg.pickup_min_order then
    raise exception 'No alcanza la compra mínima para retiro' using errcode = 'RC003',
      detail = json_build_object('min_order', v_cfg.pickup_min_order, 'missing', v_cfg.pickup_min_order - v_subtotal)::text;
  end if;

  -- Turno: tiene que ser uno de los disponibles ahora mismo
  select * into v_slot from available_delivery_slots(p_delivery_method, 60) s
   where s.window_id = p_delivery_window_id and s.delivery_date = p_delivery_date;
  if v_slot.window_id is null then
    raise exception 'Ese turno de entrega ya cerró o no existe' using errcode = 'RC006';
  end if;

  -- 3) Crear pedido + items
  insert into orders (customer_name, customer_phone, customer_email, delivery_method, address,
                      postal_code, postal_code_raw, zone_id, zone_name, notes,
                      delivery_date, delivery_window_id, delivery_window_label,
                      subtotal, shipping_cost, total, payment_method)
  values (trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), p_delivery_method,
          case when p_delivery_method = 'delivery' then trim(p_address) end,
          v_cp, p_postal_code, v_zone.id, v_zone.name, nullif(trim(p_notes), ''),
          p_delivery_date, v_slot.window_id,
          -- "Viernes 9/10 a la noche · 20 a 23 h" (mismo formato que la tienda)
          split_part(v_slot.label, ' ', 1) || ' ' || to_char(p_delivery_date, 'FMDD/FMMM') || ' '
            || substr(v_slot.label, length(split_part(v_slot.label, ' ', 1)) + 2) || ' · '
            || to_char(v_slot.starts_at, 'FMHH24') || ' a ' || to_char(v_slot.ends_at, 'FMHH24') || ' h',
          v_subtotal, v_shipping, v_subtotal + v_shipping, p_payment_method)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;

  -- 4) Descontar stock
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;

  return query select v_order.id, v_order.number, v_order.total;
end $$;

-- Cambiar estado (la llama solo el panel, ya autenticado en el servidor). Al cancelar devuelve el stock una sola vez.
create function set_order_status(p_order_id uuid, p_status order_status) returns orders
language plpgsql set search_path = public as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido inexistente'; end if;
  if v_order.status = 'cancelled' and p_status <> 'cancelled' then
    raise exception 'Un pedido cancelado no se reabre (crear uno nuevo)';
  end if;
  if p_status = 'cancelled' and not v_order.stock_returned then
    update products p set stock = p.stock + oi.quantity
      from order_items oi where oi.order_id = v_order.id and oi.product_id = p.id;
    update orders set stock_returned = true where id = v_order.id;
  end if;
  update orders set status = p_status where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- ── Registro de intentos (límite de logins y de pedidos por visitante) ──
create table request_log (
  kind      text not null,            -- 'login' | 'order'
  key_hash  text not null,            -- hash de la IP (no se guarda la IP)
  at        timestamptz not null default now()
);
create index request_log_idx on request_log (kind, key_hash, at desc);

-- El panel consulta cambios recientes de pedidos (en lugar de realtime).
create index orders_updated_idx on orders (updated_at desc);

