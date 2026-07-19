-- ============================================================================
-- Tamio · Sincronización SV1 — tabla espejo de SERVICIOS (registro de cultos)
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) ya corrido.
--
-- Solo el registro del culto (fecha, quién dirige/predica, mensaje, conteos,
-- visitantes). El roster por miembro (servicio_asistencia) NO se sincroniza:
-- es una tabla de unión con clave compuesta, pendiente aparte.
-- ============================================================================

create table if not exists public.servicios (
  uid                text primary key,
  church_id          uuid not null references public.iglesias (id) on delete cascade,
  fecha              text,
  tipo               text,
  dirige             text,
  predica            text,
  titulo_mensaje     text,
  texto_biblico      text,
  resumen_mensaje    text,
  participaciones    text default '[]',
  tema_escuela       text,
  maestro_escuela    text,
  asistentes         text default '[]',
  ausentes           text default '[]',
  visitantes         text default '[]',
  ninos              int default 0,
  jovenes            int default 0,
  adultos            int default 0,
  eventos            text,
  creado_en          text,
  updated_at         timestamptz not null default now(),
  deleted            boolean not null default false
);

create index if not exists idx_servicios_church_updated
  on public.servicios (church_id, updated_at);

alter table public.servicios enable row level security;

drop policy if exists "servicios_select" on public.servicios;
create policy "servicios_select" on public.servicios for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "servicios_insert" on public.servicios;
create policy "servicios_insert" on public.servicios for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "servicios_update" on public.servicios;
create policy "servicios_update" on public.servicios for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "servicios_delete" on public.servicios;
create policy "servicios_delete" on public.servicios for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
