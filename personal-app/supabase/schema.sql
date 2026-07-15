-- Mi Panel (personal-app) — Supabase schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists personal_app_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table personal_app_state enable row level security;

drop policy if exists "Authenticated read personal_app_state" on personal_app_state;
create policy "Authenticated read personal_app_state"
  on personal_app_state for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated insert personal_app_state" on personal_app_state;
create policy "Authenticated insert personal_app_state"
  on personal_app_state for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated update personal_app_state" on personal_app_state;
create policy "Authenticated update personal_app_state"
  on personal_app_state for update
  using (auth.role() = 'authenticated');

-- Enable realtime so a change on one device shows up on the other automatically.
alter publication supabase_realtime add table personal_app_state;
