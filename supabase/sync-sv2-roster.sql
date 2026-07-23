-- ============================================================================
-- Tamio · Sincronización SV2 — tabla espejo del ROSTER de asistencia
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias), E2 (members) y SV1 (servicios) ya corridos.
--
-- Tabla de unión servicio↔miembro. Se enlaza por los uid globales
-- (servicio_uid, member_uid), no por el id local, que difiere entre equipos.
-- La app mapea id local → uid al subir y uid → id local al bajar.
-- ============================================================================

create table if not exists public.servicio_asistencia (
  uid             text primary key,
  church_id       uuid not null references public.iglesias (id) on delete cascade,
  servicio_uid    text,
  member_uid      text,
  presente        int default 0,
  razon           text,
  razon_otra      text,
  seguimiento     int default 0,
  nombre_snapshot text,
  updated_at      timestamptz not null default now(),
  deleted         boolean not null default false
);

create index if not exists idx_roster_church_updated
  on public.servicio_asistencia (church_id, updated_at);

alter table public.servicio_asistencia enable row level security;

drop policy if exists "roster_select" on public.servicio_asistencia;
create policy "roster_select" on public.servicio_asistencia for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "roster_insert" on public.servicio_asistencia;
create policy "roster_insert" on public.servicio_asistencia for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "roster_update" on public.servicio_asistencia;
create policy "roster_update" on public.servicio_asistencia for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "roster_delete" on public.servicio_asistencia;
create policy "roster_delete" on public.servicio_asistencia for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
