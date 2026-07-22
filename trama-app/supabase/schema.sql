-- TRAMA Studio — Supabase schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists trama_app_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table trama_app_state enable row level security;

drop policy if exists "Authenticated read trama_app_state" on trama_app_state;
create policy "Authenticated read trama_app_state"
  on trama_app_state for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated insert trama_app_state" on trama_app_state;
create policy "Authenticated insert trama_app_state"
  on trama_app_state for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated update trama_app_state" on trama_app_state;
create policy "Authenticated update trama_app_state"
  on trama_app_state for update
  using (auth.role() = 'authenticated');

-- Enable realtime so a change on one device shows up on the other automatically.
alter publication supabase_realtime add table trama_app_state;
