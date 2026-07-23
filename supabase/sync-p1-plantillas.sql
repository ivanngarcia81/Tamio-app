-- ============================================================================
-- Tamio · Sincronización P1 — tabla espejo de PLANTILLAS de cartas
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) ya corrido.
--
-- Cada equipo siembra sus propias plantillas iniciales; la app las deduplica
-- por nombre tras bajar (soft-delete determinista), así que aquí solo se
-- guarda el espejo tal cual.
-- ============================================================================

create table if not exists public.plantillas (
  uid            text primary key,
  church_id      uuid not null references public.iglesias (id) on delete cascade,
  nombre         text,
  tipo           text default 'personalizada',
  asunto         text,
  saludo         text,
  cuerpo_html    text default '',
  despedida      text,
  activa         int default 1,
  predeterminada int default 0,
  es_inicial     int default 0,
  creado_en      text,
  modificado_en  text,
  updated_at     timestamptz not null default now(),
  deleted        boolean not null default false
);

create index if not exists idx_plantillas_church_updated
  on public.plantillas (church_id, updated_at);

alter table public.plantillas enable row level security;

drop policy if exists "plantillas_select" on public.plantillas;
create policy "plantillas_select" on public.plantillas for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "plantillas_insert" on public.plantillas;
create policy "plantillas_insert" on public.plantillas for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "plantillas_update" on public.plantillas;
create policy "plantillas_update" on public.plantillas for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "plantillas_delete" on public.plantillas;
create policy "plantillas_delete" on public.plantillas for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
