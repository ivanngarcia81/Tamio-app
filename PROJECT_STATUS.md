# Tamio — Estado del proyecto

App de escritorio para macOS que lleva la tesorería de una iglesia:
ingresos, gastos, depósitos bancarios, miembros, reportes y constancias
en PDF. **Tauri 2 + React 19 + TypeScript**, SQLite local vía
`@tauri-apps/plugin-sql`. Bilingüe (ES/EN) con paridad de claves
verificada por el compilador. Antes se llamaba "Tesorería"; el
identificador interno sigue siendo `com.tesoreria.app` a propósito
(de él depende la carpeta de datos del usuario).

Última actualización: 2026-07-14 · rama de trabajo: `claude/hello-9v3atw`

## Mapa del código

- `src/db.ts` — toda la capa de datos (SQLite). Único lugar a tocar si
  llega un backend.
- `src/App.tsx` — shell: rutas, sidebar, modal global, tema.
- `src/pages/` — Dashboard, Movimientos (ingresos/gastos), Miembros,
  Depósitos, Bandeja, Reportes, Configuración.
- `src/components/` — tablas, modales, ajustes, skeletons, paginación.
- `src/services/print/` — motor de PDF (jsPDF nativo). Tema centralizado
  en `printUtils.ts` (PDF_TYPE/PDF_SPACE/PDF_MARGIN); ningún reporte
  hardcodea tamaños.
- `src/styles.css` — sistema de diseño completo por tokens (tipografía
  --fs-*, espaciado, sombras, radios, --dur, layout --content-*).
- `src/i18n/` — es.ts es la fuente; en.ts usa tipo espejo.
- `src-tauri/src/lib.rs` — migraciones SQL (v10). Regla: NUNCA reusar un
  número de versión; siempre agregar al final.

## Funcionalidad completa

Movimientos con estados (aprobado/pendiente+Bandeja), recurrentes
mensuales de ingreso/gasto (el mes en curso se materializa al concluir),
deshacer al eliminar, búsqueda/filtros/paginación, miembros con
archivado no destructivo y constancia anual (firmas de tesorero y
pastor), depósitos, reportes mensual/anual en PDF con folio de
auditoría, importación CSV, respaldos, categorías personalizadas,
temas claro/oscuro, sonidos opcionales, atajos de teclado.

## Pendiente (siguiente etapa)

1. **Fase 0 — Distribución**: `tauri build` + firma → instalador .dmg.
2. **Backend + cuentas** (3 usuarias en Macs distintas): sync en la
   nube, roles (tesoreras: todo; secretaria: miembros + solo lectura
   financiera; pastor futuro: solo lectura). La matriz acordada está en
   el historial de la sesión.
3. Después: iPad/móvil o acceso web de consulta.

## Convenciones

- Verificar con `npx tsc --noEmit` + `npm run build` antes de commit.
- Commits y UI en español; código con nombres en español donde ya lo es.
- No introducir dependencias sin necesidad clara.
