# Registro de cáscaras — lo visible que aún no tiene motor

_Abierto el 22 de agosto de 2026, con el handoff 2. La regla la puso Iván:
"si ves funciones que no existen en la aplicación, constrúyelas… aunque solo
sea decoración; ya después construimos su función". Este archivo es la otra
mitad de esa regla: la lista de la que se tacha. Y es lo que se revisa antes
de mandar una versión a REVISIÓN del App Store (a TestFlight no le importa):
un control que no hace nada es motivo de rechazo (guideline 2.1)._

## Cómo se apunta

Cada entrada dice QUÉ se ve, DÓNDE, qué le falta por detrás, y qué haría
falta para dárselo. Cuando se cablea, se tacha con la fecha.

## Membresía (maestro-detalle, handoff 2)

- **Nada quedó de cáscara.** Todo lo que el handoff dibujó se cableó a datos
  reales: asistencia (`AsistenciaLigera`), expediente (`camposFaltantes`),
  alertas (racha ≥ umbral y nuevo sin revisar, con `seguimiento_revisado_en`),
  movimientos (`historial_estados` + hitos de la ficha), las ocho tarjetas
  (`resumenMembresia`) y la analítica (`resumenAsistencia`).
- ~~**"Dirección" en el expediente**~~ → **resuelto el 24 ago 2026, y no como
  se esperaba.** La columna `direccion` resultó existir desde la migración 1 y
  hasta viajaba en la sincronización: lo que faltaba era **campo en algún
  formulario**, así que se podía leer y nunca escribir. Ya se captura (ver
  "Aportantes / ficha de miembro"). Lo que **no** entró es el EXPEDIENTE:
  `camposFaltantes` marca lo obligatorio, y meterla ahí habría dejado el padrón
  entero en rojo de un día para otro por un campo que nadie había podido
  llenar. Se pinta entre los datos, con los otros dos.
- **Paginación ‹ › del pie** — en el prototipo pagina; aquí la lista es de
  desplazamiento continuo y los botones desplazan una página de alto. No es
  cáscara (hacen algo real), pero se anota porque el gesto difiere del
  dibujo.

## Informes de membresía (índice maestro, handoff 2)

- **Nada quedó de cáscara.** El índice, el periodo, las cuatro vistas, la
  barrita con Imprimir/Exportar y los subtítulos con números reales ya
  existían como funciones; el trabajo fue de alojamiento, no de motor.
- **La hoja del periodo del prototipo** (`infper_abrir`, un picker en hoja)
  se resolvió con los campos inline bajo los chips — misma función, sin hoja.
  Si Iván prefiere la hoja del dibujo, es solo presentación.

## Mensajes (chat de columna centrada, handoff 2)

- **Nada quedó de cáscara.** Enviar, borrar lo propio con confirmación, el
  hilo, el estado vacío y ⌘↩ ya funcionaban; lo nuevo (columna de 720
  centrada, separadores por día, hora en la burbuja y la nota de
  visibilidad) es presentación sobre datos que ya existían.
- **El aviso "lo ven las tres áreas"** dice la verdad: `mensajes` no tiene
  destinatario, es un hilo único por iglesia. Si algún día se quiere
  mensajería dirigida, es columna nueva y no un cambio de texto.

> 🪦 **Esta pantalla ya no existe.** Iván, 25 ago 2026: *"la página donde dice
> mensajes debería ser otra función, no de recibir mensajes como si fuera un
> chat; ya las personas tienen WhatsApp e iMessage"*. En su sitio está **el
> registro de lo que pasa en la iglesia** (migración 50). Lo de arriba se
> queda tal cual porque describía bien lo que había.
>
> **La retirada fue en dos tiempos, y el segundo hizo falta.** El 25 de agosto
> se dejó de ENSEÑAR `mensajes` y sus filas se conservaron: borrar con
> sincronización de por medio no tiene vuelta atrás, y esa decisión no era del
> que escribe código. El 26 Iván la tomó —*"cerrar el reemplazo de Mensajes y
> borrar"*— y entonces se fue de verdad: la pantalla, las seis funciones de
> `db.ts`, el paso de `sync.ts`, las claves de i18n, la tabla local
> (migración 51) y las filas de la nube. La tabla REMOTA se queda vacía hasta
> que todos los aparatos pasen de la 1.2.11; el porqué está en
> `supabase/retiro-msg1-mensajes.sql`.
>
> **Y salió algo que no se buscaba.** Al ir a quitar `mensajes` de
> `TABLAS_DATOS` se vio que `registro` **nunca entró** en esa lista: la tabla
> nació el 25 y el borrado de datos de la iglesia la dejaba entera. Nadie lo
> habría notado hasta ir a mirar. No es un despiste aislado — es lo que pasa
> siempre que se añade una tabla, porque la lista del borrado vive a mil
> líneas de la migración y no la ve nadie. De ahí salió
> `npm run verificar-borrado`, que corre las migraciones de verdad sobre un
> sqlite en memoria y compara el esquema resultante con la lista. Probado
> rompiéndolo tres veces: quitando `registro` de la lista, dejando un nombre
> fantasma, y añadiendo una tabla nueva sin apuntarla.

---

> ⚠️ **Este archivo se quedó parado nueve pantallas.** Se abrió el 22 de
> agosto con Membresía, Informes y Mensajes, y **dejó de escribirse ahí**
> mientras el repaso página a página seguía por Inicio, Movimientos,
> Aportantes, Reportes, Depósitos, Por revisar, Actas, Servicios, Cartas,
> Agenda y Configuración. Lo que sigue lo pone al día: la mitad que construye
> se hizo, la mitad que apunta no. Lo cazó Iván preguntando.

## Inicio (§14)

- **Nada de cáscara.** El segmentado Mes/Trimestre/Año, las dos gráficas, los
  cuatro KPI y "Esta semana" salen de datos reales.
