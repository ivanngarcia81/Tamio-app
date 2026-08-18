# Tamio — Hoja de ruta de ideas futuras

Notas de producto para después del lanzamiento en la App Store. No es un
compromiso ni un orden fijo; es para no perder las buenas ideas.

_Última actualización: 1 de agosto de 2026_

---

## 🚨 BLOQUEANTE antes de publicar cualquier actualización

### Banner de actualizaciones: ocultarlo en iOS
`src/components/UpdateBanner.tsx` se renderiza sin condición de plataforma en
`src/App.tsx` (~línea 296). En iPhone/iPad eso significa que:

1. La app consulta un `version.json` en GitHub al arrancar (petición de red silenciosa).
2. Si hay una versión más nueva, muestra un botón **"Descargar"** que abre un
   **`.dmg` de Mac** — lo que **Apple prohíbe** (directrices 3.1.1 / 2.5.2: una
   app de iOS no puede dirigir a descargar software fuera del App Store).

> 🔴 **CORRECCIÓN (1 ago 2026).** Una versión anterior de esta nota decía que el
> archivo peligroso era `web/version.json` **de este repo**. Es falso y la
> advertencia apuntaba al archivo equivocado. El archivo que la app lee de verdad
> es:
>
> ```
> src/services/update.ts:16
> https://ivanngarcia81.github.io/Tamio-web/version.json
> ```
>
> Es decir, **el `version.json` del repo `Tamio-web`**, no el de este repositorio.
> El `web/` de aquí no lo lee nadie. Quien hubiera seguido la nota anterior habría
> publicado la actualización creyéndose a salvo.

**Por qué no bloqueó la 1.0:** ese `version.json` sigue en `1.0.0` y la app es
`1.0.8`, así que `esMasNueva()` da false y el banner nunca se muestra. El revisor
de Apple no lo vio. **Decisión (28 jul 2026, Iván): se arregla en la 1.1.**

> ⚠️ **PELIGRO:** el día que subas el `version.json` **del repo `Tamio-web`** a una
> versión mayor (p. ej. `1.1.0`) para avisar a los usuarios de **Mac**, los
> usuarios de **iPhone** empezarán a ver un banner ofreciéndoles descargar un
> `.dmg`. **NO toques ese archivo hasta haber arreglado el banner.**

**Arreglo:** condicionar `<UpdateBanner />` a que la plataforma no sea iOS
(p. ej. con `platform()` de `@tauri-apps/plugin-os`, o una bandera de build).
Toca `App.tsx`, que es código compartido con Mac/iPad.

### Tarjeta de plan: restaurar estado y vencimiento con el login
En la 1.0 (modo local) `PlanSettings.tsx` se reduce a elegir **áreas**: se
quitaron el estado (Activa/Cortesía/Prueba/Vencida) y la fecha de vencimiento.

**Por qué:** con el login apagado la tarjeta quedó *editable*, así que cualquiera
—incluido el revisor de Apple— veía "Plan / Trial / Expired / Vence el…" y podía
autoconcederse "Cortesía (no caduca)". Eso (a) usa vocabulario de suscripción
sin que exista forma de comprarla en la app, roce con la directriz 3.1.1;
(b) contradice las notas al revisor, que dicen que la app es gratis y sin muro de
pago; y (c) exponía un control del vendedor ("sirve para regalar cuentas") a los
clientes.

**Para la 1.1:** al reactivar el login la tarjeta vuelve sola a su modo de
**solo lectura** (rama `soloLectura`, ya escrita), donde la nube manda y sí tiene
sentido mostrar estado y vencimiento. No hay que rehacer nada, solo comprobar que
se ve bien.

---

## 🐞 Hallazgos de la auditoría del 1 ago 2026 (verificados en el código)

Revisión externa sobre `main` @ `1c0a861` (v1.0.8), contrastada línea por línea
antes de aceptarla. Ordenados por gravedad. **Ninguno es una regresión nueva**:
todos venían de antes, así que no bloquean la 1.0 ya enviada; son la lista de
trabajo de la 1.1.

### A. Afectan al dinero — arreglar primero

