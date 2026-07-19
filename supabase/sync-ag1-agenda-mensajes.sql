-- ============================================================================
-- Tamio · Sincronización AG1/MSG1 — tablas espejo de AGENDA y MENSAJES
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias) y E2 (members) ya corridos.
--
-- Agenda: el responsable puede ser un miembro (member_uid global). Mensajes:
-- buzón interno entre roles, sin vínculos.
-- ============================================================================

create table if not exists public.agenda (
  uid                     text primary key,
  church_id               uuid not null references public.iglesias (id) on delete cascade,
  member_uid              text,
  nombre                  text,
  tipo                    text,
  tipo_personalizado      text,
  fecha                   text,
  hora_inicio             text,
  hora_fin                text,
  dia_completo            int default 0,
  lugar                   text,
  descripcion             text,
  responsable_persona     text,
  responsable_ministerio  text,
  invitado                text,
  contacto                text,
  estado                  text default 'programada',
  recurrencia             text default '{"tipo":"ninguna"}',
  excepciones             text default '[]',
  recordatorios           text default '[]',
  es_fecha_importante     int default 0,
  creado_en               text,
  modificado_en           text,
  updated_at              timestamptz not null default now(),
  deleted                 boolean not null default false
);

create table if not exists public.mensajes (
  uid         text primary key,
  church_id   uuid not null references public.iglesias (id) on delete cascade,
  de_rol      text,
  cuerpo      text,
  leido       int default 0,
  creado_en   text,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

create index if not exists idx_agenda_church_updated on public.agenda (church_id, updated_at);
create index if not exists idx_mensajes_church_updated on public.mensajes (church_id, updated_at);

alter table public.agenda enable row level security;
alter table public.mensajes enable row level security;

drop policy if exists "agenda_select" on public.agenda;
create policy "agenda_select" on public.agenda for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "agenda_insert" on public.agenda;
create policy "agenda_insert" on public.agenda for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "agenda_update" on public.agenda;
create policy "agenda_update" on public.agenda for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "agenda_delete" on public.agenda;
create policy "agenda_delete" on public.agenda for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "mensajes_select" on public.mensajes;
create policy "mensajes_select" on public.mensajes for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "mensajes_insert" on public.mensajes;
create policy "mensajes_insert" on public.mensajes for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "mensajes_update" on public.mensajes;
create policy "mensajes_update" on public.mensajes for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "mensajes_delete" on public.mensajes;
create policy "mensajes_delete" on public.mensajes for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
