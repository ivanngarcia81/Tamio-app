-- ============================================================================
-- Tamio · Sincronización C1 — tablas espejo de CARTAS y SOLICITUDES en la nube
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) y E2 (members) ya corridos.
--
-- El vínculo con el miembro se guarda por `member_uid` (uid global), no por id
-- local. El enlace mutuo carta↔solicitud NO se sincroniza (queda local).
-- ============================================================================

create table if not exists public.cartas (
  uid                     text primary key,
  church_id               uuid not null references public.iglesias (id) on delete cascade,
  member_uid              text,
  numero_seq              int,
  folio                   text,
  tipo                    text,
  fecha_emision           text,
  lugar_emision           text,
  destinatario_tipo       text,
  destinatario_nombre     text,
  destinatario_direccion  text,
  asunto                  text,
  saludo                  text,
  cuerpo_html             text,
  despedida               text,
  firmas                  text default '[]',
  observaciones           text,
  estado                  text default 'borrador',
  historial_estados       text default '[]',
  entregada_a             text,
  fecha_entrega           text,
  creado_en               text,
  modificado_en           text,
  updated_at              timestamptz not null default now(),
  deleted                 boolean not null default false
);

create table if not exists public.solicitudes (
  uid                  text primary key,
  church_id            uuid not null references public.iglesias (id) on delete cascade,
  member_uid           text,
  numero_seq           int,
  folio                text,
  solicitante_externo  text,
  tipo_carta           text,
  motivo               text,
  fecha_solicitud      text,
  fecha_requerida      text,
  medio_entrega        text,
  responsable          text,
  prioridad            text default 'normal',
  estado               text default 'nueva',
  observaciones        text,
  historial_estados    text default '[]',
  creado_en            text,
  modificado_en        text,
  updated_at           timestamptz not null default now(),
  deleted              boolean not null default false
);

create index if not exists idx_cartas_church_updated on public.cartas (church_id, updated_at);
create index if not exists idx_solicitudes_church_updated on public.solicitudes (church_id, updated_at);

-- ---------------------------------------------------------------------------
-- Seguridad por iglesia (RLS) para ambas tablas.
-- ---------------------------------------------------------------------------
alter table public.cartas enable row level security;
alter table public.solicitudes enable row level security;

drop policy if exists "cartas_select" on public.cartas;
create policy "cartas_select" on public.cartas for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cartas_insert" on public.cartas;
create policy "cartas_insert" on public.cartas for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cartas_update" on public.cartas;
create policy "cartas_update" on public.cartas for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cartas_delete" on public.cartas;
create policy "cartas_delete" on public.cartas for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "solicitudes_select" on public.solicitudes;
create policy "solicitudes_select" on public.solicitudes for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "solicitudes_insert" on public.solicitudes;
create policy "solicitudes_insert" on public.solicitudes for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "solicitudes_update" on public.solicitudes;
create policy "solicitudes_update" on public.solicitudes for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "solicitudes_delete" on public.solicitudes;
create policy "solicitudes_delete" on public.solicitudes for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
