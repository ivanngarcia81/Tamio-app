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

Lo que **no** hay que hacer: nada de Configuración. `.settings-shell` +
`.settings-nav` + `.settings-detail` ya corren como índice + columna en
Mac y iPad, y el diseño pide 298px + 680px — que es lo que ya hacemos.

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
