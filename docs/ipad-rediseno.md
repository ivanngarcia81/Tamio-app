# El rediseño de iPad

_Escrito el 21 de agosto de 2026, al abrir el handoff `Diseño nativo para
iPad` de Claude Design. Complementa `ipad-plan.md`, que es el plan de
viabilidad de antes de que el iPad existiera; esto es la maquetación._

El handoff es aplicable. Lo que lo hace valioso no es el radio de las
esquinas: es que **cambia la estructura** de las tres pantallas principales,
así que el iPad deja de ser un Mac con los dedos gordos.

| | Mac | **iPad** | iPhone |
|---|---|---|---|
| Ingresos/Gastos | tabla densa, fila de 38px | **lista de 400px + panel de detalle** | lista sola, fila de ~62px |
| Miembros | tabla con `.person` | **lista de 378px + ficha** | lista sola |
| Fila táctil | 38px | 60–64px | ~62px |
| Radio de tarjeta | 8px | 14–16px | 12px |
| Sidebar | 220px fijo | 318px | oculto |
| Crear | modal centrado | **hoja de formulario de 600px** | hoja a pantalla completa |

---

## 1. Lo que ya está hecho

### `:root.ipad`

Hasta ahora el iPad no tenía clase propia: era `.movil` sin ser `.iphone`,
o sea que se describía por lo que no es, y cogía reglas pensadas mirando un
teléfono. Ya tiene la suya, puesta en `main.tsx` antes de montar React, con
`esIPad()` en `movil.ts` para leerla desde componentes.

**La cuenta de las tres clases:** `movil` = iPad + iPhone · `iphone` = solo
teléfono · `ipad` = táctil que no es teléfono · `mac` = escritorio.

### La barra de 56px

`.header` medía **157px** en el arnés a 1366×1024 (12 de relleno + 34 de la
fila de acciones + 24 de hueco + 65 del Large Title + 22) para decir
"Ingresos". Ahora es una barra de 56px: título de 17px y subtítulo de 12px
apilados a la izquierda, acciones a la derecha, fondo de sidebar y línea de
0.5px. Vuelve el botón "Nuevo ingreso" con su texto; "Imprimir" y el "···"
vuelven al flujo. Se van la fila fija de glifos y el título viajero.

De paso arregló un solape real del iPad de 13": pasados los 1024px la barra
del ☰ no existe, pero el "+" seguía clavado en `top: 58px`, flotando sobre
el Large Title, que empieza en y=70.

