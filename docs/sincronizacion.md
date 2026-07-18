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
- ⬜ **E1 — Vincular usuario ↔ iglesia:** `perfiles.church_id`; al registrarse se
  crea la iglesia en la nube y se guarda su id.
- ⬜ **E2 — Esquema en la nube + RLS:** crear las tablas espejo en Supabase con
  `church_id/updated_at/deleted` y las políticas de seguridad por iglesia.
- ⬜ **E3 — Metadatos locales:** migración que añade `updated_at/deleted` a las
  tablas locales y los setea en cada escritura.
- ⬜ **E4 — Motor de sync (push/pull):** una tabla a la vez, empezando por las
  más simples (categorías, plantillas) antes de las críticas (transactions,
  members). Probar a fondo con dos equipos.
- ⬜ **E5 — Estado en la UI + automatización:** indicador de sincronización,
  sync al guardar / al reconectar / periódico.
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
- E0 hecho. E1–E6 pendientes, se construyen por etapas en la Mac contra Supabase.