- ~~**`Folio 1042` bajo cada movimiento**~~ → **cableado el 24 ago 2026**
  (migración 48), y era lo último del handoff sin pintar. Decidido con Iván:
  **`2026-0042`** —la forma de los demás folios de la app, sin prefijo— y **el
  pasado NO se numera**.

  Lo segundo es la decisión que más se nota: numerar hacia atrás obligaría a
  inventar un orden dentro de cada día, y ese orden inventado se leería como el
  que tuvieron. Los movimientos anteriores se quedan sin folio y la pantalla no
  pinta la fila cuando falta, en vez de enseñar un hueco que parezca un folio
  perdido.

  De paso salió una cáscara que nadie había apuntado: en Depósitos → Pendientes
  cada movimiento llevaba un número al lado, con la clase `dep-mov-folio`, y no
  era un folio — era `m.id`, el número de fila de esa base. El mismo ingreso
  era el 47 en un iPad y el 91 en otro. **Un folio de mentira, y a la vista.**
  Ya lleva el de verdad.

## Ingresos y Gastos (§15)

- ~~**"Registrado por · Rosa Elena Vega · tesorera"**~~ → **cableado el 24 ago
  2026** (migración 39). Lo pone la app con quien tiene la sesión abierta; no
  se teclea. Ver §37 de `docs/ipad-rediseno.md`.
- ~~**Chip "Sin depositar"**~~ → **cableado el 24 ago 2026** con los cortes
  (migración 38). Cuenta y filtra los ingresos en efectivo o cheque que no
  están en ningún corte.

## Aportantes / ficha de miembro (§16)

- ~~**Nacimiento, dirección y estado civil**~~ → **cableados el 24 ago 2026**
  (migración 42). Se capturan en **"Datos de la persona"**, una pantalla de la
  ficha que existe en el ALTA y en la EDICIÓN, y se pintan como filas normales
  en las dos fichas que los enseñan (Aportantes y Membresía). Con ellos se
  retiró `filaSinMotor()`, el ayudante que los dibujaba en gris: era su único
  usuario.

  Dos cosas que costaron más de lo que parecía:

  - **`direccion` ya existía** en la tabla desde la migración 1 y en
    `DATA_COLS`. Las columnas nuevas de verdad fueron dos, no tres. Se
    descubrió leyendo el esquema antes de escribir la migración.
  - **Los tres van en `MemberFicha`, no en `NewMember`.** `NewMember` solo se
    escribe al dar de alta —el modal de escritorio pinta "Datos personales"
    bajo `{crear && …}` y la hoja de iOS hereda esa regla—, así que puestos ahí
    solo se habrían podido llenar el día del registro, que es justo el día en
    que menos se sabe de una persona. `MemberFicha` la escribe
    `updateMemberFicha`, que corre en los dos modos. La guarda del arnés (§35)
    comprueba exactamente eso: abre un miembro que YA existe, escribe los tres
    por la interfaz, guarda, **recarga** y los busca.
- ~~**Pestaña "Familia"**~~ → **cableada el 24 ago 2026** (migración 46, tabla
  `parentescos`). Se añade a alguien del padrón y se dice qué es de esta
  persona; la relación sale en **las dos fichas**.

  Dos decisiones que quedan escritas, porque las dos se podrían haber tomado
  al revés y habría costado caro:

  - **Una fila por relación, no dos.** La fila dice "`pariente_id` es el
    `tipo` de `member_id`", y la ficha del otro la lee al revés con el
    inverso. Guardar las dos direcciones habría duplicado cada escritura y,
    con ella, la posibilidad de que se separen: corriges una y la otra sigue
    contando otra historia. La guarda del arnés (§40) comprueba exactamente
    esto — mira la relación desde las dos fichas y desde la segunda exige el
    tipo INVERTIDO.
  - **El catálogo es neutro** —"Padre o madre", "Hijo o hija"— y no por
    corrección: `members` no guarda sexo, así que "hija" sería un dato que
    inventa la interfaz. De regalo, cada inverso queda único: el inverso de
    "hijo" es "padre" y punto.

  Elegir va en dos pasos —primero la persona, después el parentesco— porque
  el padrón son cuatrocientos nombres y el catálogo son diez opciones;
  juntarlos en una hoja obligaría a elegir el parentesco primero, que es al
  revés de como se piensa ("Ana… es mi hermana").

## Reportes (§17)

- **Nada de cáscara.**
- **Chip "Todas las categorías"** — **NO se construyó**, y esta vez no por
  falta de dato: filtrar por categoría cambiaría lo que dice el PDF y el
  estado financiero dejaría de cuadrar contra el saldo. Si lo quieres, lo
  natural es el informe "Ingresos por categoría" que ya está en el índice.

## Depósitos (§18)

- ~~**Desglose Efectivo / Cheques**~~ → **cableado el 24 ago 2026**
  (migración 38). Sale de los movimientos del corte que cerró el depósito. Si
  el depósito se registró SIN corte, sigue diciendo que no se sabe — que es la
  verdad, no un cero.
- ~~**"Movimientos incluidos"**~~ → **cableado el 24 ago 2026**. Lista real,
  con su método, su folio y su total.
- ~~**Pestaña "Pendientes"**~~ → **cableada el 24 ago 2026**. Dos grupos: lo
  entregado y sin depositar, y lo que sigue en la caja.
- **"Marcar depositado"** — ~~NO se construyó~~ → **cableado el 24 ago 2026**
  (handoff 3). Ya no es una cáscara: vive en el panel de **Pendientes** y abre
  el formulario de depósito con el total, la cuenta y el periodo del corte
  puestos. Lo que era un botón apagado en un depósito ya hecho —donde no
  significaba nada— pasó a ser el paso que cierra la revisión.

