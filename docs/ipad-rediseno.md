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
   | Ingresos · Gastos | 400px | hecho |
   | Aportantes | 378px | hecho |
   | Configuración | 298px | hecho (21 ago, ver abajo) |
   | Reportes | 330px | hecho (22 ago, §3.9) |
   | Depósito bancario | 378px | hecho (22 ago, §3.9) |
   | Por revisar (bandeja) | 400px | hecho (21 ago) |
   | Actas | 358px | hecho (22 ago, §3.9) |
   | Registro de servicios | 358px | hecho (22 ago, §3.9) |
   | Cartas y traslados | 338px | hecho (22 ago, §3.9) |
   | Agenda y calendario | 318px | hecho (22 ago, §3.9) |

   Solo Inicio y Membresía son de una columna en el diseño.

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

9. ~~Las seis pantallas restantes~~ **Hecho** (22 ago). Con el andamio ya
   construido, cada una fue sobre todo decidir qué va en la fila, qué en el
   panel, y qué del handoff no existe. Las seis comparten el patrón de
   siempre: `partido` desde 700, columnas desde 1150, la selección es un ID
   (o un valor) que se re-busca y sobrevive al giro, y el ancho de cada
   lista es el del diseño (regla por pantalla en el bloque de 1150px).

   - **Depósito bancario (378px).** Lista agrupada por PERÍODO —no por mes
     de la fecha— porque así agrupan los totales y los reportes: un depósito
     de julio pagado en agosto sale bajo julio, donde suma. Panel nuevo
     (`DetalleDeposito`): la anatomía de `DetalleMovimiento` (importe
     grande, ficha, comprobante como botón) porque un depósito ES un
     movimiento de dinero. En cero filas abiertas, las tres tarjetas del
     resumen. Lo que el handoff traía y NO existe: el segmentado
     Pendientes/Depositados, "Marcar depositado" y la lista de movimientos
     incluidos en el corte — `depositos_bancarios` no guarda estado ni
     vínculos con `transactions`; aquí un depósito se registra cuando ya se
     hizo.

   - **Actas (358px).** Lista agrupada por año (la cabecera "2026" del
     diseño), fila con título, fecha · tipo · nº de acuerdos y la pastilla
     de estado. El panel (`DetalleActa`) enseña el acta COMO DOCUMENTO: la
     hoja serif del diseño (`--paper` claro en los dos temas: un documento
     impreso no tiene modo oscuro) con las mismas secciones y en el mismo
     orden que el PDF de `printActa.ts`. "Recopilar firmas" y "Cerrar acta"
     del handoff no existen como flujos: el estado se cambia editando y las
     firmas son líneas del documento impreso.

   - **Registro de servicios (358px).** Fila con bloque de fecha (día de la
     semana + número, como una celda de Calendario), agrupada por mes, con
     la asistencia como cifra a la derecha. Panel (`DetalleServicio`): la
     ficha del culto por secciones en el orden del formulario de registro.
     El "Orden del culto" con horarios y el roster por rol (Predicación,
     Ujieres, "Asignar encargado") del handoff no existen: `servicios` es
     una BITÁCORA de lo que ya pasó, no una planeación.

   - **Cartas y traslados (338px).** El partido cubre solo el estado de
     HOJEAR (resumen y archivo, fundidos): lista de cartas agrupada por mes
     de emisión con chips de estado, y el panel (`DetalleCarta`) enseña la
     carta con el MISMO HTML de `buildCartaHtml` que imprime — en un iframe
     a tamaño de hoja (816px) escalado al ancho del marco, para que lo que
     se lee sea exactamente lo que va a salir en papel. El editor, las
     solicitudes, los traslados y las plantillas siguen siendo pantallas
     completas; la columna de "Plantillas" del handoff se quedó como navcard
     en el panel vacío, no como sección de la lista — la lista es de cartas
     emitidas, que es lo que se viene a hojear.

   - **Reportes (330px).** La columna lista los informes que EXISTEN:
     estado financiero, distribución por categorías, resumen mensual y el
     reporte anual (`printAnnual.ts`, que además ganó su vista en pantalla:
     los doce meses con totales, la misma consulta que alimenta su PDF).
     "Aportantes" y "Depósitos del periodo" del handoff no son documentos de
     esta pantalla y no se inventaron. La selección es nullable a propósito:
     en columnas el estado financiero abre por defecto; en el empuje `null`
     significa "en la lista". Los botones de generar siguen en la barra
     de 56px.

   - **Agenda y calendario (318px).** Aquí los papeles se INVIERTEN: el
     maestro es el calendario (flexible, a la izquierda) y el detalle es la
     columna del día elegido, de 318px sobre el gris del sidebar — la
     anatomía de la app de Calendario. En el iPad, tocar un día lo ELIGE
     (es lo que hace el diseño); crear en ese día es el "+" de la propia
     columna. El día elegido es `cursor`, que ya era estado de pantalla y
     sobrevive al giro; en el empuje la columna entra por encima con
     "‹ Agenda". Solo en las vistas de mes y semana: Lista e Historial ya
     son listas y se quedan a lo ancho. Las reglas genéricas del empuje
     sirvieron tal cual — `.md-agenda` solo invierte quién es fijo y quién
     flexible.

