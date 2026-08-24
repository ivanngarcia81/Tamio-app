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
- **"Dirección" en el expediente** — el prototipo la lista como campo del
  expediente; `members` no tiene columna de dirección. NO se pintó (un campo
  que jamás puede llenarse no es cáscara, es mentira permanente). Si se
  quiere, es una migración + campo en la ficha; entonces entra al expediente.
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
- **`Folio 1042` bajo cada movimiento** — el handoff lo pone; `transactions`
  no tiene columna `folio` (las cartas sí). **NO se pintó**, y no como cáscara
  sino porque un folio inventado se lee como un dato de contabilidad. Pide
  migración + numerador. **Pendiente de tu decisión.**

## Ingresos y Gastos (§15)

- ~~**"Registrado por · Rosa Elena Vega · tesorera"**~~ → **cableado el 24 ago
  2026** (migración 39). Lo pone la app con quien tiene la sesión abierta; no
  se teclea. Ver §37 de `docs/ipad-rediseno.md`.
- ~~**Chip "Sin depositar"**~~ → **cableado el 24 ago 2026** con los cortes
  (migración 38). Cuenta y filtra los ingresos en efectivo o cheque que no
  están en ningún corte.

## Aportantes / ficha de miembro (§16)

- **Nacimiento, dirección y estado civil** — `FichaMiembroIPad.tsx`,
  `filaSinMotor()`. **Construidos como plantilla**, en gris cursiva y con
  `title` que lo explica (`detalleMiembro.sinCapturarAyuda`). Falta migración
  de `members` con las tres columnas. Decisión tuya: *"déjalo construida la
  plantilla y después se le pone motor"*.
- **Pestaña "Familia"** — **construida vacía y con su explicación**. `members`
  no tiene relaciones ni columna de familia. Pide tabla de parentescos.

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
| **"Compartir"** | Depositados, cabecera del detalle | `btn secondary` apagado + `title` | una hoja de compartir; la app no tiene ninguna |
| ~~**"Reabrir el corte"**~~ | Depositados, menú de "⋯" | **cableado el 24 ago** — devuelve el corte a "entregado". Sigue apagado en un depósito sin corte, donde no hay nada que reabrir | — |
| ~~**"Registró"**~~ | Depositados, Datos del depósito | **cableado el 24 ago** (migración 39) — sale con quien tenía la sesión abierta. En un depósito anterior a esa migración la fila no se pinta, en vez de repetir que no se sabe | — |
| ~~**"Conciliación"**~~ | Depositados, columna derecha | **cableada el 24 ago** — compara lo contado contra lo registrado y canta la diferencia. Cuadrar no demuestra que el banco lo recibió, y el texto no lo dice | casar contra el banco, si algún día se importa el estado de cuenta |
| ~~**Hoja "Nuevo corte"** entera~~ | Pendientes | **cableada el 24 ago** — "Crear" guarda el corte y engancha sus movimientos | — |
| ~~**"Responsable"**~~ | dentro de esa hoja | **cableado el 24 ago** — se elige de `usuarios` o se escribe, y se propone el del corte anterior | — |
| **"Adjuntar foto de la ficha"** | dentro de esa hoja | sigue apagado, con una razón más precisa | **ninguna**: la ficha la da el banco, así que en el corte todavía no hay ninguna. Se adjunta un paso después, al registrar el depósito, donde el campo lleva funcionando desde siempre |
| **"Pedir doble firma"** | dentro de esa hoja | apagado por **decisión**, no por hueco | Iván eligió *constancia* (se anota a quién se le entregó) y no *acuse* (que el que recibe confirme). Si algún día quiere lo segundo, esto es lo que se enciende |

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

- **Renglón de firma "Testigo"** — `DetalleActa.tsx`, `da-firma--sinmotor`,
  raya discontinua y cargo en cursiva. **Construido como plantilla**, y se
  imprime igual para poder firmarlo a mano (`actas.testigoAyuda`). Falta
  **una columna**: `actas.testigo`, junto a `preside` y `secretario`.
- **"Recopilar firmas"** — **construido y DESHABILITADO**, con su `title`. No
  hay flujo de recolección de firmas. Cuando lo haya, se le quita el
  `disabled` y ya está en su sitio.
- **"Cerrar acta"** — real desde el primer día (`estado = 'aprobada'` +
  `fecha_aprobacion`).

## Servicios (§21)

- **Roster por puestos: cuatro de seis son plantilla.** Predicación y
  Dirección salen de `servicios.predica` y `.dirige`; Alabanza, Ujieres,
  Ofrenda y Sonido dicen **"Sin asignar"**. El mapeo vive en la constante
  `PUESTOS` con `campo: null`: cuando exista el roster, se cambia esa tabla y
  el resto de la tarjeta ni se entera. Pide estructura nueva (catálogo de
  puestos + asignación por servicio).
- **Tarjeta "Orden del culto"** — **construida como plantilla** con su
  explicación. `servicios` no guarda el minuto a minuto.