> ✅ **La pieza se construyó el 24 de agosto de 2026** (migración 38: `cortes`
> + `corte_movimientos`). Era la primera de la lista del final y la que más
> rendía; el detalle está en §36 de `docs/ipad-rediseno.md`. Lo que apagó, de
> una vez: el desglose efectivo/cheques, "Movimientos incluidos", la pestaña
> Pendientes, el chip "Sin depositar" de §15, "Reabrir el corte", la hoja
> "Nuevo corte" entera, el aviso de "todavía no se marca qué fue al banco" y
> —de regalo, sin necesitar el banco— la tarjeta "Conciliación", que ahora
> compara lo contado contra lo registrado. **Ocho.**

### Lo que añade el handoff 3 (24 ago 2026)

El handoff de Depósitos rehace las dos pestañas. Lo que se cableó de verdad
está en §34 de `docs/ipad-rediseno.md`; aquí va lo que quedó **dibujado y
apagado**, con lo que le falta a cada uno:

| Cáscara | Dónde | Cómo quedó | Qué le falta |
|---|---|---|---|
| ~~**"Compartir"**~~ | Depositados, cabecera del detalle | **cableado el 24 ago** — saca el comprobante en PDF y lo entrega por la hoja del sistema | nada: lo que faltaba no era la hoja, era el documento |
| ~~**"Reabrir el corte"**~~ | Depositados, menú de "⋯" | **cableado el 24 ago** — devuelve el corte a "entregado". Sigue apagado en un depósito sin corte, donde no hay nada que reabrir | — |
| ~~**"Registró"**~~ | Depositados, Datos del depósito | **cableado el 24 ago** (migración 39) — sale con quien tenía la sesión abierta. En un depósito anterior a esa migración la fila no se pinta, en vez de repetir que no se sabe | — |
| ~~**"Conciliación"**~~ | Depositados, columna derecha | **cableada el 24 ago** — compara lo contado contra lo registrado y canta la diferencia. Cuadrar no demuestra que el banco lo recibió, y el texto no lo dice | casar contra el banco, si algún día se importa el estado de cuenta |
| ~~**Hoja "Nuevo corte"** entera~~ | Pendientes | **cableada el 24 ago** — "Crear" guarda el corte y engancha sus movimientos | — |
| ~~**"Responsable"**~~ | dentro de esa hoja | **cableado el 24 ago** — se elige de `usuarios` o se escribe, y se propone el del corte anterior | — |
| **"Adjuntar foto de la ficha"** | dentro de esa hoja | sigue apagado, con una razón más precisa | **ninguna**: la ficha la da el banco, así que en el corte todavía no hay ninguna. Se adjunta un paso después, al registrar el depósito, donde el campo lleva funcionando desde siempre |
| ~~**"Pedir doble firma"**~~ | dentro de esa hoja | **cableado el 24 ago por la tarde** (migración 47) | Ver el recuadro del final: no se encendió el *acuse*, se descubrió que la segunda firma era otra cosa — un doble conteo |

> ✅ **"Compartir", cableado el 24 de agosto de 2026** — y con una corrección
> que vale la pena dejar escrita, porque el diagnóstico de la tabla de arriba
> estaba mal. Decía que faltaba "una hoja de compartir; la app no tiene
> ninguna". **La tenía desde siempre**: `openForPrint` → `entregarArchivo`
> (`services/entrega.ts`) usa la Web Share API en el iPad y el diálogo de
> guardar en el Mac, y por ahí salen todos los reportes desde que existen. Lo
> que faltaba de verdad era el **documento**, y por eso el botón se encendió
> sin una dependencia nueva: `services/print/printDeposito.ts`.
>
> El comprobante lleva los datos del depósito, el desglose efectivo/cheques y
> la lista de movimientos **del corte** que lo cerró, y firma a quien registró
> y a quien llevó el dinero al banco — el par que un comprobante de depósito
> necesita enfrentar, y el hueco que los cortes vinieron a cubrir. Un depósito
> registrado sin corte no tiene desglose, y el PDF **lo dice** en vez de
> imprimir un cero. Si lo contado y lo registrado no cuadran, la diferencia va
> escrita en el papel: la copia que se archiva es el peor sitio para
> esconderla.
>
> Y en un iPad "Compartir" **abre primero el visor** de la app; la hoja nativa
> sale de su botón. No es un rodeo: iOS no tiene Vista Previa, y es lo que
> hace cada PDF de Tamio desde el primer día.

**Lo que NO se pintó, y por qué** *(escrito antes de la migración 38: los
nombres de corte ya existen desde que existe la tabla; lo que sigue valiendo
es el criterio)*. El diseño enseñaba en Pendientes una lista de
cortes con nombre propio ("Corte del domingo 23", "Ofrendas de miércoles 19")
y su cuenta asignada. Un corte con nombre no existe: lo que sí existe es el
día. Así que la lista agrupa por **fecha** —dato real— en vez de inventar
nombres, y el panel dice con todas las letras que la app todavía no sabe qué
movimientos fueron ya al banco. Un nombre inventado se lee como verdadero; una
fecha, no.

## Por revisar (§19)

- **Nada de cáscara.** Las siete alertas y "Aprobar todo" se calculan con
  columnas que ya existen — que fue justo el hallazgo de esa pantalla.

## Actas (§20)

- ~~**Renglón de firma "Testigo"**~~ → **cableado el 24 ago 2026** (migración
  41, y la columna también en Supabase). Campo opcional en las dos formas de
  alta, nombre en el detalle y tercera columna en el PDF **solo si se llena**:
  añadirla siempre habría cambiado la forma del PDF de todas las actas ya
  firmadas, y un documento contable no cambia retroactivamente.
  La raya discontinua se queda cuando no hay nombre, pero ya no significa
  "sin motor" sino "todavía nadie ha firmado aquí" — que es lo que siempre
  debió significar, y sigue sirviendo para firmar a mano.
