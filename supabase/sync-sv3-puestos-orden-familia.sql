-- ============================================================================
-- Tamio · Sincronización SV3 — puestos del culto, orden del culto y parentescos
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias), E2 (members) y SV1 (servicios).
--
-- Las tres tablas de la tanda del 24 de agosto de 2026 que nacieron con sus
-- metadatos de sincronización puestos —uid, updated_at, borrado en blando— y
-- se quedaron un día sin quien las subiera:
--
--   · `servicio_puestos` — quién cubre cada puesto del culto (migración 43)
--   · `servicio_orden`   — el minuto a minuto (43)
--   · `parentescos`      — la pestaña Familia de la ficha del miembro (46)
--
-- Todo enlaza por uid globales y nunca por id local, que no significa nada
-- fuera de su base. SIN claves foráneas entre ellas a propósito: el orden en
-- que bajan las tablas no puede convertirse en un error, y el cliente se salta
-- la fila hasta que su padre exista localmente.
-- ============================================================================

create table if not exists public.servicio_puestos (
  uid          text primary key,
  church_id    uuid not null references public.iglesias (id) on delete cascade,
  servicio_uid text,
  -- Clave del catálogo: alabanza | ujieres | ofrenda | sonido. El catálogo NO
  -- es una tabla: son los seis puestos del diseño y viven en una constante de
  -- `db.ts`. Predicación y Dirección siguen en columnas de `servicios`, que es
  -- donde han estado siempre y de donde salen impresas en los informes.
  puesto       text,
  -- INSTANTÁNEA del nombre: quien ayuda en sonido un domingo puede no estar en
  -- el padrón, y el histórico tiene que seguir diciendo quién fue aunque esa
  -- persona se dé de baja.
  nombre       text,
  member_uid   text,
  created_at   text,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);
create index if not exists idx_sv_puestos_church on public.servicio_puestos (church_id);
create index if not exists idx_sv_puestos_servicio on public.servicio_puestos (servicio_uid);
-- Un puesto por servicio, y PARCIAL como el local: con el borrado en blando,
-- un puesto soltado dejaría su lápida ocupando el sitio y no se podría
-- reasignar. Es la lección de la migración 40.
create unique index if not exists idx_sv_puestos_vivo
  on public.servicio_puestos (servicio_uid, puesto) where (deleted = false);

create table if not exists public.servicio_orden (
  uid          text primary key,
  church_id    uuid not null references public.iglesias (id) on delete cascade,
  servicio_uid text,
  -- Manda la posición, no la hora: un culto tiene pasos sin hora ("Ofrenda,
  -- cuando toque") y ordenarlos por una hora vacía los mandaría todos al
  -- principio. La hora es un dato que se enseña; el orden es la posición.
  posicion     int not null default 0,
  hora         text,
  titulo       text,
  encargado    text,
  created_at   text,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);
create index if not exists idx_sv_orden_church on public.servicio_orden (church_id);
create index if not exists idx_sv_orden_servicio on public.servicio_orden (servicio_uid, posicion);

create table if not exists public.parentescos (
  uid          text primary key,
  church_id    uuid not null references public.iglesias (id) on delete cascade,
  -- UNA fila por relación, no dos: dice "`pariente_uid` es el `tipo` de
  -- `member_uid`" y la ficha del otro la lee al revés con el inverso. Guardar
  -- las dos direcciones habría duplicado cada escritura y, con ella, la
  -- posibilidad de que se separen.
  member_uid   text,
  pariente_uid text,
  -- Catálogo NEUTRO (conyuge | padre | hijo | hermano | abuelo | nieto | tio |
  -- sobrino | primo | otro): `members` no guarda sexo, así que "hija" sería un
  -- dato que inventa la interfaz. De regalo, cada inverso queda único.
  tipo         text,
  created_at   text,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);
create index if not exists idx_parentescos_church on public.parentescos (church_id);
create index if not exists idx_parentescos_pariente on public.parentescos (pariente_uid);
create unique index if not exists idx_parentescos_par_vivo
  on public.parentescos (member_uid, pariente_uid) where (deleted = false);

alter table public.servicio_puestos enable row level security;
alter table public.servicio_orden enable row level security;
alter table public.parentescos enable row level security;

-- Las cuatro de siempre, por iglesia del perfil que consulta.
drop policy if exists "sv_puestos_select" on public.servicio_puestos;
create policy "sv_puestos_select" on public.servicio_puestos for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_puestos_insert" on public.servicio_puestos;
create policy "sv_puestos_insert" on public.servicio_puestos for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_puestos_update" on public.servicio_puestos;
create policy "sv_puestos_update" on public.servicio_puestos for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_puestos_delete" on public.servicio_puestos;
create policy "sv_puestos_delete" on public.servicio_puestos for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "sv_orden_select" on public.servicio_orden;
create policy "sv_orden_select" on public.servicio_orden for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_orden_insert" on public.servicio_orden;
create policy "sv_orden_insert" on public.servicio_orden for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_orden_update" on public.servicio_orden;
create policy "sv_orden_update" on public.servicio_orden for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "sv_orden_delete" on public.servicio_orden;
create policy "sv_orden_delete" on public.servicio_orden for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "parentescos_select" on public.parentescos;
create policy "parentescos_select" on public.parentescos for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "parentescos_insert" on public.parentescos;
create policy "parentescos_insert" on public.parentescos for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "parentescos_update" on public.parentescos;
create policy "parentescos_update" on public.parentescos for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "parentescos_delete" on public.parentescos;
create policy "parentescos_delete" on public.parentescos for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
