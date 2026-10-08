-- Ricordo — Fase 0: concurrencia optimista + historial de auditoría
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto de Supabase, después de supabase/schema.sql.
-- 100% aditivo: no borra ni modifica ninguna fila existente de app_state.

-- 1) Columna de versión para escritura condicionada (evita que un guardado viejo pise uno nuevo
--    sin darse cuenta). Arranca en 1 para la fila que ya existe.
alter table app_state add column if not exists version integer not null default 1;

-- 2) Historial de auditoría: una fila por cada guardado confirmado. Permite responder "¿por qué
--    cambió este dato?" y, si hiciera falta, volver a una versión anterior.
create table if not exists app_state_history (
  id bigint generated always as identity primary key,
  app_state_id text not null references app_state(id),
  version integer not null,
  data jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by text
);

create index if not exists app_state_history_app_state_id_version_idx
  on app_state_history (app_state_id, version desc);

alter table app_state_history enable row level security;

drop policy if exists "Authenticated read app_state_history" on app_state_history;
create policy "Authenticated read app_state_history"
  on app_state_history for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated insert app_state_history" on app_state_history;
create policy "Authenticated insert app_state_history"
  on app_state_history for insert
  with check (auth.role() = 'authenticated');

-- No hace falta Realtime en el historial (se lee bajo demanda), no se agrega a la publicación.