**A1. Un depósito puede no contar en ningún total.** — ✅ **ARREGLADO (1 ago 2026)**
`periodo` (YYYY-MM) es un campo independiente de `fecha`, y **todos los totales
filtran por `periodo`** (`db.ts:870`, `db.ts:883`). El modal lo inicializa con el
mes de HOY, no con el de la fecha del depósito (`DepositoModal.tsx:40`), y solo lo
sincroniza mientras el usuario no lo toque: `if (!periodoTocado …)`
(`DepositoModal.tsx:58`). En cuanto se toca una vez, los dos campos pueden
discrepar para siempre **sin que nada avise**, y la lista muestra la fecha en
grande y el periodo en gris pequeño — se suma por el que no se ve.
*Arreglo aplicado:* la discrepancia ya no es invisible.
1. **Modal:** aviso en vivo, no bloqueante, en cuanto el mes de `fecha` ≠ `periodo`
   ("Este depósito se sumará en julio 2026, no en agosto 2026: los totales
   agrupan por período correspondiente").
2. **Fila de la lista:** el `2026-07` suelto en gris se sustituye por
   "Corresponde a Julio 2026" resaltado, y **solo aparece cuando difiere** — así
   la excepción destaca en vez de perderse entre filas normales.
3. **Tarjeta de resumen:** ahora dice "Período agosto 2026 · 0 depósitos", que
   explica por sí sola por qué un depósito con fecha de agosto puede no contar.

Se mantiene a propósito la posibilidad de que difieran: depositar en agosto el
dinero de julio es un caso real y legítimo. Lo que se arregla es que ocurra **sin
que nadie se entere**.

**A2. El dinero se guarda en coma flotante.** — 📋 **PLAN ESCRITO, SIN EMPEZAR**
`monto REAL NOT NULL` en tres tablas (`lib.rs:43`, `:84`, `:136`) más
`saldo_inicial` (`:663`). Con `SUM(monto)` los centavos derivan, y los porcentajes
de los reportes dejarán de cuadrar contra el PDF en cuanto haya cifras reales.
*Arreglo:* guardar centavos como entero y dividir solo al mostrar.

El plan completo está en **`docs/plan-centavos.md`**: inventario, orden de los
pasos, la trampa del `CAST` sin `ROUND`, las pruebas y la marcha atrás.

**Cuándo:** después de que Apple apruebe la 1.0, y en su propia rama. El motivo
no es que la migración ponga en riesgo datos durante la revisión — solo corre en
un build que alguien instale, así que mientras la 1.0 está en revisión no le pasa
nada a nadie. El motivo es que **si Apple rechaza y hay que mandar un arreglo
urgente, `main` no puede estar a medio migrar la base**: un rechazo obliga a
corregir algo pequeño y volver a subir el mismo día.

### B. Correcciones claras

**B1. `fmtMoney` fija el formato numérico en inglés.** — ✅ **ARREGLADO (1 ago 2026)**
El símbolo ya era dinámico, pero `toLocaleString("en-US")` estaba clavado.

*Ojo con la solución:* la auditoría proponía seguir **el idioma de la app**, y eso
habría sido una regresión. El separador de miles es una convención **del país**,
no del idioma: en México, Puerto Rico y EE. UU. se escribe `1,250.50`, y en España
y Argentina `1.250,50` — los tres en español. Atarlo al idioma le habría cambiado
el formato a los usuarios del mercado principal (la ficha de la App Store tiene
Spanish (Mexico) como idioma). Se toma de la **configuración regional del
dispositivo**, con `en-US` de reserva.

**B1-bis. La ENTRADA de importes trataba la coma como millares.** — ✅
**ARREGLADO (18 ago 2026, rama `coma-decimal`)**
La otra mitad de B1, y más grave: `fmtMoney` era la salida, pero al TECLEAR,
`deTexto` borraba la coma como separador de miles y `1,50` se guardaba como
**$150.00**, sin aviso, en Mac y en iPhone por igual. Lo tecleado pasa ahora por
`deTextoTecleado` (`src/dinero.ts`), que usa la misma configuración regional del
dispositivo que B1 —entrada y salida responden a la misma pregunta con la misma
fuente—, saca de la moneda cuántos decimales admite (CLP, PYG y COP no tienen), y
**rechaza con aviso lo ambiguo** en vez de adivinar. `deTexto` se quedó intacto
como parser de formato fijo de los CSV: los archivos guardados se leen igual que
siempre.

**B2. `fs:scope` abarca todo `$HOME`.** — ✅ **ARREGLADO (2 ago 2026)**
El permiso estaba en `$HOME/**` en dos sitios (`fs:scope` y
`opener:allow-open-path`): la carpeta del usuario entera, incluidas `~/.ssh`,
`~/Library` (llaveros, cookies, Correo) y los perfiles del navegador.

Se hizo en tres pasos, y **el orden importaba**: acotar primero habría roto en
silencio todos los comprobantes que apuntaban al Escritorio o a iCloud.

1. El comprobante se **copia** a la carpeta de datos de la app al guardarlo, en
   vez de guardar la ruta del archivo del usuario (que se puede mover o borrar).
2. Una migración trae adentro los comprobantes de instalaciones anteriores,
   aprovechando que el permiso amplio todavía estaba vigente. Lo que ya no
   existe se deja tal cual y la vista previa lo dice con todas las letras.
3. Recién entonces se acotó el permiso, y en **dos archivos separados**:
   `fs-escritorio.json` (carpeta de la app + Escritorio, Documentos, Descargas e
   Imágenes) y `fs-movil.json` (sigue en `$HOME/**`, que en iOS **es** el
   contenedor de la app: ya lo acota el sistema, y el selector de archivos de
   iOS entrega los documentos en una carpeta temporal fuera de `$APPDATA`).

*Por qué no es "solo la carpeta de la app y Descargas":* seis flujos leen o
escriben la ruta que el usuario elige en el diálogo — importar CSV, logo, firma,
foto de perfil, adjuntos y guardar exportaciones — y la gente elige en Escritorio
y Documentos tanto como en Descargas.

**B3. `"csp": null`** — ✅ **ARREGLADO (2 ago 2026)**
Política real en `tauri.conf.json`. `script-src 'self'` más el **hash** del
script en línea de `index.html` (el que fija el tema antes del primer pintado;
no se puede mover a un módulo sin que vuelva el destello blanco al abrir en
oscuro). `connect-src` limitado al IPC de Tauri, al manifiesto de versión y a
Supabase. `devCsp` aparte y permisivo para que `tauri dev` siga funcionando.

⚠️ Si se edita ese script de `index.html`, hay que recalcular el hash o el
navegador lo bloquea en silencio. Queda avisado en el propio `index.html`.

**B4. El webhook de pago decide el plan con datos del navegador.** — ✅ **ARREGLADO (1 ago 2026)**
`planDe()` leía `custom_data.plan`, que viaja desde el navegador del comprador y
es alterable. No había daño hoy (un solo producto, todos deben recibir
"completo"), pero era una puerta abierta en cuanto existiera un plan más barato.
Ahora el plan se deduce del **producto/variante que informa el procesador** en
el evento, que es dato de su servidor. Los IDs se configuran como secretos, sin
tocar código. _(Nombres actualizados el 4 ago 2026: la función se reescribió de
Paddle a Lemon Squeezy el 3 ago, y con ella los secretos.)_

```
supabase secrets set LEMON_PLAN_TESORERIA="123456,234567"
supabase secrets set LEMON_PLAN_SECRETARIA="345678"
supabase secrets set LEMON_PLAN_COMPLETO="456789"
```

Sin ningún secreto configurado —el caso de hoy— todo pago sigue dando "completo".
**Pendiente:** desplegar con `supabase functions deploy pago-webhook --no-verify-jwt`.

### C. Sistema visual (se puede hacer sin tocar la app)

- **C1.** ✅ **ARREGLADO (2 ago 2026).** Escala tipográfica en tokens. Quedan 7
  tamaños en px, todos excepciones documentadas: `body` 14px (base de las
  unidades relativas), los campos de formulario y el buscador a 16px (por debajo,
  iOS hace zoom al enfocar) y cuatro casos puntuales de cifras grandes.
- **C2.** ✅ **ARREGLADO (2 ago 2026).** Escala de espaciado (`--space-1..8`) y
  migrados los 186 huecos: primero los 85 que coincidían exactos con un paso
  (cero cambio visual), después los 101 intermedios (crecen ~2px). Revisado en la
  Mac: sin cambios que molesten.
- **C3.** ✅ **ARREGLADO (1 ago 2026).** Huecos en Ajustes: `.settings-masonry`
  era `grid` de 2 columnas, así que cada tarjeta se quedaba en su celda y la fila
  medía lo que la más alta (`grid-auto-flow: dense` no hacía nada: solo actúa
  sobre elementos que ocupan varias celdas). Cambiado a **columnas CSS**
  (`columns: 2` + `break-inside: avoid`, con la variante prefijada para WebKit
  antiguo), que reparten y equilibran las alturas solas. **Verificado a ojo en la
  Mac el 1 ago 2026**: ninguna tarjeta se parte entre columnas.
- **C4.** ⬜ **PENDIENTE.** Dos paletas para la misma categoría (el chip y su
  porción del donut no coinciden). Una sola paleta con variante clara y saturada
  del mismo tono. En 2.4 solo se dio color a las dos categorías que salían en
  gris; unificar las dos paletas sigue sin hacerse.
- **C5.** ✅ **ARREGLADO (2 ago 2026).** Tokens `--warn` / `--warn-bg` en claro y
  oscuro. De paso se corrigieron dos tokens que **no existían** (`--verde`,
  `--rojo`): el color caía siempre al valor de reserva y nunca se adaptaba al
  modo oscuro.
- **C6.** ⬜ **PENDIENTE.** Accesibilidad: muchos `<div onClick>` sin rol ni
  foco; la app no se recorre con teclado. Es el único punto visual que queda de
  la auditoría, junto con C4.
- **C7.** ✅ **ARREGLADO (1 ago 2026).** Los botones de editar y menú de fila
  quedaban pegados al borde de la tarjeta en **todas** las tablas: la celda de
  acciones era un `.td` normal y heredaba sus 18px de padding lateral dentro de
  una columna de 40px, así que dos botones de 28px no cabían y se desbordaban.
  Ahora esa celda tiene clase propia (`td-acciones`) con su padding, y la columna
  se ensancha a 72px (o 104px donde caben tres botones).

*(La auditoría lista más detalles visuales —montos partidos en dos líneas, flechas
que no siguen el signo, el hero sin color, modales al 86% de alto, estados vacíos
descuadrados, Income vs Expenses desalineadas—. Todos son ciertos como observación
de captura; van con C1–C6 cuando se toque el sistema visual.)*

### D. Higiene del repositorio

- **D1.** ✅ **HECHO (1 ago 2026).** `README.md` describe Tamio.
- **D2.** ✅ **HECHO (1 ago 2026).** `PROJECT_STATUS.md` reescrito: decía v10 de
  migraciones cuando van por la **v35**, y que la base usaba
  `@tauri-apps/plugin-sql` cuando eso lo reemplazó SQLCipher hace tiempo.
- **D3.** `web/` es peso muerto: el `version.json` que la app lee está en
  `Tamio-web` (ver el bloqueante de arriba).
- **D4.** `docs/` mezcla el sitio público (`.html` + `CNAME`) con notas internas
  (`.md`). Separarlo es el paso previo para poder hacer privado este repo.
- **D5.** No borrar `claude/hello-9v3atw` mientras GitHub Pages sirva desde ella.

---

## ✅ Afirmaciones de esa auditoría que resultaron FALSAS

Se dejan escritas para que nadie las repita ni "arregle" algo que ya está bien.

**1. "Sin cifrado local: la base queda en claro."** — **Falso, y es el error más
grave de la auditoría.** La base **sí está cifrada** con SQLCipher y la clave vive
en el **Llavero de macOS**:

```
src-tauri/Cargo.toml:27   rusqlite … features = ["bundled-sqlcipher-vendored-openssl"]
src-tauri/Cargo.toml:29   keyring = { version = "3", features = ["apple-native"] }
src-tauri/src/motordb.rs:45   conn.pragma_update(None, "key", clave)?;
src-tauri/src/lib.rs:840      entrada.get_password()  // clave en el Llavero
```

Lo único cierto es que **no hay PIN ni biometría** para abrir la app — eso es la
función de Face ID, ya en esta hoja de ruta.

**2. "Tagged as tither: 0 con un diezmo registrado, el conteo está mal."** — No es
un bug. `Miembros.tsx:133` cuenta **etiquetas del miembro**
(`if (ets.includes("diezmador"))`), no transacciones. Un miembro con un ingreso de
diezmo pero sin la etiqueta puesta cuenta 0, que es lo correcto. Y el rótulo **ya
dice** "Tagged as tither" — justo el arreglo que la auditoría proponía.

**3. "El modal de gasto muestra 'Save income'."** — La propia auditoría lo retiró y
se confirma: `NewRecordModal.tsx:234-236` deriva título, subtítulo y botón de la
misma variable `tab`, y `en.ts:330` tiene `guardarGasto: "Save expense"`. El código
no puede producir ese texto.

**4. "Falta `@media print`."** — No aplica: el botón Imprimir no usa
`window.print()`, genera el PDF con un servicio propio (`services/print/`).

**5. "El depósito fuera de mes es un problema de zona horaria."** — Retirado por la
propia auditoría; la causa real es A1.

---

## 🥇 Prioridad alta (después de lanzar)

### 1. Invitar usuarios desde la app + roles reales  — 🎯 objetivo: versión 1.1
Hoy existe la pantalla **Configuración → Usuarios**, pero es solo un directorio:
no crea la cuenta de acceso ni envía invitación. Al registrarse, cada usuario
queda como **administrador de su propia iglesia** (trigger en Supabase); no hay
forma de que una segunda persona se una a la MISMA iglesia con rol de tesorero o
secretaria desde la app. Falta conectarlo al login real para que el comprador
invite a su equipo y asigne roles **sin tocar Supabase**.
- La separación de roles **ya funciona** (cada rol ve solo su área).
- Falta: crear/invitar cuenta + unir a la misma iglesia (church_id) + asignar rol
  (función de Supabase, como la de "borrar cuenta") + pantalla de invitación.
- **Por qué importa:** es la pieza que hace realidad el modelo "un producto donde
  el comprador reparte los roles en su iglesia".
- **Decisión (28 jul 2026):** se construye en la **1.1** (opción B). Para la 1.0,
  la descripción de la App Store y del sitio se ajustaron para NO prometer la
  invitación todavía (solo "acceso por roles"). Para los primeros clientes, el
  admin/rol se asigna a mano en Supabase.

### 1-bis. Evolucionar InicioSecretaria a panel de trabajo — 🎯 versión 1.1, DESPUÉS de los roles reales

Propuesta del 3 ago 2026, archivada con una **corrección de premisa
verificada en el código**: el panel de inicio de Secretaría SÍ existe
(`src/pages/InicioSecretaria.tsx`; lo enruta `App.tsx` cuando el rol es
secretaria y el plan incluye Secretaría — el cartel `HomeSinArea` solo sale
cuando el área no está contratada, y eso es correcto). Lo que se propone no
es crear la pantalla, sino **evolucionarla de panel de indicadores a panel
de trabajo**.

**La tesis, que se conserva tal cual:** la pregunta de la secretaria al
abrir la app no es "¿cómo vamos?" sino "¿qué tengo que hacer?". Su trabajo
es de pendientes, no de saldos. El panel de Tesorería se mira; este se usa
para saber por dónde empezar.

**La regla de oro:** cada tarjeta lleva a la pantalla donde se resuelve —
un número sin acción detrás no va en el panel. Y el panel **no recalcula
nada**: lee las mismas funciones que ya usan Actas, Cartas, Agenda e
Informes, o se queda sin la tarjeta. (Es la lección de los bugs de agosto:
dos pantallas que calculan lo mismo por separado terminan descuadrándose.)

**Qué ya tiene el panel de hoy:** fichas incompletas, próximas actividades
(5), accesos rápidos, activos y altas del año.

**Qué le falta (todos son pendientes reales):**
- Actas en borrador y esperando aprobación (estados ya en `Actas.tsx`).
- Cartas esperando firma y listas para entregar (contadores ya en `Cartas.tsx`).
- Actividades sin confirmar (ya es una tarjeta de `Agenda.tsx`).
- Miembros con ausencias consecutivas que piden seguimiento (ya en
  `InformesMembresia.tsx`).
- **"Falta registrar el culto del domingo pasado"** — el único cálculo
  nuevo y probablemente la tarjeta más útil: es el error que de verdad
  comete una secretaria.
- Y el primer paso de todos: las cuatro tarjetas actuales son `div` sin
  clic — deben volverse botones que llevan a su pantalla, como ya se hizo
  en Agenda y Cartas.

**Dependencia y orden:** primero los roles reales (entrada 1 de arriba),
después este panel — sin roles, casi nadie llega a esta pantalla. No
requiere esquema nuevo ni migraciones. No se toca durante la revisión de
Apple: es pantalla nueva a ojos del revisor.

### 2. Face ID / Touch ID para iniciar sesión
Usar biometría (plugin oficial de Tauri) para desbloquear Tamio sin escribir la
contraseña cada vez, estilo apps de banco. También puede servir de "candado"
para abrir la app.
- Funciona en iPhone/iPad (Face ID / Touch ID) y Mac (Touch ID).
- **Esfuerzo:** bajo-medio. **Ideal para una app de finanzas** (capa extra de
  seguridad + comodidad).

### 3. Familias / hogares en Secretaría — cimiento de Kids
Hoy Secretaría registra **miembros individuales**. Agregar el concepto de
**familia / hogar** que agrupa personas, y donde los niños quedan dentro de su
familia.
- **Sirve por sí sola:** directorio por hogar, cartas/certificados a nombre de la
  familia, reportes por familia (no solo personas sueltas), niños registrados
  dentro de su hogar aunque no sean miembros formales.
- **Es el cimiento de Tamio Kids:** el plan de Kids (decisión 3) ya asume que las
  familias vienen de Secretaría. Construir esto primero evita que Kids lo
  reinvente. Piénsalo como la "Fase -1" de Kids.
- **Decisión de diseño clave:** una **familia** agrupa **personas**, y cada persona
  puede ser **miembro** (formal), **niño/dependiente** o **visitante**. Los niños
  **no** deben contar como miembros formales en los reportes, salvo que se quiera.
- **Tiempo sugerido:** mejora de Secretaría que puede ir en 1.1, justo antes de
  Kids. Factible: encaja con el modelo de personas que ya existe.
- Ver también: [`docs/tamio-kids-plan.md`](./tamio-kids-plan.md).

---

## 🚀 Expansión de plataformas

### 4. Android
La base ya es multiplataforma (Tauri) y la vista compacta de celular **ya está
lista** (la hicimos para iPhone). Faltaría construir el `.apk`, probarlo, y abrir
cuenta en **Google Play** ($25 una sola vez).
- **Por qué importa:** muchas iglesias con presupuesto ajustado usan Android.
  Podría abrir un mercado grande.

### 5. Windows
Generar el instalador `.exe` (requiere una PC con Windows o un servicio en la
nube) y probar cosas nativas (guardar archivos, imprimir). El diseño ya es
adaptable, así que la mayor parte funcionaría.

---

## 🌟 Módulo nuevo (versión 2.0)

### 6. Tamio Kids — seguridad y registro infantil
Módulo que controla la **entrada y salida de los niños** del culto y garantiza
que cada niño se vaya con la persona correcta. No es enseñanza ni contenido: es
**seguridad y registro**.

> 📄 **Plan técnico detallado por fases + veredicto de viabilidad:** ver
> [`docs/tamio-kids-plan.md`](./tamio-kids-plan.md). Resumen: **sí se puede
> implementar** — esta versión usa **un solo iPad designado** (sin servidor en la
> Mac ni red local), y sincroniza lo operativo por Supabase mientras salud y
> autorizados se quedan locales por no estar en la lista blanca. Encaja casi por
> completo con lo que Tamio ya tiene. Único detalle nuevo a probar temprano:
> excluir el archivo del respaldo de iCloud. Se construye por fases (0 a 7)
> después del lanzamiento en la App Store.

**Flujo de un domingo:**
1. La familia escanea su código en la tablet de la puerta y elige a sus niños.
2. Se imprimen dos etiquetas: una para el niño (nombre, sala, alergia, código de
   4 caracteres) y un recibo para el padre con el mismo código.
3. El maestro ve su sala: quiénes entraron, alergias y contacto de emergencia.
4. Al salir, el padre presenta el recibo. Si el código coincide y la persona está
   autorizada, se entrega al niño y queda registrada la hora y quién lo recogió.

**Lo que le queda a la iglesia:** asistencia infantil real por sala y culto (que
suma al culto de Secretaría), historial de quién recogió a cada niño, lista de
alergias, bitácora de incidentes, proporción maestros/niño.

**Diferenciador clave:** funciona **sin internet** y los datos de los niños
**nunca salen del edificio**.

**A cuidar:**
- El hardware es el mayor reto: tablet en la puerta + **impresora de etiquetas**.
  → **Prototipar la impresión primero.**
- Competencia establecida (Planning Center, KidCheck). Ganar en el terreno
  propio: offline, datos locales, español, iglesias pequeñas.
- En los términos, dejar claro que es una herramienta de apoyo, no una garantía.

**Idea de negocio:** podría ser un **complemento de pago aparte** (p. ej. +$8/mes
sobre el plan) para iglesias con ministerio infantil grande.

---

### 6-bis. Documentos fiscales de EE. UU. (IRS) — idea para la 2.0

**Pregunta de Iván (10 ago 2026):** ¿puede Tamio hacer formularios de impuestos
o reportar algo al IRS, ya que los datos están todos ahí?

**Hay que separar dos cosas que suenan igual:**

#### Transmitir al IRS: NO, y no debería

Para enviar declaraciones hace falta ser *Authorized e-file Provider* —
solicitud, verificación de antecedentes, controles anuales — o integrar a uno
que ya lo sea. Y con ello viene la responsabilidad legal de lo transmitido.
Para un desarrollador solo eso no es una función, es cambiar de negocio.

#### Generar los documentos: SÍ, y hay valor real

Cuatro candidatos, de más a menos valor:

**1. La constancia anual, que ya existe pero hoy NO sirve para el IRS.**
`i18n → constancia.nota` dice *"Informational document generated by Tamio.
Check local tax requirements before using it as a deductible receipt."* Honesto,
pero significa que no vale como comprobante.

La ley (IRC §170(f)(8)) exige que, para donaciones de **$250 o más**, el donante
tenga un acuse escrito con monto, fecha y —lo que falta— **si la iglesia dio
algo a cambio**. La fórmula estándar para una iglesia:

> *"No goods or services were provided in exchange for these contributions,
> other than intangible religious benefits."*

**Añadir esa frase convierte el documento de informativo en útil.** Es la mejor
relación esfuerzo/valor de toda la lista: una tarde. _(Regla hermana,
IRC §6115: si la iglesia entrega algo de valor por una donación de más de $75,
hay que declarar cuánto valía — eso ya pide un campo nuevo.)_

**2. Formulario 1099-NEC.** Si la iglesia paga **$600+ al año** a un no
empleado (predicador invitado, músico, limpieza, plomero) hay que emitirlo. Se
les pasa constantemente a las iglesias pequeñas. Tamio ya tiene los pagos:
faltaría marcar qué proveedores son contratistas y avisar en enero de quién
cruzó el umbral. **Presentarlo** sigue siendo del contador.

**3. Paquete de fin de año para el contador.** Probablemente el punto dulce:
aportes por donante, ingresos y gastos por categoría, resumen de compensación y
depósitos, en un PDF o carpeta. Tamio no declara nada; **le entrega al humano
que declara todo lo que necesita**. Cero riesgo legal, mucho ahorro.

**4. Nómina — NO tocar.** W-2, 941 trimestral, y el régimen especial del pastor
(doble estatus, *housing allowance*). Es un producto entero, no una función, y
equivocarse le cuesta dinero real a alguien.

#### Lo que NO hace falta, y casi todo el mundo asume que sí

**Las iglesias están EXENTAS de presentar el Formulario 990** (IRC §6033). Es
la diferencia grande entre una iglesia y cualquier otra organización sin fines
de lucro: la función que parece más obvia no se necesita. _(Excepciones: el
990-T si hay ingresos de un negocio no relacionado, y las organizaciones
afiliadas que no son iglesias — una escuela, una fundación aparte.)_

#### ⚠️ La trampa: exenta está la que el IRS TIENE CLASIFICADA como iglesia

_Aportado por Iván el 11 ago 2026; corrige la frase de arriba, que estaba
incompleta._

La exención no depende de que la organización se considere iglesia, sino de
**cómo aparece clasificada en el registro del IRS**. Si al presentar el
Formulario 1023 quedó registrada como *religious organization* o
*charitable organization* en vez de *church*, **sí tiene obligación de
presentar el 990** — aunque celebre culto todos los domingos.

Y el castigo es severo: **tres años consecutivos sin presentar y la exención
se revoca automáticamente**, sin aviso previo. La organización se entera
cuando aparece en la lista pública de revocaciones, y para entonces sus
donantes ya perdieron la deducción.

Es un fallo silencioso: nadie se equivoca activamente, simplemente nadie
presenta nada porque todos creen que no hace falta.

**Riesgo mayor en iglesias independientes.** Una iglesia de concilio suele
estar cubierta por la exención de grupo de su denominación, que clasificó bien
porque lo hace mil veces. Una independiente depende de cómo se llenó su propio
1023, a veces hace veinte años y por alguien que ya no está.

**Cómo se comprueba, gratis y en dos minutos:** *IRS Tax Exempt Organization
Search* (irs.gov). Se busca por EIN y dice cómo está clasificada la
organización y si aparece en la lista de revocaciones automáticas.

**Y esto SÍ es una función, de las buenas.** Tamio no puede presentar nada,
pero sí puede **preguntar**: una pantalla en la configuración inicial —*"¿cómo
aparece tu organización en el registro del IRS?"*— con el enlace al buscador y
la explicación de por qué importa. Cero responsabilidad legal, porque no es
asesoría fiscal: es información pública y una advertencia. Para una iglesia que
no lo sabía, esa pantalla puede valer más que todo el resto de la app.

**Prioridad: alta, y por encima del resto de esta entrada.** Es barata
(una pantalla informativa), no toca dinero ni esquema, y previene el único
daño de esta lista que es irreversible.

#### Y si resulta que SÍ hay que presentar: qué puede hacer Tamio

Lo primero, el límite: **Tamio no puede presentar**. El IRS exige que el 990 y
el 990-EZ se envíen electrónicamente a través de un *Authorized e-File
Provider*, y serlo es un trámite regulado con auditoría de por medio. El envío
lo hace el contador o un portal aprobado (el 990-N se envía gratis en irs.gov).
Todo lo de abajo es preparar las cifras, no enviarlas.

**a) Decir cuál de los tres formularios toca.** Depende de una sola cifra que
Tamio ya calcula, los ingresos brutos del año:

