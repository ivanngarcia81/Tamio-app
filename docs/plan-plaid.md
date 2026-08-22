# Plan de implementación — Conciliación bancaria (Plaid en solo lectura)

**Estado (21 ago 2026): PLAN ESCRITO, SIN EMPEZAR.** Es la bajada a
implementación de la idea de `docs/ideas-futuras.md` → sección 7
("Conciliación bancaria (Plaid en solo lectura)", Iván, 29 jul 2026). Las
decisiones de producto de esa sección **no se relitigaron aquí**: solo lectura,
el libro local sigue mandando, el token vive en el servidor, la fuente está
desacoplada (Plaid + archivo), la función vive en Depósitos, y la disciplina la
impone la visibilidad, nunca el bloqueo.

**Decisiones nuevas tomadas al escribir este plan (Iván, 21 ago 2026):**

- **Tope de 2 cuentas conectadas por iglesia** (protege el margen: Plaid cobra
  ~1–1.5 USD por cuenta al mes sobre los $23.99 de la suscripción; verificar el
  precio real al contratar). Ampliable después.
- **El banco también se ve desde Movimientos** (gastos e ingresos), como
  referencia cruzada — no solo desde Depósitos. Detalle en la Fase 0.
- **Vista agrupada por categoría** de los movimientos del banco (una fila por
  categoría, p. ej. supermercado; y una fila de recurrentes/suscripciones).
  Plaid trae la categoría; la fila agrupada la construye Tamio (ver "Qué hace
  Plaid y qué construye Tamio").

---

## Qué hace Plaid y qué construye Tamio

Para no confundir el producto con la app:

| Lo trae Plaid (por transacción) | Lo construye Tamio encima |
|---|---|
| Monto, fecha, descripción, estado *pending* | Conversión a centavos (`Centavos`), tabla local cifrada |
| **Categoría** — `personal_finance_category` (~120 categorías: FOOD_AND_DRINK_GROCERIES, GENERAL_SERVICES…), incluida en Transactions **sin costo extra** | La **fila agrupada** por categoría (un `GROUP BY` local), y el mapa categoría de Plaid → categorías de Tamio para pre-llenar gastos/ingresos |
| **Comercio** — `merchant_name` normalizado | Detección local de **recurrentes/suscripciones** (comercio + monto + cadencia), cruzada con la tabla `gastos_recurrentes` que ya existe |
| Saldos por cuenta | La **conciliación** con el libro: emparejar, "salidas sin justificar", crear gasto/ingreso/depósito desde un movimiento |

**Suscripciones:** Plaid tiene un producto aparte que las agrupa solo
(`/transactions/recurring/get`, Recurring Transactions), pero **cuesta extra
por cuenta**. La v1 las detecta gratis con la heurística local; el producto de
Plaid queda como mejora opcional si la detección local se queda corta.

---

## Decisiones de arquitectura

### 1. Plaid Link por Hosted Link en el navegador externo — la CSP no se toca

Incrustar el SDK de Link en la app exigiría añadir `cdn.plaid.com` a
`script-src`/`frame-src` (`src-tauri/tauri.conf.json:38`, vigilado por
`scripts/verificar-csp.mjs`), debilitando el candado más fuerte de la app. En
su lugar:

1. La Edge Function crea el `link_token` con el bloque `hosted_link: {}` →
   Plaid devuelve una `hosted_link_url`.
2. La app abre esa URL en el **navegador del sistema** (opener de Tauri; igual
   en Mac, iPad y iPhone, y resuelve solo los redirects OAuth de bancos como
   Chase).
3. Al volver, la app llama a la función de intercambio; el **servidor** obtiene
   el `public_token` con `/link/token/get` y lo intercambia.

**Ni el `public_token` ni el `access_token` tocan jamás el cliente.** Cambio de
CSP necesario: **ninguno** (`connect-src` ya cubre `https://*.supabase.co`).

### 2. El servidor baja de Plaid; los dispositivos solo sincronizan

La Edge Function escribe los movimientos directamente en la tabla espejo de la
nube con `uid = 'plaid-' + transaction_id` (determinista). Los dispositivos los
reciben por el motor de sync normal. Eso elimina de raíz el "dos Macs bajan la
misma transacción con uids distintos", y el estado de conciliación (que sí
edita el cliente) sube por el mismo canal last-write-wins. Los movimientos
importados de archivo nacen en el cliente con uid aleatorio y suben como
cualquier depósito.

### 3. Montos siempre positivos + columna `tipo`

