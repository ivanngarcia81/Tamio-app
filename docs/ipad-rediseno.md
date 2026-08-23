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

### Las hojas de formulario — TODAS (22 ago)

`NewRecordModal` elegía la hoja con `esIPhone()`; ahora con `esMovil()`. En
el iPad se pinta como `.formSheet` de UIKit: 600px de ancho, centrada, 82%
de alto, radio 16, sin tirador. El 21 de agosto solo "Nuevo ingreso/gasto"
había cruzado; el 22 cruzaron los OCHO formularios restantes con hoja de
iOS — el mismo cambio de gancho en cada uno, porque el cascarón (`.ios-sheet`
y la geometría de `.formSheet`) ya estaba bajo `:root.movil`/`:root.ipad` y
lo único propio de cada hoja son sus filas:

| Formulario | Gancho cambiado | Hoja |
|---|---|---|
| Acta (con subpáginas de horario, mociones, acuerdos) | `ActaModal` | `NuevaActaIOS` |
| Registro de culto (asistencia en subpágina) | `ServicioModal` | `NuevoServicioIOS` |
| Actividad de agenda | `ActividadModal` | `NuevaActividadIOS` |
| Depósito bancario | `DepositoModal` | `NuevoDepositoIOS` |
| Solicitud de carta | `SolicitudModal` | `NuevaSolicitudIOS` |
| Traslado de salida | `TrasladoSalidaModal` | `NuevoTrasladoSalidaIOS` |
| Traslado de entrada | `TrasladoEntradaModal` | `NuevoTrasladoIOS` |
| Alta de miembro (solo CREAR, como en iPhone) | `FichaMiembroModal` | `NuevoMiembroIOS` |

Las subpantallas (el buscador de nombres, "Tomar asistencia", los textos
largos, horario/mociones/acuerdos) también son `.ios-sheet`, así que en el
iPad se apilan solas como una segunda hoja de 600 encima — el mismo
comportamiento que ya tenía el buscador de aportante de Nuevo ingreso.

El CSS: el 21 se movieron a `:root.movil` las 71 clases que monta la hoja
de movimiento (extraídas de leer los componentes, no a mano); el 22, con el
mismo método sobre las ocho hojas nuevas, se movieron las ~25 reglas que
faltaban (`.sol-tipo`, `.dia-chip`, `.ios-cuenta`, `.ios-ia-campo`,
`.ios-total`, `.ios-miembro-*`, `.ios-check`, los pies `--error`/`--aviso`,
`.modal-overlay--confirm` y las variantes oscuras huérfanas de
`.ios-stepper` y `.ios-chips`). Lo que sigue en `:root.iphone` es solo lo
que el iPad de verdad no alcanza: los Ajustes de iOS, la Bandeja, el editor
de Cartas (`carta-ios`), la barra de menú y las pieles de páginas enteras
de teléfono.

Dos consecuencias que no son formularios pero salieron de aquí:

- **Cartas recuperó su botón de crear en iPad.** Desde 700px el "+" fijo se
  apaga y vuelven los botones de cabecera; el menú de crear de Cartas
  (`.cartas-menu-crear`, con las 4 acciones) estaba oculto para todo
  `movil`, así que el iPad grande no tenía NINGUNA entrada de crear en esa
  pantalla — ni forma de llegar a la pestaña de Solicitudes. Ahora
  `:root.ipad` lo enseña desde 700, como al `.btn-nuevo-cabecera`.
- **El editor de Cartas se queda como página en iPad** (la piel de
  escritorio, `card pad-lg`). El diseño lo comprime en una hoja de 580;
  la app lo tiene como pantalla completa con vista previa del documento, y
  meter ese editor en 600px es otra tarea, anotada abajo, no un cambio de
  gancho.

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
   mientras el panel entra). El corte columnas/empuje es **1000px** (nació en
   1150 y bajó el 22 ago, §11): por debajo —el mini, el 10.9" y el 11" en
   vertical— la lista se queda con todo el ancho, el resumen del mes baja a su
   cabeza (`.md-extra`) y el panel entra por encima con "‹ Ingresos"; de 1000
   en adelante conviven 400px + el resto. En columnas,
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

9. ~~Las seis pantallas restantes~~ **Hecho** (22 ago). Con el andamio ya
   construido, cada una fue sobre todo decidir qué va en la fila, qué en el
   panel, y qué del handoff no existe. Las seis comparten el patrón de
   siempre: `partido` desde 700, columnas desde 1000 (1150 cuando se
   escribieron, ver §11), la selección es un ID
   (o un valor) que se re-busca y sobrevive al giro, y el ancho de cada
   lista es el del diseño (regla por pantalla en el bloque de columnas).

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

    > ⚠️ **La segunda de esas desviaciones se levantó el 23 de agosto**: las
    > listas agrupadas SÍ cruzaron al iPad. El porqué, y lo que se rompía
    > mientras tanto, en **§24**.

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