10. **La repasada contra el handoff** (22 ago, segunda pasada). Pedida por
    Iván sobre Inicio, Ingresos, Gastos, Aportantes y Reportes. Ingresos,
    Gastos, Aportantes y Reportes estaban fieles; lo que faltaba:

    - **Inicio era la pantalla menos aplicada.** El handoff la maqueta con
      el saludo como h1 de 34px EN el contenido, cuatro KPI (con "Por
      revisar → Abrir bandeja"), y "Últimos movimientos · Esta semana" a dos
      columnas. Lo que había era el dashboard del Mac con el saludo y el
      saldo de 34px DENTRO de la barra — una barra de ~110px en una cáscara
      que promete 56. Ahora (`enIPad` en Dashboard.tsx): barra de 56px con
      "Inicio" y el balance del mes como subtítulo (el dato sigue siempre a
      la vista), saludo con "el corte de mes cierra en N días" (aritmética
      real del fin de mes), KPI del diseño —el pie de Ingresos dice
      "{{registros}} registros · {{diezmos}} diezmos", los conteos que
      `monthTotals` ya traía— con la cuarta tarjeta saltando a la bandeja
      (el conteo de `countPendingTx`, el mismo del badge), y las dos listas
      del pie: últimos 4 movimientos y la semana de la Agenda (las mismas
      ocurrencias de `expandirTodas`). Lo que el handoff traía aquí y NO
      existe: el segmentado Mes/Trimestre/Año (no hay concepto de periodo
      más que el mes) y los renglones de "Esta semana" que mezclaban tareas
      inventadas ("14 movimientos sin depositar" presupone el vínculo
      depósito↔movimientos que no existe) — la lista es solo de agenda.
    - **"Ver ficha" en el detalle de un ingreso** (diseño de la ficha de
      movimiento): existía el dato (`member_id`) pero no el salto. Ahora
      `DetalleMovimiento` acepta `onVerFicha` y navega a Aportantes con el
      miembro abierto — el mismo puente por `location.state` que ya usaban
      Agenda→Servicios y Membresía→Traslados. La Bandeja no lo pasa y no
      pinta el enlace.
    - **La línea secundaria de la fila de Aportantes** decía el correo (o la
      letanía "Sin correo registrado"); el diseño dice "Miembro desde 2014 ·
      diezma". Ahora: año de `fecha_ingreso` + primera etiqueta, con el
      correo de repuesto cuando no hay ni lo uno ni lo otro.

11. **La repasada de Configuración** (22 ago, tercera pasada, pedida por
    Iván). Medido con estilos computados a 1366: el bloque del 21 de agosto
    aplica tal cual el handoff — índice de 298 con su filo y fondo de
    sidebar, filas de 40px a 15px con radio 10 y activa con el tinte al 10%
    (gris con el acento "neutro"; verde si se elige verde), panel con
    columna de 680 centrada, héroe de 64px en rejilla y zona aplanada.
    Desviaciones deliberadas que se quedan: las zonas son las REALES de la
    app (Sincronización y Suscripción viven como tarjetas dentro de "Acceso
    y áreas"; "Datos y respaldo" es la Zona sensible), los formularios
    siguen siendo los controles reales y no las listas iOS del mock, y los
    tres interruptores inventados de Iglesia siguen sin construirse (§4).

    Lo que la repasada sí cazó, los dos en el rango apilado del mini (744):

    - **El índice apilado parecía deshabilitado**: la regla base pinta las
      filas en `--text-2` porque en Mac el índice convive con el detalle y
      no es el protagonista; a 744 el índice ES la pantalla y las siete
      filas salían en gris de apoyo. Ahora tinta entera.
    - **El cajón cerrado pintaba su sombra**: `box-shadow: 12px 0 40px`
      siempre encendida con el cajón en `translateX(-100%)` deja el borde
      derecho en x=0 y la sombra se proyecta DENTRO — una franja gris en el
      filo izquierdo de toda página del rango. Estaba en los DOS bloques de
      cajón (el del iPad, 700–1149, y el viejo de 601–1023 sin plataforma,
      así que también alcanzaba al Mac angosto y al iPhone apaisado). En
      ambos, la sombra ahora solo existe con `.menu-abierto` — el mismo
      trato que ya tenía el panel del maestro-detalle.

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

El arnés de Playwright ya vive en el repo: **`pruebas/arnes-ipad.mjs`**
(hasta el 22 de agosto se reconstruía en cada sesión y se perdía). Monta la
app REAL con `vite dev`, sustituye `invoke("db_select"/"db_execute")` por
sql.js corriendo las migraciones reales de `src-tauri/src/lib.rs`, siembra
datos con las funciones reales de `db.ts` y recorre las seis pantallas
partidas en los ocho tamaños de iPad más la red de seguridad. Cómo correrlo
está en su cabecera (`npm i --no-save playwright sql.js`).

Los tamaños de abajo son los del arnés. Los marcados como "no debe cambiar"
son la red: si uno se mueve, el cambio se salió del iPad.

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
