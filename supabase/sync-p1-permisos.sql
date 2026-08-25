-- ============================================================================
-- Tamio · P1 — los dos permisos del rol Tesorería
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias, perfiles) y T1 (transactions).
--
-- Los cuatro interruptores que el rediseño de iPad dibujó se quedan en DOS,
-- porque los otros dos no eran permisos: "registrar ingresos y gastos" y
-- "cerrar cortes" SON el rol de tesorería. Apagarlos no le quita un permiso a
-- la tesorera: la deja dentro de Tesorería sin poder hacer nada, que es otro
-- rol —uno de solo lectura— y no un permiso.
--
--   · `tesorero_ve_padron`      — le ABRE Membresía, el padrón de Secretaría.
--                                 Por omisión FALSE, que es lo de hoy.
--   · `tesorero_puede_eliminar` — le QUITA el borrado de movimientos.
--                                 Por omisión TRUE, que es lo de hoy: una
--                                 migración no le retira en silencio a nadie
--                                 algo que venía usando.
--
-- Viven en la IGLESIA y no en la persona (decisión de Iván, 24 ago): una sola
-- regla que el administrador enciende una vez y vale para quien ocupe el
-- puesto, hoy y el año que viene.
--
-- La nube es la AUTORIDAD, igual que con el plan. Los dispositivos guardan una
-- copia local para que la interfaz funcione sin señal, pero esa copia solo se
-- escribe bajando: si el permiso se pudiera cambiar en el aparato, no sería un
-- permiso, sería una preferencia.
-- ============================================================================

alter table public.iglesias
  add column if not exists tesorero_ve_padron boolean not null default false;
alter table public.iglesias
  add column if not exists tesorero_puede_eliminar boolean not null default true;

-- ----------------------------------------------------------------------------
-- Escribirlos: una función, NO una política de UPDATE.
--
-- `iglesias` hoy solo tiene política de SELECT, así que ningún cliente puede
-- escribirla. Abrir un UPDATE para el administrador abriría la tabla ENTERA
-- —el GRANT de Supabase a `authenticated` es de tabla, no de columna—, y con
-- ella `plan`: cualquier administrador podría regalarse la suscripción. La
-- función deja la tabla cerrada como está y expone exactamente dos columnas.
-- ----------------------------------------------------------------------------
create or replace function public.fijar_permisos_tesoreria(
  p_ve_padron boolean,
  p_puede_eliminar boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo record;
begin
  select rol, church_id into yo from public.perfiles where id = auth.uid();
  if yo.church_id is null then
    raise exception 'sin iglesia';
  end if;
  -- Solo el administrador. El tesorero no se quita sus propios límites.
  if yo.rol is distinct from 'administrador' then
    raise exception 'solo el administrador cambia los permisos';
  end if;
  update public.iglesias
     set tesorero_ve_padron = p_ve_padron,
         tesorero_puede_eliminar = p_puede_eliminar
   where id = yo.church_id;
end;
$$;

revoke all on function public.fijar_permisos_tesoreria(boolean, boolean) from public;
revoke all on function public.fijar_permisos_tesoreria(boolean, boolean) from anon;
grant execute on function public.fijar_permisos_tesoreria(boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Que se cumpla: el disparador del borrado.
--
-- Esconder el botón no es un control —el aparato puede escribir la fila igual—,
-- así que el servidor tiene que negarse. Tres decisiones, y las tres importan:
--
-- 1) Vigila la TRANSICIÓN viva → borrada, no el valor. Si la fila ya está
--    borrada en la nube y el aparato de la tesorera la vuelve a subir borrada,
--    no está borrando nada: está retransmitiendo la baja que hizo otro. Mirar
--    solo el valor cortaría la sincronización de `transactions` entera cada
--    vez que la tesorera relevara una baja del administrador.
--
-- 2) NO lanza excepción: DESHACE el cambio. Una excepción tumbaría el lote
--    completo y con él la sincronización de la tabla, para siempre, en un caso
--    muy real: un movimiento que la tesorera borró ANTES de que el permiso se
--    apagara y que todavía no había subido. Así, en cambio, la baja rebota y el
--    movimiento vuelve vivo al aparato en la siguiente bajada. Que reaparezca
--    ES el aviso.
--
-- 3) Empuja `updated_at` por delante del que trae el cliente. Sin eso la fila
--    resucitada llegaría empatada o vieja y el aparato volvería a mandarla
--    borrada en cada sincronización, para siempre.
--
-- Solo UPDATE. Un INSERT con `deleted = true` es un movimiento que nunca
-- estuvo en la nube y que nadie más llegó a ver; resucitarlo lo haría aparecer
-- de la nada en los demás aparatos, que es peor. Y el camino que importa —dar
-- de baja algo que YA está arriba— pasa por el UPDATE del upsert.
-- ----------------------------------------------------------------------------
create or replace function public.frenar_borrado_tesorero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mi_rol text;
  permitido boolean;