12. **Los formularios** (22 ago, cuarta pasada, pedida por Iván: "¿ya
    todas las páginas, incluyendo sus formularios?"). La respuesta honesta
    era NO: solo "Nuevo ingreso/gasto" había cruzado al iPad; los otros
    ocho formularios con hoja de iOS seguían detrás de `esIPhone()` y en el
    iPad salían como el modal de escritorio. Cruzados los ocho — el detalle
    en §1 ("Las hojas de formulario"). Queda anotado, no hecho:

    - **El editor de Cartas como hoja** (el diseño lo comprime a 580px;
      la app lo tiene como página con vista previa — es un rediseño del
      editor, no un gancho).
    - **Las hojas de Configuración del diseño** (nueva categoría, invitar,
      responsable): en iPad siguen siendo los modales de escritorio de
      cada zona, coherentes entre sí. Las listas iOS de Categorías
      (`CategoriesSettingsIOS`, `IOSFormSheet`) son la piel del teléfono.
    - **En iPad angosto (<700) la pestaña de Solicitudes sigue sin
      entrada** — el "+" fijo abre "Nueva carta" directo y el menú de
      cabecera solo existe desde 700. Desde 700 ya se llega (el menú
      recuperado); por debajo, el reparto de media pantalla, es un hueco
      heredado que el rediseño no abrió.

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
partidas en los ocho tamaños de iPad, las ocho hojas de formulario (a 1366
deben salir como formSheet de 600 centrada, con sus subpáginas apiladas) y
la red de seguridad (que incluye: en Mac el formulario sigue siendo el
modal, en iPhone la hoja sigue siendo a lo ancho). 227 comprobaciones. Cómo
correrlo está en su cabecera (`npm i --no-save playwright sql.js`).

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
umbrales (700 y 1150, hoy 1000) y el patrón de "el detalle es un ID que se
re-busca".
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

---

## 11. El corte de columnas baja de 1150 a 1000 (22 ago 2026)

Lo destapó una pregunta de Iván después de probar la 1.2.0 en su iPad: *"no
se puede arreglar para iPad 12.9?"*.

**Con 1150, ningún iPad en vertical llegaba a dos columnas.** Ni siquiera el
Pro de 12.9", que mide 1024, ni el de 13", que mide 1032. El iPad más grande
que existe se comportaba en vertical como el mini de 744. Y no había motivo:
a 1024, con la columna maestra más ancha del proyecto (400px en Ingresos,
Gastos y Por revisar), al panel le quedan 624px — más que el ancho entero de
un iPhone Pro Max, donde ese mismo panel ES la pantalla. El sitio estaba; el
umbral no dejaba usarlo. Mail, Notas y Archivos de Apple sí muestran dos
columnas en un 12.9" en vertical.

### Lo que costó: dos decisiones compartiendo un número

El cambio parecía de una línea y eran tres sitios, porque `1150` vivía en un
`min-width` y en **dos** `max-width: 1149.98px` compañeros. Cambiar solo el
primero dejó el CSS aplicando los dos bloques a 1024, con el del empuje
ganando por orden — y la medición salió contradictoria: Agenda en columnas
(318px) y Depósitos en empuje (1024px) en el mismo viewport. El arnés lo cazó
en la primera vuelta; leyendo el CSS a ojo no se veía.

Y al abrir esos bloques apareció lo importante: **los dos empezaban en 700 y
acababan en 1149.98, pero no comparten motivo.**

| Bloque | Pregunta que hace | Tope |
|---|---|---|
| Cajón del sidebar con velo | ¿caben sidebar Y contenido a la vez? | **1149.98** (sin tocar) |
| Modo de empuje del maestro-detalle | ¿caben lista Y detalle? | **999.98** (bajado) |

A 1024 la primera respuesta sigue siendo NO —318 de sidebar más 400 de lista
dejarían 306 al detalle—, y por eso el 12.9" en vertical sigue enseñando el
☰. Pero con el sidebar ya superpuesto, los 1024 enteros son del split, y la
segunda respuesta pasa a ser SÍ. Eran dos cuentas distintas que por
casualidad daban el mismo número, y tenerlas atadas costó que el iPad más
grande se comportara como el más pequeño. **Si algún día se vuelve a mover
uno, moverlo por su propia razón.**

### Qué cambia y qué no

- 12.9" y 13" en vertical (1024 / 1032) → **dos columnas**. Era el objetivo.
- mini en horizontal (1133) → dos columnas (antes empuje).
- mini (744), 10.9" (820) y 11" (834) en vertical → siguen en empuje, que a
  esos anchos es lo correcto: 744 − 400 dejaría 344px de panel.
- 10.9" y 11" en horizontal (1180 / 1194) → ya estaban en columnas.
- Split View y Slide Over → siguen en empuje.

Verificado con el arnés en los ocho tamaños más la red de seguridad: **223
comprobaciones, cero fallos**. A 1024×1366 las seis pantallas dan sus anchos
de diseño (378 / 358 / 358 / 338 / 330, y el día de Agenda en 318); a 744
siguen dando empuje.

### El arnés medía otra rama

De paso hubo que alinearlo con la implementación que se envió, porque venía
de la rama que perdió la fusión y probaba SU código:

- daba `.md-fila` por sentado como fila de la columna maestra, y se colgaba
  30 s en Cartas. La columna maestra tiene **tres formas** (§10.1): Cartas y
  Reportes son de ÍNDICE y usan `.md-indice-item`. Ahora cada pantalla nombra
  la suya.
- pulsaba la PRIMERA fila, que en una columna de índice es la sección en la
  que ya estás: no abría nada y el empuje "fallaba" sin fallar. Ahora pulsa
  `:not(.sel)`.
- buscaba el volver de Agenda en `.agenda-dia-cab`, un div interno de la otra
  rama. Ahora se ancla en `.md-agenda .dm-volver`.
- y su propio corte seguía en 1150, así que juzgaba con una vara distinta de
  la de la app. Es el fallo más peligroso de los cuatro: un verificador que
  no comparte umbral con lo que verifica aprueba lo que debería suspender.

---

## 12. Por qué el iPad del diseño fue el último en salir bien

_Escrito el 22 de agosto de 2026, contestando una pregunta de Iván: "si el
handoff fue diseñado para iPad 13, ¿qué fue lo que pasó?". Es la lección más
cara de los tres días y merece estar aquí y no solo en los commits._

### El handoff describe UN estado de doce

Venía dibujado a **1366×1024** — el 13" en horizontal. De ahí salen todos los
números de este documento: lista de 400 y de 378, sidebar de 318, hoja de
600, filas de 60–64, radio de 14–16. Son medidas de **un lienzo**.

Y a 1366 la app hace lo que dibuja. Ahí no falló nada en ningún momento.

Lo que el handoff **no** traía: vertical (fue el primer mensaje de Iván sobre
esto, *"los diseños de portrait mode no salió"*), Split View, Slide Over, el
mini, el 10.9" y el 11". Un iPad puede aparecer en unos doce estados entre
tamaños y repartos; el handoff describe uno.

**Los otros once se inventaron aquí.** Y una decisión inventada no tiene
contra qué comprobarse: solo contra el criterio de quien la toma.

### Los tres fallos son el mismo fallo

Los tres fueron "un número puesto sin nada que lo validara", y los tres los
encontró Iván probando en el aparato, no una comprobación:

| Cuándo | El número | A quién dejaba fuera |
|---|---|---|
| 21 ago | el rediseño ENTRABA a 1024 | todos menos el 13"; *"sigue en su mayoría con la vieja UI"* |
| 22 ago | el bloque del teléfono LLEGABA a 1023 | mini, 10.9" y 11" en vertical corrían la maqueta del iPhone |
| 22 ago | las columnas ENTRABAN a 1150 | **todo iPad en vertical, incluido el 13"** |

La progresión es lo que duele: cada arreglo corrigió el umbral de entrada y
dejó intacto el de al lado. Tres veces seguidas.

### Y el 13" fue el último precisamente por ser el del diseño

Porque **es el que se dibujó, y por eso es el que se miró**. En horizontal
coincidía con la maqueta al píxel, así que daba la sensación de estar
terminado, y nadie lo giró. El aparato del diseño acabó siendo el mejor
atendido en la orientación dibujada y el peor en la que no.

No es mala suerte: **lo que no está en la maqueta no se revisa.**

### Las dos reglas que salen de aquí

1. **Un umbral se justifica por su propia pregunta, no por parecerse al de al
   lado.** El fallo de hoy eran dos decisiones —"¿caben sidebar y contenido?"
   y "¿caben lista y detalle?"— atadas al mismo 1149.98 sin compartir motivo.
   Está escrito junto a las dos media queries, en `styles.css`.

2. **Cuando la maqueta cubre un tamaño, la verificación tiene que cubrir
   todos.** Es la razón de ser de `pruebas/arnes-ipad.mjs`: los ocho tamaños
   de iPad más Mac, iPhone, Split View y Slide Over. Antes de que existiera,
   la única verificación era Iván con el iPad en la mano — y por eso los tres
   fallos llegaron a un build.

## 13. El cajón del sidebar se decide por orientación, no por ancho (22 ago 2026)

Iván revisó la 1.2.2 en TestFlight y trajo esto:

> "en portrait mode el side bar no se esconde sigue afuera como si como lo
> hace landscape mode. ahi que arreglarlo."

La regla decía:

```css
@media (min-width: 700px) and (max-width: 1149.98px) { /* cajón con velo */ }
```

Y el diseño que esa misma regla dice seguir —`anchoAmplio` solo en
horizontal— no habla de anchos: habla de **orientación**. El ancho era un
sustituto: "todo iPad en vertical mide menos de 1150". Y es falso.

**Ajustes → Pantalla y brillo → Zoom de pantalla → "Más espacio"** cambia
cuántos puntos reporta la pantalla sin cambiar la pantalla. El iPad Pro de
13" pasa de 1024pt en vertical a **~1210pt**. La cuenta:

| Aparato | Orientación | Ancho en pt | ¿< 1149.98? | Antes |
|---|---|---|---|---|
| iPad mini | vertical | 744 | sí | cajón ✓ |
| iPad 11" | vertical | 834 | sí | cajón ✓ |
| iPad 13" | vertical | 1024 | sí | cajón ✓ |
| **iPad 13" "Más espacio"** | **vertical** | **1210** | **no** | **fija ✗** |
| iPad mini | horizontal | 1133 | sí | cajón ✓ |
| iPad 13" | horizontal | 1366 | no | fija ✓ |

Una sola fila mal, y era la suya. Por eso las capturas que mandó en agosto
enseñaban la barra plantada en vertical mientras el arnés —que medía el 1024
de catálogo— decía que todo estaba bien.

La consulta ahora pregunta lo que de verdad quiere saber:

```css
@media (min-width: 700px) and (orientation: portrait),
       (min-width: 700px) and (max-width: 1149.98px) { … }
```

La coma es un O. Primera rama: cualquier iPad en vertical, mida lo que mida.
Segunda: el mini en horizontal (1133), que con 318 de barra más 400 de lista
se queda sin sitio para el detalle. Las dos ramas siguen siendo dos
preguntas distintas, y ahora cada una se hace con su propia unidad.

**Lo que hay que aprender de esto:** un umbral en píxeles que en realidad
está midiendo otra cosa funciona hasta el día en que un ajuste del sistema
mueve los píxeles debajo. El mismo aparato, en la misma orientación, con dos
números distintos según una casilla de Ajustes. Si la pregunta es "¿está de
pie o acostado?", `orientation` la contesta y `width` la aproxima.

**El arnés lo caza ahora.** `pruebas/arnes-ipad.mjs` mide la `position`
calculada de `.sidebar` en seis tamaños —incluido 1210×1614— y exige barra
superpuesta y fuera de pantalla con el ☰ encendido en vertical, y barra en
el flujo sin ☰ en horizontal ancho. Con la regla vieja puesta a propósito,
las tres aserciones de 1210×1614 fallan; con la nueva, las 308 pasan. El
corte de columnas (§11) NO se tocó: sigue en 1000 y sigue siendo por ancho,
porque esa sí es una pregunta de anchura.

## 14. Inicio, pantalla por pantalla contra el handoff (23 ago 2026)

Primera pantalla de la revisión página a página. Lo que sigue es la
comparación completa entre lo que dibuja el handoff de Claude Design y lo que
había en el repo, con la decisión de cada fila.

| El handoff dibuja | El repo tenía | Qué se hizo |
|---|---|---|
| Saludo `h1` 34px + fecha + corte de mes | igual (handoff 1) | se conserva — y se **arregla**: ver abajo |
| Segmentado **Mes · Trimestre · Año** | no existía | construido **y cableado** |
| KPI 1 · **Saldo en caja** | "Balance del mes" | cambiado; son dos cifras distintas |
| KPI 2 · Ingresos, con "N registros · N diezmos" | igual, del mes | ahora sigue al periodo |
| KPI 3 · Gastos, con delta | igual, del mes | ahora sigue al periodo |
| KPI 4 · Por revisar → bandeja | igual | sin cambios |
| Barras **por mes**, 6 columnas | barras por SEMANA (30 días) | sustituida en iPad |
| **Dona** de ingresos por categoría | área "Evolución del balance" | sustituida en iPad |
| — | tarjeta "Distribución de gastos" | fuera del Inicio del iPad |
| Últimos movimientos, 4 filas | igual | subtítulo: ver contradicción |
| Esta semana, 4 filas **con punto de color** | igual, sin punto | punto añadido |

### El segmentado es de verdad

En el prototipo los tres botones no llevan `onClick`: son estáticos. Se
cablearon contra datos reales. Un periodo es un **periodo de calendario**, no
una ventana móvil de 30/90/365 días, porque los libros de una iglesia se
cierran por calendario: el corte de mes, el informe al consejo y la constancia
anual caen los tres en fronteras fijas. Un "últimos 90 días" daría una cifra
que no coincide con ningún papel que la iglesia firme.

Gobierna las KPI de ingresos y gastos, sus deltas, y el periodo de la dona.
**No** gobierna la gráfica de barras: esa dice "por mes" y son seis meses
siempre, que es lo que dibuja el handoff — es la tendencia, no el periodo.

### Por qué "Saldo en caja" y no "Balance del mes"

No es un cambio de rótulo. Son dos números:

- **Balance del mes** = ingresos − gastos del mes. Un *flujo*.
- **Saldo en caja** = apertura + aprobados − depositado en el banco. Un
  *saldo*, y la pregunta con la que un tesorero abre la app.

Lo calcula `efectivoDisponibleHasta`, que ya existía y que es la misma cuenta
que usa Depósitos para saber cuánto queda por depositar. **El balance del mes
no se pierde**: sigue en la barra de menús de macOS, en el pie de ventana, en
los ocho indicadores del teléfono y en el estado financiero impreso.

Su delta solo sale **entre dos saldos positivos**. Un saldo que cruza el cero
da porcentajes como "▲ 1350%" o "▼ 356%", que no significan nada; con base
cero o negativa el cambio relativo no está definido. Cuando no se puede, la
tarjeta se queda con su cifra.

### Las gráficas: divs, no recharts

El handoff no dibuja una gráfica con ejes. Son doce barras de 13px sin
rejilla, sin eje Y y sin tooltip, y una dona que es un `conic-gradient`.
Montar eso sobre recharts es pelearse con su layout para acabar
escondiéndole todo lo que trae. En Mac y en el teléfono **no se toca nada**:
ahí siguen las de recharts, que son además las que se imprimen.

Se conserva un criterio que `DashboardCharts` había apuntado: *sin eje Y no
se sabe si una barra son 13 mil o 130 mil*. El diseño no tiene sitio para ese
eje, así que el dato va donde no cambia el dibujo — cada columna lleva su
`title` y su `aria-label` con las dos cifras del mes.

Los colores de la dona salen de `colorCategoria`, la paleta real de la app, y
no de los hexadecimales del prototipo. Es deliberado: el repo ya arregló una
vez la "segunda paleta que hacía que el chip y el donut no coincidieran"
(comentario en `db.ts`), y copiar los hexes la reintroduciría.

### Los puntos de "Esta semana" salían del repo

El handoff los pinta morado, verde, naranja y cian. Son **exactamente**
`--accent-3`, `--accent-1`, `--accent-5` y `--accent-4` de `styles.css`: la
prueba de que el handoff 2 se dibujó mirando el repo, como dijo Iván. Lo que
el prototipo no dice es qué separa un color de otro (son cuatro filas fijas).
La app sí tiene el dato —`agenda.tipo`, 23 valores— así que el punto pasa a
decir algo: `familiaDeActividad` agrupa los 23 en cuatro familias (culto,
reunión, fecha señalada, otra). Un color por tipo serían 23 colores que nadie
distingue.

### Lo que la captura encontró: el saludo llevaba meses roto

`franjaDelDia()` arma su clave con plantilla —``t(`dashboard.saludo.${franja}`)``—
y **esas tres claves no existían en ningún idioma**. El `h1` de 34px del Inicio
del iPad enseñaba el literal `dashboard.saludo.manana`, en 1.2.0 y en 1.2.2, en
TestFlight. `verificar-traducciones` pasaba en verde porque solo miraba
`t("…")` con comillas dobles; su propia cabecera avisaba de la limitación.

Ahora comprueba también los **prefijos** de las claves con plantilla: el
sufijo sigue sin poder resolverse sin ejecutar la app, pero el prefijo es
estático, y comprobar que existe al menos una clave debajo caza el fallo que
de verdad ocurre — que la rama entera no exista. Con las claves quitadas a
mano, el script falla; con ellas, pasa. 52 prefijos comprobados.

El saludo, además, ahora lleva nombre — "Buenas tardes, Iván" — de
`tesorero_nombre`, y solo el primero.

### La contradicción que queda abierta: el folio

El handoff pone `Folio 1042 · Efectivo` bajo cada movimiento de "Últimos
movimientos". **`transactions` no tiene columna `folio`** (`lib.rs`,
migración 2): las cartas sí lo tienen y los movimientos no. No se inventa un
número; la fila sigue diciendo `fecha · método`. Está a la espera de decisión.

