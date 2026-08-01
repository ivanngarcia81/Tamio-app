# Tamio — Estado del proyecto

App de administración para iglesias: **tesorería** (ingresos, gastos, depósitos,
reportes) y **secretaría** (membresía, actas, cartas, traslados, asistencia,
agenda). Corre en **macOS, iPad y iPhone** desde una sola base de código.

**Tauri 2 + React 19 + TypeScript.** Base de datos local **cifrada con SQLCipher**
(`rusqlite`), con la clave guardada en el **Llavero de macOS** (`keyring`).
Bilingüe ES/EN con paridad de claves verificada por el compilador.

> El identificador interno es `com.tesoreria.app` **a propósito**: de él depende
> la carpeta de datos de cada instalación existente. **No cambiarlo nunca.**

_Última actualización: 1 de agosto de 2026 · versión 1.0.8_

---

## Dónde está el proyecto ahora

- **1.0.8 enviada a App Review** el 29 de julio de 2026, a la espera de respuesta.
- La 1.0 sale **gratis y 100% local**: sin login, sin nube, sin compras.
  Dos interruptores lo controlan:
  - `LOGIN_HABILITADO` en `src/supabase.ts`
  - `SYNC_HABILITADO` en `src/syncManager.ts`
  Ambos en `false`. La 1.1 los vuelve a encender.
- La suscripción (19 USD/mes por iglesia) llega con la 1.1. Procesador de pago sin
  decidir: Paddle construido, Lemon Squeezy recuperable — ver `docs/planes.md`.

**Qué leer antes de tocar nada:**
- [`docs/ideas-futuras.md`](./docs/ideas-futuras.md) — hoja de ruta, **el
  bloqueante del banner de actualizaciones**, y los hallazgos de la auditoría del
  1 de agosto (con lo que resultó falso).
- [`docs/checklist-app-store.md`](./docs/checklist-app-store.md) — qué se declaró
  a Apple en el envío.

---

## Mapa del código

- `src/db.ts` — toda la capa de datos. Único lugar a tocar para consultas.
- `src/App.tsx` — shell: rutas, sidebar, modal global, tema, puerta de login.
- `src/pages/` — Dashboard, Movimientos, Miembros, Depósitos, Bandeja, Reportes,
  Membresía, Actas, Servicios, Cartas, Agenda, Mensajes, Configuración.
- `src/components/` — tablas, modales, ajustes, skeletons, paginación.
- `src/services/print/` — motor de PDF (jsPDF nativo). Tema centralizado en
  `printUtils.ts`; ningún reporte fija tamaños por su cuenta. **No se usa
  `window.print()` a propósito.**
- `src/styles.css` — tokens de tipografía (`--fs-*`), color, sombras y layout.
  Punto de corte compacto (iPhone): `@media (max-width: 760px)`.
- `src/i18n/` — `es.ts` es la fuente; `en.ts` usa tipo espejo.
- `src-tauri/src/lib.rs` — migraciones SQL. **Van por la v35.**
  Regla: NUNCA reusar un número; siempre agregar al final.
- `src-tauri/src/motordb.rs` — apertura de la base y `PRAGMA key` (SQLCipher).
- `supabase/functions/` — `pago-webhook` y `borrar-cuenta`.

---

## Reglas de trabajo

- Verificar con `npx tsc --noEmit` **y** `npm run build` antes de cada commit.
- **Mac e iPad ya funcionan bien.** Los ajustes de iPhone van detrás del
  breakpoint compacto; si un arreglo exige tocar código compartido, consultarlo
  antes.
- Commits y UI en español; nombres de código en español donde ya lo están.
- No introducir dependencias sin necesidad clara.
- El `.env` no se sube (solo `.env.example`). El repo es público: nada de claves.

## Compilar

```bash
npm run dist                                            # .dmg de macOS
npm run tauri ios build -- --export-method app-store-connect   # .ipa
```