| Ingresos brutos | Formulario | Qué pide |
|---|---|---|
| ≤ $50,000 | **990-N** (e-Postcard) | 8 datos, ninguno financiero. Gratis en irs.gov, 5 minutos |
| < $200,000 y activos < $500,000 | **990-EZ** | 4 páginas con cifras |
| Por encima | **990** completo | Contador |

La mayoría de iglesias pequeñas caen en el 990-N, donde Tamio solo tiene que
dar el número y decir "te toca este, aquí se envía". Eso ya resuelve el caso
más común, y es la parte más barata de todas.

**b) La hoja de trabajo del 990-EZ.** El formulario pide las cifras agrupadas en
sus líneas numeradas, y las categorías de Tamio no son esas líneas. Pero se
mapean (catálogos en `src/db.ts:274` y `:285`):

| Categoría de Tamio | Línea del 990-EZ |
|---|---|
| Diezmo, Ofrenda, Donación | **1** — Contributions, gifts, grants |
| Otros | **8** — Other revenue |
| Compensación | **12** — Salaries, other compensation |
| Utilidades, Mantenimiento, Limpieza | **14** — Occupancy, rent, utilities |
| Misiones, Ayudas | **10** — Grants and similar amounts paid |
| Suministros, Varios, Alimentos, Tecnología, Transporte | **16** — Other expenses |