## 15. Ingresos y Gastos, pantalla por pantalla contra el handoff (23 ago 2026)

Segunda pantalla de la revisión. Buena parte ya estaba —la lista de 64px, la
cabecera de día pegada, el pie con conteo y total, el panel con su ficha de
campos—, así que aquí se anota solo lo que faltaba y lo que cambió.

### La columna maestra

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Segmentado **Ingresos \| Gastos** sobre el buscador | no, en iPad | construido, con `<Link>` |
| Chip de **mes**, relleno, con chevrón | en la cabecera (‹ Agosto ›) | movido al chip; la ‹ › se apaga |
| Chips de categoría con conteo | ✓ | sin cambios |
| Chip de estado | no | **Pendientes** (ver contradicción) |
| Cuadrito de color 11px | solo en **gastos** | también en ingresos |
| Etiqueta de aviso junto al monto | punto ámbar en el titular | etiqueta, como el diseño |

El segmentado son dos rutas de verdad y no un estado local: el resto de la app
enlaza a `/ingresos` y `/gastos`, y el atrás del sistema tiene que seguir
funcionando.

El chip del mes **sustituye** a la navegación ‹ Agosto › de la cabecera en las
páginas partidas, no se suma a ella. Dos mandos que hacen lo mismo en la misma
pantalla son peores que cualquiera de los dos por separado.

### El panel

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| `h1` de 32px con el título | no — abría con el importe | construido |
| Importe grande | ✓ (40px) | sin cambios |
| Chip **Folio** | — | contradicción (§14) |
| "registrado por Iván García" | — | contradicción, abajo |
| Comprobante · **Compartir** · Editar | Ver comprobante · Eliminar · Editar | **Compartir** añadido; Eliminar se queda |
| Ficha de campos | ✓ | sin cambios |
| **Rastro de auditoría** | no | construido con datos reales |
| **Tarjeta de comprobante** con hueco punteado | solo un botón | construida |

**Eliminar no se quita.** El handoff dibuja tres botones y ninguno es borrar,
pero eso es una omisión del prototipo, no una decisión: quitarlo dejaría la
pantalla sin forma de deshacer un alta equivocada desde el iPad.

**Compartir** no inventa un formato: llama a `printRegister` con un solo
movimiento, y sale por `entrega`, que en iPad es la hoja nativa (Archivos,
AirDrop, Mail, Imprimir).

### El rastro de auditoría: lo que sí y lo que no

El handoff 1 pedía este mismo bloque y se descartó entero por inventado (§4).
Al mirar el esquema con calma —la lección de agosto— resulta que la mitad sí
existe:

| Línea del diseño | Columna | ¿Se construye? |
|---|---|---|
| Creado | `created_at` (migración 2) | **sí** |
| Editado | `updated_at` (migración 20) | **sí**, si difiere |
| Estado | `estado` | **sí** |
| Generado por recurrente | `recurrente_id` | **sí** |
| "por Iván García" | — | **no**, ver abajo |
| "Depositado · incluido en el corte" | — | **no**: los depósitos no están enlazados a sus movimientos |

**Un fallo que salió al construirlo.** `created_at` y `updated_at` los escribe
SQLite con `datetime('now')`: **UTC, con segundos**. `transactions.fecha` y
todo lo que escribe la app con `nowLocalIso()` van en hora **local sin
segundos**. Los formateadores no distinguen —reciben una cadena y la parten—,
así que el sello salía como "23 ago 2026, 00:46:48": con segundos, y **un día
por delante** de la fecha que el mismo panel enseña dos líneas más arriba. Un
gasto registrado a las 19:00 en México (UTC−6) decía haberse registrado al día
siguiente.

Se arregló con `utcALocal()` en `db.ts`, que devuelve "YYYY-MM-DD HH:MM" local
—el formato del resto de la app— para poder pasarlo a `fmtFecha` sin caso
especial. Comprobado a mano en UTC y en `America/Mexico_City`, y el arnés
comprueba que el sello no lleve segundos. **Cualquier otra columna
`datetime('now')` que se enseñe tiene el mismo problema**: hoy solo se enseñan
estas dos.

### Las dos contradicciones abiertas de esta pantalla

**1. "Registrado por".** El handoff lo pone dos veces: en el pie de la cabecera
("… · registrado por Iván García") y como primera línea del rastro. La tabla
`usuarios` **sí existe** (nombre + rol) y la sesión **sí sabe** quién está
dentro (`authEstado.nombre`), pero `transactions` **no tiene columna de
usuario**: no hay dónde guardarlo al dar de alta. Necesita una migración de una
columna y tocar el alta, la edición y la importación de CSV. No se inventa un
nombre.

**2. El chip "Sin depositar".** El handoff lo pone en la lista de ingresos. La
app no puede contestarlo: `depositos_bancarios` guarda el monto y el periodo
del corte, pero **no qué movimientos lo componen**. Hasta que exista esa
relación, el chip de estado dice **"Pendientes"** —que es `estado`, real— en
las dos listas. Es la misma pieza que falta para la pantalla de Depósitos.

## 16. Aportantes, pantalla por pantalla contra el handoff (23 ago 2026)

Tercera pantalla. El handoff la llama "Miembros"; en la app es **Aportantes**
(`/miembros`), la vista de TESORERÍA del padrón. Membresía (`/membresia`, de
secretaría) es otra pantalla y ya se hizo en su momento.

### La columna maestra

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Buscador | ✓ | sin cambios |
| Segmentado **Activos · Bajas · Todos** | no | construido |
| Conteo bajo el filtro | solo en el pie | añadido |
| Cabecera de sección por inicial | ✓ | sin cambios |
| Fila de 60px con avatar de 38 | ✓ (64px) | sin cambios |
| Sub "Miembro desde 2014 · ujier" | ✓ | y ahora "Baja en 2025 · traslado" |
| Etiqueta **Traslado** | no | construida (`estado_membresia`) |

Para poder ofrecer las tres vistas, la página pasa de `listMembers` (solo
activos) a `listMembersRegistro` (el registro completo) y filtra en memoria: un
padrón de iglesia son cientos de filas, y dos consultas serían dos verdades
que sincronizar.

### El panel: la ficha de cuatro pestañas

El handoff pide un segmentado de **Datos · Aportes · Familia · Asistencia** con
el expediente a la izquierda y el dinero fijo a la derecha. Eso no es lo que
hacía el panel, que reutilizaba tal cual el cuerpo del modal de Mac (tres
tarjetas + selector de año + tabla). Ahora el CUERPO es propio
(`FichaMiembroIPad`), pero el ESTADO se sigue compartiendo: `useFichaMiembro`
carga los años, el año elegido y los aportes una sola vez. Hay una fuente de
datos y dos maneras de enseñarla, no dos fichas que mantener.

