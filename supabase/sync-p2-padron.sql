-- ============================================================================
-- Tamio · P2 — el padrón lo mueve Secretaría
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere P1 (los permisos de Tesorería en `iglesias`) y `members`.
--
-- APLICADO el 6 sep 2026 en `hkpbkpojeierxqtbmagh`, el proyecto al que apuntan
-- las dos apps. Las dos ya escondían los botones; esto es lo que hace que
-- esconderlos no sea lo único que hay.
--
-- La comprobación de abajo se corrió sobre los datos de verdad y dio
-- `bloqueado=t relevo=t sello_avanzo=t`, sin dejar rastro. Antes se verificó
-- contra la base —no contra este archivo— que las columnas existen y son de
-- los tipos que se dan por hechos: `activo` entero, `deleted` booleano,
-- `fecha_baja`/`motivo_baja` texto y `updated_at` timestamptz, que es lo que
-- hace válido el `greatest(...)` de más abajo.
--
-- La regla, decidida por Iván ese día: dar de alta y de baja a una persona es
-- de Secretaría. El administrador también; el tesorero no, ni con
-- `tesorero_ve_padron`, que le abre la pantalla y no el acta. El tesorero no
-- lo necesita: un diezmo de alguien sin ficha se registra con
-- `transactions.aportante_nombre`, sin dar de alta a nadie.
--
-- Con el matiz que ya tenía `puedeCrearMiembros` en plan.ts y que se conserva:
-- en el plan "solo Tesorería" no HAY Secretaría, y entonces el tesorero
-- mantiene su propio padrón. El disparador mira `iglesias.plan` por eso.
--
-- Calcado de `frenar_borrado_tesorero` (P1), con sus tres decisiones:
--
-- 1) Vigila la TRANSICIÓN, no el valor: viva → de baja (`activo` 1 → 0) y
--    viva → borrada (`deleted` false → true). Retransmitir una baja que ya
--    estaba arriba pasa limpia; si no, el disparador cortaría la
--    sincronización de `members` para toda la iglesia cada vez que el
--    aparato del tesorero relevara una baja hecha por Secretaría.
--
-- 2) NO lanza excepción: DESHACE el cambio. Una excepción tumbaría el lote y
--    con él la sincronización de la tabla. Así la baja rebota, y que la
--    persona reaparezca viva en el aparato ES el aviso.
--
-- 3) Empuja `updated_at` por delante del que trae el cliente, o la fila
--    resucitada llegaría vieja y el aparato la volvería a mandar de baja en
--    cada sincronización, para siempre.
--
-- Solo UPDATE, y a propósito. Un INSERT del tesorero —un alta— no destruye
-- nada; la interfaz de las dos apps ya no lo ofrece, y "deshacer" un INSERT
-- sería tragárselo en silencio, que es peor: el aparato creería que subió.
-- Si algún día hace falta, se decide aparte.
-- ============================================================================
create or replace function public.frenar_baja_tesorero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mi_rol text;
  mi_plan text;
  baja boolean;
  borrado boolean;
begin
  baja    := coalesce(old.activo, 1) = 1 and coalesce(new.activo, 1) = 0;
  borrado := not coalesce(old.deleted, false) and coalesce(new.deleted, false);
  if not baja and not borrado then
    return new;  -- no es una salida del padrón
  end if;

  select p.rol, i.plan
    into mi_rol, mi_plan
    from public.perfiles p
    join public.iglesias i on i.id = p.church_id
   where p.id = auth.uid();

  -- El plan "tesoreria" no tiene Secretaría: ahí el tesorero es el padrón.
  if mi_rol = 'tesorero' and mi_plan in ('completo', 'secretaria') then
    if baja then
      new.activo      := old.activo;
      new.fecha_baja  := old.fecha_baja;
      new.motivo_baja := old.motivo_baja;
    end if;
    if borrado then
      new.deleted := old.deleted;
    end if;
    new.updated_at := greatest(now(), coalesce(new.updated_at, now()) + interval '1 second');
  end if;
  return new;
end;
$$;

drop trigger if exists frenar_baja_tesorero on public.members;
create trigger frenar_baja_tesorero
  before update on public.members
  for each row execute function public.frenar_baja_tesorero();

-- ============================================================================
-- COMPROBACIÓN — pégala en el SQL Editor cuando lo quieras verificar contra
-- los datos de verdad. No deja rastro: el `raise` final aborta el bloque y
-- deshace todo lo de arriba; el resultado viaja dentro del mensaje.
--
-- Mismo aviso que en P1: el disparador mira `auth.uid()`, así que hay que
-- FIJAR la claim para el paso "como tesorero" y LIMPIARLA para el resto.
-- ============================================================================
-- do $$
-- declare
--   v_tesorero uuid; v_iglesia uuid; v_uid text;
--   v_bloqueado boolean; v_relevo boolean; v_sello timestamptz; v_sello2 timestamptz;
-- begin
--   select p.id, p.church_id into v_tesorero, v_iglesia
--     from public.perfiles p join public.iglesias i on i.id = p.church_id
--    where p.rol = 'tesorero' and i.plan in ('completo', 'secretaria')
--    limit 1;
--   if v_tesorero is null then raise exception 'PRUEBA-SIN-TESORERO'; end if;
--   select m.uid, m.updated_at into v_uid, v_sello from public.members m
--    where m.church_id = v_iglesia and coalesce(m.activo, 1) = 1 and not coalesce(m.deleted, false)
--    limit 1;
--   if v_uid is null then raise exception 'PRUEBA-SIN-MIEMBRO'; end if;
--
--   -- Como tesorero: la baja debe rebotar.
--   perform set_config('request.jwt.claims', json_build_object('sub', v_tesorero)::text, true);
--   update public.members set activo = 0, fecha_baja = '2026-09-05', motivo_baja = 'retiro' where uid = v_uid;
--   select coalesce(activo, 1) = 1, updated_at into v_bloqueado, v_sello2 from public.members where uid = v_uid;
--
--   -- Relevo: una baja que YA estaba arriba, retransmitida, pasa limpia.
--   perform set_config('request.jwt.claims', '', true);
--   update public.members set activo = 0, fecha_baja = '2026-09-05', motivo_baja = 'retiro' where uid = v_uid;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_tesorero)::text, true);
--   update public.members set activo = 0, fecha_baja = '2026-09-05', motivo_baja = 'retiro' where uid = v_uid;
--   select coalesce(activo, 1) = 0 into v_relevo from public.members where uid = v_uid;
--
--   raise exception 'RESULTADO bloqueado=% relevo=% sello_avanzo=%',
--     v_bloqueado, v_relevo, (v_sello2 > v_sello);
-- end $$;