begin
  if coalesce(old.deleted, false) or not coalesce(new.deleted, false) then
    return new;  -- no es la transición viva → borrada
  end if;

  select p.rol, i.tesorero_puede_eliminar
    into mi_rol, permitido
    from public.perfiles p
    join public.iglesias i on i.id = p.church_id
   where p.id = auth.uid();

  if mi_rol = 'tesorero' and permitido is false then
    new.deleted := old.deleted;
    new.updated_at := greatest(now(), coalesce(new.updated_at, now()) + interval '1 second');
  end if;
  return new;
end;
$$;

drop trigger if exists frenar_borrado_tesorero on public.transactions;
create trigger frenar_borrado_tesorero
  before update on public.transactions
  for each row execute function public.frenar_borrado_tesorero();

-- ============================================================================
-- COMPROBACIÓN — pégalo tal cual en el SQL Editor cuando quieras verificar el
-- disparador contra los datos de verdad. **No deja rastro**: el `raise` del
-- final aborta el bloque, y con él se deshacen todos los cambios de arriba
-- (por eso el resultado viaja dentro del mensaje de error).
--
-- Corrido el 24 ago 2026 contra el proyecto real, con este resultado:
--   bloqueado=f  relevo=t  permitido=t  sello_avanzo=t
--
--   · bloqueado=f  — la baja del tesorero SIN permiso no se aplicó.
--   · relevo=t     — retransmitir una baja que YA estaba arriba pasa limpia.
--                    Es la que impide que el disparador corte la
--                    sincronización de `transactions` para toda la iglesia.
--   · permitido=t  — con el permiso encendido, el mismo tesorero sí puede.
--   · sello_avanzo=t — la fila que rebotó vuelve con `updated_at` por delante,
--                    así que baja viva en lugar de quedarse rebotando.
--
-- Un detalle que salió al escribirlo y que conviene saber: el disparador mira
-- `auth.uid()`, no quién ejecuta el UPDATE. En producción eso es exactamente
-- lo que se quiere —cada aparato manda su propio JWT—, pero en una prueba hay
-- que LIMPIAR la claim entre pasos o el paso "como administrador" se restringe
-- a sí mismo. El primer intento de esta comprobación falló por eso.
-- ============================================================================
-- do $$
-- declare
--   v_perfil uuid; v_iglesia uuid; v_uid text;
--   v_bloqueado boolean; v_relevo boolean; v_permitido boolean;
--   v_sello timestamptz; v_sello2 timestamptz;
-- begin
--   select p.id, p.church_id into v_perfil, v_iglesia
--     from public.perfiles p
--    where p.church_id is not null
--      and exists (select 1 from public.transactions t
--                   where t.church_id = p.church_id and coalesce(t.deleted,false) = false)
--    limit 1;
--   if v_perfil is null then raise exception 'PRUEBA-SIN-DATOS'; end if;
--   select t.uid into v_uid from public.transactions t
--    where t.church_id = v_iglesia and coalesce(t.deleted,false) = false limit 1;
--
--   update public.perfiles set rol = 'tesorero' where id = v_perfil;
--   update public.iglesias set tesorero_puede_eliminar = false where id = v_iglesia;
--
--   select updated_at into v_sello from public.transactions where uid = v_uid;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_perfil::text)::text, true);
--   set local role authenticated;
--   update public.transactions set deleted = true, updated_at = now() where uid = v_uid;
--   reset role;
--   perform set_config('request.jwt.claims', '', true);
--   select coalesce(deleted,false), updated_at into v_bloqueado, v_sello2
--     from public.transactions where uid = v_uid;
--
--   update public.transactions set deleted = true where uid = v_uid;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_perfil::text)::text, true);
--   set local role authenticated;
--   update public.transactions set deleted = true, updated_at = now() where uid = v_uid;
--   reset role;
--   perform set_config('request.jwt.claims', '', true);
--   select coalesce(deleted,false) into v_relevo from public.transactions where uid = v_uid;
--
--   update public.transactions set deleted = false where uid = v_uid;
--   update public.iglesias set tesorero_puede_eliminar = true where id = v_iglesia;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_perfil::text)::text, true);
--   set local role authenticated;
--   update public.transactions set deleted = true, updated_at = now() where uid = v_uid;
--   reset role;
--   select coalesce(deleted,false) into v_permitido from public.transactions where uid = v_uid;
--
--   raise exception 'RESULTADO bloqueado=% relevo=% permitido=% sello_avanzo=%',
--     v_bloqueado, v_relevo, v_permitido, (v_sello2 > v_sello);
-- end $$;
