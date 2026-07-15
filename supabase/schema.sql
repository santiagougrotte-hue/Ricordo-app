-- Ricordo Pasta — Supabase schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists app_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

drop policy if exists "Authenticated read app_state" on app_state;
create policy "Authenticated read app_state"
  on app_state for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated insert app_state" on app_state;
create policy "Authenticated insert app_state"
  on app_state for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated update app_state" on app_state;
create policy "Authenticated update app_state"
  on app_state for update
  using (auth.role() = 'authenticated');

-- Enable realtime so a change on one device shows up on the other automatically.
alter publication supabase_realtime add table app_state;
