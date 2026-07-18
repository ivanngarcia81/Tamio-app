-- ============================================================================
-- Tamio · Sincronización E1 — vincular usuario ↔ iglesia
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (una sola vez).
-- Es la base multi-iglesia: cada usuario pertenece a una iglesia, y toda la
-- sincronización posterior se aísla por ese church_id.
-- ============================================================================

-- 1) Tabla de iglesias en la nube.
create table if not exists public.iglesias (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  creado_en timestamptz not null default now()
);

alter table public.iglesias enable row level security;

-- Cada usuario solo puede leer la iglesia a la que pertenece.
drop policy if exists "leer_mi_iglesia" on public.iglesias;
create policy "leer_mi_iglesia"
  on public.iglesias for select
  using (id = (select church_id from public.perfiles where id = auth.uid()));

-- 2) Vincular el perfil a su iglesia.
alter table public.perfiles
  add column if not exists church_id uuid references public.iglesias (id);

-- 3) Backfill: los usuarios que YA existían (admin, tesorero, secretaria) se
--    agrupan en UNA misma iglesia (son la misma congregación).
do $$
declare la_iglesia uuid;
begin
  if exists (select 1 from public.perfiles where church_id is null) then
    insert into public.iglesias (nombre) values ('Iglesia principal')
      returning id into la_iglesia;
    update public.perfiles set church_id = la_iglesia where church_id is null;
  end if;
end $$;

-- 4) Trigger de registro (reemplaza el de la Fase 1): al crear una cuenta nueva
--    desde la app, se crea SU iglesia y su perfil de administrador vinculado.
create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva_iglesia uuid;
begin
  insert into public.iglesias (nombre)
  values (coalesce(nullif(new.raw_user_meta_data->>'iglesia', ''), 'Mi Iglesia'))
  returning id into nueva_iglesia;

  insert into public.perfiles (id, nombre, rol, church_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), 'administrador', nueva_iglesia)
  on conflict (id) do update set church_id = excluded.church_id;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ============================================================================
-- Después de correr esto:
-- - En Table Editor → perfiles, cada usuario debe tener un church_id.
-- - En Table Editor → iglesias, debe existir "Iglesia principal" (tus usuarios
--   actuales) y una iglesia nueva por cada registro futuro.
-- La app todavía no "usa" el church_id (eso llega en E2/E3); esto es el cimiento.
-- ============================================================================
