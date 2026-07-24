-- Foto de perfil del usuario que inicia sesión.
--
-- La foto se guarda como data URL (JPEG comprimido ~160px) en la columna `foto`
-- de la tabla `perfiles`. Al leer el perfil en el login viaja con la cuenta, así
-- que aparece igual en cualquier Mac donde el usuario entre. No hace falta un
-- bucket de Storage.
--
-- Ejecuta esto UNA vez en Supabase → SQL Editor. Es idempotente.

alter table public.perfiles add column if not exists foto text;

-- El usuario debe poder actualizar SU propia fila para guardar/quitar la foto.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'perfiles'
      and policyname = 'perfil_update_propio'
  ) then
    create policy perfil_update_propio on public.perfiles
      for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;