Plaid entrega `amount` como float **con signo** (positivo = sale dinero). Se
guarda `monto INTEGER` en centavos **siempre positivo** + `tipo`
(`'debito'`/`'credito'`), espejo del patrón `ingreso`/`gasto` de
`transactions`. La conversión float→centavos ocurre **en la Edge Function**
con un helper de texto compartido (doctrina de `deTexto()` de
`src/dinero.ts`; nunca `Math.round(n*100)`). Los CSV en el cliente pasan por
`deTexto()`, como ya hace `scripts/verificar-csv-centavos.ts`.

---

## Fase 0 — Cimiento sin Plaid: tabla local + importación de archivo + motor de conciliación

Entrega todo el valor de control interno **sin cuenta de Plaid**, como manda la
idea original ("en desarrollo se usa la importación de archivo; se lanza con
Plaid; el archivo queda como respaldo permanente"). Al cerrar esta fase la
función es usable de punta a punta con CSV/OFX.

### 0.1 Migración v38 (`src-tauri/src/lib.rs`, append tras la v37 — nunca reusar números)

Dos tablas nuevas:

- **`cuentas_banco`** — la entidad de cuenta que hoy no existe
  (`depositos_bancarios.cuenta_banco` es texto libre y **no se toca**: conviven):
  `id, church_id, uid, nombre ("Chase · Cheques"), institucion, mask ("0442"),
  tipo (checking|savings), fuente ('plaid'|'archivo'), plaid_account_id,
  saldo, saldo_disponible, saldo_fecha (centavos; NULL si desconocido),
  estado ('activa'|'reauth'|'desconectada'), ultimo_sync,
  created_at, updated_at, deleted`.
- **`movimientos_banco`** — la bandeja del banco:
  `id, church_id, uid ('plaid-<tx_id>' o UUID de archivo), cuenta_uid,
  fecha (YYYY-MM-DD), monto (centavos, SIEMPRE positivo),
  tipo ('debito'|'credito'), descripcion,
  comercio (merchant_name de Plaid), categoria_banco
  (personal_finance_category.primary de Plaid; NULL en archivo),
  pendiente (pending de Plaid), fuente ('plaid'|'archivo'),
  plaid_transaction_id, hash_dedupe
  (cuenta_uid|fecha|monto|tipo|descripcion normalizada; el FITID del OFX entra
  aquí), estado ('sin_conciliar'|'conciliado'|'ignorado'),
  conciliado_tipo ('transaction'|'deposito'|NULL), conciliado_uid,
  created_at, updated_at, deleted`.
- Índices: `(church_id, estado, fecha)` y `(church_id, hash_dedupe)`.

Ambas tablas entran solas al respaldo `.tamio` (`src-tauri/src/paquete.rs`) y a
la base cifrada.

### 0.2 Acceso a datos (`src/db.ts`, mismo estilo del resto)

Tipos `CuentaBanco` y `MovimientoBanco`, más: `listCuentasBanco`,
`listMovimientosBanco(churchId, {estado, cuentaUid, page})`,
`countMovimientosSinConciliar`, `sumMovimientosSinJustificar` (débitos sin
conciliar — alimenta la lista persistente), `insertMovimientosArchivo` (dedupe
por `hash_dedupe`, estilo `findDuplicateDeposito` en `db.ts:819`),
`conciliarMovimiento` / `desconciliarMovimiento` / `ignorarMovimiento`,
`candidatosParaMovimiento` y `movimientoBancoDe(txUid)` (lookup inverso para la
insignia en Movimientos).

### 0.3 Importación CSV/OFX (`src/services/bancoImport.ts`)

- CSV: reutilizar `parseCsvFile` / `autoDetectMapping` / `applyMapping` de
  `src/services/csvImport.ts` (papaparse ya está). Campos: fecha, descripción,
  monto (o débito/crédito en columnas separadas, común en bancos de EE.UU.).
  Montos por `deTexto()`.
- OFX/QFX: parser mínimo propio (bloques `<STMTTRN>`: `TRNAMT`, `DTPOSTED`,
  `NAME`/`MEMO`, `FITID`; el `FITID` da dedupe fuerte).
- Modal calcado del patrón de importación existente, pidiendo primero "¿a qué
  cuenta?" (crear la cuenta de archivo si no existe).

### 0.4 Motor de emparejamiento (`src/services/conciliacion.ts`, funciones puras)

Determinista, sin IA:

1. **Crédito** → candidatos en `depositos_bancarios` con mismo monto y fecha
   ±3 días; si no hay, `transactions` tipo ingreso, mismo monto ±3 días.
2. **Débito** → `transactions` tipo gasto (aprobado o pendiente), mismo monto,
   fecha ±5 días.
3. Empate exacto fecha+monto con candidato único → **sugerencia fuerte** (un
   tap confirma). Varios candidatos → lista para elegir. Sin candidatos →
   segunda pasada solo-monto a 30 días, marcada "posible".
4. Excluir registros ya vinculados por otro movimiento (el vínculo
   `conciliado_uid` es 1:1 — es lo que evita conciliar dos veces).

**Detección local de recurrentes/suscripciones:** agrupar débitos por comercio
normalizado + monto similar (±5%) con cadencia ~mensual (28–33 días) o semanal;
cruzar con `gastos_recurrentes` (`src/db.ts:3267`) para sugerir el vínculo.

### 0.5 UI

**En Depósitos** (`src/pages/Depositos.tsx`, el hogar de la función):

- Segmento nuevo **"Banco"**: tarjetas de cuentas (saldo, último sync), y el
  banner persistente **"N salidas sin justificar — $X"** — siempre visible
  mientras haya débitos sin conciliar, **nunca bloquea** (la advertencia de
  diseño de ideas-futuras).
- Lista de movimientos con la sugerencia al lado (patrón visual de
  `Bandeja.tsx`), con **dos vistas conmutables**:
  - **Cronológica** — lo que entró y lo que salió, crédito/débito diferenciados.
  - **Agrupada por categoría** — una fila por `categoria_banco` (o comercio si
    no hay categoría) con total y conteo, expandible; incluye la fila
    "Recurrentes / Suscripciones" de la detección local.
- Acciones por movimiento: **Vincular** (al candidato sugerido o buscado) ·
  **Crear gasto/ingreso desde el movimiento** (pre-llena el modal existente con
  fecha, monto, descripción **y la categoría de Tamio sugerida** por el mapa
  `categoria_banco` → `CATEGORIAS_GASTO`/`CATEGORIAS_INGRESO`; al guardar queda
  conciliado) · **Crear depósito** (pre-llena `DepositoModal`) · **Ignorar**
  (con motivo, reversible).
- Variantes Mac/iPad + hoja de iPhone con hook compartido (patrón
  `DepositoModal.tsx` ↔ `components/ios/NuevoDepositoIOS.tsx` +
  `components/deposito.ts`). Componentes: `ConciliacionPanel.tsx`,
  `ios/ConciliacionIOS.tsx`, hook `components/conciliacion.ts`.

**En Movimientos** (`src/pages/Movimientos.tsx` — referencia cruzada, decisión
del 21 ago 2026):

- Cada gasto/ingreso conciliado muestra una insignia **"Banco ✓"** (por
  `movimientoBancoDe(txUid)`), con detalle al tocar: fecha, cuenta y
  descripción del movimiento del banco.
- Un panel/filtro **"Banco"** en la misma página lista lo que entró y salió del
  banco en el periodo visible, como referencia junto al libro — **solo
  lectura**, con acceso directo a conciliar (abre la misma hoja de
  conciliación). El libro nunca se modifica desde esa vista.

i18n: bloque `banco.*` en `src/i18n/es.ts` **y** `en.ts` (paridad tipada,
vigilada por el build y `verificar-traducciones.mjs`).

### 0.6 Sync + nube

- `supabase/sync-b1-banco.sql`: tablas espejo `public.cuentas_banco` y
  `public.movimientos_banco` (uid PK text, `church_id uuid references
  iglesias`, **montos `bigint`** — no repetir el `double precision` de las
  tablas viejas), con las 4 políticas RLS por `church_id`, idénticas a
  `sync-d1-depositos.sql`.
- `src/sync.ts`: `CUENTA_BANCO_DATA_COLS`, `MOV_BANCO_DATA_COLS`; registrar los
  dos pasos en `sincronizarTodo()` (~línea 1033), **cuentas antes que
  movimientos** (los movimientos referencian `cuenta_uid`).
- Orden de despliegue: el SQL en la nube **antes** del release que lo usa.

### 0.7 Gating (desde la Fase 0, aunque Plaid no exista aún)

- `src/banco.ts` (patrón `src/ia.ts`): `bancoHabilitado = Boolean(supabase) &&
  import.meta.env.VITE_BANCO_HABILITADO === "1"`. Sin la bandera, ni el
  segmento "Banco" ni la importación aparecen: los builds actuales no cambian.
- Rol: solo **tesorero/administrador** (ocultar para secretaria).
- Plan: exigir plan con Tesorería y sesión de nube activa; el gate duro de la
  conexión Plaid vive en el servidor (Fase 1).

### 0.8 Verificación de la Fase 0

- `scripts/verificar-conciliacion.ts` (patrón `verificar-estado-financiero.ts`):
  casos del matcher (crédito exacto, débito ±5 días, ambigüedad, solo-monto,
  ya-vinculado) y de la detección de recurrentes.
- Fixtures CSV/OFX de un banco de EE.UU. en `scripts/fixtures/`; re-importar el
  mismo archivo debe deduplicar (0 filas nuevas).
- `npm run verificar-dinero`, `verificar-csv-centavos`,
  `verificar-traducciones`, `npx tsc --noEmit`, build completo.
- Respaldo/restauración `.tamio` con las tablas nuevas pobladas.

---

## Fase 1 — Plaid en sandbox

### 1.1 Lado servidor (Supabase)

- Tabla **solo-servidor** `public.plaid_items`: `id uuid pk, church_id uuid,
  item_id, access_token, cursor, institution_id, institution_name,
  estado ('activa'|'reauth'|'desconectada'), link_token_pendiente,
  created_at, updated_at`. **RLS habilitado SIN políticas** → solo el
  `service_role` (las Edge Functions) la alcanza; el token jamás es accesible
  desde el cliente. Mejora opcional (no bloqueante): cifrar el token con
  Supabase Vault.
- Secretos: `supabase secrets set PLAID_CLIENT_ID=… PLAID_SECRET=…
  PLAID_ENV=sandbox`.

### 1.2 Edge Functions (`supabase/functions/`, mismos patrones existentes)

| Función | JWT | Endpoints Plaid | Notas |
|---|---|---|---|
| `plaid-crear-link-token` | ✅ | `/link/token/create` (con `hosted_link:{}`, producto `transactions`, `webhook` → URL de `plaid-webhook`) | **Doctrina de `invitar-usuario`: el `church_id` se lee del perfil del llamador, NUNCA del body.** Verifica rol tesorero/admin, plan vigente y el **tope de 2 cuentas** (el gate duro vive aquí). Guarda `link_token_pendiente`. Modo `actualizar` (re-auth) → Link update mode. Devuelve `hosted_link_url`. |
| `plaid-intercambiar-token` | ✅ | `/link/token/get`, `/item/public_token/exchange`, `/accounts/get` | Usa el `link_token_pendiente` de la iglesia; extrae el `public_token` del resultado de la sesión Hosted Link, intercambia, guarda el token en `plaid_items`, upsertea `public.cuentas_banco` con `fuente='plaid'`. **No devuelve tokens.** |
| `plaid-sincronizar` | ✅ | `/transactions/sync` (cursor), `/accounts/balance/get` | Recorre los items de la iglesia del llamador; upsert en `public.movimientos_banco` con `uid='plaid-'+transaction_id` (added/modified; removed → `deleted=true` si sigue sin conciliar); maneja `pending_transaction_id` (al confirmarse un pendiente cambia el id — se reemplaza la fila); guarda `merchant_name` → `comercio` y `personal_finance_category.primary` → `categoria_banco`; float→centavos con el helper compartido `_shared/centavos.ts`; actualiza saldos y `ultimo_sync`. |
| `plaid-webhook` | ❌ `--no-verify-jwt` | verificación JWT de Plaid (`/webhook_verification_key/get`; patrón raw-body de `pago-webhook`) | `SYNC_UPDATES_AVAILABLE` → misma lógica de sync (módulo compartido `_shared/plaid.ts`); `ITEM_LOGIN_REQUIRED` / `PENDING_EXPIRATION` → `estado='reauth'` en item y espejo (el cliente lo baja por sync y muestra "Reconectar"). |
| `plaid-desconectar` | ✅ | `/item/remove` | church del perfil; marca item y cuentas `desconectada`; **los movimientos ya bajados se conservan** (historial de control). Corta el costo mensual. |

### 1.3 Lado app

- `src/banco.ts` crece con los invocadores (`supabase.functions.invoke`,
  errores estilo `invocarIACruda` de `src/ia.ts`): `crearEnlacePlaid()`,
  `completarEnlacePlaid()`, `sincronizarBanco()`, `desconectarBanco()`.
- Flujo conectar: botón "Conectar banco" → `crearEnlacePlaid()` → abrir
  `hosted_link_url` con el opener de Tauri → diálogo "Cuando termines en el
  navegador, vuelve aquí" con botón **"Ya conecté"** → `completarEnlacePlaid()`
  → sync → refrescar. Sin deep links y sin tocar la CSP.
- Estado `reauth`: badge en la tarjeta de la cuenta + botón "Reconectar".
- Pendientes de Plaid: atenuados con etiqueta "pendiente en el banco"; **no
  cuentan** en "salidas sin justificar" hasta confirmarse.
- La app invoca `plaid-sincronizar` al entrar al segmento Banco y con un botón
  "Actualizar"; después corre `sincronizarTodo()` para bajar las filas.

### 1.4 Verificación de la Fase 1

- Sandbox de Plaid: institución de prueba con `user_good` / `pass_good`;
  `/sandbox/item/fire_webhook` para `SYNC_UPDATES_AVAILABLE`;
  `/sandbox/item/reset_login` para forzar el flujo de re-auth.
- Probar: tope de 2 cuentas rechazado **por el servidor**; desconexión; dos
  dispositivos sincronizando sin duplicados (uid determinista); conciliar en el
  iPad lo que se bajó en la Mac.

---

## Fase 2 — Producción y lanzamiento

1. Solicitar la aprobación de **Producción de Plaid al inicio de la Fase 1**,
   no al final (el trámite tarda semanas y es el camino crítico del
   calendario). Contratar **pay-as-you-go sin mínimo mensual** (decisión de
   ideas-futuras).
2. `PLAID_ENV=production`, re-deploy de funciones, webhook al proyecto
   productivo.
3. **Apple:** etiqueta de privacidad (Financial Info **vinculada al usuario**),
   reescribir la política de privacidad, y documentar el argumento de
   categoría (la app no mueve dinero ni ofrece productos financieros de
   terceros). Hacerlo como **release dedicado**: es un envío delicado por sí
   solo.
4. Control de costos: el tope de 2 cuentas ya vive en el servidor; monitorear
   items activos vs. suscripciones; desconexión automática si la suscripción
   vence (con periodo de gracia — decidir y documentar antes de codificarlo).
5. Limitar la conexión Plaid a iglesias con `moneda='USD'` en la v1 (los
   importes de archivo heredan la moneda de la iglesia, como hoy).
6. Documentar el despliegue en `docs/` (funciones + SQL a correr, como los
   `sync-*.sql` existentes).

---

## Guardarraíles — qué NO se construye

- **Nada de auto-contabilizar:** un movimiento del banco jamás crea un registro
  del libro por sí solo.
- **Nada de mover dinero:** ningún producto de pagos de Plaid, nunca.
- **El saldo del banco nunca pisa el libro:** se muestra al lado, informativo.
- **Ningún bloqueo** por movimientos sin justificar: solo la lista persistente
  visible ("la disciplina la impone la visibilidad, no el bloqueo").

## Riesgos principales

- **Conciliar dos veces** (no hay duplicado de datos: banco y libro viven en
  tablas distintas): mitigado con el vínculo 1:1 por `conciliado_uid` y la
  exclusión de ya-vinculados en el matcher.
- **La aprobación de Producción de Plaid** es el camino crítico → por eso la
  Fase 0 entrega valor sin ella.
- **Columnas nuevas en el sync:** seguir el orden probado (SQL en la nube
  primero, release después).
- **Costo por cuenta** (~1–1.5 USD/mes sobre $23.99): tope de 2 cuentas en el
  servidor y monitoreo.

## Archivos críticos

| Archivo | Qué le pasa |
|---|---|
| `src-tauri/src/lib.rs` | Migración v38 (append tras la v37) |
| `src/db.ts` | Tipos + CRUD de `cuentas_banco`/`movimientos_banco`, candidatos, lookup inverso |
| `src/sync.ts` | Dos pasos nuevos, registrados en `sincronizarTodo()` |
| `src/pages/Depositos.tsx` | Segmento "Banco": cuentas, banner, conciliación |
| `src/pages/Movimientos.tsx` | Insignia "Banco ✓" + panel de referencia |
| `src/services/bancoImport.ts` · `src/services/conciliacion.ts` | Nuevos: importación y matcher |
| `src/banco.ts` | Nuevo: bandera + invocadores de las funciones |
| `supabase/sync-b1-banco.sql` | Nuevo: espejos + RLS |
| `supabase/functions/plaid-*/index.ts` | Nuevas: las 5 funciones de la Fase 1 |

**Prompt de diseño:** `docs/prompt-diseno-plaid.md` tiene el prompt listo para
Claude Design con la visión de estas pantallas.
