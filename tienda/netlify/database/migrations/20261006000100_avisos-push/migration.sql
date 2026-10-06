-- Notificaciones push al celular del dueño (Web Push), aunque el panel esté cerrado.
-- Las claves VAPID se generan solas la primera vez; la privada nunca sale del servidor.
create table push_config (
  id          boolean primary key default true check (id),
  public_key  text not null,
  private_key text not null
);

-- Un registro por celular/navegador donde activaste los avisos.
create table push_subscriptions (
  endpoint    text primary key check (endpoint like 'https://%'),
  p256dh      text not null,
  auth        text not null,
  label       text not null default '',
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