De dónde sale cada pestaña:

| Pestaña | Fuente | ¿Real? |
|---|---|---|
| Datos | `members` (teléfono, correo, ingreso, bautismo, ministerios, cargos) | sí |
| Aportes | `listMemberAportes` | sí |
| Asistencia | `listAsistenciaLigera` | sí |
| **Familia** | — | **no** |

La columna derecha —total del año, barras por mes, últimos tres aportes— es
fija y no cambia con la pestaña: esta es la pantalla de Tesorería y el aporte
es la razón de abrir la ficha.

El promedio de la tarjeta se saca sobre los meses **con** aporte, no sobre los
transcurridos: quien diezma cada dos meses no aporta "la mitad", y dividir
entre los meses vacíos convertiría su ficha en un reproche.

### Lo que esta pantalla no puede llenar

**La pestaña Familia.** `members` no guarda parentesco: no hay tabla de
relaciones ni columna de familia. La pestaña **se construye igual** y explica
qué le falta, siguiendo la regla que Iván ya fijó en Membresía: *una sección
sin datos todavía no es lo mismo que una que no aplica; enséñala vacía y di
por qué*. Cuando exista la relación, se enchufa el motor y la pestaña ya está.

**Tres campos del expediente del diseño no existen** y por eso no se pintan:
nacimiento, dirección y estado civil. `members` tiene mucho de membresía
(ingreso, congregación, bautismos, ministerios, cargos, instrumentos) y casi
nada de datos personales. Piden migración; la ficha enseña mientras tanto lo
que sí hay, que no es poco.

### Y una cosa que casi doy por bug y no lo era

Las barras del año y el chip del mes salían **negros** en el arnés, no verdes
como el handoff. Parecía que había usado el token equivocado.

No: **`--ink` en esta app es el acento que el usuario elige** en Configuración
→ Apariencia. De fábrica es "neutro" (`#0f0f0f`), y hay verde, azul, morado y
ámbar. El `--ink` del handoff (`#047857`) es **exactamente**
`[data-acento="verde"]` de esta hoja — otra prueba de que el diseño se dibujó
sobre el repo.

O sea: el prototipo está pintado con el acento verde puesto, y la app arranca
en neutro. Atarse al token es lo correcto —hardcodear el verde rompería el
selector de acento que Configuración ofrece—, y el arnés ahora lo comprueba:
cambia `data-acento` a verde y exige que la barra se mueva. Sale
`rgb(15,15,15) → rgb(4,120,87)`.

**Queda una decisión para Iván, no técnica:** si el acento de fábrica debería
ser verde en vez de neutro, para que la app recién instalada se vea como el
handoff. Es una línea de CSS; no la toco sin que lo diga.

## 17. Reportes, pantalla por pantalla contra el handoff (23 ago 2026)

Cuarta pantalla, y la más corta de las cuatro: el índice de 330px con sus
cinco informes ya era exactamente el del diseño desde el handoff 1. Lo que
faltaba era **dónde viven los mandos**.

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Índice de 330px, cinco informes con subtítulo | ✓ | sin cambios |
| **Barra de 50px sobre el informe** | no | construida |
| Chip de mes con chevrón, en esa barra | en la cabecera (‹ Agosto ›) | movido |
| **Compartir** | en el menú "Más" | también en la barra |
| **Vista previa PDF** | botón "PDF" en la cabecera | movido a la barra |
| Chip "Todas las categorías" | — | **no**, ver abajo |
| Aviso "No se incluye en el PDF" | no | construido |
| 4 KPI con filete de color arriba | ✓ | sin cambios |
| Tabla de meses con variación | ✓ | sin cambios |

La barra va **dentro** de `.dm`, encima del informe: al desplazar el papel
los mandos se van con él, porque son del informe y no de la página. Y por eso
mismo se apagan sus duplicados de la cabecera — la ‹ › del mes y el botón
"PDF"—, con el mismo criterio que en Movimientos: el mismo mando dos veces en
una pantalla es peor que cualquiera de los dos.

### "Vista previa PDF" ya existía, y mejor

El handoff dibuja un velo a pantalla completa con una hoja de 660px dentro,
Cerrar / Compartir / Imprimir arriba. **No hace falta construirlo**:
`services/entrega.ts` ya abre el visor de la app con el **PDF de verdad** y su
propio botón de compartir, precisamente porque en iOS no hay Vista Previa.
Enseñar el documento real es mejor vista previa que una maqueta de él, así que
el botón nuevo llama a lo que ya había.

### Lo que no se construyó: el chip "Todas las categorías"

El handoff pone un segundo chip junto al del mes. **La pantalla no tiene ese
filtro y no debería tenerlo a la ligera**: un reporte de Tesorería es del
PERIODO, y filtrarlo por categoría cambiaría lo que dice el PDF —el estado
financiero dejaría de cuadrar contra el saldo—. No es que falte un dato: es
que la pregunta que hace ese chip no es la que responde este documento. Si de
verdad hace falta, lo natural es un informe aparte ("Ingresos por categoría"
ya está en el índice), no un filtro sobre el estado financiero.

### El aviso que sí faltaba

El handoff rotula el bloque de arriba como "Resumen en pantalla · **No se
incluye en el PDF**". Es un detalle pequeño y honesto: esas cuatro cifras son
ayuda de pantalla, y quien comparte el reporte esperaría encontrarlas dentro.
Ahora lo dice.

## 18. Depósitos, y la regla nueva: primero la plantilla (23 ago 2026)

Quinta pantalla, y la primera que se construye bajo una **regla nueva de
Iván**, dicha el 23 de agosto sobre las tres contradicciones abiertas:

> 1. "Registrado por" — *déjalo registrado, y cuando terminemos con el diseño
>    se le agregan los usuarios.*
> 2. Nacimiento, dirección, estado civil — *déjalo construido, la plantilla, y
>    después se le pone motor.*
> 3. "Sin depositar" — *se lo ponemos después del diseño.*

O sea: **el diseño primero, el motor después**, y lo que no tiene datos se
DIBUJA con su hueco explicado en vez de desaparecer. Es la misma regla que ya
había fijado para la quinta columna de Membresía, ahora general.

### Lo que eso cambió en Aportantes (§16)

Los tres campos personales ya no se omiten: salen como filas de la ficha con
su etiqueta y "Sin capturar todavía" en gris cursiva, y un `title` que explica
que el campo está en el diseño y aún no se guarda. No es lo mismo que una fila
vacía —esa se esconde porque el campo existe y esta ficha no lo trae—: aquí el
hueco ES la información.

### Depósitos

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Segmentado **Pendientes · Depositados** | no | construido |
| Fila de 72px con estado | 64px, sin estado | ambas cosas |
| `h1` "Corte del domingo 23" | solo el monto | construido |
| **Efectivo / Cheques / Total** | no | Total real; los otros dos, plantilla |
| **Movimientos incluidos** con palomitas | no | plantilla con su explicación |
| **Ficha de depósito** (foto del banco) | una fila de la ficha | tarjeta con hueco punteado |
| Botón "Marcar depositado" | — | **no**, ver abajo |

**"Ficha de depósito" era real desde siempre.** `depositos_bancarios` tiene
`comprobante_path` desde la migración 5; lo que faltaba era darle la forma de
tarjeta con el recuadro punteado del diseño en vez de una fila que decía "Sin
ficha adjunta".

**"Pendientes" no se queda muda.** Un depósito, en Tamio, se registra cuando
YA se hizo: no existe el paso de preparar el corte antes de ir al banco. La
pestaña lo dice, y de paso da el número que sí se sabe calcular —el efectivo
por depositar, `efectivoDisponibleHasta`, la misma cuenta del "Saldo en caja"
del Inicio—. Vale más un dato verdadero y una explicación que una lista vacía.

**El botón "Marcar depositado" NO se construye.** Aquí la regla de "primero la
plantilla" se para, y a propósito: un campo vacío es pasivo y un botón invita
a pulsarlo. Un primario que no hace nada, encima de cada corte, enseña el
diseño a costa de mentirle a quien lo toca. Las plantillas mudas —una fila,
una tarjeta, una pestaña— sí van, porque no prometen una acción. Cuando exista
el estado del corte, el botón entra con su motor puesto.

### Lo que sigue esperando la relación depósito↔movimientos

Tres cosas, todas dibujadas y sin motor: el desglose Efectivo / Cheques, la
lista de movimientos incluidos, y el chip "Sin depositar" de la lista de
Ingresos (§15). Las tres se resuelven con la misma pieza: guardar qué
movimientos componen cada depósito.

## 19. Por revisar: la taxonomía que se descartó por no mirar el esquema (23 ago 2026)

Sexta pantalla, y la que cierra una vieja deuda. El **handoff 1** dibujaba
esta bandeja con siete tipos de aviso —"duplicado probable", "categoría
vacía", "recurrente vencido"— y se descartaron **enteros, por inventados**
(§4). El handoff 2 los volvió a pedir. Al mirar el esquema con calma, la
conclusión de agosto se confirma en su forma más cara:

**las siete reglas se calculan con columnas que ya existían.** Ninguna
necesitaba tabla nueva. El descarte no fue por falta de datos: fue por no
haber abierto `lib.rs`.

| Alerta | De dónde sale | ¿Existía? |
|---|---|---|
| Espera visto bueno | `estado = 'pendiente'` | sí |
| Gasto sin comprobante | `comprobante_path` + monto | sí |
| Duplicado probable | huella (tipo, monto, contraparte) + ventana de 8 días | sí |
| Categoría vacía | `categoria` en blanco | sí |
| Aportante sin vincular | `member_id` nulo + `diezmo`/`emitir_constancia` | sí |
| Recurrente vencido | `mesesPendientesRecurrente` | sí |
| Miembro archivado | `activo = 0` | sí |

