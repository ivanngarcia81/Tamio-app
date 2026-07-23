-- ============================================================================
-- Tamio · Sincronización CAT1 — tabla espejo de CATEGORIAS_CUSTOM
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) ya corrido.
--
-- Los movimientos referencian estas categorías por su uid global
-- (custom-<uid>), así que la referencia viaja sin ambigüedad entre equipos.
-- ============================================================================

create table if not exists public.categorias_custom (
  uid         text primary key,
  church_id   uuid not null references public.iglesias (id) on delete cascade,
  tipo        text,
  nombre      text,
  color       text,
  created_at  text,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create index if not exists idx_categorias_custom_church_updated
  on public.categorias_custom (church_id, updated_at);

alter table public.categorias_custom enable row level security;

drop policy if exists "categorias_custom_select" on public.categorias_custom;
create policy "categorias_custom_select" on public.categorias_custom for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "categorias_custom_insert" on public.categorias_custom;
create policy "categorias_custom_insert" on public.categorias_custom for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "categorias_custom_update" on public.categorias_custom;
create policy "categorias_custom_update" on public.categorias_custom for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "categorias_custom_delete" on public.categorias_custom;
create policy "categorias_custom_delete" on public.categorias_custom for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
