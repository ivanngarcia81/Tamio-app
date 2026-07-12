# Tesorería — Estado del proyecto

App de escritorio para macOS (con visión de venderse a varias iglesias) que lleva la contabilidad de una congregación: ingresos, gastos, miembros, reportes financieros. Construida con **Tauri 2 + React + TypeScript**, base de datos **SQLite local**.

Última actualización: 2026-07-12.

---

## 1. Estructura del repositorio

```
applicacion para iglesias/
├── mockup*.html, mockup-styles.css, mockup-theme.js   # Mockups estáticos (fase de diseño)
├── desktop app.webp                                    # Imagen de referencia visual original
├── PROJECT_STATUS.md                                   # Este archivo
└── tesoreria/                                           # App real (Tauri)
    ├── src/                                             # Frontend (React + TS)
    │   ├── App.tsx                                      # Shell: rutas, sidebar, modal global, tema
    │   ├── db.ts                                        # Toda la capa de acceso a datos (SQLite)
    │   ├── export.ts                                    # Generación de Excel/PDF
    │   ├── icons.tsx                                     # Íconos SVG como componentes
    │   ├── styles.css                                    # Sistema de diseño (copiado de mockup-styles.css)
    │   ├── components/
    │   │   ├── NewRecordModal.tsx                        # Modal crear/editar (Ingreso/Gasto/Miembro)
    │   │   ├── TxList.tsx                                 # Lista de movimientos agrupada por día
    │   │   ├── RowMenu.tsx                                # Menú "···" (Editar/Eliminar) vía portal
    │   │   ├── ConfirmDialog.tsx                          # Diálogo de confirmación propio
    │   │   └── Sidebar.tsx
    │   └── pages/
    │       ├── Dashboard.tsx      (ruta "/")
    │       ├── Movimientos.tsx    (ruta "/ingresos" y "/gastos", componente compartido)
    │       ├── Miembros.tsx       (ruta "/miembros")
    │       ├── Reportes.tsx       (ruta "/reportes")
    │       ├── Bandeja.tsx        (ruta "/bandeja")
    │       └── Configuracion.tsx  (ruta "/configuracion")
    └── src-tauri/
        ├── src/lib.rs             # Registro de plugins + migraciones SQL
        └── capabilities/default.json  # Permisos de Tauri
```

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Runtime nativo | Tauri 2 (Rust) |
| UI | React 19 + TypeScript + React Router 7 (`HashRouter`) |
| Build | Vite 7 |
| Base de datos | SQLite local vía `@tauri-apps/plugin-sql` (migraciones definidas en `lib.rs`) |
| Selección de archivos | `@tauri-apps/plugin-dialog` |
| Escritura de archivos / export | `@tauri-apps/plugin-fs` |
| Abrir archivos con app del sistema | `@tauri-apps/plugin-opener` |
| Generación de Excel | `xlsx` (SheetJS) |
| Generación de PDF | `jspdf` |
| Estilos | CSS propio (sin framework), variables CSS para tema claro/oscuro |

No hay backend ni servidor: todo vive localmente en el Mac del usuario (`~/Library/Application Support/com.tesoreria.app/tesoreria.db`).

---

## 3. Modelo de datos (SQLite)

```
churches      (id, nombre, ciudad, pais, moneda, logo_path, created_at)
members       (id, church_id, nombre, email, telefono, rfc, direccion,
               etiquetas [JSON], fecha_ingreso, notas, activo, created_at)
transactions  (id, church_id, tipo[ingreso|gasto], categoria, subcategoria,
               concepto, detalle, fecha, monto, moneda, metodo_pago,
               member_id, beneficiario, beneficiario_rfc, comprobante_path,
               emitir_constancia, estado[pendiente|aprobado|rechazado],
               notas, created_at)
```

- Esquema ya preparado para multi-inquilino (`church_id` en todo), pero la app hoy solo usa **una iglesia** (`getOrCreateChurch()` toma/crea la primera fila).
- Migraciones aplicadas: **v1** (esquema inicial) y **v3** (cambio de moneda por defecto MXN→USD). La v2 se retiró tras un conflicto de checksum durante desarrollo — nunca reutilizar ese número de versión.
- `activo` en `members` permite archivar sin perder historial (ver §5).
- `estado` en `transactions` permite marcar movimientos "pendientes de revisión" que no cuentan en los totales hasta aprobarse.

### Categorías

- **Ingreso:** Ofrenda, Diezmo, Donación, Otros
- **Gasto (12):** Pastores, Músicos, Administración, Limpieza, Servicios, Mantenimiento, Eventos, Materiales, Misiones, Ayudas, Tecnología, Transporte

---

## 4. Funcionalidad implementada

### Pantallas (todas conectadas a datos reales)
- **Inicio** — balance del mes, resumen ingresos/gastos, movimientos recientes
- **Ingresos / Gastos** — listado filtrable por categoría, totales, % por categoría
- **Miembros** — listado con búsqueda por nombre/email/RFC
- **Reportes** — estado financiero mensual (ingresos, gastos, balance neto) + exportación
- **Bandeja** — ver §5
- **Configuración** — editar nombre, ciudad, país y moneda de la iglesia