El motor (`services/bandeja/alertas.ts`) llevaba escrito desde el 22 de
agosto, puro y probado aparte, **sin que ninguna pantalla lo llamara**. Esto
es lo que le pone la pantalla.

### Lo que construye

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Cabecera con conteo y **Aprobar todo** | no | construida |
| Chips por tipo de alerta | no | construidos (solo los tipos que hay) |
| Fila de 70px con círculo de 34 e inicial | fila de 64, punto ámbar | construida |
| Pastilla "Requiere revisión" | no | construida |
| Titular grande de la alerta | no | construido |
| **Párrafo que explica el caso** | no | construido, con los datos dentro |
| Acciones propias de cada alerta | "Marcar revisado" para todo | una fila por tipo |

**El párrafo es el corazón de la pantalla** y por eso se redacta con los
valores reales —concepto, monto, fecha, método, el umbral citado— en vez de
un texto fijo: quien abre la bandeja tiene que poder decidir sin ir a buscar
el movimiento. Siete explicaciones, en los dos idiomas.

**Las acciones son distintas por alerta**, que es lo que hace útil la
pantalla: "Adjuntar comprobante" en la de comprobante, "Asignar categoría" en
la de categoría, "Vincular aportante" en la del diezmo suelto, "Restaurar" en
la del miembro archivado. La que no tiene movimiento sobre el que actuar —el
recurrente vencido— lleva a donde vive su serie en vez de fingir una acción.

### Una acción que faltaba en la base

"Devolver al tesorero" no existía. El estado `rechazado` **sí** estaba en el
esquema desde la migración 2, y `listTx` ya lo excluía de las listas y los
totales, pero **no había forma de ponerlo**: la Bandeja solo sabía aprobar. Se
añade `markTxRejected`, gemela de `markTxReviewed`. No borra: conserva el
movimiento con su historial, que es justo la diferencia entre devolver y
eliminar.

### "Aprobar todo" no aprueba todo

Solo los movimientos en estado pendiente. Las otras seis alertas no son cosas
que se aprueben —un duplicado no se "aprueba", se decide—, así que el botón no
las toca ni finge haberlas resuelto. Y por eso solo aparece cuando hay algo
que aprobar.

### Y un bug que salió en la primera captura

La cabecera de la página decía **"No tienes pendientes" encima de una lista
con doce asuntos**. Contaba `pendientes + archivados`, que son dos de las
siete reglas: con la bandeja llena de gastos sin comprobante y ningún
movimiento en estado pendiente, la suma daba cero. Ahora cuenta alertas, que
es la unidad de esta pantalla, y el arnés comprueba que la cabecera no
contradiga a la lista.

## 20. Actas: el acta pasa a ser una HOJA (23 ago 2026)

Séptima pantalla. El documento estructurado ya estaba —quién, agenda,
resumen, mociones, acuerdos, firmas—; lo que faltaba era **cómo se presenta**
y las dos acciones del trámite.

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Índice de 358px con fila de 74px | ✓ | sin cambios |
| **Barra de 50px** con estado y trámite | no | construida |
| **Cerrar acta** | solo desde el formulario | acción propia, real |
| **Recopilar firmas** | no | dibujado y **apagado** |
| El acta sobre **papel**, en serif | tarjeta blanca, sans | hoja de 660px |
| **Tres** renglones de firma | dos | el tercero, marcado |

### El acta es papel, no una tarjeta

Un acta se firma y se archiva, y el diseño la trata como tal: hoja de 660px
centrada sobre un lienzo gris, sombra de papel levantado, cuerpo en serif y
encabezado centrado. La **estructura de dentro no se toca** —la del repo es
más rica que la prosa del prototipo—; lo que cambia es la presentación, que es
lo que el handoff manda.

Con eso aparece un token nuevo: **`--paper`**. Es el blanco de un documento y
**no sigue al tema**: en oscuro baja a hueso (`#f6f6f4`) para no deslumbrar,
pero no se vuelve negro. Una hoja no se pone negra, y el acta impresa y la de
pantalla tienen que parecerse. Sobre ella, los rótulos de sección vuelven a la
tipografía de la app: el serif es para el TEXTO del acta, no para su
andamiaje — exactamente lo que hace el prototipo.

### "Cerrar acta" sí existía; "Recopilar firmas" no

**Cerrar** es real: `estado = 'aprobada'` y `fecha_aprobacion` estaban en la
tabla desde el principio. Lo que faltaba era poder cambiarlos **sin reabrir el
formulario entero y volver a guardar el documento completo**. Cerrar un acta
es UN gesto, no una edición, así que va en su propia función (`cerrarActa`)
que toca solo esas dos columnas, y pasa por confirmación: no porque sea
irreversible —el formulario puede devolverla a borrador— sino porque es el
gesto que cambia lo que ese papel significa.

**Recopilar firmas** no tiene motor: el acta guarda quién preside y quién
redacta, pero no **si firmaron ni cuándo**. Eso sí lo tienen las cartas
(`cartas.firmas`), y por eso la pieza existe en el proyecto pero no en esta
tabla.

El botón **se dibuja apagado**, con su `title` explicando qué le falta. Y aquí
la regla del 23 de agosto se aplica distinto que en Depósitos: allí me negué a
dibujar "Marcar depositado" porque un primario encendido invita a pulsarlo y
miente. **Un botón deshabilitado no miente**: enseña que la acción existe en
el diseño y dice por qué todavía no. La frontera no es "botón sí / botón no",
es *¿parece que funciona?*.

### El tercer renglón de firma

El handoff pone tres rayas: Pastor, Secretaria y **Testigo**. El acta no
guarda ese tercer nombre. Se dibuja igual, con la raya punteada y el cargo en
cursiva: **un acta impresa lleva tres firmas y la hoja tiene que tener dónde
ponerlas**, aunque el nombre se escriba a mano. Es el mismo criterio que los
tres campos personales de Aportantes.

## 21. Servicios: el roster y el orden, dibujados a medio cablear (23 ago 2026)

Octava pantalla. Es la que más se apoya en la regla de "primero la
plantilla", porque el handoff pide dos secciones y la tabla solo puede llenar
un tercio de una.

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Fila de 76px con pastilla de fecha | fila más baja, con pastilla | a 76 |
| Punto naranja del culto incompleto | no | construido, con dato real |
| **Roster por puestos** (5) | no | construido; 2 reales, 4 plantilla |
| **Tomar asistencia** | no (solo Editar) | construido, **real** |
| **Orden del culto** con horas | no | plantilla con su explicación |
| Asistencia del último mes | ✓ | sin cambios |

### El roster: dos de seis

`servicios` guarda `predica`, `dirige` y una lista de `participaciones`. Los
cinco puestos del diseño —Predicación, Alabanza, Ujieres, Ofrenda, Sonido— no
son columnas: son una estructura que la app no tiene.

Se construye la tarjeta con los seis renglones (los cinco del diseño más
Dirección, que sí existe). Predicación y Dirección se llenan de la base; los
otros cuatro dicen **"Sin asignar"** en el gris cursiva de pendiente, con su
`title` explicando. El mapeo vive en una constante (`PUESTOS`) con
`campo: null` para los que esperan: cuando haya roster por puesto se cambia
esa tabla y el resto de la tarjeta ni se entera.

**Lo que NO se copió: el enlace azul.** El diseño pinta el puesto vacío como
una acción — "Asignar encargado", en azul. Aquí no hay dónde guardar esa
asignación, y un enlace que no lleva a ningún sitio miente. Un hueco descrito
no. Es la misma frontera de Actas y Depósitos: no es *¿botón sí o no?*, es
*¿parece que funciona?*

### "Tomar asistencia" sí es real

Y llevaba tiempo siéndolo sin botón que lo dijera: `ServicioModal` ya tiene la
lista de asistencia y `db.ts` la guarda **por diferencias** en
`servicio_asistencia` (para que el uid de cada par se conserve y el borrado
viaje como lápida al sincronizar). El botón abre ese formulario. Comparte
destino con "Editar" y eso no es un atajo: ahí dentro están las dos cosas, y
lo que cambia es la intención con la que se entra — que es lo que el rótulo
dice.

### El punto naranja mide lo que puede medir

"Falta gente por asignar" se calcula sobre `predica` y `dirige`, que son las
dos que la tabla sabe. Los otros cuatro puestos no se pueden contar todavía, y
por eso el aviso no promete más de lo que comprueba.

### El orden del culto

No hay nada: el servicio guarda su fecha, quién participa y la asistencia,
pero no el minuto a minuto. La tarjeta se construye y lo dice.

## 22. Cartas: el papel al lado de sus campos (23 ago 2026)

Novena pantalla, y la única del handoff con **tres columnas**: plantillas,
papel y campos.

Aquí el handoff y el repo modelan cosas distintas. El prototipo dibuja
Cartas como **un editor**: eliges plantilla, llenas cuatro campos, ves la
carta, firmas y envías. La app la modela como un **hub de secretaría** con
resumen, archivo, plantillas, solicitudes y los dos traslados. El hub es
mucho más de lo que el prototipo enseña, y no se toca.

Lo que sí se lleva del diseño es su idea central, que faltaba: **ver la carta
mientras se escribe**.

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| Índice de 338px | ✓ (secciones, no plantillas) | sin cambios |
| **Barra con "Campos: N de M"** | no | construida, con cuenta real |
| **El papel al lado del formulario** | detrás de un modal | construido, en vivo |
| Campos a la derecha, 298px | debajo, a todo el ancho | a la derecha |
| Firmar y enviar | flujo propio del repo | sin cambios |

### El papel es el papel de verdad

No es una segunda maqueta de los mismos campos: el iframe carga
`buildCartaHtml`, **el mismo HTML que sale por la impresora y por el PDF**. Si
algún día cambia el papel, cambia en un sitio.

