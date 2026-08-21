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

> **El umbral es 1024px y no es negociable.** Es el mismo que separa el cajón
> lateral (601–1023) de la barra fija, así que la barra de 56px y el sidebar
> fijo no pueden discrepar. Un iPad en Split View angosto se queda como
> estaba —cajón, ☰, fila de glifos, Large Title— y eso es correcto: ahí es
> un tamaño compacto, no una tablet.

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

1. **El panel de detalle** (el grueso, ~70% de lo que queda). No existe
   componente: hoy tocar una fila abre `MemberDetailModal` o el modal de
   edición. Hay que sacar ese contenido a un panel que viva en columna y
   que en vertical empuje.
2. **Maestro-detalle en Ingresos/Gastos**: columna de lista de 400px con el
   segmentado Ingreso/Gasto, buscador, chips de filtro, filas de 64px
   agrupadas por día y un pie de 44px con conteo y total.
3. **Maestro-detalle en Miembros**: lo mismo con 378px, secciones por
   inicial y filtro Activos/Bajas/Todos.
4. **Sidebar superpuesto con velo en vertical para el iPad de 13".** Los
   demás iPads en vertical (820, 834, 744) ya caen en 601–1023 y ya tienen
   cajón; el de 12.9"/13" mide exactamente 1024 y se queda fuera por un
   píxel. Es mover un umbral, no escribir un cajón.
5. **Buscador global en el sidebar con ⌘K.** No existe hoy en ninguna
   plataforma; es función nueva, no maquetación.

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

| Clase | Tamaño | Qué es |
|---|---|---|
| `mac` | 1440×900 | Mac — no debe cambiar |
| `mac` | 1024×900 | Mac angosto — no debe cambiar |
| `movil ipad` | 1366×1024 | iPad 13" horizontal |
| `movil ipad` | 1024×1366 | iPad 13" vertical |
| `movil ipad` | 1180×820 | iPad 10.9" horizontal |
| `movil ipad` | 820×1180 | iPad 10.9" vertical — cajón, no debe cambiar |
| `movil ipad` | 744×1133 | iPad mini vertical — cajón, no debe cambiar |
| `movil iphone` | 390×844 | iPhone — no debe cambiar |
