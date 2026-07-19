-- ============================================================================
-- Tamio · Sincronización TR1 — tablas espejo de TRASLADOS (salida/entrada)
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) y E2 (members) ya corridos.
--
-- Vínculo con el miembro por `member_uid` (global). En traslados_salida el
-- enlace a la carta (`carta_id`) NO se sincroniza (queda local).
-- ============================================================================

create table if not exists public.traslados_salida (
  uid                    text primary key,
  church_id              uuid not null references public.iglesias (id) on delete cascade,
  member_uid             text,
  numero_seq             int,
  folio                  text,
  fecha_solicitud        text,
  motivo                 text,
  iglesia_destino        text,
  pastor_receptor        text,
  direccion              text,
  ciudad                 text,
  region                 text,
  pais                   text,
  telefono               text,
  email                  text,
  fecha_aprobacion       text,
  aprobado_por           text,
  fecha_entrega          text,
  metodo_entrega         text,
  confirmacion_recibida  int default 0,
  fecha_confirmacion     text,
  observaciones          text,
  estado                 text default 'borrador',
  historial_estados      text default '[]',
  creado_en              text,
  modificado_en          text,
  updated_at             timestamptz not null default now(),
  deleted                boolean not null default false
);

create table if not exists public.traslados_entrada (
  uid                  text primary key,
  church_id            uuid not null references public.iglesias (id) on delete cascade,
  member_uid           text,
  numero_seq           int,
  folio                text,
  nombre               text,
  fecha_nacimiento     text,
  telefono             text,
  correo               text,
  direccion            text,
  iglesia_procedencia  text,
  pastor_anterior      text,
  direccion_anterior   text,
  fecha_emision_carta  text,
  fecha_recepcion      text,
  referencia_carta     text,
  adjunto_path         text,
  adjunto_nombre       text,
  adjunto_fecha        text,
  fecha_congregacion   text,
  fecha_entrevista     text,
  entrevistador        text,
  decision             text,
  fecha_aprobacion     text,
  observaciones        text,
  estado               text default 'recibida',
  historial_estados    text default '[]',
  creado_en            text,
  modificado_en        text,
  updated_at           timestamptz not null default now(),
  deleted              boolean not null default false
);

create index if not exists idx_ts_church_updated on public.traslados_salida (church_id, updated_at);
create index if not exists idx_te_church_updated on public.traslados_entrada (church_id, updated_at);

alter table public.traslados_salida enable row level security;
alter table public.traslados_entrada enable row level security;

drop policy if exists "ts_select" on public.traslados_salida;
create policy "ts_select" on public.traslados_salida for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "ts_insert" on public.traslados_salida;
create policy "ts_insert" on public.traslados_salida for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "ts_update" on public.traslados_salida;
create policy "ts_update" on public.traslados_salida for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "ts_delete" on public.traslados_salida;
create policy "ts_delete" on public.traslados_salida for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "te_select" on public.traslados_entrada;
create policy "te_select" on public.traslados_entrada for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "te_insert" on public.traslados_entrada;
create policy "te_insert" on public.traslados_entrada for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "te_update" on public.traslados_entrada;
create policy "te_update" on public.traslados_entrada for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "te_delete" on public.traslados_entrada;
create policy "te_delete" on public.traslados_entrada for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