- **"Asignar encargado"** (el enlace azul del puesto vacío) — **NO se
  construyó.** Ver el recuadro del final.
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
- **"N movimientos" por categoría** — el conteo se puede calcular
  (`conteoCategoriaIngreso`/`Gasto` ya existen); no se pintó por no meter una
  consulta nueva en la pantalla de Ajustes. Es trabajo pequeño si lo quieres.
- **Asa de arrastre para reordenar categorías** — pide una columna de orden en
  la tabla de categorías. No se pintó.
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
| **Asignar encargado** ×4 | Servicios, puestos sin motor | botón apagado, uno por puesto |
| **Tamaño de texto** | Config → Preferencias → Presentación | segmentado apagado, "Normal" marcado |
| ~~**Barra lateral siempre visible**~~ | ídem | **RETIRADO el 24 ago** — no se cableó: se quitó. Ver abajo |
| ~~**Ocultar montos al bloquear**~~ | ídem | **cableado el 24 ago** — tapa el contenido en segundo plano (`src/privacidad.ts`) |
| **4 permisos del rol Tesorería** | Config → Acceso y áreas | cuatro interruptores apagados |
| **Avisar de gastos sin comprobante desde $X** | Config → Iglesia → Controles de tesorería | interruptor apagado, **encendido** |
| **Avisar de posibles duplicados** | ídem | interruptor apagado, **encendido** |
| **Doble firma en el corte** | ídem | interruptor apagado |
| **Cierre de mes** | ídem | fila de valor apagada ("Mes natural") |

Tres detalles de la ejecución que no son obvios:

- **"Asignar encargado" es un BOTÓN, no el enlace azul del handoff.** Un
  enlace deshabilitado no existe en ninguna interfaz —o lleva a un sitio o no
  es un enlace—, así que el hueco usa la misma pieza que todo lo demás.
- **Se apaga la FILA entera, no solo el mando** (`.ios-field--apagado`, media
  tinta). Un interruptor gris dentro de una fila normal se lee como "está
  roto"; la fila entera a media tinta se lee como "esto todavía no".
- **Los cuatro permisos enseñan el estado que YA se cumple** con el rol de
  tesorería (dos sí, dos no), no un estado inventado. Mientras espera motor,
  la fila dice algo verdadero.
- **Solo iPad.** Son del handoff de iPad; el teléfono no los pidió y no se le
  meten controles muertos.
- **Dos de los cuatro últimos van ENCENDIDOS**, y no por descuido. "Avisar de
  gastos sin comprobante" y "Avisar de posibles duplicados" describen algo que
  la app **ya hace**: `UMBRAL_COMPROBANTE` vale de verdad y Por revisar señala
  los gastos que lo pasan, y la regla `duplicado` de `alertas.ts` está viva.
  Apagarlos sería mentir en la otra dirección. Lo que no se puede es cambiar
  la cifra ni desactivar el aviso — y eso lo dice el pie del grupo. El importe
  sale de la constante interpolada, no de un `$1,000` copiado del prototipo:
  si el umbral cambia, la fila cambia con él.
- **"Cierre de mes" no es un interruptor**, es una fila de valor: la app
  cierra por **mes natural** (el porqué está en `services/inicio/periodo.ts`)
  y "último domingo" del prototipo no es un ajuste, es otra forma de contar.
  Se enseña lo que hace hoy.

Lo que hace falta detrás de cada uno: los dos primeros, la pieza de
`deposito_movimientos` y el roster por puestos (ya listados arriba). Los
cuatro de Configuración son **funciones nuevas**, no columnas: escalar el
tipo de letra, fijar la barra lateral en vertical, difuminar cifras al pasar
a segundo plano, y permisos por acción en vez de por rol.

> ⚠️ **Esto sube la apuesta de revisar este archivo antes de mandar a
> REVISIÓN del App Store.** Un control apagado con explicación es defendible
> ante la guideline 2.1; seis controles apagados en una pantalla de Ajustes,
> menos. Antes de enviar a revisión: o tienen motor, o se ocultan detrás de
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

Lo que la opción "acuse" habría añadido —y que NO se hace— es el estado de
confirmación por parte de quien recibe, y con él "Pedir doble firma", que
sigue apagado.

### Lo que esto descarta

En la conversación llegué a decir que, si la iglesia deposita el mismo día sin
paso intermedio, la hoja "Nuevo corte" sobraba y lo barato era quitarla.
**No sobra.** Así trabajan, y es de lo más útil que le falta a la app.

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

## Lo que sigue sin pintarse

- **`Folio 1042`** en Inicio y en el panel de Movimientos. No es un control:
  es un **dato de contabilidad**, y uno inventado se lee como verdadero. Pide
  columna y numerador.
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
3. **`actas.testigo`** — una columna, un renglón.
4. **Tres columnas personales en `members`** — nacimiento, dirección, estado
   civil.
5. **Roster por puestos y orden del culto** — la más grande de las cinco;
   estructura nueva, no columnas.