Se regenera con **medio segundo de freno**: `buildCartaHtml` carga el logo y
la firma de la iglesia, y rehacerlo en cada tecla pediría esos archivos
decenas de veces por frase. Medio segundo después de dejar de escribir es "en
vivo" para quien mira y una sola llamada para el disco.

### La hoja es una miniatura, y se comporta como tal

**El diseño no cabe en su propio lienzo.** Sus columnas suman 338 + 580 + 298
= 1216 **más** la barra lateral, sobre un canvas de 1366. Con el sidebar de
318 de esta app quedan ~646 para el panel, así que la hoja sale en ~310.

En vez de fingir que es una página, se asume: **se toca y se abre a tamaño**
(la vista previa que ya existía), con `cursor: zoom-in` y un rótulo al posar
el puntero. El iframe no recibe el toque —`pointer-events: none`— para que el
gesto sea del botón y no del documento de dentro.

### Dos cosas que costaron una medición

Perseguí el ancho de la hoja **tres veces a ciegas** —culpando al
`max-width: 720px` de `.dm`, luego a `:has()`— antes de medir la cadena en el
navegador. La medición dio la respuesta en un renglón:
`detalle 710 · dm 646 · papel 310`. **El tope nunca fue `.dm`: era el ancho
real del panel.** Media hora de suposiciones que un `getBoundingClientRect`
resolvía.

Y la barra se partía en dos líneas porque vivía dentro de la columna del
papel. Va de lado a lado (`grid-column: 1 / -1`), que además es donde el
diseño la pone.

### `display: contents`, para no tocar Mac ni el teléfono

El envoltorio nuevo (`.ce-split`) existe siempre, pero cuando no hay papel al
lado se declara `display: contents` y **desaparece del layout**: el formulario
se comporta exactamente como antes en Mac y en el iPhone. Sin eso, un div de
más habría cambiado el ancho de dos pantallas que no se estaban tocando.

## 23. Agenda: la barra fuera y la rejilla llenando el alto (23 ago 2026)

Décima pantalla. La Agenda ya era **maestro-detalle al revés** —el calendario
se queda con el ancho y el día es la columna fija de 318 a la derecha— desde
la primera pasada, así que el diseño no cambia de anatomía. Lo que cambia es
todo lo que rodea al calendario.

| El handoff dibuja | Estaba | Qué se hizo |
|---|---|---|
| **Barra de 50px sobre las dos columnas** | barra dentro del calendario | construida (`.ag-barra`) |
| Segmentado Mes · Semana · Lista | cuatro *chips* | segmentado, con las **cuatro** vistas |
| Mes pegado al segmentado, `‹ Hoy ›` al otro extremo | al revés | invertido |
| Rejilla que **llena el alto** | tabla de 104px por celda | `grid-auto-rows: 1fr` |
| Celdas sueltas de 10px sobre el lienzo | tabla con filos | tarjetas |
| Días de los meses vecinos, en gris | huecos en blanco | `matrizMesVecinos` |
| Hoy con la celda entera tintada | círculo alrededor del número | celda entera |
| Pastillas de color **por tipo** | filo de color por estado | tipo **y** estado |
| Columna del día: fecha a 22px, tarjetas, lo hecho tachado | 20px, sin tachado | al diseño |

### Lo que hubo que quitarle el sitio, y por qué no se pierde

El calendario del handoff **necesita el alto entero**: `grid-auto-rows: 1fr`
no dice nada si encima hay una fila de cuatro cifras, un bloque de
recordatorios y una fila de filtros. Medido, sin ellos la rejilla pasa a
852px de alto en 1366×1024.

La regla que salió de ahí: **en el iPad partido, Mes y Semana enseñan solo el
calendario; Lista e Historial conservan las cifras y los filtros.** No es
esconder funcionalidad por estética —

- los cuatro destinos a los que llevaban las cifras son exactamente los que
  la barra nueva ya ofrece: "Semana" + "Hoy" para *Hoy* y *Esta semana*,
  "Lista" para *Próximas* y *Por confirmar*;
- filtrar y buscar son operaciones de **lista**, y la lista sigue teniendo su
  fila de filtros entera.

En Mac y en el iPhone no cambia nada: las dos siguen viendo lo de siempre.

### Tres pestañas en el diseño, cuatro en la app

El handoff dibuja **Mes · Semana · Lista**. La app tiene además
**Historial**, que es la única forma de mirar lo ya pasado. No se quita: el
diseño define la **forma** del control —un segmentado— no cuántas vistas
tiene esta aplicación. Entra como cuarta pestaña, y en 744px (el iPad mini en
vertical, el más estrecho) las cuatro, el mes y `‹ Hoy ›` siguen cabiendo en
una sola línea. Está medido en el arnés.

### Color por tipo, filo por estado: caben los dos

La pastilla del handoff se tiñe por **tipo** de actividad (culto en el
acento, reunión en morado, fecha límite en ámbar, lo demás en cian). La app
venía pintando un filo de 2px por **estado** (borrador, programada,
confirmada). Son dos preguntas distintas y las dos tienen dato real detrás,
así que se quedan las dos: fondo por tipo, filo por estado.

El agrupado de tipos **no es nuevo**: es `familiaDeActividad`, las cuatro
familias sobre los 23 tipos del catálogo que ya usa el "Esta semana" del
Inicio (§14). Si dos pantallas dicen "esto es un culto", lo dicen del mismo
color.

### El nombre delante de la hora

El handoff escribe la pastilla como **"Culto 10:00"**. La app la traía al
revés, y en una celda de ~93px lo que sobrevivía al recorte era
`09:00 Fir…` — la hora se adivina, el nombre no. Se invierte con `order`,
sin tocar el orden del DOM (que es el que oye VoiceOver y el que usa el Mac),
y la hora lleva factor de encogido alto para que **ceda ella primero** cuando
no caben las dos.

### `matrizMesVecinos` va aparte a propósito

La rejilla del mes rellenaba con huecos en blanco. El handoff pinta los días
de los meses de al lado en gris, que es como se dibuja un calendario en
cualquier parte. La función nueva no sustituye a `matrizMes`: **aquella la
usa también el calendario del teléfono**, donde el hueco es deliberado —ahí
el mes es una cuadrícula de puntos, no una tabla— y cambiarla habría movido
una pantalla que no es la de este rediseño.

### Lo medido

El arnés pasa de 491 a **528 comprobaciones**, todas en verde. Las de esta
pantalla comprueban, entre otras cosas, que la barra mide 50 y **cruza las
dos columnas** (1048 contra 1048), que está *por encima* del partido y no
dentro del calendario, que la rejilla llega hasta abajo (852px, seis filas
iguales), que no queda ninguna celda en blanco, que las pastillas traen tres
familias de color distintas y que en Lista **vuelven** las cuatro cifras y
los filtros.

Una de ellas nació de un fallo de verdad: `.agenda-cell.sel` —la marca del
día elegido— tiene **la misma especificidad** que el fondo de tarjeta nuevo y
perdía por orden de aparición, así que el panel se abría y la celda no se
marcaba. La comprobación se hace en un día **cualquiera** y no en hoy, que va
tintado de por sí y tapaba el fallo; quitando la regla, el arnés lo canta.

> 📋 **El registro de cáscaras** (`docs/cascaras-1-2.md`) se quedó parado en
> la pantalla 3 mientras este documento seguía hasta la 11. Está al día desde
> el 23 de agosto por la tarde, con las once pantallas y —lo que faltaba— la
> lista de los controles que NO se construyeron, para que Iván pueda
> revocarla. Se revisa **antes de mandar a revisión del App Store**.

## 24. Configuración: las listas agrupadas cruzan al iPad (23 ago 2026)

Undécima pantalla y última del handoff. El **armazón** ya estaba desde el 21
de agosto (§3.7 y §11): índice de 298 con su filo, panel de 680 centrado,
héroe de 64px, sin buscador ni galones. Lo que faltaba era el **contenido**,
y ahí había una desviación apuntada por escrito: *"los formularios siguen
siendo los controles reales y no las listas iOS del mock"*.

Esa frase escondía un error de encuadre. El handoff no dibuja "listas iOS":
dibuja **listas insertadas** —versalitas de 12.5px sobre una tarjeta de 12 de
radio, filas de 52 con la etiqueta a la izquierda, pie explicativo debajo—, y
ese patrón **ya estaba escrito en la app**: es `FormularioIOS`, y los seis
componentes `*SettingsIOS` son, por su propia cabecera, *"una reescritura del
MARCADO, no de la lógica"*, con props idénticas a las tarjetas de escritorio.

Lo que había que hacer no era construir nada nuevo, era **dejar de esconderlo
detrás de `esIPhone()`**.

### Un `enListas` en vez de seis ramas nuevas

```
const enListas = enIPhone || esIPad();
```

Las seis zonas con gemelo (`iglesia`, `acceso`, `institucion`, `personas`,
`categorias`, `preferencias`) cambian de rama con esa constante. El estado, la
validación y el **guardado automático** no se enteran: son las mismas props.

Se comprobó zona por zona que no se pierde nada por el camino, porque las dos
ramas no siempre traen lo mismo. El caso que lo justificaba: "Acceso y áreas"
en escritorio son cinco tarjetas (Plan, Rol, Usuarios, Invitar, Sync) y en
lista son tres `Section` **más** la tarjeta de Usuarios al lado —
`AccesosSettingsIOS` sí trae invitar, sync y plan dentro. Si no las hubiera
traído, el cambio habría borrado la Suscripción del iPad.

### 44 reglas que se habían quedado en `:root.iphone`

