# Sincronización de Tamio (diseño)

> Objetivo: que varias computadoras de **una misma iglesia** (p. ej. Tesorería y
> Secretaría, en Macs distintas y en momentos distintos) vean **los mismos
> datos**, sincronizados por Supabase. Multi-iglesia: cada iglesia tiene sus
> datos aislados de las demás.
>
> Decisión tomada con el usuario: se acepta que los datos financieros y de
> miembros vivan en Supabase, protegidos por seguridad por iglesia (RLS).
>
> ⚠️ Este es el trabajo más grande y sensible del proyecto. Se construye por
> **etapas**, probando cada una en la Mac contra un Supabase real. Un motor de
> sincronización mal hecho puede **perder datos**, así que se prioriza la
> seguridad sobre la velocidad.

---

## Modelo mental

- Cada **usuario** (auth) pertenece a **una iglesia** (`perfiles.church_id`).
- Cada **fila** de datos lleva `church_id`. La seguridad (RLS) garantiza que un
  usuario solo lee/escribe filas de **su** iglesia.
- Roles siguen igual: administrador (todo), tesorero (Tesorería), secretaria
  (Secretaría). La sincronización no cambia los roles, solo comparte los datos.

## Arquitectura — dos caminos

### Opción A · Offline-first (local + espejo en la nube) — recomendada
La app **sigue usando SQLite local** (rápida y funciona sin internet) y, por
detrás, **sincroniza** con Supabase: sube sus cambios y baja los de los demás.

- ✅ Mantiene el punto fuerte de Tamio: **funciona offline**.
- ✅ No desestabiliza la app que ya funciona; la sync se añade **encima**.
- ❌ Es lo más difícil de construir bien (conflictos, borrados, orden).

**Estrategia de conflictos:** *last-write-wins por fila* usando `updated_at`.
En este caso es seguro porque Tesorería y Secretaría editan **módulos distintos**
(dinero vs miembros), así que casi nunca tocan la misma fila a la vez.

**Borrados:** *soft-delete* (columna `deleted`), nunca borrar físico, para que el
borrado se propague en vez de "revivir" al sincronizar.

### Opción B · Cloud-primary (Supabase como única fuente)
La app lee/escribe **directo a Supabase**; el local queda solo como caché.

- ✅ Lógica más simple (no hay que resolver conflictos; RLS hace la seguridad).
- ❌ **Requiere internet** para funcionar (se pierde el offline).
- ❌ Reescribir **toda** la capa de datos (`db.ts`, 3000+ líneas) de golpe.

**Recomendación:** **Opción A (offline-first)**. Conserva el offline y no rompe lo
que ya funciona; el costo es construir el motor de sync con cuidado, por etapas.

---

## Esquema en la nube (Supabase / Postgres)

Se replican en Supabase las tablas de datos que hoy viven en SQLite:
`transactions, members, depositos_bancarios, actas, cartas, solicitudes,
traslados_salida, traslados_entrada, servicios, servicio_asistencia, agenda,
mensajes, gastos_recurrentes, plantillas, categorias_custom, churches`.

Cada tabla lleva, además de sus columnas actuales:
- `church_id` (a qué iglesia pertenece) — ya existe en casi todas.
- `updated_at timestamptz` — para el last-write-wins.
- `deleted boolean default false` — soft-delete.

**RLS (seguridad por iglesia):** en cada tabla, políticas que solo permiten
`select/insert/update` de filas cuyo `church_id` coincide con el `church_id` del
usuario (leído de `perfiles`). Así una iglesia **nunca** ve datos de otra.

---

## Motor de sincronización (Opción A) — cómo funciona

1. **Metadatos locales:** cada tabla local gana `updated_at` y `deleted`. Cada
   escritura local actualiza `updated_at = now()`.
2. **Push:** subir a Supabase las filas locales con `updated_at` mayor que la
   última sincronización (upsert por id).
