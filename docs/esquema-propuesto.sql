-- ════════════════════════════════════════════════════════════════════
-- RICORDO · Tienda + Panel admin — ESQUEMA PROPUESTO (v2)
-- ⚠️  PROPUESTA PARA REVISAR. Todavía no se ejecutó en ningún proyecto.
--     Ver docs/esquema-db.md para el resumen y las preguntas abiertas.
-- Montos en pesos enteros (ARS, sin centavos).
-- ════════════════════════════════════════════════════════════════════

-- ── Tipos ────────────────────────────────────────────────────────────
create type pasta_type      as enum ('ravioles', 'sorrentinos', 'cappellacci');
create type media_kind      as enum ('photo', 'video');
create type delivery_method as enum ('delivery', 'pickup');
create type payment_method  as enum ('transfer', 'cash', 'mercadopago');
create type order_status    as enum ('new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled');
create type payment_status  as enum ('pending', 'paid', 'refunded');

-- ── Admins ───────────────────────────────────────────────────────────
-- "Logueado" no alcanza: si alguien se registra en Auth sería "authenticated".
-- Solo los user_id de esta tabla son admin. (Además: desactivar signups en Auth.)
create table admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ── Configuración de la tienda (una sola fila) ──────────────────────
create table store_settings (
  id                   boolean primary key default true check (id),   -- fuerza fila única
  pickup_enabled       boolean not null default true,
  pickup_min_order     int not null default 0 check (pickup_min_order >= 0),   -- v1: sin mínimo
  pickup_address       text not null default '',
  whatsapp_phone       text not null default '',      -- formato internacional: 5491155551234
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
  units_per_box  int  not null check (units_per_box > 0),
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
  url         text not null,          -- path en Storage (bucket product-media)
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
               whatsapp_phone text, mercadopago_enabled boolean)
language sql stable security definer set search_path = public as $$
  select pickup_enabled, pickup_min_order, pickup_address, whatsapp_phone, mercadopago_enabled
  from store_settings limit 1;
$$;

-- Cotización para el carrito (informativa; el valor real lo fija create_order).
create function quote_shipping(p_postal_code text, p_subtotal int)
returns table (found boolean, postal_code text, zone_id uuid, zone_name text,
               shipping_cost int, min_order int, free_shipping_from int,
               missing_for_min int, missing_for_free int)
language sql stable security definer set search_path = public as $$
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

-- Crear pedido: una sola transacción. Si algo falla, no se crea nada.
-- NO se llama desde el navegador: la llama la función de Netlify /api/create-order
-- después de validar el token de Cloudflare Turnstile, con la service key.
-- p_items = [{"product_id": "...", "quantity": 2}, ...]
-- Errores con código propio (el front los traduce a mensajes amables):
--   RC001 sin stock (detail = JSON con productos y stock disponible)
--   RC002 CP fuera de zona · RC003 no llega al mínimo · RC004 datos inválidos
--   RC005 método de pago o retiro no disponible
create function create_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_method delivery_method, p_address text, p_postal_code text,
  p_notes text, p_payment_method payment_method, p_items jsonb
) returns table (order_id uuid, order_number bigint, total int)
language plpgsql security definer set search_path = public as $$
declare
  v_cp text; v_zone shipping_zones; v_subtotal int := 0; v_shipping int := 0;
  v_order orders; v_short jsonb; v_cfg store_settings;
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

  -- 3) Crear pedido + items
  insert into orders (customer_name, customer_phone, customer_email, delivery_method, address,
                      postal_code, postal_code_raw, zone_id, zone_name, notes,
                      subtotal, shipping_cost, total, payment_method)
  values (trim(p_customer_name), trim(p_customer_phone), nullif(trim(p_customer_email), ''), p_delivery_method,
          case when p_delivery_method = 'delivery' then trim(p_address) end,
          v_cp, p_postal_code, v_zone.id, v_zone.name, nullif(trim(p_notes), ''),
          v_subtotal, v_shipping, v_subtotal + v_shipping, p_payment_method)
  returning * into v_order;

  insert into order_items (order_id, product_id, product_name, units_per_box, quantity, unit_price)
  select v_order.id, p.id, p.name, p.units_per_box, r.quantity, p.price
  from _req r join products p on p.id = r.product_id;

  -- 4) Descontar stock
  update products p set stock = p.stock - r.quantity from _req r where p.id = r.product_id;

  return query select v_order.id, v_order.number, v_order.total;
end $$;

-- Cambiar estado (solo admin). Al cancelar devuelve el stock una sola vez.
create function set_order_status(p_order_id uuid, p_status order_status) returns orders
language plpgsql security definer set search_path = public as $$
declare v_order orders;
begin
  if not is_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
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

-- ════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
alter table admins         enable row level security;
alter table store_settings enable row level security;
alter table products       enable row level security;
alter table product_media  enable row level security;
alter table shipping_zones enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;

-- Público (anon): solo lectura de lo activo
create policy products_public_read on products for select using (active);
create policy media_public_read    on product_media for select
  using (exists (select 1 from products p where p.id = product_id and p.active));
create policy zones_public_read    on shipping_zones for select using (active);

-- Admin: todo
create policy admins_self_read     on admins         for select using (user_id = auth.uid());
create policy products_admin_all   on products       for all using (is_admin()) with check (is_admin());
create policy media_admin_all      on product_media  for all using (is_admin()) with check (is_admin());
create policy zones_admin_all      on shipping_zones for all using (is_admin()) with check (is_admin());
create policy settings_admin_all   on store_settings for all using (is_admin()) with check (is_admin());
create policy orders_admin_all     on orders         for all using (is_admin()) with check (is_admin());
create policy items_admin_all      on order_items    for all using (is_admin()) with check (is_admin());

-- Nadie inserta directo en orders/order_items. create_order() solo la ejecuta el servidor
-- (service_role, desde la función de Netlify que valida Turnstile): un bot con la anon key
-- no puede crear pedidos ni vaciar el stock.
revoke all on function create_order(text, text, text, delivery_method, text, text, text, payment_method, jsonb) from public, anon, authenticated;
grant execute on function create_order(text, text, text, delivery_method, text, text, text, payment_method, jsonb) to service_role;
grant execute on function store_public_settings()          to anon, authenticated;
grant execute on function quote_shipping(text, int)       to anon, authenticated;
grant execute on function normalize_postal_code(text)     to anon, authenticated;
revoke all on function set_order_status(uuid, order_status) from public, anon;
grant execute on function set_order_status(uuid, order_status) to authenticated;

-- ── Realtime: pedidos nuevos en el panel (RLS filtra: solo admin los recibe)
alter publication supabase_realtime add table orders;

-- ── Storage: fotos/videos públicos de lectura, escritura solo admin
insert into storage.buckets (id, name, public) values ('product-media', 'product-media', true)
  on conflict (id) do nothing;
create policy media_bucket_admin_write on storage.objects for insert
  with check (bucket_id = 'product-media' and is_admin());
create policy media_bucket_admin_update on storage.objects for update
  using (bucket_id = 'product-media' and is_admin());
create policy media_bucket_admin_delete on storage.objects for delete
  using (bucket_id = 'product-media' and is_admin());