Al primer intento, Preferencias salió **rota**: las miniaturas encimadas, los
tintes del acento sin forma, las filas de elección sin altura. La causa: de la
familia `.ios-*`, 131 reglas ya estaban escritas para `:root.movil` —que
incluye al iPad— y **24 clases se habían quedado en `:root.iphone`**
(`.ios-row`, `.ios-choice-row`, `.ios-color-dot`, `.ios-swipe`…). Son los
restos de la mudanza del §12, cuando cruzaron las hojas de formulario.

Ampliadas las 44 reglas de esas 24 clases a `:root.movil`. Para el iPhone es
un no-op exacto: `esIPhone` pone **las dos** clases (`movil` e `iphone`, ver
`main.tsx`), así que lo que ya se aplicaba se sigue aplicando. El Mac ni se
entera: `.mac` no lleva `.movil`.

Encima, los números del handoff, acotados a `.settings-detail` para no tocar
las hojas de formulario: encabezado 12.5/600 en versalitas, tarjeta de 12 con
sombra de 1px, filas de 52, **etiqueta en columna fija de 190** y valor a su
izquierda (en el teléfono va pegado al borde derecho porque en 390px no caben
dos columnas; en 680 sí), y los campos apilados de vuelta a una fila.

### Lo único que se construyó: las tres miniaturas de tema

El handoff dibuja Apariencia con tres rectángulos de 104px que **retratan la
app** —barra lateral con tres renglones, el primero con el acento, y dos
tarjetas al lado— en claro, en oscuro y partido en diagonal para
"Automático". Eso no existía en ninguna parte: `AppearanceSettings` es un
segmentado de tres pastillas.

Construido (`TemasIPad`, dentro de `PreferenciasSettingsIOS`) con los tres
botones **cableados de verdad** a `onThemePrefChange`. Los colores van
literales y no en tokens a propósito: es un retrato del tema claro y del
oscuro, así que la miniatura clara tiene que verse clara aunque el iPad esté
en oscuro — el mismo criterio que `--paper` en las hojas de Actas y Cartas.
El arnés lo comprueba midiendo las dos.

Solo iPad: en 390px tres miniaturas salen a 110 de ancho y no se distingue
qué retratan. El teléfono se queda con su lista de tres filas.

### Un fallo que llevaba tiempo ahí

**La Zona sensible se veía rota en el iPad**, y no por este cambio: se
comprobó capturándola antes y después, y salía igual de mal. `.settings-masonry`
son **dos** columnas y solo vuelve a una en `@media (max-width: 1180px)` —una
media query de **viewport**, que en un iPad de 1366 no dispara aunque el panel
de lectura mida 680. Resultado: dos tarjetas de ~320 con "Guardar respaldo
completo (.zip)" partido en cuatro renglones y el botón montado sobre el
texto.

Una columna en el panel de Ajustes del iPad, y ya se lee. Es la zona que no
tiene gemelo en lista —Respaldo, Restaurar, Compactar y Zona de peligro
siguen siendo tarjetas—, y es también la última de la lista y solo visible
para el administrador: por eso nadie la había mirado.

### Lo que sigue sin construirse, y por qué

- **La cabecera de logo de "Iglesia"** (tile de 64 con las iniciales, el
  nombre a 22px y "Cambiar logo · Eliminar"). El héroe de zona ya ocupa ese
  sitio con el mismo tamaño; dos cabeceras de 64px apiladas dirían lo mismo
  dos veces. El logo se cambia desde su fila, que es donde lo pone el patrón
  de lista.
- **"Tamaño de texto", "Sidebar siempre visible" y "Ocultar montos al
  bloquear"** (Apariencia), y los cuatro interruptores de permisos por rol
  (Acceso). No existen. Son **interruptores**, no adornos: un control
  encendido que no hace nada es lo que esta serie viene rechazando desde
  Depósitos, y además es motivo de rechazo del App Store (guideline 2.1).
- **"N movimientos" por categoría** y el asa de arrastre para reordenar. El
  conteo se puede calcular; el reordenado pide una columna de orden. Los dos
  son trabajo con motor, no maquetación.

### Lo medido

El arnés pasa de 528 a **550 comprobaciones**, todas en verde. Las de esta
pantalla se acotan a la zona **visible** (`.settings-zona:not(.settings-zona-inactiva)`)
y no al panel entero: las otras seis siguen en el DOM, ocultas con CSS, y al
primer intento las medidas salieron de una zona que no se estaba viendo —
`gridTemplateColumns` de un elemento oculto devolvió las dos columnas viejas
y dio un falso rojo.

## 25. Los cuatro grises, y el que estaba mal (23 ago 2026)

Iván lo cazó en el iPad, sobre la 1.2.4 y con la pantalla marcada: circuló el
panel de detalle de Ingresos y señaló con una flecha el gris de `.dash-canvas`
— *"el color gris tiene que ser idéntico al de la flecha; esa área no debe ser
del mismo gris del sidebar ni del maestro-detalle"*.

Medido sobre su captura:

| Superficie | Estaba | Debía |
|---|---|---|
| Barra lateral | `#F7F7F9` | ✓ |
| Barra de arriba | `#F7F7F9` | ✓ |
| Columna maestra | `#F7F7F9` | ✓ |
| **Panel de detalle** | `#F7F7F9` | **`#F2F2F7`** |
| (`.dash-canvas`, la flecha) | `#F2F2F7` | — |

**El handoff le da la razón, y por escrito.** El `<main>` lleva
`background: var(--bg)` (`#f2f2f7` claro, `#000` oscuro) y el div del panel de
detalle **no declara fondo**: lo hereda. Solo tres cosas llevan `--sb`
(`#f7f7f9`): la barra lateral, la barra de 56px de arriba y la columna
maestra.

### De dónde salió el error

Del bloque que escribí el 22 de agosto —"El gris del cromo del iPad"—, que
declaraba **tres** superficies del mismo gris e incluía el panel entre ellas,
con este razonamiento: *"es medio tono por encima del lienzo, no el mismo…
el cromo es continuo, barra, columna y panel sin costuras"*. Suena bien y es
falso: convertía media pantalla en una sola mancha de `#F7F7F9` de borde a
borde, y las tarjetas blancas perdían el fondo que las agrupa.

No lo inventé del aire —venía de una nota de color— pero **no lo comprobé
contra el archivo del handoff**, que es donde estaba la respuesta en una
línea. Es el §12 otra vez, y van tres: *lo que no se busca en la fuente, se
declara de memoria*.

### El segundo fallo, que salió al poner la comprobación

Al escribir la guarda nueva apareció otro: **la columna del día de la Agenda
tampoco tenía el gris que le toca**. Esa sí es cromo en el handoff —su div
declara `background:var(--sb)`, la única columna de detalle que lo hace— y en
el repo pedía `--sidebar-bg`… que en el iPad **cuelga de `--canvas`**, o sea
el lienzo. Llevaba así desde que se construyó, tapado porque el panel también
era del otro gris. Ahora usa `--ipad-cromo` explícito.

### Y el tercero y el cuarto, que salieron de la misma raíz

Iván volvió con otra captura marcada: **la barra de vistas de la Agenda**
—la de 50px con Mes · Semana · Lista y `‹ Hoy ›`— salía del gris del lienzo
mientras la barra de arriba, la barra lateral y la columna del día que tiene
al lado eran cromo. *"Lo circulado debe tener el color del maestro-detalle."*

Misma raíz que el fallo de la columna del día: **`--sidebar-bg` cuelga de
`--canvas`, y en el iPad `--canvas` es el lienzo.** Cualquier superficie de
cromo escrita con ese token sale del gris equivocado, y el nombre del token
invita a usarlo — se llama "sidebar-bg", ¿qué va a pintar si no la barra
lateral?

Esta vez, en vez de arreglar el que señaló, se buscaron **todas**. Hay cinco
usos de `--sidebar-bg` bajo `:root.ipad` y **cuatro estaban mal**:

| Superficie | Estaba |
|---|---|
| Barra de vistas de la Agenda | lienzo → **cromo** |
| Índice de zonas de Configuración | lienzo → **cromo** |
| Rótulo pegado de la columna maestra (`color-mix` 80%) | mezclaba lienzo → **cromo** |
| Barra de arriba (`color-mix` 85%) | mezclaba lienzo → **cromo** |

Los dos últimos son mezclas translúcidas: flotan **sobre** cromo, así que
mezclar lienzo les daba un tinte que no es el de debajo. La cuarta ni se
notaba —el bloque del final la pisa con `--ipad-cromo` sólido— pero dejar la
base equivocada es dejar una trampa para quien toque esa regla mañana.

La guarda nueva mide las dos que se pueden medir (la barra de la Agenda y el
índice de Ajustes) contra el gris de la barra lateral, no contra un literal:
si el cromo cambia, la comprobación sigue valiendo.

### Lo medido

Dos guardas. La vieja —que exigía **el mismo** gris en los tres— se reescribe
para exigir cromo en barra y lista y **lienzo** en el panel, en claro y en
oscuro (`#F2F2F7` y `#000`). Y una nueva comprueba las cuatro superficies de
una vez, incluida la identidad que pidió Iván —panel igual a `.dash-canvas`—
y la excepción de la Agenda. El arnés pasa de 550 a **557**.

## 26. El chip que se salía de su caja (23 ago 2026)

Iván circuló el chip del mes de Reportes. Medido en el navegador antes de
tocar nada —la lección del §22— el chip arrancaba en **x=642** cuando el panel
empieza en 648 y su contenido en 680: **38px fuera del panel, encima de la
columna maestra**.

No era de Reportes. `MenuAnchor` envuelve su disparador en `.ios-bar-button`,
y esa regla medía **44×44 fijos** con `justify-content: center`. Un glifo cabe;
un chip con texto de 120px no, y al estar centrado asoma `(120−44)/2 = 38` por
cada lado. La cuenta cuadra al píxel.

### Lo que hacía que fuera la tercera vez

Ya estaba parcheado **dos veces**, en dos sitios distintos:

```
:root.ipad .md-chips .ios-bar-button   { width: auto; height: auto; min-width: 0 }
:root.ipad .mb-controles .ios-bar-button { width: auto; height: auto; padding: 0; … }
```

Y el comentario del segundo decía, textualmente, *"el mismo tropiezo que en
Membresía"*. Dos parches y una nota que ya sabía que era un patrón — pero cada
uno se quedó en su pantalla, así que la barra de Reportes, escrita después, lo
volvió a pisar.

**El arreglo va a la raíz: 44 pasa a ser el MÍNIMO táctil, no la medida.**

```
min-width: 44px;  min-height: 44px;   /* en vez de width/height */
```

Para un glifo no cambia nada —sigue midiendo 44×44— y cualquier disparador con
texto crece a lo que necesite. Los dos parches se quedan solo con lo que de
verdad les es propio (soltar el mínimo táctil donde el chip ya lo da, y el
radio de la fila de Membresía).

### La guarda, y por qué la primera versión no servía

La primera comprobación que escribí medía la caja del botón contra la de su
**padre**. Con el fallo puesto de vuelta, **salía en verde**: el padre es
`.ios-menu-anchor`, que se encoge al contenido, así que se lleva el desbordado
consigo y las dos cajas coinciden.

La invariante buena no es dónde está el botón, es que **su contenido quepa
dentro de él**: `scrollWidth <= clientWidth`. Con esa, el fallo restaurado
sale en rojo en las **tres** pantallas a la vez —Reportes, Ingresos y
Membresía— que es exactamente lo que había que ver desde el principio.

Más la comprobación concreta de lo que Iván señaló: el chip del mes arranca
donde arranca el informe (680 = 680) y dentro del panel (680 > 648).

El arnés pasa de 586 a **591**.

## 27. El menú del mes se abría detrás del panel (23 ago 2026)

Iván tocó el chip del mes en Reportes y el desplegable salió **cortado por la
mitad**, con los meses tapados por la columna maestra. Medido antes de tocar
nada: el menú ocupaba **546–796** y el panel empieza en **648**. Los 102px de
la izquierda se los comía el `overflow-y: auto` del panel.

Dos causas encadenadas, y las dos en `MenuAnchor`:

1. **El menú vivía dentro de su anclaje** (`position: absolute`), así que
   cualquier ancestro con `overflow` podía recortarlo. `.md-detalle` lo tiene,
   porque el panel se desplaza.
2. **Se alineaba siempre a la derecha del disparador** (`right: 4px`). Con el
   chip pegado al borde izquierdo del panel, los 250px del menú salían todos
   hacia la izquierda — justo fuera.

### La casa ya tenía la respuesta escrita

`RowMenu`, `HeaderMenu` y `ContextMenu` **ya** cuelgan sus menús de `<body>`
con `createPortal` y los colocan en `fixed` desde el rect del disparador. Lo
dice hasta la cabecera de `Portal.tsx`: *"igual que hacen RowMenu/HeaderMenu/
ContextMenu con sus menús, la salida es colgar el overlay de `<body>`"*.
`MenuAnchor` era el único que no lo hacía. No hubo que inventar el patrón,
solo aplicarlo donde faltaba.

Con el menú suelto hay que colocarlo a mano, y eso permite además:

- **Voltear.** Se alinea al borde **izquierdo** del disparador y crece hacia la
  derecha —lo que espera cualquiera de un desplegable— y solo se voltea a la
  derecha si así se saldría de la ventana, que es el caso de los "+" de las
  cabeceras.
- **Limitarse de alto.** El menú de meses trae doce entradas; si no cabe
  debajo se abre hacia arriba, y si tampoco, se queda con el alto disponible y
  se desplaza por dentro.
- **Cerrarse al desplazar.** Un `fixed` no sigue a su disparador; quedarse
  abierto sería quedarse flotando en el sitio equivocado.

Se coloca en **dos pasadas** —se monta invisible, se mide, se coloca— dentro
de un `useLayoutEffect`, que es lo que evita ver el salto.

### La guarda, y el segundo fallo que encontró

Comprueba, en las pantallas con menú anclado: que cuelgue de `<body>`, que
**ningún ancestro con `overflow` lo recorte** —recorriendo la cadena de padres
de verdad, no suponiéndolo—, que quepa entero en pantalla y que se pueda
pulsar (`elementFromPoint` en su centro cae dentro del menú).

Puesta a prueba devolviendo el `absolute`, canta ocho fallos… y **uno no era
el de Iván**:

```
✗ Reportes · mes: ningún ancestro lo recorta (md-detalle)
✗ Ingresos · mes: ningún ancestro lo recorta (md-chips)
✗ Ingresos · mes: y se puede pulsar
```

El chip del mes de **Ingresos** estaba igual de recortado, y ahí nadie lo
había visto todavía. Es la ventaja de arreglar el patrón y no el síntoma.

El arnés pasa de 591 a **605**.

## 28. El día de hoy en negro, y el botón repetido (23 ago 2026)

Dos cosas en la misma captura de Iván: *"lo negro debe ser verde"* y *"hay un
duplicado en nueva actividad"*.

### `--ink` no era el token, y el archivo ya lo decía

La celda de hoy se pintaba con `var(--ink)`. Con el acento de fábrica
—"neutro"— `--ink` vale `#0f0f0f`, así que la celda entera salía **negra**.

Lo llamativo es que la regla ya estaba escrita en este mismo `styles.css`,
sobre el token `--brand`, y con estas palabras:

> *"NO es un alias directo de `--ink`: el acento de fábrica ("neutro") deja
> `--ink` en `#0f0f0f`, y con un alias los switches, checks y chips activos
> salían casi NEGROS — justo el patrón que este rediseño vino a quitar
> («iOS no usa negro puro como estado activo»)."*

Es exactamente la celda de hoy: un **estado activo** pintado a bloque. La
Agenda se escribió sin ver esa nota, y usó `--ink`. Van tres veces en dos días
que la respuesta ya estaba en el repo y el problema fue no buscarla —el
`--sidebar-bg` (§25), el patrón de portal de los menús (§27) y esto.

Cambiados a `--brand` la celda de hoy, el día elegido y la pastilla de la
familia "culto" (que el handoff tiñe con su acento, y que con "neutro" salía
negra). Con acento de fábrica dan el verde de la app; en cuanto el usuario
elige uno, lo siguen.

**Faltaba media pareja.** `--brand` no tenía color de texto: `--ink-contrast`
no sirve encima —con el acento de fábrica son colores distintos, y en oscuro
`--pos` se aclara tanto que el blanco deja de leerse—. Se añade
`--brand-contrast`: blanco en claro, tinta oscura en oscuro, y alias de
`--ink-contrast` en cuanto hay acento elegido.

### El "Nueva actividad" de más

Había **dos** botones verdes idénticos con el mismo rótulo: el de la cabecera
y otro al pie de la columna del día. Con un día abierto se veían los dos a la
vez, a un palmo. El handoff no dibuja ninguno en esa columna.

Se queda el de la cabecera **y hereda lo que hacía el otro**: con un día
elegido, crea EN ESE DÍA. No se pierde el atajo, solo el botón. El texto del
estado vacío se reescribe, porque prometía un botón que ya no está.

### Un falso rojo de la comprobación

La guarda del acento salía en rojo con el código bien: leía el color en el
**mismo** `evaluate` que ponía `data-acento`, y el recálculo de estilo todavía
no había llegado al elemento —`--brand` ya valía morado y la celda seguía
verde—. Poner el atributo y leer el color en pasadas separadas lo arregla.
Vale la pena dejarlo escrito: una comprobación que miente en verde es peor que
no tenerla, y esta mentía en rojo, que al menos se ve.

El arnés pasa de 605 a **608**.

## 29. Configuración era una página con contenido, no una pantalla partida (23 ago 2026)

Iván marcó el índice de zonas: *"debe tener el color del maestro-detalle, no
solo un cuadrado"*. El gris ya era el correcto desde la 1.2.6 (§25) — lo que
fallaba era la **forma**.

Medido antes de tocar nada:

| | Estaba | Debía |
|---|---|---|
| Índice, x | **350** | 318 (pegado a la barra lateral) |
| Índice, y | **68** | 56 (pegado a la cabecera) |
| Índice, alto | **1168** sobre una ventana de 1024 | 968, hasta abajo |

O sea: un **rectángulo de cromo flotando** en medio del lienzo, con 32px de
aire a la izquierda y 12 arriba, y creciendo con lo que hubiera dentro en vez
de llenar la pantalla.

La causa: Configuración se montaba como una **página con contenido**
—`.content-ajustes` heredaba de `.content` el `padding: 12px 32px 24px` y su
`max-width` centrado— mientras que las otras diez pantallas se montan como
**partidas**, donde `.main` es una columna con `overflow: hidden` y desplaza
cada columna por su cuenta.

Aplicada la misma receta de `.main:has(.md-split)`. Lo curioso es que el
comentario que ya estaba escrito en ese bloque decía *"aquí el índice desplaza
por su cuenta y llega abajo del todo"* — describía lo que **debía** pasar, no
lo que pasaba.

### El escalón de especificidad que hizo falta

Con `padding: 0` no bastó: `:root.movil .content` fija el padding de arriba
(12) y el de abajo (24) **más abajo en el archivo** y con la misma
especificidad (0,2,0), así que ganaba por orden. Medido otra vez: y seguía en
68 y la base en 1000. Con `.main` en el selector —`:root.ipad .main
.content-ajustes`— sube a 0,3,0 y gana. Es la segunda vez en esta serie que la
respuesta estaba en la especificidad y no en el valor (la primera, §23).

### Lo medido

La guarda comprueba la geometría, no el color: que el índice arranque en el
borde de la barra lateral, pegado a la cabecera, que llegue al fondo de la
ventana, y que **la página no desplace** —porque quien desplaza son las
columnas—. El arnés pasa de 608 a **612**.