**El mapa tiene que ser configurable, no fijo.** Se elige una vez en Ajustes
—cada categoría escoge su línea— y a partir de ahí el reporte sale solo todos
los años. Sin ese paso no funciona: las categorías personalizadas
(`categorias_custom`) Tamio no las puede adivinar, y dos iglesias pueden
clasificar "Misiones" distinto con igual razón.

**c) El anexo de donantes (Schedule B).** Contribuyentes de $5,000 o más en el
año. Tamio ya tiene el total anual por miembro — es la misma consulta que
alimenta las estadísticas de miembros. A mano es la parte que más duele; aquí
es un filtro.

**d) Lo que Tamio NO sabe, y hay que escribir a mano.** Esto define el diseño,
así que va escrito y no descubierto a mitad de la implementación: la **Parte II
es un balance**, y Tamio lleva caja, no contabilidad patrimonial. Sabe el
efectivo y el saldo bancario; **no** sabe el valor del templo, del terreno, ni
las deudas o hipotecas. Esas líneas salen en blanco con una nota. Igual la
Parte IV (directivos y su compensación): Secretaría tiene los nombres, pero
enlazarlos con lo que cobran es trabajo aparte.

**El límite legal, que es lo que hace esto seguro:** se llama **"hoja de
trabajo"**, no "declaración". No pre-rellena nada que requiera criterio, no dice
si la iglesia está exenta, no firma. Es la información de la propia iglesia con
los números de línea encima, para llevársela al contador o copiarla al portal.
Eso no es asesoría fiscal y no crea responsabilidad.