### CRUD completo
- **Crear**: modal único con 3 pestañas (Ingreso / Gasto / Miembro), formulario adaptado a cada tipo
- **Editar**: mismo modal reutilizado en modo edición (precarga datos, oculta las pestañas)
- **Eliminar**:
  - Movimientos: eliminación real con `ConfirmDialog`
  - Miembros: **eliminación inteligente** — si no tiene movimientos asociados se borra de verdad; si sí tiene, se archiva (`activo=0`) para no perder el historial en reportes

### Comprobantes (adjuntos)
- Selector de archivo nativo de macOS (PDF/PNG/JPG/HEIC) al crear/editar un ingreso o gasto
- Se guarda la ruta en `comprobante_path`; botón "Ver" la abre con la app predeterminada del sistema
- Indicador de clip visible en la lista de movimientos cuando hay comprobante adjunto

### Exportación de reportes
- **Excel** real (`.xlsx`) vía diálogo nativo "Guardar como"
- **PDF** real (`.pdf`) con el mismo diseño del reporte en pantalla
- Nombre de archivo sugerido automáticamente

### Modo oscuro
- Toggle funcional en el sidebar, persistido en `localStorage`, sin parpadeo al cargar

---

## 5. Bandeja — diseño particular

Originalmente concebida como centro de aprobaciones multiusuario (mockup `mockup-bandeja.html`), pero como la app **todavía no tiene sistema de cuentas/multiusuario**, se reescribió con alcance honesto para un tesorero individual:

1. **Pendientes de revisión** — movimientos marcados con el checkbox "Marcar para revisar después" en el modal. No cuentan en los totales del mes hasta que se marcan como revisados aquí.
2. **Miembros archivados** — con botón "Restaurar" (antes de esto, un miembro archivado no se podía recuperar desde la UI).

---

## 6. Decisiones de diseño y bugs resueltos

| Problema | Solución |
|---|---|
| `window.confirm()` poco confiable dentro del webview de Tauri | Componente propio `ConfirmDialog.tsx` (React, no depende de APIs nativas del navegador) |
| Menú "···" recortado por `overflow:hidden` de las tablas | `RowMenu.tsx` usa un **portal de React** (`createPortal` a `document.body`) con posición `fixed` calculada en JS |
| Categorías con cajas de distinto tamaño en el formulario | La clase `.tag` heredaba `justify-self:center; white-space:nowrap`, pensada para tablas; se creó `.cat-pill` con tamaño uniforme forzado |
| Selección de categoría poco visible | En vez de un anillo del color de tema (se perdía contra fondos pastel), se usa una insignia circular oscura con palomita blanca (colores fijos, no dependen del tema) |
| Botón flotante "+" duplicado en Ingresos/Gastos | Se eliminó el botón global fijo; cada página tiene un único botón "+ Nuevo X" en su propio header |
| Migración v2 con checksum distinto tras editar el archivo en caliente | Se retiró y se creó como v3; regla: nunca modificar el SQL de una migración ya aplicada, siempre agregar una nueva versión |
| Moneda por defecto MXN en vez de USD | Cambiada a USD + migración v3 que corrige datos ya creados |
| Etiquetas manuales (Diezmador, etc.) al registrar un miembro | Se quitaron del formulario — ese tipo de clasificación debería calcularse a partir del historial real de aportes, no asignarse a mano |

---

## 7. Explícitamente fuera de alcance (decisiones tomadas, no pendientes por descuido)

- **Cuentas reales / Login / Registro / Selector de iglesias con backend en la nube** — Se diseñaron los mockups (`mockup-login.html`, `mockup-registro.html`, `mockup-onboarding-iglesia.html`, `mockup-selector-iglesia.html`) pero **no se conectaron**. Requiere elegir y levantar un backend (recomendado: **Supabase** — Postgres + Auth + Row Level Security, encaja con el esquema relacional ya diseñado). Implica que la app dejaría de ser 100% local/offline. Pendiente de que el usuario cree la cuenta en Supabase y comparta Project URL + anon key.
- **Sincronización local ↔ nube (offline-first)** — Deliberadamente no se intentó; es uno de los problemas más difíciles de ingeniería de software. Si se agrega backend, la app probablemente pasaría a requerir internet en vez de sincronizar.
- **PWA móvil** — Existe una versión previa (`~/Desktop/Tesoreria-semifinal--main`) con diseño distinto (paleta navy/esmeralda/dorado). Se decidió no tocarla hasta terminar la app de Mac.

## 8. Pendientes razonables para continuar

- Migrar de "una sola iglesia implícita" a selector real de iglesias (el esquema ya lo soporta vía `church_id`)
- Editar/cancelar comprobante desde la vista de detalle de un movimiento (hoy solo desde el modal de edición)
- Copiar el archivo de comprobante a una carpeta propia de la app en vez de solo guardar la ruta original (para no perder el vínculo si el usuario mueve/borra el archivo original)
- Paginación real en listas largas de movimientos/miembros (hoy hay límites fijos en las consultas)
- Pruebas automatizadas (no existen actualmente — todo se verificó manualmente corriendo la app)

---

## 9. Cómo correr el proyecto

```bash
cd "tesoreria"
npm install
npm run tauri dev
```

Requiere Rust (`rustup`) y Node.js instalados. El primer build de Rust tarda ~30-60s; los siguientes son incrementales.
