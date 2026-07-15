-- ============================================================================
-- Tamio · Configuración inicial de Supabase (Fase 1: login + roles)
-- Ejecuta esto en Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- 1) Tabla de perfiles: un rol por usuario autenticado.
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  rol text not null check (rol in ('tesorero', 'secretaria')),
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