**Esfuerzo:** el mapa en Ajustes más un PDF con la estructura del 990-EZ, que
reutiliza `printAnnual.ts` casi entero. Es una versión menor, no un proyecto.
**Va después de la pantalla de clasificación de la subsección anterior**, que es
la que previene el daño irreversible; esta solo ahorra trabajo.

#### Dos advertencias antes de que esto entre en ninguna lista

- **Ata el producto a EE. UU.** Hoy país y moneda son configurables; todo lo de
  arriba es específico del IRS y no le sirve a una iglesia en México o
  Colombia. No es motivo para no hacerlo —el mercado es aquí— pero es una
  decisión de producto, no solo una función.
- **Confirmar con un contador antes de programar.** Los umbrales cambian de año
  en año. Si Tamio emite un documento que una iglesia entrega al IRS, esa
  revisión no es opcional.

**Dónde va:** la pantalla de clasificación del IRS va primero de todo — es una
pantalla informativa y previene lo irreversible. El punto 1 (la frase de "no
goods or services") cabe en la 1.2 sin discusión. Los puntos 2 y 3, y la hoja de
trabajo del 990-EZ, son de la 2.0. El 4 no se hace.

### 7. Conciliación bancaria (Plaid en solo lectura) — idea para la 2.0

**Idea (Iván, 29 jul 2026):** que los depósitos y movimientos del banco aparezcan
solos en Tamio, para que el presupuesto refleje lo que de verdad hay en la cuenta
y la tesorera no trabaje a ciegas. **Solo lectura**: leer transacciones y saldos,
nunca mover dinero.

#### Veredicto: viable, y no rompe el local-first

El banco **no es la autoridad**; el libro de la iglesia lo sigue siendo. Las
transacciones entran como **candidatos a conciliar**, no como registros:

1. Una Edge Function de Supabase habla con Plaid (el `access_token` es una
   credencial permanente al banco y **nunca** puede vivir en el cliente).
2. La app descarga las transacciones a una tabla local de movimientos del banco.
3. La tesorera **concilia**: empareja cada línea con un registro de Tamio, o crea
   uno. Nada se contabiliza automáticamente.

SQLite sigue siendo la fuente de verdad, todo sigue cifrado y la app sigue
funcionando sin conexión con lo último descargado. **Ya existe el patrón de UI:**
es el mismo flujo de "Pendiente de revisión".

#### Restricciones que condicionan el proyecto

- **Depende de la 1.1.** Plaid exige cuenta y token en servidor, así que solo
  puede existir para usuarios de nube/pago; es imposible en el modo local
  gratuito. Va después de que login y sync estén sólidos. (Como contrapartida,
  es una función que justifica muy bien la suscripción.)
- **Mueve la app al terreno "Finance" con Apple.** Hoy la categoría es *Business*
  justamente para evitar escrutinio extra. Conectar cuentas bancarias reales
  cambia la etiqueta de privacidad (Financial Info vinculada al usuario), obliga
  a reescribir la política otra vez y añade el proceso de aprobación de Plaid
  para Producción. Es hacedero, pero es un envío delicado por sí solo.
- **Costo por cuenta conectada.** El producto de transacciones se cobra por
  cuenta y mes (del orden de 1–1.5 USD, **verificar al contratar**). Con 1–2
  cuentas es asumible sobre 19 USD de ingreso; con 5 cuentas se come el margen.
  Conviene limitarlo al plan alto o incluir un número máximo de cuentas. Usar
  Producción sin mínimo mensual, no un contrato con mínimo (~500 USD).

#### Lo que de verdad hace valiosa la función: control, no importación

**Refinamiento de Iván (29 jul 2026), que cambia la recomendación anterior.** El
objetivo no es "traer transacciones", es que **nada salga del banco sin
justificación**: cada débito del banco debe emparejarse con un gasto registrado y
su comprobante, y cada crédito con un ingreso. Eso convierte a Tamio de un
sistema de *contabilidad* (anotar lo que pasó) en uno de **control interno**
(demostrar que nada salió sin respaldo).

En una iglesia eso es el problema real: el tesorero maneja dinero ajeno. Hoy, ante
un "¿dónde está el dinero?", la respuesta es "según mis anotaciones…"; con esto,
es "el banco dice esto y cada movimiento tiene su comprobante". Es **protección
para el tesorero** y confianza para la congregación — mucho más valioso que un
ahorro de tiempo.

**Dónde vive:** la pantalla de **Depósitos / banco** ya existe y es su hogar
natural.

#### Recomendación (corregida): desacoplar la fuente, pero lanzar con Plaid

La propuesta anterior era construir primero la importación de archivo para validar
barato. **Se descarta como plan de validación**, por dos razones:

1. El CSV **no** está atado al cierre de mes (los bancos de EE.UU. dejan descargar
   cualquier rango de fechas). La diferencia real no es mensual vs. semanal, sino
   **manual vs. automático**: ninguna tesorera va a entrar al banco, descargar un
   archivo e importarlo cada semana.
2. Por eso, validar con la versión manual daría un **falso negativo**: la
   rechazarían por tediosa y se concluiría que "la conciliación no interesa",
   cuando lo que falla es la fricción.

El plan correcto es **un motor con la fuente desacoplada**:

```
        [ Plaid ]        [ Archivo CSV/OFX ]
              \              /
               v            v
        Movimientos del banco (tabla local)
                     |
                     v
        MOTOR DE CONCILIACIÓN Y CONTROL
        · emparejar banco <-> registros de Tamio
        · marcar lo que salió sin justificar
        · exigir comprobante en cada gasto
```

- **En desarrollo** se usa la importación de archivo: gratis, sin cuenta de Plaid,
  sin esperar su aprobación de Producción y con datos de prueba.
- **Se lanza con Plaid**, que es donde está el valor.
- **El archivo se queda como respaldo permanente**: bancos que Plaid no soporte y
  iglesias del plan gratuito.

#### Advertencia de diseño: implacable, pero no bloqueante

Si la app **bloquea** o regaña de más, la tesorera la abandona. Las iglesias reales
tienen semanas desordenadas (alguien saca efectivo el domingo y trae el recibo el
jueves). Lo que funciona es una lista visible y persistente del tipo *"3 salidas
del banco sin justificar — $450"* que no desaparece hasta resolverse. **La
disciplina la impone la visibilidad, no el bloqueo.**

---

## 🔧 Pulido para la 1.1

- **Asistencia de cultos: total = lista + contadores.** Decisión del 3 ago
  2026 (P1 de la tanda de Secretaría). Hoy el total visible de un culto sale
  SOLO de los contadores Niños+Jóvenes+Adultos; la lista nominal alimenta
  únicamente el informe por miembro, y el formulario lo rotula y avisa en las
  dos direcciones. Para la 1.1 se acordó cambiar el modelo: la lista cuenta a
  los miembros presentes, los contadores pasan a ser solo gente fuera del rol
  (niños y visitantes) y "Total" se calcula como lista + contadores, de solo
  lectura. Antes de codificarlo hay que decidir qué se hace con los cultos ya
  guardados, donde los contadores incluían a todo el mundo (sumarles la lista
  los contaría dos veces); la opción simple es dejar lo histórico como está y
  aplicar la regla nueva desde la fecha del cambio.

- **Reorganizar el layout de Ajustes.** El grid de 2 columnas deja huecos
  verticales cuando una columna es más alta que la otra. Hay una propuesta
  (primitivas `SettingsPage` / `SettingsColumns` / `SettingsStack` con columnas
  de altura independiente) para que las tarjetas se apilen pegadas. Es cosmético,
  toca la pantalla de Ajustes (compartida), y conviene probarlo en simulador. Se
  dejó para la 1.1 para no arriesgar el envío de la 1.0.

---

## 💡 Ideas menores / pendientes

- Ocultar/limpiar el correo del menú lateral en capturas de marketing.
- Selector nativo de iOS (`<select>`) que respete el tema oscuro (necesitaría
  algo de Swift).
- Mover el sitio web (`docs/`) a un repo aparte para poder hacer **privado** el
  repo del código de la app.
- Definiciones de "miembro activo" y conteos (revisar con calma).

---

## ✅ Ya hecho (para referencia)

- App para Mac, iPhone y iPad (Apple).
- Tesorería + Secretaría con separación de roles.
- Sincronización en la nube (Supabase), datos locales cifrados (SQLCipher).
- Funciones de IA para redactar.
- Borrar cuenta dentro de la app + política de privacidad.
- Pagos con Lemon Squeezy (aprobado el 3 ago 2026; Paddle también, como respaldo).
- Sitio web tamio.church.