> **El umbral son 700px** — y la primera versión puso 1024, que estaba mal.
> El razonamiento de entonces ("que coincida con el rango del cajón lateral,
> 601–1023, para que no puedan discrepar") sonaba sólido y era falso: ese
> rango se escribió pensando en **ventanas de Mac angostas**, no en lo que
> iPadOS considera compacto.
>
> **Un iPad a pantalla completa tiene clase de ancho REGULAR en todos sus
> tamaños**, el mini en vertical incluido. Lo compacto es solo el Split View
> y el Slide Over. Con 1024, medido en el arnés, el mini (744), el 10.9"
> (820) y el 11"/Air (834) se quedaban **en vertical con la UI vieja entera**
> —cabecera de 135px, Large Title de 34px, sin maestro-detalle— y solo el Pro
> de 13" veía el rediseño sin girar el aparato. Lo reportó Iván al probarlo:
> *"sigue en su mayoría con la vieja UI"*.
>
> Con 700 entran los ocho tamaños de iPad a pantalla completa (el más chico
> es el mini con 744) y siguen fuera los repartos angostos: media pantalla en
> el 13" son ~678, en el 11" ~590, y el Slide Over ~320. Ahí sí corresponde
> la forma compacta.
>
> **La lección**: un umbral de iPad se justifica por las clases de tamaño de
> iPadOS, no por reutilizar un breakpoint que existía para otra cosa.

### La hoja de "Nuevo ingreso/gasto"

`NewRecordModal` la elegía con `esIPhone()`; ahora con `esMovil()`. En el
iPad se pinta como `.formSheet` de UIKit: 600px de ancho, centrada, 82% de
alto, radio 16, sin tirador.

El CSS de la hoja vivía entero bajo `:root.iphone`. Se movieron a
`:root.movil` las 71 clases que la hoja monta de verdad (131 apariciones),
sacadas de leer `NuevoMovimientoIOS.tsx` y `src/components/ios/*.tsx` — no
a mano. Las otras 148 (Ajustes iOS, Bandeja, Cartas, la barra de menú)
siguen en `:root.iphone` y el iPad no las alcanza, porque sus componentes
siguen detrás de `esIPhone()`.

---

## 2. La decisión que estaba abierta

**En vertical, el detalle EMPUJA.** Decidido el 21 de agosto.

El diseño resuelve el sidebar en vertical (se superpone con velo) pero no
dice qué hace la columna de detalle cuando ya no caben 400px de lista más el
detalle. Las dos salidas eran: seguir siendo modal en vertical y volverse
panel solo en horizontal (la mitad de trabajo, reutiliza los modales que ya
hay), o empujar como un `push` de navegación de iOS.

Se eligió empujar. Consecuencias para quien lo implemente:

- El detalle es una **ruta o un estado de pantalla**, no un modal. En
  horizontal se pinta en la columna derecha; en vertical entra desde la
  derecha tapando la lista, con un botón de volver en la barra que lleva el
  título de la lista ("‹ Ingresos"), como hace Mail.
- El estado de "qué fila está abierta" tiene que sobrevivir al giro: girar
  el iPad con un movimiento abierto debe dejarlo abierto, no volver a la
  lista. O sea que vive por encima del componente que decide la forma.
- La animación es la de `push` de iOS, no la de modal.

---

## 3. Lo que falta, por orden

1. ~~El panel de detalle~~ **Hecho** (21 ago): `DetalleMovimiento.tsx` +
   el partido en `Movimientos.tsx`. Las tres consecuencias de §2 están
   cumplidas y verificadas con Playwright: el detalle es estado de pantalla
   (`selId`, un ID re-buscado en cada recarga, no una copia congelada), el
   giro con una fila abierta la deja abierta en los dos sentidos, y la
   entrada es el push de iOS (la lista se corre un cuarto a la izquierda
   mientras el panel entra). El corte columnas/empuje es **1150px**: por debajo
   —todo iPad en vertical, más el mini en horizontal (1133)— la lista se
   queda con todo el ancho, el resumen del mes baja a su cabeza
   (`.md-extra`) y el panel entra por encima con "‹ Ingresos"; de 1150 en
   adelante conviven 400px + el resto. En columnas,
   el panel sin fila abierta enseña el resumen del mes y los recurrentes —
   los mismos nodos, extraídos a constantes, no una copia.
2. ~~Maestro-detalle en Ingresos/Gastos~~ **Hecho** (21 ago): columna de
   400px con buscador relleno, chips con conteo, filas de 64px agrupadas
   por día con cabeceras pegajosas ("HOY · VIERNES 21") y pie de 44px con
   conteo y suma de lo VISIBLE (obedece búsqueda y filtro). Sin el
   segmentado Ingreso/Gasto del prototipo: aquí son dos entradas del
   sidebar, y un segundo conmutador diría lo mismo dos veces.
3. ~~Maestro-detalle en Miembros~~ **Hecho** (21 ago): lista de 378px con
   secciones por inicial (sin acentos: "Ángel" cae en la A), avatar de 38px
   cuyo color sale del `id % 8` —el mismo cálculo que la ficha, así lista y
   panel pintan igual a la misma persona— y total del año en la fila. La
   ficha del panel es LA MISMA del modal de Mac/iPhone: `MemberDetailModal`
   quedó partido en `useFichaMiembro` + `IdentidadMiembro` +
   `CuerpoFichaMiembro`, y el modal y `DetalleMiembro.tsx` son dos
   cascarones sobre esas piezas (el trato de `useNuevoMovimiento`). El
   filtro Activos/Bajas/Todos del prototipo NO se puso: esta página
   (Aportantes, tesorería) es solo de activos por diseño del dominio — las
   bajas viven en Membresía, de secretaría.
4. ~~Sidebar superpuesto con velo en vertical para el iPad de 13"~~
   **Hecho** (21 ago): rango propio 700–1149, solo `:root.ipad` (una
   ventana de Mac de ese ancho no se inmuta). El sidebar pasa a cajón fijo
   de 318px con velo, el ☰ de App.tsx —que ya se montaba siempre— se
   enciende como glifo desnudo sobre la barra de 56px (que le reserva 56px
   de padding, el trato de `.btn-sidebar` en el Mac), y la lista del
   maestro-detalle gana el ancho completo: 706 → 1024. La barra además
   ganó `padding-top: env(safe-area-inset-top)`, que le faltaba para el
   iPad real.
5. ~~Buscador global en el sidebar con ⌘K~~ **Hecho** (21 ago) — y costó
   poco porque la paleta YA EXISTÍA: `CmdPalette.tsx` (⌘K y el menú de la
   app) con navegación, acciones rápidas y búsqueda de miembros,
   consciente de rol y plan. Lo que faltaba era la puerta táctil: la
   pastilla "Buscar en Tamio ⌘K" del sidebar (solo iPad, `esIPad()` +
   prop `onBuscar`), que abre esa misma paleta. En táctil la paleta sube
   sus filas a 44px y esconde el pie de atajos de teclado.

6. **Las otras siete pantallas de maestro-detalle.** Corrección del 21 de
   agosto: al cerrar los puntos 1–5 se dijo por escrito que el handoff
   "solo maquetó dos pantallas como maestro-detalle". **Es falso.** Contadas
   sobre el propio archivo del handoff —buscando la firma de la columna
   maestra, `width:NNNpx;flex:0 0 NNNpx`— son NUEVE, más Configuración:

   | Pantalla | Columna | Estado |
   |---|---|---|
   | Ingresos · Gastos | 400px | hecho (21 ago) |
   | Aportantes | 378px | hecho (21 ago) |
   | Configuración | 298px | hecho (21 ago, ver abajo) |
   | Por revisar (bandeja) | 400px | hecho (21 ago) |
   | Depósito bancario | 378px | hecho (22 ago, §10) |
   | Actas | 358px | hecho (22 ago, §10) |
   | Registro de servicios | 358px | hecho (22 ago, §10) |
   | Reportes | 330px | hecho (22 ago, §10) |
   | Cartas y traslados | 338px | hecho (22 ago, §10) |
   | Agenda y calendario | 318px (a la DERECHA) | hecho (22 ago, §10) |

   Solo Inicio y Membresía son de una columna en el diseño. **Membresía
   quedó hecha el 22 de agosto** (§9); Inicio ya lo estaba salvo su barra,
   que también se arregló ese día.

   El error vino acompañado de un argumento inventado —"Reportes y Agenda no
   son listas, no ganan nada partiéndose"— cuando el handoff las parte las
   dos: Reportes con su columna de informes y la vista previa al lado, y
   Agenda con 318px. **La lección: contar sobre el archivo, no sobre el
   recuerdo de haberlo leído**; el comando que da la cuenta buena está en §5.

   La infraestructura ya está hecha: `.md-split`, `.md-lista`,
   `.md-detalle`, el modo de empuje, `useMediaQuery` y el patrón de "el
   detalle es un ID que se re-busca, no una copia congelada". Cada pantalla
   nueva es sobre todo decidir qué va en la fila y qué en el panel, no
   volver a construir el andamio.

7. ~~Configuración~~ **Hecho** (21 ago). Aquí quedó escrito antes que "no
   hay que hacer nada, ya corre como índice + columna en Mac y iPad". Era
   falso, y lo cazó Iván mirándolo: *"veo el diseño viejo en configuración"*.
   Las dos columnas sí existían, pero eran las de ANTES del rediseño de
   Ajustes — ese se escribió entero bajo `:root.mac` (87 de las 92 reglas de
   `.settings-detail`), así que el iPad se quedó con la versión anterior.
   Medido: índice de 240px en vez de 298, y sin ninguna pieza nueva.

   No se copió el bloque de Mac: sus medidas son de ratón (filas de 32px,
   texto de 13, radio 8). Se escribió un bloque `:root.ipad` con las del
   handoff — índice de 298 con filo propio y fondo de sidebar, filas de 40px
   a 15px con radio 10, activa con relleno tintado (`color-mix` del ink al
   10%, el mismo de `.md-fila.sel`) en vez del acento sólido, y panel con
   columna de lectura de 680px centrada.

   **Lo que el handoff NO trae al iPad**, y por eso siguen en `enMac`: el
   buscador de zonas y los galones de historial. Son de Ajustes del Sistema
   de macOS; el diseño de iPad no los dibuja. Lo que sí cruza es la cabecera
   de zona (`.settings-hero`), presente en sus seis pantallas — su gate pasó
   de `enMac` a `!enIPhone`.

   Dos cosas que solo se ven midiendo, y que el Mac ya resolvía: con la
   cabecera arriba, el `.settings-zona-head` de dentro repite título y
   subtítulo dos dedos más abajo (apagado), y `.settings-zona` trae fondo,
   borde y radio 18 de cuando era la caja de una pestaña — envolviendo a
   tarjetas que ya son cajas, un marco dentro de otro (aplanada).

   El umbral de esta pantalla son **761px, no los 700 del resto**, y es
   deliberado: con 298 de índice, al mini en vertical (744) le quedarían 446
   para el panel y los formularios de dos columnas no caben. Ahí se queda el
   modo apilado —lista de zonas, eliges una, la ves sola—, que es la misma
   decisión que el modo de EMPUJE del maestro-detalle: cuando no caben dos
   cosas, se enseña una. Sus filas sí subieron a 44px, que venían de la
   regla base de ratón.

8. ~~Por revisar~~ **Hecho** (21 ago). La primera pantalla que no construye
   panel nuevo: `DetalleMovimiento` y `DetalleMiembro` ganaron una prop
   `acciones?: ReactNode` que sustituye su fila de botones, y la Bandeja los
   monta con las suyas. Aquí un movimiento se mira para APROBARLO —Editar ·
   Marcar revisado, sin Eliminar— y un miembro archivado solo se Restaura.
   La ficha (importe, campos, comprobante, aportes del año) es la misma que
   en Ingresos y Aportantes: quien ya usó esas dos no aprende una tercera.

   La columna maestra junta los dos grupos que la página ya tenía en una
   lista con dos cabeceras. La selección guarda `{tipo, id}` y no solo el
   id, porque la lista es **heterogénea** —un movimiento pendiente y un
   miembro archivado no son lo mismo— y de ahí sale qué panel se pinta.
   Resolver un asunto lo saca de su lista y cierra el panel solo.

   **Lo que el handoff maquetaba aquí no existe.** Traía una taxonomía de
   alertas —"duplicado probable", "categoría vacía", "miembro no
   encontrado", "recurrente vencido"— y acciones como "Aprobar sin
   comprobante" o "Devolver al tesorero". En la app, `listPendingTx` da
   movimientos en estado pendiente y `listArchivedMembers` da miembros
   archivados: dos listas, y ya. Se tomó la ESTRUCTURA del diseño (columna
   de 400px + panel), no sus datos inventados — el mismo criterio que con el
   "Rastro de auditoría" de §4.

---

## 4. Lo que hay que tirar del handoff

- La barra de estado de arriba (9:41, Wi-Fi, batería) y el botón de rotar:
  son andamios del prototipo.
- **"Rastro de auditoría"** ("Creado · Iván García · iPad de Iván", "Nota
  editada 11:26") y "Registrado por Iván García" en la cabecera del
  detalle. **Esos datos no existen.** `transactions` solo tiene
  `updated_at`; no hay `created_by` ni historial de ediciones. Es lo único
  del documento que no es maquetación: pide tabla nueva y escrituras en
  cada punto de mutación. Si se quiere, es su propia tarea.
- Tres interruptores inventados en Configuración → Iglesia: "Exigir
  comprobante en gastos mayores a $1,000", "Doble firma en el corte" y
  "Avisar duplicados", más "Cierre de mes: último domingo". Ninguno existe.
  (Sí hay detección de duplicados en `db.ts`, pero no como ajuste.)

---

## 5. Cómo verificar cambios de iPad

El arnés de Playwright de siempre, con la clase puesta a mano en la raíz y
estos ocho tamaños. Los cinco marcados como "no debe cambiar" son la red:
si uno se mueve, el cambio se salió del iPad.

**Cuántas pantallas del handoff son maestro-detalle.** La columna maestra
siempre se declara igual (`width:NNNpx` seguido de `flex:0 0 NNNpx`), así que
se cuentan con un `grep` sobre el archivo del handoff en vez de a ojo — que es
como se coló el error de "solo dos":

```
grep -o 'width:[0-9]\{3\}px;flex:0 0 [0-9]\{3\}px' "Tamio iPad.dc.html" | sort -u
```

Para saber a QUÉ pantalla pertenece cada una, partir el archivo por sus
`<sc-if value="{{ es_… }}">` y buscar esa firma dentro de cada trozo.

**Los ocho iPads a pantalla completa** — los ocho deben dar el diseño nuevo
(barra de 56px, título de 17px, material y maestro-detalle). Son los anchos
reales en puntos CSS, y la tabla existe porque con el umbral en 1024 las
cuatro primeras filas fallaban y nadie lo vio hasta probarlo en el aparato:

| Tamaño | Qué es |
|---|---|
| 744×1133 | mini 8.3" vertical |
| 820×1180 | iPad 10.9" vertical |
| 834×1194 | Air / Pro 11" vertical |
| 1024×1366 | Pro 13" vertical |
| 1133×744 | mini horizontal |
| 1180×820 | 10.9" horizontal |
| 1194×834 | 11" horizontal |
| 1366×1024 | 13" horizontal |

**La red de seguridad** — estos NO deben tocar el diseño de iPad:

| Clase | Tamaño | Qué es |
|---|---|---|
| `mac` | 1440×900 | Mac |
| `mac` | 1024×900 | Mac angosto |
| `mac` | 800×700 | Mac muy angosto (cajón de siempre) |
| `movil iphone` | 390×844 | iPhone vertical |
| `movil iphone` | 844×390 | iPhone horizontal |
| `movil ipad` | 507×1194 | Split View ½ en 11" — compacto |
| `movil ipad` | 678×1024 | Split View ½ en 13" — compacto |
| `movil ipad` | 320×1194 | Slide Over — compacto |


---

## 6. El 22 de agosto: el iPad EN VERTICAL

Iván lo dijo mirando su aparato: *"los diseños de portrait mode no salió"*.
Y era literal.

### 6.1 Por dos píxeles

El rediseño entra a partir de 700px (§1), pero el bloque del cajón lateral
—`@media (min-width: 601px) and (max-width: 1023px)`, escrito mirando un
teléfono— seguía alcanzando a los **tres iPads que en vertical miden menos
de 1024**: el mini (744), el 10.9" (820) y el 11" (834). Solo el Pro de 13"
(1024) se libraba.

Es el error de §4.1 de la bitácora del 21 de agosto **a medio arreglar**:
se corrigió el umbral de ENTRADA y no se miró qué seguía entrando por la
puerta de al lado. Medido a 1023 contra 1024 con la misma página:

| Qué | a 1023 (todo iPad chico en vertical) | a 1024 |
|---|---|---|
| Filas del sidebar | 40px | 44px |
| `.dash-canvas` | sin fondo, sin radio, sin relleno | tarjeta de 14 |
| `.summary-4` | 2 columnas, cifra de 20px | 3–4 columnas, cifra de 24 |
| `.data-table` de Membresía | 3 columnas (sin Contacto ni Alta) | 5 columnas |
| Filas de Inicio | sin método, sin aportante, sin hora | completas |
| `.report-preview` | apilada, sin cabecera de tabla | entera |

**La guarda es `:where(:root:not(.ipad-ancho))`** sobre las 143 reglas del
bloque, con `.ipad-ancho` puesta desde `main.tsx` cuando el aparato es iPad
Y mide 700px o más. Dos decisiones que conviene no deshacer:

- **`:where()` no suma especificidad.** Cada regla del bloque pesa
  exactamente lo que pesaba, así que su orden con el resto del archivo no se
  mueve: lo único que cambia es a QUIÉN alcanza. Sin eso, prefijar 143
  reglas es un cambio de riesgo alto.
- **`.ipad-ancho` lleva listener de `matchMedia`.** Este valor cambia al
  girar el aparato y al repartir la pantalla, al revés que `.ipad`,
  `.iphone` y `.mac`, que se resuelven una vez y no vuelven a cambiar.

El Split View y el Slide Over **sí** siguen entrando al bloque: ahí el ancho
es compacto de verdad y esa franja es justo lo que corresponde.

### 6.2 La tira de cifras

Tres reglas se repartían el reparto de `.summary-4/5/8` y ninguna era del
iPad: la base (`auto-fit, minmax(240px, 1fr)`), un `@media (max-width:
860px)` genérico, y un `gridTemplateColumns` en el marcado de cinco páginas.
Girar el aparato costaba media pantalla de tarjetas antes de ver un dato:

| Pantalla | vertical | horizontal |
|---|---|---|
| Depósitos | 288px | 136px |
| Servicios | 228px | 106px |
| Agenda | 228px | 106px |
| Aportantes | 200px | 92px |
| Informes de membresía | 401px | 192px |

Con 150px de vía mínima entran en una fila en los ocho tamaños. **Solo para
tarjetas que son etiqueta y número**: las de Inicio llevan dentro barra de
proporción, desglose de dos columnas, segmentado o pastilla de categoría, y
a 160px de ancho eso no se lee. La frontera se escribe sobre lo que la
tarjeta CONTIENE (`:not(:has(…))`), no sobre en qué página vive — así una
tarjeta nueva cae del lado correcto sola. Y el panel de detalle se queda con
sus dos columnas: es una columna angosta DENTRO de la pantalla, no la
pantalla.

### 6.3 La barra se aplastaba

`.main` es flex en columna y `.header` es uno de sus hijos. `min-height:
56px` en un hijo de un flex **sustituye al mínimo automático de contenido**:
en vez de garantizar 56, permitía bajar HASTA 56 con lo que hubiera dentro.

Inicio lo enseñaba: su cabecera no era un título sino el saldo del mes —87px
de saludo, cifra de 40 y pie— dentro de una caja de 56, con la cifra partida
por la línea de la barra. En los ocho tamaños y en las dos orientaciones.
`flex: 0 0 auto` lo arregla y devuelve lo que el `min-height` quería: que la
barra pueda CRECER (Reportes en vertical pasa a 101px en vez de recortar sus
acciones).

Con la barra sana, Inicio se pone en línea con el handoff: "Inicio" +
"Resumen de agosto 2026", como las otras quince. El saldo no se pierde: vive
en la tarjeta consolidada, que es donde el diseño lo pone.

---

## 7. Las ocho hojas de alta

§1 dejó escrito el porqué y no lo cerró: *"las otras 148 [clases de iOS]
siguen en `:root.iphone` y el iPad no las alcanza, porque sus componentes
siguen detrás de `esIPhone()`"*. De "Nuevo ingreso/gasto" en adelante,
ninguna otra alta cruzó — y el handoff maqueta Servicios, Cartas, Agenda,
Actas, Miembro, Depósito, Solicitud y los dos Traslados como hojas.

Ocho puertas del mismo tamaño: `esIPhone()` → `esMovil()` en `ActaModal`,
`ActividadModal`, `DepositoModal`, `ServicioModal`, `SolicitudModal`,
`TrasladoEntradaModal`, `TrasladoSalidaModal` y el **alta** de
`FichaMiembroModal` (la edición no: ahí la ficha completa es justo lo que se
viene a ver).

**Las reglas que faltaban no se movieron a ojo.** Se sacó la lista de clases
que monta de verdad cada hoja siguiendo sus imports, se cruzó con los 275
selectores `:root.iphone` del archivo, y salieron 24 reglas de 13 clases que
son EXCLUSIVAS de las hojas: `.ios-cuenta`, `.ios-total`, `.dia-chip`,
`.sol-tipo`, `.ios-field--pos`, `.ios-miembro*`, `.ios-check`,
`.ios-ia-campo`, los dos pies de sección y el z-index del `ConfirmDialog`
(que abierto DESDE una hoja tiene que quedar por encima de ella). Las demás
se quedan donde están: son de la bienvenida, de Ayuda, del carrusel o de
Ajustes del teléfono, y ahí el iPad no entra.

**Cómo se comprobó**, y es el método a repetir: se abre cada hoja a 820×1180
con clase de iPhone y con clase de iPad y se comparan los estilos calculados
de cada clase. Antes salían tres desajustes reales; ahora la única
diferencia que queda es la que debe quedar — 16px de radio en vez de 12, el
tirador de arrastre apagado y las esquinas del formSheet.

> **Un agujero que esto destapó:** Cartas y traslados no tenía NINGUNA forma
> de crear en un iPad. Su menú de alta (`.cartas-menu-crear`) se escondía
> bajo `:root.movil` porque en el teléfono el "+" fijo ya lo cubre, pero el
> "+" fijo del iPad no existe desde el rediseño. Ni botón de cabecera, ni
> flotante, ni acción de estado vacío: cero controles de alta visibles.

**Lo que sigue en el modal de escritorio en el iPad, a propósito:** la
EDICIÓN de la ficha de miembro, el editor de cartas (`CartaEditor`, que es
un documento a página completa y no una hoja) y los diálogos cortos
(`ConfirmDialog`, `BajaMemberModal`, importar CSV, plantillas).

---

## 8. Las cabeceras de tabla

En el iPad salían a **17px y en versalitas** —`.data-table .th` hereda
`--fs-body`, que en táctil son 17—: en Informes de membresía la fila de
cabecera medía 74px y "Ministerio, cargo e instrumentos" ocupaba tres
renglones. Y no era consistente ni consigo misma: las columnas ORDENABLES
son `<button class="th">` con `font: inherit` **en línea**, así que heredaban
los 10.5px del `.thead` y salían sin versalitas (el `text-transform` de un
botón lo pone el navegador y gana a lo heredado).

12.5px con 0.4 de tracking, la medida del handoff, puesta también en
`.thead` para que ese `font: inherit` herede lo mismo sin tocar su `style=`.
Y lo táctil que el bloque del cajón daba por accidente se escribe ahora
donde le toca —para los ocho tamaños y las dos orientaciones—: el "···" de
fila vuelve a 44pt (medía 25×28, la medida de un ratón), los iconos que solo
aparecen al pasar el puntero no se pintan, y el lápiz suelto de Informes de
membresía (el único que no se esconde, porque ahí no hay "···") sube a 44.

---

## 9. Membresía

La única pantalla del rediseño sin tocar, así que en el iPad salía la tabla
de RATÓN del Mac. El handoff la maqueta como pantalla de UNA columna (solo
ella e Inicio lo son): cuatro cifras arriba en una fila, un segmentado a la
izquierda de su barra de controles, y una tabla de tarjeta con cabecera en
versalitas y filas de 58px.

- Las cuatro cifras en una fila, tarjetas de radio 16 y cifra de 28.
- Los tres chips (De alta / De baja / Todos) se pintan como el segmentado de
  iOS. Para eso, las dos medidas que estaban en `style=` pasan a clases con
  los MISMOS valores: un estilo en línea gana a cualquier hoja. En Mac no
  cambia un píxel, está medido.
- Tabla táctil: cabecera de 44 pegada, filas de 58, avatar de 32, realce al
  tocar y "···" de 44pt.
- Se adelanta **Condición** a la segunda columna y entran **Ministerio**
  (`members.ministerios`) y **Asistencia**. Las cinco del handoff.

### La quinta columna, y qué hacer cuando no hay dato

La primera versión la dejó fuera con este argumento: "es un cálculo por
periodo que vive en Informes de membresía, ponerlo aquí sería inventar un
dato". La mitad era cierta —el dato del handoff, un 96% de adorno, sí era
inventado— y la conclusión no. Lo corrigió Iván:

> lo más correcto es poner que no hay suficiente información hasta que haya
> información que compilar

Que es una regla mejor que "quitar la columna", y vale para cualquier otra:
**una columna sin datos todavía no es lo mismo que una columna que no
corresponde.** La primera se enseña vacía y diciendo por qué; la segunda no
se enseña.

El dato existe y se calcula con la MISMA función que usa Informes de
membresía (`asistenciaPorMiembro` sobre `servicio_asistencia`), no con una
cuenta paralela que se desviaría. Tres estados:

| Situación | Qué se pinta |
|---|---|
| Ni un culto del año con lista tomada | "Sin listas" en gris, y **una** nota al pie de la tabla que explica de dónde saldría el dato |
| Hay listas, pero este miembro no estuvo en ningún roster | "—" — aquí el guion sí significa lo que parece |
| Hay dato | el porcentaje, y debajo de cuántos cultos sale |

Dos detalles que no son adorno:

- **El "de cuántos" va debajo del porcentaje.** Un 100% de un culto y un
  100% de cuarenta no son la misma noticia, y el porcentaje solo no
  distingue los dos. Es el mismo problema de "no hay suficiente
  información", una fila más abajo.
- **La nota va una vez, no en cada celda.** El motivo es el mismo para todas
  las filas, y treinta veces "sin datos" no informa treinta veces. Dice
  dónde se toma la lista, que es lo que convierte un hueco en una tarea.

### El reparto de columnas se decide en el marcado

Ministerio cae por debajo de 1024 —los tres iPads chicos en vertical—, donde
con seis vías los nombres se partían a la mitad. Asistencia se queda: es la
columna que responde "¿este miembro sigue viniendo?", que es de lo que va el
padrón.

Pero **la elección se hace con `useMediaQuery` en el componente, no con
`display: none` en el CSS**, y es una trampa que conviene tener escrita:
esconder una celda de una rejilla NO quita su vía. Apagar Ministerio dejaba a
la columna de acciones ocupando la vía de 1.2fr y un hueco muerto de 104px al
final de cada fila.


---

## 10. Las seis que faltaban

Cerradas el 22 de agosto. El andamio del día 21 aguantó: `.md-split`,
`.md-lista`, `.md-detalle`, el modo de empuje con su animación, los dos
umbrales (700 y 1150) y el patrón de "el detalle es un ID que se re-busca".
Ninguna de las seis necesitó tocarlo. Lo que sí hizo falta fue **descubrir
que la columna maestra tiene tres formas**, no una.

### 10.1 Las tres formas de una columna maestra

| Forma | Pantallas | Por qué |
|---|---|---|
| **Lista de registros** | Ingresos, Aportantes, Bandeja, Depósitos, Actas, Servicios | Hay muchos y llegan más; la fila de 64px con su cabecera de grupo es la forma correcta |
| **Índice de destinos** (`.md-indice`) | Reportes, Cartas, Configuración | Son cinco o siete destinos FIJOS. Una fila de lista miente: promete que hay muchos y que llegan más |
| **Panel a la derecha** | Agenda | Un calendario mensual no cabe en una columna de lista, así que la que se estrecha es la otra |

La tercera se monta sobre las MISMAS dos clases (`.md-lista` para el
calendario, `.md-detalle` para el día) y solo invierte cuál es fija y cuál
flexible en el rango de columnas. Así el modo de empuje, su animación y el
botón de volver salen gratis; un andamio paralelo habría duplicado los tres.

El índice se pinta como el de Ajustes —pastillas de radio 10, sin filos
entre ellas, la activa con el `color-mix` del ink al 10%— para que "lo
elegido" se vea igual en las tres formas.

### 10.2 Los seis paneles, uno por uno

- **Depósitos** (378px). Lista agrupada por PERÍODO y no por fecha: es como
  suman los totales de la pantalla y como agrupan los reportes. Pie con el
  conteo y la suma de lo VISIBLE. Panel con la cifra grande y la ficha.
- **Actas** (358px). El primer panel que no es una ficha: es el
  **documento**. Un acta se lee de arriba abajo —encabezado, quién estuvo,
  agenda, resumen, mociones, acuerdos y firmas—, y las mociones y acuerdos
  van en un `<ol>` de verdad porque su número es cómo se cita un acuerdo
  después. Lista agrupada por AÑO, que es como los numera el folio.
- **Servicios** (358px). Fecha en pastilla delante (en una lista de cultos la
  fecha es la identidad de la fila), conteo grande primero y una tira de
  barras con los cuatro últimos cultos —la sección "Asistencia del último
  mes" del handoff, con datos que la página ya tiene cargados—.
- **Reportes** (330px, índice). Cinco informes; en columnas se llega con el
  estado financiero abierto, en empuje se llega al índice.
- **Cartas** (338px, índice). Sus siete secciones, agrupadas en documentos y
  traslados. Arregla de paso que **no había forma de volver** de una sección
  al resumen ni de saltar a otra sin salir de la pantalla.
- **Agenda** (318px a la derecha). Tocar un día lo abre en el panel; crear
  sigue estando, dentro del panel y con esa fecha puesta.

### 10.3 Lo que NO se construyó, y por qué

El mismo criterio de §4 y §3.8, seis veces más. Queda escrito en cada
componente para que no se "arregle" luego por error:

| Pantalla | Lo que el handoff dibuja | Por qué no está |
|---|---|---|
| Depósitos | "14 movimientos en efectivo y cheque", desglose Efectivo/Cheques, lista de movimientos incluidos | Un depósito es una fila: no guarda qué movimientos lo componen ni en qué forma venía el dinero |
| Actas | Botones "Recopilar firmas" y "Cerrar acta"; tercera firma de "Testigo" | El estado se cambia en el formulario; el modelo guarda preside y secretario, no un testigo |
| Servicios | "Roster" por puestos (Predicación, Alabanza, Ujieres, Sonido) y "Orden del culto" con horas | No hay catálogo de puestos, ni asignación por puesto, ni horario minuto a minuto |
| Reportes | "Aportantes" y "Depósitos del periodo" en el índice | En Tamio son dos PANTALLAS con su entrada en el sidebar; meterlas aquí duplica la navegación |
| Cartas | Tercera columna de 298px con "Campos de la carta" | `CartaEditor` ya enseña esos campos; una columna que repita lo de al lado no añade, repite |
| Agenda | — | Aquí el handoff no inventó nada |

### 10.4 La regla que sale de las seis

En las seis, el trabajo de verdad no fue el andamio sino **decidir qué del
handoff es estructura y qué es contenido inventado**. La estructura se copia;
el contenido se comprueba contra el esquema antes de dibujarlo. Y cuando el
dato existe pero todavía no hay ninguno —el caso de la asistencia en
Membresía, §9— la columna se enseña vacía y diciendo por qué, que no es lo
mismo que no enseñarla.