- ~~**"Recopilar firmas"**~~ → **cableado el 24 ago 2026** (migración 44,
  `actas.firmas`). Se le quitó el `disabled` y ya estaba en su sitio, que era
  justo lo que decía esta línea.

  Tres decisiones que quedan escritas:

  - **Recoge una CONSTANCIA, no una firma digital.** Se anota que fulano
    firmó el papel y en qué fecha. Es la misma elección que Iván hizo en los
    cortes, y por el mismo motivo: un acta de asamblea se firma con bolígrafo
    delante de la mesa, y pedirle a los tres firmantes que entren en la app a
    confirmarlo convierte un trámite de un minuto en uno de tres días. La
    hoja lo dice con todas las letras en su primer renglón.
  - **Es JSON y no tres columnas de fecha**, porque las cartas resuelven
    exactamente esto con `cartas.firmas` desde hace versiones. Dos formas de
    guardar lo mismo en la misma app acaban comportándose distinto.
  - **El nombre NO entra en el JSON**: sigue en `preside`, `secretario` y
    `testigo`. Copiarlo dejaría dos versiones que se separan a la primera
    corrección de una letra.

  El botón se sigue pudiendo apagar, pero por un motivo verdadero: un acta
  que no dice quién preside, quién redacta ni quién es testigo no tiene
  firmas que recoger. Con firmas recogidas, deja de invitar y lleva la
  cuenta ("Firmas: 1 de 3"). La fecha sale bajo el cargo en la ficha **y en
  el PDF**: un acta que se manda por correo tiene que poder enseñar que está
  firmada sin abrir la app.
- **"Cerrar acta"** — real desde el primer día (`estado = 'aprobada'` +
  `fecha_aprobacion`).

## Servicios (§21)

- ~~**Roster por puestos: cuatro de seis son plantilla**~~ → **cableado el 24
  ago 2026** (migración 43, tabla `servicio_puestos`). Alabanza, Ujieres,
  Ofrenda y Sonido se asignan uno por uno desde la ficha del culto, con la
  hoja del buscador —la misma que elige aportante en Nuevo ingreso—, que
  además deja **escribir un nombre que no está en el padrón**: quien ayuda en
  sonido un domingo no tiene por qué estar dado de alta, y obligarle a estarlo
  convertía un apunte de treinta segundos en un trámite.

  Lo que **no** cambió, y no es un descuido: **Predicación y Dirección siguen
  en sus columnas** (`servicios.predica` y `.dirige`). Se escriben en el
  formulario del culto desde la primera versión y salen impresas en los
  informes; moverlas a la tabla nueva habría obligado a migrar datos reales
  para no ganar nada. La constante `PUESTOS` —que ahora vive en `db.ts`, con
  los demás catálogos— sigue siendo la que reparte: `campo` dice de dónde sale
  cada renglón, y el que lee la ficha no tiene por qué notar que son dos
  sitios.

  El catálogo **no** se convirtió en tabla. Son los seis puestos del diseño;
  una iglesia que necesite otro (multimedia, transmisión) pide una línea en la
  constante y su clave en los dos idiomas, no una pantalla de mantenimiento
  que nadie abre dos veces.
