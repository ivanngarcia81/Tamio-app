-- ============================================================================
-- Tamio · Configuración inicial de Supabase (Fase 1: login + roles)
-- Ejecuta esto en Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1) Tabla de perfiles: un rol por usuario autenticado.
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  rol text not null check (rol in ('tesorero', 'secretaria', 'administrador')),
  creado_en timestamptz not null default now()
);

-- 2) Seguridad a nivel de fila: cada quien solo lee su propio perfil.
alter table public.perfiles enable row level security;

drop policy if exists "leer_propio_perfil" on public.perfiles;
create policy "leer_propio_perfil"
  on public.perfiles for select
  using (auth.uid() = id);

-- ============================================================================
-- 3) Crear los usuarios y asignarles rol
--    a) En Supabase → Authentication → Users → Add user, crea cada persona
--       con su correo y una contraseña. Copia el "User UID" de cada una.
--    b) Inserta su perfil con el rol correspondiente (reemplaza los UID):
-- ============================================================================

-- insert into public.perfiles (id, nombre, rol) values
--   ('UID-DEL-TESORERO',  'Nombre del tesorero',  'tesorero'),
--   ('UID-DE-LA-SECRETARIA', 'Nombre de la secretaria', 'secretaria');

-- Para cambiar un rol después:
-- update public.perfiles set rol = 'secretaria' where id = 'UID-DEL-USUARIO';

-- ============================================================================
-- 4) Registro self-service (opcional): cuando alguien crea su cuenta desde la
--    app ("Crear cuenta"), este trigger le crea automáticamente su perfil como
--    'administrador' de su propia iglesia. Así no tienes que asignar el rol a
--    mano. Ejecuta este bloque una sola vez.
-- ============================================================================

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), 'administrador')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();
