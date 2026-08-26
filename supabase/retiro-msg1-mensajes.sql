-- Retirada de `mensajes` (MSG1) — 26 de agosto de 2026
--
-- Iván: "cerrar el reemplazo de Mensajes y borrar".
--
-- La tabla `mensajes` la sustituyó `registro` en la migración 50. Aquella
-- dejó de ENSEÑARLA y conservó sus filas a propósito, porque borrar con
-- sincronización de por medio no tiene vuelta atrás. Iván lo confirmó y esto
-- es el cierre.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL ORDEN, que aquí va al revés que el de añadir
-- ─────────────────────────────────────────────────────────────────────────
--
-- Para AÑADIR una tabla o una columna: primero en Supabase, después en el
-- `sync.ts` local. Al revés, la app pide algo que no existe y la
-- sincronización entera se cae, no solo esa tabla.
--
-- Para RETIRAR es simétrico y por eso mismo va al revés:
--
--   PASO 1 (hecho, 26 ago 2026) — se quita el paso local del sync y se suelta
--     la tabla LOCAL (migración 51), y las filas remotas se marcan borradas.
--     La tabla remota se queda, vacía. Mientras exista, un iPad con la 1.2.11
--     todavía instalada sigue sincronizando sin error.
--
--   PASO 2 (PENDIENTE) — cuando TODOS los aparatos lleven la 1.2.12 o más,
--     se suelta también la tabla remota. Hasta entonces, no.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ EL BORRADO ES SUAVE Y NO UN DELETE
-- ─────────────────────────────────────────────────────────────────────────
--
-- Un DELETE duro aquí NO habría borrado nada. Un aparato que todavía tenga
-- sus filas locales con `deleted = 0` las vuelve a SUBIR en la siguiente
-- sincronización: reaparecen. Marcarlas borradas y adelantar `updated_at` sí
-- baja a todos los aparatos y las apaga de verdad, porque gana la fila más
-- reciente.
--
-- Es exactamente el mismo razonamiento que ya está escrito en
-- `borrarDatosIglesia` de src/db.ts, y por el mismo motivo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HABÍA DENTRO (mirado antes de tirar)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Siete filas, todas de una sola iglesia y todas de prueba:
--   · 3 ya borradas en blando desde julio.
--   · 4 vivas, las cuatro automáticas y las cuatro iguales:
--     "Notice from Secretariat: Maria's membership status changed from X to Y."
--
-- O sea, el aviso automático que el registro ahora hace mejor — y congelado
-- en INGLÉS, que era justamente el defecto que llevó a guardar `tipo` +
-- `datos` en vez del texto ya compuesto. No se perdió nada escrito por nadie.

-- ---------------------------------------------------------------------------
-- PASO 1 — APLICADO el 26 de agosto de 2026
-- ---------------------------------------------------------------------------

update mensajes
   set deleted = true,
       updated_at = now()
 where deleted = false;

-- Comprobado después de aplicarlo:  total = 7,  borradas = 7,  vivas = 0.

-- ---------------------------------------------------------------------------
-- PASO 2 — NO APLICAR TODAVÍA
-- ---------------------------------------------------------------------------
--
-- Sólo cuando ningún aparato quede con una versión anterior a la 1.2.12.
-- La forma de saberlo no es adivinar: es que Iván confirme que todos los
-- iPads y Macs de la iglesia están actualizados.
--
--   drop table if exists mensajes;
--
-- Y si aparece cualquier duda, no pasa nada por dejar la tabla vacía ahí: una
-- tabla sin filas no cuesta nada. Lo que sí costaría es soltarla mientras un
-- aparato viejo la sigue pidiendo.
