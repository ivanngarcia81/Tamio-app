-- ============================================================================
-- Tamio · Sincronización E2 (piloto) — tabla espejo de MIEMBROS en la nube
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere haber corrido antes E1 (tabla iglesias + perfiles.church_id).
--
-- Cada fila lleva:
--  - uid        : identificador global único generado por la app (no choca
--                 entre dispositivos, a diferencia del id numérico local).
--  - church_id  : a qué iglesia pertenece (aislamiento por RLS).
--  - updated_at : para "el más nuevo gana" (last-write-wins).
--  - deleted    : borrado suave (se propaga en vez de "revivir").
-- ============================================================================

create table if not exists public.members (
  uid                       text primary key,
  church_id                 uuid not null references public.iglesias (id) on delete cascade,
  nombre                    text,
  email                     text,
  telefono                  text,
  rfc                       text,
  direccion                 text,
  etiquetas                 text default '[]',
  fecha_ingreso             text,
  notas                     text,
  activo                    int default 1,
  created_at                text,
  fecha_baja                text,
  motivo_baja               text,
  estado_membresia          text default 'activo',
  fecha_congregacion        text,
  iglesia_anterior          text,
  bautizado_agua            int default 0,
  fecha_bautismo_agua       text,
  bautizado_espiritu        int default 0,
  fecha_bautismo_espiritu   text,
  curso_membresia           int default 0,
  ministerios               text default '[]',
  ministerios_interes       text default '[]',
  instrumentos              text default '[]',
  habilidades               text default '[]',
  disponibilidad            text,
  interes_servir            int default 0,
  cargos                    text default '[]',
  historial_estados         text default '[]',
  seguimiento_revisado_en   text,
  seguimiento_notas         text default '[]',
  updated_at                timestamptz not null default now(),
  deleted                   boolean not null default false
);

create index if not exists idx_members_church_updated
  on public.members (church_id, updated_at);

-- ---------------------------------------------------------------------------
-- Seguridad por iglesia (RLS): un usuario solo ve/escribe filas de SU iglesia.
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;

drop policy if exists "members_select" on public.members;
create policy "members_select" on public.members for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "members_insert" on public.members;
create policy "members_insert" on public.members for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "members_update" on public.members;
create policy "members_update" on public.members for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "members_delete" on public.members;
create policy "members_delete" on public.members for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

-- ============================================================================
-- Después de correr esto:
-- - En Table Editor → members debe existir la tabla (vacía por ahora).
-- - La app aún no la usa; eso llega en E3 (uid/updated_at/deleted locales) y
--   E4 (motor push/pull). Este es solo el destino en la nube.
-- ============================================================================
