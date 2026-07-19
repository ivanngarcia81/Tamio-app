-- ============================================================================
-- Tamio · Sincronización D1 — tabla espejo de DEPÓSITOS BANCARIOS en la nube
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias + perfiles.church_id) ya corrido.
-- Los depósitos no tienen vínculos externos, así que el mapeo es directo.
-- ============================================================================

create table if not exists public.depositos_bancarios (
  uid                text primary key,
  church_id          uuid not null references public.iglesias (id) on delete cascade,
  fecha              text,
  periodo            text,
  monto              double precision,
  moneda             text,
  cuenta_banco       text,
  referencia         text,
  comprobante_path   text,
  notas              text,
  created_at         text,
  updated_at         timestamptz not null default now(),
  deleted            boolean not null default false
);

create index if not exists idx_depositos_church_updated
  on public.depositos_bancarios (church_id, updated_at);

alter table public.depositos_bancarios enable row level security;

drop policy if exists "dep_select" on public.depositos_bancarios;
create policy "dep_select" on public.depositos_bancarios for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "dep_insert" on public.depositos_bancarios;
create policy "dep_insert" on public.depositos_bancarios for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "dep_update" on public.depositos_bancarios;
create policy "dep_update" on public.depositos_bancarios for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "dep_delete" on public.depositos_bancarios;
create policy "dep_delete" on public.depositos_bancarios for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