3. **Pull:** bajar de Supabase las filas con `updated_at` mayor que la última
   sincronización y aplicarlas localmente (si la remota es más nueva, gana).
4. **Borrados:** se propagan como `deleted = true` (no se borra físico).
5. **Disparadores:** al guardar/editar/eliminar, y periódicamente (cada X
   minutos) y al reconectar. Indicador de estado en la UI ("Sincronizado / Sin
   conexión / Sincronizando…").

---

## Plan por etapas (cada una probada en la Mac)

- ✅ **E0 — Registro self-service** (hecho): cada iglesia crea su cuenta; el
  administrador es el dueño de su iglesia.
- ✅ **E1 — Vincular usuario ↔ iglesia:** tabla `iglesias`, `perfiles.church_id`,
  backfill de usuarios existentes en una misma iglesia, y trigger que crea la
  iglesia al registrarse. SQL en `supabase/sync-e1.sql`. (La app aún no usa el
  church_id; es el cimiento para E2/E3.)
- 🔨 **E2 — Esquema en la nube + RLS (piloto):** tabla espejo `members` en
  Supabase con `uid` (id global), `church_id/updated_at/deleted` y RLS por
  iglesia. SQL en `supabase/sync-e2-members.sql`. Piloto: primero solo miembros;
  el resto de tablas se replica cuando el piloto funcione de punta a punta.
- ✅ **E3 — Metadatos locales (piloto members):** migración v23 añade
  `uid/updated_at/deleted` a la tabla local `members`; las escrituras generan
  `uid` (crypto.randomUUID) y bumpean `updated_at`. El borrado físico de miembros
  aún NO sincroniza (se maneja al productizar); la columna `deleted` queda lista.
- 🔨 **E4 — Motor de sync (push/pull), piloto members:** `src/sync.ts` con
  `sincronizarMiembros(churchIdLocal)`. Trae el estado completo local y remoto,
  compara `updated_at` (last-write-wins por `uid`), sube lo local más nuevo
  (upsert por `uid`) y baja lo remoto más nuevo (insert/update local). Mapea el
  `church_id` local (int) al `church_id` remoto (uuid, leído del perfil). Botón
  manual "Sincronizar ahora" en Configuración (con login, admin/secretaría). El
  borrado físico aún no se propaga. Falta replicar a las otras 14 tablas.
- 🔨 **E5 — Estado en la UI + automatización:** `src/syncManager.ts` envuelve el
  motor con un estado observable y disparadores automáticos (al abrir, al
  guardar vía `programarSync`, al reconectar `online`, al volver a la ventana
  `focus`, y cada 3 min). Indicador en el pie del sidebar (`SyncIndicator`) con
  estado (Sincronizado / Sincronizando / Sin conexión / Error) y clic para
  forzar. El botón de Ajustes comparte el mismo estado. Falta pulir con dos Macs.
- ⬜ **E6 — Pruebas de estrés:** dos Macs editando, sin conexión, conflictos,
  borrados. Confirmar que **no se pierde nada**.

---

## Riesgos y decisiones

- **Pérdida de datos:** el mayor riesgo. Mitigación: soft-delete, `updated_at`,
  respaldos antes de cada etapa, y probar con datos de prueba (no reales) hasta
  E6.
- **Costo de Supabase:** el plan gratuito tiene límites (filas, ancho de banda).
  Con varias iglesias reales probablemente haya que pasar a plan de pago.
- **Privacidad/legal:** al subir datos de miembros a la nube, conviene una
  **política de privacidad** (necesaria además para el App Store).
- **Migración de datos existentes:** las iglesias que ya usaron Tamio local
  tendrán que "subir" su base la primera vez (un push inicial completo).

---

## Estado
- E0–E4 hechos (E4 validado con dos Macs: sube/baja miembros). E5 en curso:
  sincronización automática + indicador de estado, a pulir con dos Macs. E6
  pendiente (pruebas de estrés). Luego replicar a las otras tablas.
