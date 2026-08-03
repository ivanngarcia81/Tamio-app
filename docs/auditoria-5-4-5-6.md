# Auditoría 5.4 y 5.6 — inventarios (3 de agosto de 2026)

Cierre de los dos puntos de la auditoría que se podían hacer leyendo el
código. El 5.5 (recorrer todas las pantallas con la consola abierta) sigue
pendiente y **solo puede hacerse en la Mac**, con `npm run tauri dev`.

---

## 5.4 — `unwrap()`, errores tragados y `any`

### Rust: `unwrap()` / `expect()` fuera de pruebas

**Uno solo en todo el crate**, y es el estándar de Tauri:

- `lib.rs:1619` — `.expect("error while running tauri application")` en el
  arranque del builder. Si eso falla no hay app que arrancar; no hay nada
  mejor que hacer ahí. **No requiere acción.**

Todo lo demás usa `Result` con mensajes, o `let _ =` donde ignorar es la
decisión correcta (y está comentado por qué). Las pruebas sí usan
`unwrap()`/`expect()`, que es su papel.

### TypeScript: `any`

**Dos apariciones**, ambas en `src/components/DashboardCharts.tsx` (27 y 41):
el `payload` del tooltip de Recharts, cuya tipografía upstream es floja. Riesgo
bajo (solo pinta texto). Candidato a tiparse con `TooltipProps` de Recharts en
la 1.1; no urge.

### TypeScript: errores silenciados (`.catch(() => {})` / `catch { /* noop */ }`)

**53 apariciones en 23 archivos.** La mayoría son deliberadas y responden a un
patrón sano: "esto es opcional y su fallo no debe frenar lo principal"
(sonidos, toasts, marcar una actividad como realizada, limpiar localStorage).
Reparto:

| Archivo | Nº | Naturaleza |
|---|---|---|
| `App.tsx` | 11 | Cadena de arranque: migraciones oportunistas y avisos; un fallo no debe impedir arrancar. Tras la lección del arrastre de ventana (un `.catch` mudo escondió el permiso que faltaba durante días), estas son las primeras candidatas a pasar a `console.warn` en la 1.1. |
| `db.ts` | 6 | Parseos de JSON guardado y limpiezas; con datos sanos no corren. |
| `sync.ts` | 4 | Red: el fallo ya se refleja en el estado del indicador. |
| `UpdateBanner.tsx` | 4 | Consulta de version.json: si falla, simplemente no hay banner. |
| `restaurar.ts` | 3 | Comentados uno a uno; el diseño es fallar hacia el lado seguro (quedarse en pausa). |
| `i18n/index.ts` | 3 | localStorage inaccesible → se usa el idioma por defecto. |
| Resto (17 archivos) | 22 | Uno o dos por archivo: sonido, toast, marcar puente Agenda→Bitácora, etc. |

**Recomendación para la 1.1** (no para ahora, con la 1.0 en revisión): pasar
los silencios de `App.tsx` y de los modales a `console.warn` con contexto,
como ya se hizo con `startDragging()`. Un error que solo se ve "no haciendo
nada" cuesta días de diagnóstico; uno que deja rastro en la consola cuesta
minutos.

---

## 5.6 — Inventario de exportaciones por entidad

Qué puede sacar el usuario de cada entidad, y por dónde.

| Entidad | CSV | PDF / impresión | Importar |
|---|---|---|---|
| Movimientos (ingresos/gastos) | ✅ Configuración → Respaldo (`exportMovimientosCsv`) | ✅ Registro (Movimientos), reporte mensual y anual (Reportes/Dashboard) | ✅ CSV con plantilla (Reportes) |
| Miembros (Tesorería) | ✅ Configuración → Respaldo (`exportMiembrosCsv`) | ✅ Constancia anual, informe individual | ✅ CSV con plantilla (Miembros) |
| Depósitos bancarios | ❌ | ❌ | ❌ |
| Membresía / Informes | ✅ `exportarInformeCsv` (Informes) | ✅ Informe general e individual | — |
| Actas | ❌ | ✅ PDF por acta con firmas | ❌ |
| Bitácora de cultos (Servicios) | ❌ | ❌ | ❌ |
| Cartas / certificados | ❌ (el archivo no exporta lista) | ✅ Impresión de cada carta | ❌ |
| Traslados | ❌ | ✅ Carta automática del traslado | ❌ |
| Agenda | ❌ | ❌ | ❌ |
| Respaldo completo | — | — | ✅ ZIP con base + documentos (y restauración) |

**Huecos que ya estaban anotados como pendiente** (los CSV de Secretaría):
actas, bitácora de cultos, cartas y agenda no tienen exportación tabular. A
eso el inventario añade dos hallazgos:

1. **Depósitos no se puede sacar de la app de ninguna forma** — ni CSV, ni
   PDF — pese a ser un dato contable que un revisor externo pediría.
2. **La bitácora de cultos tampoco tiene PDF**, aunque Actas (su vecina) sí:
   una secretaria no puede imprimir el registro de un culto.

Los dos van bien como una sola tanda de trabajo en la 1.1: los `*ToCsv` de
`services/backup.ts` marcan el patrón a seguir (BOM UTF-8 + `entregarArchivo`,
que ya resuelve Mac y iPad).