- ~~**Tarjeta "Orden del culto"**~~ → **cableada el 24 ago 2026** (migración
  43, tabla `servicio_orden`). Cada paso lleva momento, hora y encargado, y se
  sube, se baja y se quita desde la propia tarjeta.

  **La hora es opcional a propósito**, y de ahí sale la única decisión de
  diseño que hubo aquí: un culto real tiene pasos con hora ("10:00,
  Bienvenida") y pasos que van cuando toca ("Ofrenda, después de la
  predicación"). Por eso el orden lo manda `posicion` y **no** `hora` — con
  `ORDER BY hora`, los pasos sin hora se irían todos al principio, que es
  justo el fallo con el que se probó la guarda de la sección 36 del arnés.
- ~~**"Asignar encargado"**~~ → **encendido el 24 ago 2026**. Sigue siendo un
  BOTÓN y no el enlace azul del handoff, por lo de siempre: lleva a una hoja,
  no a una dirección. Con alguien ya puesto dice **"Cambiar"**, en el mismo
  sitio — asignar y reasignar son el mismo gesto, y partirlo en dos controles
  habría llenado un renglón de 58px para no decir nada nuevo.
- **"Tomar asistencia"** — real; ya existía sin botón que lo dijera.

## Cartas (§22)

- **Nada de cáscara.** El papel del editor carga `buildCartaHtml`, el mismo
  HTML que sale por la impresora y por el PDF.

## Agenda (§23)

- **Nada de cáscara.** Las cuatro vistas, el color por familia de actividad y
  el tachado de lo completado salen de `agenda.tipo` y `agenda.estado`.

## Configuración (§24)

- **Nada de cáscara**, y a propósito: lo que el handoff dibuja de más aquí son
  **interruptores**, no adornos. Ver el recuadro del final.
- ~~**"N movimientos" por categoría**~~ → **pintado el 24 ago 2026**. Una sola
  consulta agrupada (`conteoPorCategoria`) y no una por fila, que serían veinte
  para pintar una lista. La clave es la MISMA que guarda
  `transactions.categoria` —el id del catálogo, o `customCatRef(uid)` para las
  propias—, que es justo lo que la guarda del arnés (§41) vigila: si se
  buscara por la clave equivocada, todos los conteos saldrían en cero sin que
  nada fallara.
- **Asa de arrastre para reordenar categorías** — sigue sin pintarse, y ahora
  se sabe por qué: en el iPad las categorías son **pastillas que fluyen en
  varias líneas**, y ahí "arriba/abajo" no significa nada. No es solo la
  columna de orden: pide rehacer la pantalla con la lista del diseño.
- **Cabecera de logo de "Iglesia"** (tile de 64 con iniciales + nombre a 22px
  + "Cambiar logo · Eliminar") — no se construyó porque el héroe de zona ya
  ocupa ese sitio con el mismo tamaño. Es presentación, no motor.

---

## Los diez controles que faltaban — construidos y APAGADOS (23 ago 2026)

Esta sección empezó siendo "lo que NO se construyó". Duró unas horas: Iván
leyó la lista y contestó **"píntalo igual"**. Queda como registro de la
decisión y de dónde está cada uno.

La regla suya dice construir aunque sea decoración. Yo la había aplicado a
todo lo pasivo —campos, tarjetas, pestañas, renglones de firma— y me había
frenado en los **controles encendidos**, por mi cuenta. El freno se levanta,
con la forma que menos daño hace y que ya estaba probada en Actas:
**apagados, con su `title` diciendo qué falta**, nunca encendidos y mudos.

| Control | Dónde | Cómo quedó |
|---|---|---|
| ~~**Marcar depositado**~~ | ~~Depósitos, acciones del corte~~ | **cableado el 24 ago** — abre el formulario con el corte puesto |
| ~~**Asignar encargado** ×4~~ | ~~Servicios, puestos sin motor~~ | **cableados el 24 ago** (migración 43) — los cuatro abren la hoja que asigna el puesto |
| **Tamaño de texto** | Config → Preferencias → Presentación | segmentado apagado, "Normal" marcado |
| ~~**Barra lateral siempre visible**~~ | ídem | **RETIRADO el 24 ago** — no se cableó: se quitó. Ver abajo |
| ~~**Ocultar montos al bloquear**~~ | ídem | **cableado el 24 ago** — tapa el contenido en segundo plano (`src/privacidad.ts`) |
| ~~**4 permisos del rol Tesorería**~~ | ~~Config → Acceso y áreas~~ | **cableados el 24 ago** (migración 49) — y quedaron DOS. Ver abajo |
| ~~**Avisar de gastos sin comprobante desde $X**~~ | Config → Iglesia → Controles de tesorería | **cableado el 24 ago** (migración 45) — se enciende, se apaga y el importe se escribe |
| ~~**Avisar de posibles duplicados**~~ | ídem | **cableado el 24 ago** — interruptor vivo |
| ~~**Doble firma en el corte**~~ | ídem | **cableado el 24 ago** (migración 47) — dejó de ser una decisión al aclararse qué era |
| **Cierre de mes** | ídem | fila de valor: la app cierra por mes natural, y no es un ajuste |

Tres detalles de la ejecución que no son obvios:

- **"Asignar encargado" es un BOTÓN, no el enlace azul del handoff.** Un
  enlace deshabilitado no existe en ninguna interfaz —o lleva a un sitio o no
  es un enlace—, así que el hueco usa la misma pieza que todo lo demás. Con
  motor (24 ago) **sigue siendo un botón**, por la otra mitad del mismo
  argumento: lleva a una hoja, no a una dirección.
- **Se apaga la FILA entera, no solo el mando** (`.ios-field--apagado`, media
  tinta). Un interruptor gris dentro de una fila normal se lee como "está
  roto"; la fila entera a media tinta se lee como "esto todavía no".
- **Los cuatro permisos enseñaban el estado que YA se cumplía** con el rol de
  tesorería (dos sí, dos no), no un estado inventado. Mientras esperaban
  motor, la fila decía algo verdadero. **Cableados el 24 de agosto de 2026**
  (migración 49) — y al cablearlos quedaron dos, que es la historia de más
  abajo.
- **Eran solo iPad.** Al encenderlos dejaron de serlo, y por un motivo que no
  es de diseño sino de uso: quien pone un permiso es el administrador, que
  probablemente trabaja en un Mac. Un permiso que solo se pudiera poner desde
  un iPad no lo tendría nunca una iglesia sin iPad.
- **Dos de los cuatro últimos iban ENCENDIDOS**, y no por descuido: "Avisar de
  gastos sin comprobante" y "Avisar de posibles duplicados" describían algo
  que la app **ya hacía**, así que apagarlos habría sido mentir en la otra
  dirección. Lo que no se podía era cambiarlos. **Cableados el 24 de agosto de
  2026** (migración 45: `avisar_sin_comprobante`, `umbral_comprobante`,
  `avisar_duplicados`), y ahora apagar uno apaga de verdad su alerta en Por
  revisar — la sección 39 del arnés lo comprueba moviéndolos y contando lo que
  sale.

  Dos detalles de esa migración:

  - **Son tres columnas y no dos.** La de más es la que evita una mentira: sin
    `avisar_sin_comprobante`, apagar el aviso habría que representarlo con un
    umbral imposible (0, o −1), y un umbral que en realidad significa "no
    avises" es la clase de dato que se malinterpreta seis meses después.
  - **`umbral_comprobante` en NULL significa "el de la constante", no cero.**
    Una iglesia que nunca tocó el ajuste sigue con el comportamiento de
    siempre, y si la constante cambia, cambia con ella. Solo deja de seguirla
    quien elige un número. El pie del grupo dice cuál es esa cifra.

  Y el importe **salió de la etiqueta**: tiene campo propio, porque ahora se
  escribe. De paso arregló el recorte que la guarda vigilaba —"Avisar de
  gastos sin comprobante desde $1,000.00 USD" no cabía en la columna de 190—,
  esta vez quitando la causa en vez del síntoma.
- **"Cierre de mes" no es un interruptor**, es una fila de valor: la app
  cierra por **mes natural** (el porqué está en `services/inicio/periodo.ts`)
  y "último domingo" del prototipo no es un ajuste, es otra forma de contar.
  Se enseña lo que hace hoy.

Lo que hace falta detrás de cada uno: los dos primeros, la pieza de
`deposito_movimientos` y el roster por puestos (ya listados arriba). De los
cuatro de Configuración quedan **uno**: escalar el tipo de letra. Los otros
tres —fijar la barra lateral, difuminar cifras en segundo plano y los
permisos— se resolvieron: el primero retirándolo, los otros dos con motor.

### Cuatro interruptores que al encenderse resultaron ser dos

**24 de agosto de 2026, migración 49.** Al ir a construir los cuatro permisos
salió que dos de ellos no eran permisos:

| Interruptor | Qué resultó ser |
|---|---|
| Registrar ingresos y gastos | **la definición del rol.** Un tesorero que no registra no es un tesorero con un permiso menos |
| Cerrar cortes y depósitos | ídem |
| Ver el padrón completo | permiso de verdad, y **DA**: le abre Membresía, que hoy tiene cerrada |
| Eliminar movimientos | permiso de verdad, y **QUITA**: hoy sí puede |

Apagar los dos primeros habría dejado a la tesorera dentro de Tesorería sin
poder hacer nada. Eso no es quitarle un permiso: es otro rol —uno de solo
lectura— y se resuelve creando el rol, no apagando un interruptor. Se
quitaron de la lista con esa explicación en el pie.

Los dos que quedaron llevan además una **advertencia sobre hasta dónde llega
cada uno**, porque no llegan igual de lejos:

- **El del borrado es un control de verdad.** Esconder el botón no impide
  nada: el aparato puede escribir la fila igual. Quien lo impide es el
  disparador `frenar_borrado_tesorero` de Supabase, que deshace la baja y
  devuelve el movimiento vivo. Y **no lanza excepción a propósito** — una
  excepción tumbaría el lote entero y con él la sincronización de
  `transactions`, en un caso muy real: un movimiento borrado ANTES de que el
  permiso se apagara y aún sin subir. Que el movimiento reaparezca ES el
  aviso.
- **El del padrón NO es una barrera de datos, y no puede serlo.** Los miembros
  ya se sincronizan enteros a todos los aparatos de la iglesia, porque el
  tesorero los necesita en Aportantes. El permiso abre una PANTALLA. Hacerlo
  barrera real significaría no bajarle los miembros, y entonces Aportantes
  dejaría de funcionar. Está dicho así en el código y en el pie del ajuste.

Y una tercera decisión, la que hace que esto sea un permiso y no una
preferencia: **la verdad vive en Supabase**, en `iglesias`, y baja a los
aparatos como el plan. Las dos columnas locales de `churches` son un espejo
para que la interfaz sepa qué esconder sin señal, y `updateChurch` **no las
toca** — si un día se colaran en el formulario de la iglesia, el permiso se
quitaría desde Ajustes, sin conexión y sin ser administrador. El arnés (§44)
lo comprueba guardando la iglesia y mirando que los permisos no se muevan.

**Sin login no se enseñan.** Ahí el rol se elige en un desplegable de esa
misma zona, así que un permiso se quitaría cambiando el desplegable. Un
candado que cualquiera abre es peor que ningún candado.

> ⚠️ **Esto sube la apuesta de revisar este archivo antes de mandar a
> REVISIÓN del App Store.** Un control apagado con explicación es defendible
> ante la guideline 2.1; seis controles apagados en una pantalla de Ajustes,
> menos. (A 24 de agosto de 2026 queda **uno**: "Tamaño de texto".) Antes de enviar a revisión: o tienen motor, o se ocultan detrás de
> una bandera. A TestFlight no le afecta.
>
> El arnés tiene una guarda para esto (**sección 22**): comprueba que siguen
> **apagados y con explicación**. Si alguien le quita el `disabled` a uno sin
> ponerle motor, sale en rojo.
>
> **Actualizado el 24 ago 2026.** "Marcar depositado" salió de la lista —ya
> tiene motor— y en su sitio entraron los dos que trajo el handoff 3:
> **"Compartir"** y **"Reabrir el corte"**. La guarda cambió con ellos; si se
> hubiera dejado como estaba, habría seguido pidiendo que un botón cableado
> estuviera apagado. Es la tercera guarda de este arnés que envejece con el
> código en dos días, y las tres se arreglaron igual: comprobando la regla
> nueva, no borrando la comprobación.

## Qué es un "corte", decidido con Iván (24 ago 2026)

La palabra vino del handoff y durante dos días la usé sin que nadie dijera
qué significaba en ESTA iglesia. Iván preguntó, y de ahí salió la definición
que manda a partir de ahora:

> **Un corte es el dinero que sale de la caja en manos de alguien.** La
> tesorera cuenta lo que hay, se lo entrega a una persona, y esa persona va al
> banco. El corte cubre el hueco entre las dos cosas.

Ese hueco hoy **no se registra en absoluto**: un depósito aparece de la nada,
sin rastro de quién llevó el dinero. Es justo donde una tesorera necesita
estar protegida, y por eso esto no es adorno del diseño — es la pieza que
falta.

### La decisión: constancia, NO acuse

Se le pusieron dos opciones y eligió la primera:

| | Qué implica | Elegido |
|---|---|---|
| **Constancia** | La tesorera anota a quién se lo entregó. El que recibe no confirma nada. El corte se cierra al registrar el depósito. | **sí** |
| **Acuse** | El corte queda abierto hasta que el que recibió confirma que depositó. Dos personas respondiendo — la "doble firma" del handoff. | no |

**Y el responsable no es un rol fijo.** Palabras suyas: *"no necesariamente
tiene que ser el pastor, puede ser cualquier persona que esté asignada a ese
trabajo"*. O sea que "Responsable" es un nombre que se ELIGE, no el pastor ni
el tesorero por definición. La fuente natural es `usuarios` —ya existe con
`nombre` y `rol`, y `listUsuarios()` ya funciona— más texto libre para quien
no esté dada de alta: el mismo patrón que la cuenta bancaria del depósito.

**En IPDFV, quien deposita es el pastor** (confirmado por Iván el 24 ago,
después de preguntarlo en su iglesia). Eso NO cambia lo de arriba —el campo
sigue siendo elegible, porque la app es para muchas iglesias y en la suya el
encargado puede cambiar—, pero sí añade un detalle que conviene: **el campo
propone al último responsable**, como la cuenta bancaria propone la del último
depósito. Si casi siempre es la misma persona, teclearla cada domingo es
trabajo inventado; y si un domingo va otro, se cambia y esa pasa a ser la
propuesta.

### Qué cuesta, en concreto

No cambia el tamaño de la pieza 1 de la lista de abajo; la afina:

- tabla de **cortes** (fecha, nombre, cuenta, **responsable**, estado
  abierto/depositado, y el depósito que lo cerró);
- la tabla puente **corte↔movimientos**, que ya estaba apuntada como
  `deposito_movimientos`;
- el campo **responsable** eligiendo de `usuarios` o escribiendo.

Lo que la opción "acuse" habría añadido —y que sigue sin hacerse— es el estado
de confirmación por parte de quien RECIBE el dinero.

> ⚠️ **Y "Pedir doble firma" se encendió igual, el 24 de agosto por la tarde**,
> sin que esa decisión cambiara. Resulta que las dos cosas no eran la misma:
> el acuse lo daría quien recibe, y la segunda firma la da **la asistente de
> tesorería**, que vuelve a CONTAR el dinero antes de que salga. Está en el
> recuadro del final de este archivo.

### Lo que esto descarta

En la conversación llegué a decir que, si la iglesia deposita el mismo día sin
paso intermedio, la hoja "Nuevo corte" sobraba y lo barato era quitarla.
**No sobra.** Así trabajan, y es de lo más útil que le falta a la app.

## El control que salió de la lista cambiando de significado (24 ago 2026)

**"Pedir doble firma"** es el único de todo este archivo que no se encendió
llenando un hueco, sino **entendiendo mejor la pregunta**. Merece quedar
escrito porque el error estuvo en el diseño, no en el código.

Estuvo apagado dos veces por motivos distintos: primero por falta de columna, y
después un día entero por decisión —*constancia, no acuse*—. Lo que cambió no
fue la decisión: fue descubrir que se había contestado a otra pregunta. Al
describirlo con sus palabras, Iván no hablaba de que el que recibe el dinero
acuse recibo:

> *"La tesorera cuenta el dinero y verifica que todo esté bien, entonces tiene
> a una segunda persona que verifica y cuenta con el dinero y confirma que todo
> está bien, y esa persona es la segunda firma."*

Eso no es un acuse: es un **doble conteo**. Y no lo da quien recibe el dinero
sino la **asistente de tesorería** — *"la persona que cuando la tesorera falta,
esa persona toma el cargo por ese día"*. Son tres papeles distintos en la misma
hoja, y hasta entonces el diseño confundía dos:

| Papel | Quién | Qué hace |
|---|---|---|
| **Registra** | la tesorera | cuenta y arma el corte (`registrado_por`) |
| **Verifica** | la asistente | vuelve a contar y firma (migración 47) |
| **Recibe** | el pastor, u otro | se lleva el dinero al banco (`responsable`) |

De ahí salieron las decisiones que están en el código:

- **El total NO se enseña en la hoja de firmar.** Si se viera, contar dos veces
  sería copiar un número de la línea de arriba y el control se caería sin que
  nada fallara. Es la primera comprobación de la §42 del arnés, probada al
  revés enseñando el total.
- **Un descuadre no deja firmar, pero SÍ guarda la cifra.** Es la mitad que más
  se cae de estas implementaciones: si el descuadre borrara el número, contar
  dos veces no habría servido de nada.
- **`segunda_firma_modo` distingue "contó el dinero" de "revisó el registro".**
  Cuando la firma llega días después —desde Por revisar, con el dinero ya en el
  banco— solo cabe lo segundo, y el comprobante lo dice con esas palabras.
  Guardar los dos bajo la misma etiqueta convertiría el papel en algo que dice
  más de lo que sabe.
- **Quien firma no puede ser quien registró**, así que el domingo que la
  asistente sustituye a la tesorera, la app propone a la tesorera para que
  firme a la vuelta. Se resuelve solo, sin configurar nada.
- **No bloquea.** Un corte sin segunda firma se crea y se deposita igual; lo
  que hace es notarse — en el panel del corte, en Por revisar (que gana su
  octava regla) y en el comprobante.

Y su límite, dicho también en la propia hoja para que nadie lo descubra tarde:
es ciego al **teclear**, no a mirar. Quien arma el corte vio el total un
momento antes en su pantalla. Contra un error honesto —que es de lo que protege
contar dos veces— funciona; contra dos personas puestas de acuerdo, no. Ninguna
app lo hace, y fingir lo contrario sería peor que no tenerlo.

## Lo primero que se RETIRA en vez de cablearse (24 ago 2026)

**"Barra lateral siempre visible"**, de Configuración → Preferencias →
Presentación. Es la primera vez que un control del handoff sale de la app en
vez de recibir motor, así que conviene dejar escrito por qué — y que la
decisión fue de Iván.

La regla suya —construir aunque no se le vea función— existe para no descartar
por pereza. Aquí se examinó la función, y sale perdiendo:

- **No cabe.** Fijar la barra en vertical se come 318px. En un iPad de 11°
  quedan 516px de contenido y en el mini 426, por debajo de los **700** que el
  maestro-detalle necesita para partirse en lista + panel. O sea que
  cambiarías el panel de detalle por un menú. En el de 13" quedan 706: cabe
  por **seis píxeles**, que es no caber.
- **Va contra el sistema.** Notas, Archivos y Correo hacen exactamente lo que
  Tamio ya hace: barra fija en apaisado, cajón con ☰ en vertical. Y lo hacen
  por esta misma cuenta.

Palabras de Iván: *"En portrait, dejar fija la barra lateral quitaría mucho
espacio visualmente. Es mejor dejar la hamburguesa. Así lo hacen muchas
aplicaciones de Apple."*

Un control que empeora la app y contradice al sistema **no es una cáscara
esperando motor**. La distinción importa para las que quedan: lo que sigue en
la lista está ahí porque le falta dato, no porque sea mala idea.

### Y su hermano de sangre: ⌃⌘S se queda en el Mac (24 ago 2026)

Al medir el ☰ salió a la luz que el Mac **sí** tiene forma de plegar la barra:
el botón `.btn-sidebar` de la toolbar y el atajo ⌃⌘S, con la preferencia
guardada en `tamio-sidebar-oculta`. Se ofreció llevarlo al iPad y la respuesta
de Iván fue: *"No ponerle eso al iPad, eso es solo exclusivo de la Mac."*

Es la misma cuenta de arriba leída al revés. En el Mac la barra es una
**columna fija** y plegarla gana 220px de ancho útil; en el iPad, en vertical
ya es un cajón que el ☰ abre y cierra —plegar lo plegado— y en apaisado es la
única navegación que hay: esconderla sin un botón que la devuelva deja al
usuario encerrado.

**No hizo falta cambiar código: ya estaba bien.** Lo que se añadió es la
guarda, porque son **tres cerraduras independientes** y ninguna se ve desde
las otras — se puede quitar cualquiera en un refactor y no notarlo mirando
solo el Mac:

| Cerradura | Dónde | Qué la protege |
|---|---|---|
| El botón | `.btn-sidebar { display: none }` + `:root.mac .btn-sidebar` | `styles.css` |
| El atajo | `&& esMac()` en el `keydown` | `App.tsx` |
| El plegado | todas las reglas `[data-sidebar-oculta]` bajo `:root.mac` | `styles.css` |

La guarda (arnés §34) prueba las tres por separado, y la tercera la prueba
**forzando el atributo a mano**: aunque el atajo se colara, en el iPad la barra
se queda puesta. Quitando cada `:root.mac`/`esMac()` por turno, cada
comprobación falla sola.

> 📋 **El balance completo —qué se hizo desde el handoff y qué falta— está en
> [`docs/balance-handoff.md`](balance-handoff.md)**, escrito el 24 ago 2026 a
> petición de Iván. Este archivo sigue siendo el registro fino, cáscara por
> cáscara; aquél junta las tres entregas de diseño, las cinco migraciones de
> motor y lo que queda, ordenado por lo que cuesta.

## Lo que sigue sin pintarse

- ~~**`Folio 1042`**~~ → **hecho el 24 ago 2026** (migración 48). Con esto la
  lista de "lo que sigue sin pintarse" se queda vacía.
- ~~**"Registrado por"** y **el chip "Sin depositar"**~~ → **los dos cableados
  el 24 ago 2026** (migraciones 38 y 39).
- ~~**La sincronización de "Registrado por"**~~ → **cerrada el 24 ago 2026.**
  Las columnas se crearon en Supabase (`transactions` y `depositos_bancarios`)
  y entraron en `TX_DATA_COLS` y `DEP_DATA_COLS`, en ese orden — al revés,
  `sync.ts` habría intentado subir una columna que no existe y la
  sincronización entera habría fallado, no solo esa tabla.
- ~~**Los nombres de corte**~~ y su **cuenta asignada** → **llegaron con la
  tabla de cortes** el 24 ago 2026. Ya no son inventados: los escribe quien
  hace el corte.
- **La sincronización de los cortes: media hecha.** Las dos tablas **ya
  existen en Supabase** (creadas el 24 ago 2026, con RLS y sus cuatro
  políticas cada una, y con `deposito_uid` / `corte_uid` / `tx_uid` en vez de
  ids locales, que no significan nada fuera de su base). Y la base local ya
  lleva los metadatos que hacen falta para viajar: `uid`, `updated_at` y
  borrado en blando en `corte_movimientos` (migración 40), con el índice único
  vuelto **parcial** para que soltar un enganche devuelva ese dinero a la caja.
  Lo que falta es **el paso de `sincronizarTodo`**: una función que mapee ids
  locales ↔ uids en las dos direcciones, como ya hace `sincronizarRoster` con
  `servicio_uid` y `member_uid`. Hasta entonces, un corte vive en el aparato
  donde se hizo.

## Cuando toque cablear, el orden que rinde más

1. ~~**Tabla de cortes + `corte_movimientos` + `responsable`**~~ — **hecho el
   24 de agosto de 2026** (migración 38). Apagó ocho entradas de una vez. Lo
   que queda de esta lista empieza en el 2.
2. ~~**`transactions.usuario_id`**~~ — **hecho el 24 de agosto de 2026**
   (migración 39), aunque no como se había apuntado: no es un `usuario_id` que
   apunte a una tabla, son el **nombre y el rol como instantánea**, para que el
   registro siga diciendo quién fue aunque esa persona deje la iglesia. Con
   ella se apaga también el rastro de auditoría del handoff 1, que solo
   necesitaba esto más `updated_at` —que ya existía—. Lo que queda de la lista
   empieza en el 3.
3. ~~**`actas.testigo`**~~ — **hecho el 24 de agosto de 2026** (migración 41).
4. ~~**Tres columnas personales en `members`**~~ — **hecho el 24 de agosto de
   2026** (migración 42). Eran dos columnas, no tres: `direccion` ya estaba.
5. ~~**Roster por puestos y orden del culto**~~ — **hecho el 24 de agosto de
   2026** (migración 43: `servicio_puestos` + `servicio_orden`). Era la más
   grande de las cinco, y la lista se termina aquí. Dos avisos para quien
   venga detrás: el catálogo de puestos NO se hizo tabla (son los seis del
   diseño, viven en la constante `PUESTOS` de `db.ts`), y Predicación y
   Dirección se quedaron en sus columnas de siempre porque salen impresas en
   los informes desde la primera versión.
