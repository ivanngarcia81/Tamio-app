-- ============================================================================
-- Tamio · Sincronización A1 — tabla espejo de ACTAS en la nube
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias + perfiles.church_id) ya corrido.
-- Las actas son texto independiente (sin vínculos externos).
-- ============================================================================

create table if not exists public.actas (
  uid                text primary key,
  church_id          uuid not null references public.iglesias (id) on delete cascade,
  folio              text,
  tipo               text,
  titulo             text,
  fecha              text,
  hora_inicio        text,
  hora_cierre        text,
  lugar              text,
  preside            text,
  secretario         text,
  presentes          text default '[]',
  ausentes           text default '[]',
  invitados          text default '[]',
  quorum             int default 0,
  agenda             text,
  resumen            text,
  mociones           text default '[]',
  acuerdos           text default '[]',
  estado             text default 'borrador',
  confidencial       int default 0,
  fecha_aprobacion   text,
  creado_en          text,
  updated_at         timestamptz not null default now(),
  deleted            boolean not null default false
);

create index if not exists idx_actas_church_updated
  on public.actas (church_id, updated_at);

alter table public.actas enable row level security;

drop policy if exists "actas_select" on public.actas;
create policy "actas_select" on public.actas for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "actas_insert" on public.actas;
create policy "actas_insert" on public.actas for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "actas_update" on public.actas;
create policy "actas_update" on public.actas for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "actas_delete" on public.actas;
create policy "actas_delete" on public.actas for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
