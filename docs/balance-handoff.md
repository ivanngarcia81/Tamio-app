# Del handoff a hoy: qué se hizo y qué falta por cablear

*24 de agosto de 2026. Rama `claude/charming-sagan-hknqp1`.*

Este archivo responde a dos preguntas de Iván: **qué se ha hecho desde el
handoff** y **qué queda por ponerle motor**. Es un balance, no un plan: lo que
está hecho está medido contra el repo, y lo que falta lleva al lado lo que
concretamente le falta, no una etiqueta.

Los otros dos archivos siguen siendo la fuente: `docs/ipad-rediseno.md` cuenta
**cómo** se hizo cada pantalla (§1–§38) y `docs/cascaras-1-2.md` es el registro
vivo de cáscaras. Aquí se juntan las dos vistas en una página.

---

## 1. De qué handoff hablamos

Fueron **tres entregas de diseño**, no una:

| | Qué traía | Estado |
|---|---|---|
| **Handoff 1** | Las 16 pantallas del iPad: maestro-detalle, cromo, hojas de formulario | construido |
| **Handoff 2** | Membresía, Informes de membresía, Mensajes, y la taxonomía de alertas de "Por revisar" | construido |
| **Handoff 3** | Depósitos entera: Pendientes como revisión previa al banco, Depositados con su detalle, y la hoja "Nuevo corte" | construido |

Y una regla que Iván puso al empezar el handoff 3, que explica la mitad de este
archivo:

> *"Si hay algún botón que no tiene función se crea para después darle motor al
> final del diseño. No te detengas porque no le veas función al botón."*

De ahí salen las **cáscaras**: controles dibujados y apagados, con su `title`
diciendo qué les falta. Nunca encendidos y mudos.

---

## 2. Lo que se hizo: el diseño (1.2.0 → 1.2.9)

Diez versiones a TestFlight. Resumidas por lo que cada una arregló:

| Versión | Qué trajo |
|---|---|
| **1.2.0** | El rediseño de iPad completo: las seis pantallas de maestro-detalle y Membresía |
| **1.2.1** | El iPad Pro de 12.9" en vertical pasa a dos columnas |
| **1.2.2** | La build de revisión del handoff 2: Membresía, Informes de membresía, Mensajes, y Cartas con crear solo en el "+" |
| **1.2.3** | El primer arreglo salido de probarla en un iPad de verdad: la barra lateral por **orientación** y no por ancho, y el gris único del cromo |
| **1.2.4** | El handoff 2 completo con Agenda y Configuración: las once pantallas recorridas |
| **1.2.5** | El panel de detalle pasa al gris del lienzo y deja de fundirse con la barra; y se pintan los **diez controles apagados** del handoff |
| **1.2.6** | El cromo terminado: las cinco superficies que pedían cromo con el token equivocado, con guarda sobre el archivo |
| **1.2.7** | La tanda salida de probar la 1.2.6 en el iPad de verdad |
| **1.2.8** | Editar un miembro va a la hoja de iOS, no al modal viejo; y la raya de la barra deja de ir pegada a los botones (16 pantallas de golpe) |
| **1.2.9** | Depósitos rehecha con el handoff 3, y los dos textos que no respiraban |

**La 1.2.8.1 que se pidió no puede existir**, y quedó documentado en
`docs/testflight.md`: no es semver válido (cargo lo rechaza) y Tauri
**sobrescribe** `CFBundleVersion` desde `tauri.conf.json` en cada `ios build`,
así que "misma versión, build nuevo" tampoco está disponible. Salió la 1.2.9.

---

## 3. Lo que se hizo DESPUÉS del diseño: el motor (24 ago)

Aquí empieza lo que Iván pidió al terminar el handoff 3: *"dale motor a lo que
se construyó"*. Cinco migraciones en un día.

### Migración 38 — la tabla de cortes

La más grande. **Apagó ocho cáscaras de una vez.** Antes hubo que decidir con
Iván qué es un *corte*, porque no estaba escrito en ningún sitio:

> El dinero contado que la tesorera **entrega a alguien** —en su iglesia, el
> pastor— para que lo lleve al banco. No es el depósito: es el paso de antes.

De ahí salieron `cortes` y `corte_movimientos`, y con ellas: la hoja "Nuevo
corte" entera, el responsable, "Marcar depositado", "Reabrir el corte", el
desglose real, los movimientos del corte, la conciliación y el chip "Sin
depositar" de Ingresos.

Una decisión suya que quedó escrita: eligió **constancia** (se anota a quién se
le entregó) y no **acuse** (que el que recibe confirme). Por eso "Pedir doble
firma" sigue apagada — por decisión, no por hueco.

### Migración 39 — "Registrado por"

Quién tecleó cada cifra. **No es un `usuario_id`** que apunte a una tabla: son
el **nombre y el rol como instantánea**, para que el registro siga diciendo
quién fue aunque esa persona deje la iglesia. Es el concepto que Iván describió:

> *"El administrador invita a la persona que va a ser la tesorera… El
> administrador es el supervisor mayor que, si un día entra porque la tesorera
> estuvo enferma, pues el nombre queda como registrado por."*

Con ella se apagó también el rastro de auditoría del handoff 1.

### Migración 40 — los cortes, listos para viajar

`uid`, `updated_at` y borrado en blando en `corte_movimientos`, con el índice
único vuelto **parcial** para que soltar un enganche devuelva ese dinero a la
caja. Las dos tablas se crearon también **en Supabase**, con RLS y sus cuatro
políticas cada una.

### Migración 41 — el testigo del acta

El renglón de firma que se imprimía en blanco porque `actas` solo conocía a
quien preside y a quien redacta. La raya discontinua se queda cuando no hay
nombre, pero ya no significa "sin motor" sino "todavía nadie ha firmado aquí".

### Migración 42 — nacimiento, dirección y estado civil

Las tres filas grises de la ficha del miembro. **Eran dos columnas, no tres**:
`direccion` existía desde la migración 1 y hasta viajaba en la sincronización,
pero nunca tuvo campo en un formulario, así que se podía leer y jamás escribir.

### Y dos cosas que no fueron migración

- **"Ocultar montos al bloquear"** — cableado (`src/privacidad.ts`): tapa las
  cifras cuando la app pasa a segundo plano.
- **"Barra lateral siempre visible"** — **RETIRADO**, el primero que sale de la
  app en vez de recibir motor, por decisión de Iván. Fijar la barra en vertical
  se come 318px y deja el maestro-detalle por debajo de los 700 que necesita
  para partirse. Y **⌃⌘S se queda solo en el Mac**, con guarda para que no se
  cuele al iPad.

---

## 4. Lo que TODAVÍA necesita motor

> **Puesta al día del 24 de agosto de 2026, por la tarde.** Esta sección se
> escribió por la mañana con doce entradas. Quedan **cuatro**, y ninguna de
> las cuatro es "falta escribirlo": tres esperan a otra cosa (una decisión
> tuya, el login de Supabase, un refactor de tipografía) y la cuarta es una
> pantalla que el diseño no pidió. Lo hecho en la tanda va en la §3 bis.

### Lo que queda, y a qué espera cada uno

| Qué | Dónde | A qué espera |
|---|---|---|
| ~~**`Folio 1042`**~~ | Inicio y panel de Movimientos | **hecho el 24 ago 2026** (migración 48): `2026-0042`, sin numerar el pasado. Decisión de Iván |
| **4 permisos del rol Tesorería** | Config → Acceso y áreas | **Al login de verdad.** Hoy el rol se elige en un desplegable de Ajustes que cualquiera puede cambiar, así que un permiso por acción no sería un control: sería un interruptor que aparenta proteger algo. Va con Supabase (§5), no antes. Mientras tanto las cuatro filas siguen enseñando el estado que YA se cumple con el rol |
| **Tamaño de texto** | Config → Preferencias | **A que las pantallas del iPad usen los tokens `--fs-*`.** Hoy llevan px literales; encenderlo escalaría la mitad de la app y la otra mitad no, que se ve peor que no tenerlo |
| **Asa de arrastre para reordenar categorías** | Config → Categorías | **A que la pantalla sea la lista del diseño.** En el iPad las categorías son pastillas que fluyen en varias líneas, y ahí "arriba/abajo" no significa nada. Pide una columna de orden Y rehacer la pantalla; el conteo, que era la otra mitad de esa fila, ya está |
| **Mensajería dirigida** | Mensajes | A columna de destinatario. El aviso "lo ven las tres áreas" **dice la verdad** mientras tanto |
| ~~**La sincronización, entera**~~ | invisible, pero real | **hecha el 24 ago 2026.** Primero los cortes; después `actas.firmas`, `servicio_puestos`, `servicio_orden` y `parentescos`. Las dieciséis tablas viajan, y `npm run verificar-sync` comprueba la paridad de columnas de todas contra el esquema local Y contra los scripts del repo |

## 3 bis. La segunda tanda de motor (24 ago, tarde)

Seis piezas más, cuatro migraciones. Con ellas **no queda ni un solo control
dibujado y apagado por falta de columna**: los que siguen apagados lo están
por decisión (ver más abajo) o esperando el login.

### Migración 43 — el roster por puestos y el orden del culto

Los dos huecos grandes que quedaban del handoff, y son el mismo visto de dos
maneras: QUIÉN hace cada cosa en el culto y CUÁNDO. Se encendieron los cuatro
**"Asignar encargado"** y la tarjeta **"Orden del culto"** dejó de ser un
cartel explicando lo que faltaba.

Tres decisiones que quedaron escritas: Predicación y Dirección **no se
movieron** de sus columnas (salen impresas en los informes desde la primera
versión); el catálogo de puestos **no es una tabla** (son los seis del diseño,
viven en una constante); y el orden del culto lo manda `posicion` y **no la
hora**, porque un culto tiene pasos que van "cuando toque" y ordenarlos por
una hora vacía los mandaría todos al principio.

### "Compartir" un depósito — y un diagnóstico que estaba mal

El botón llevaba dos días apagado diciendo que la app no tenía hoja de
compartir. **La tenía desde siempre**: `entregarArchivo` usa la Web Share API
en el iPad y el diálogo de guardar en el Mac, y por ahí salen todos los
reportes. Lo que faltaba era el **documento**. Con `printDeposito.ts` el botón
se encendió sin una dependencia nueva.

El comprobante lleva el desglose y los movimientos **del corte**, y firma a
quien registró y a quien llevó el dinero al banco. Si el depósito se registró
sin corte, el PDF **lo dice** en vez de imprimir un cero; y si lo contado no
cuadra con lo registrado, la diferencia va escrita — la copia que se archiva
es el peor sitio para esconderla.

### Migración 44 — "Recopilar firmas"

El acta sabía QUIÉNES firman y no si habían firmado. Recoge una **constancia,
no una firma digital** (la misma elección que en los cortes: un acta se firma
con bolígrafo delante de la mesa). Es JSON y no tres columnas de fecha porque
las cartas ya resolvían esto igual, y el nombre no entra en el JSON: sigue en
`preside`, `secretario` y `testigo`, para que no haya dos copias que se
separen a la primera corrección.

### Migración 45 — los dos avisos de tesorería, ajustables

Eran las dos filas raras del grupo: iban encendidas Y apagadas como mando,
porque describían algo que la app ya hacía y no se podía cambiar. Ahora se
encienden, se apagan y el umbral se escribe.

Son **tres columnas y no dos**, y la de más evita una mentira: sin
`avisar_sin_comprobante`, apagar el aviso habría que representarlo con un
umbral imposible. Y `umbral_comprobante` en NULL significa "el de la
constante", no cero: quien nunca tocó el ajuste sigue con el comportamiento de
siempre.

### Migración 46 — la pestaña Familia

**Una fila por relación, no dos**: la ficha del otro la lee al revés con el
inverso. Guardar las dos direcciones habría duplicado cada escritura y con
ella la posibilidad de que se separen. El catálogo es **neutro** —"Padre o
madre", "Hijo o hija"— porque `members` no guarda sexo, y de regalo cada
inverso queda único.

### Y el conteo por categoría

La entrada más pequeña de la lista de la mañana ("nada nuevo, es pintarlo").
Una sola consulta agrupada, con la misma clave que guarda
`transactions.categoria`.

### Cómo quedó el arnés

De **799 comprobaciones a 843** (contadas, no estimadas: los números que
fueron apareciendo en los mensajes de commit de esta tanda se escribieron
sumando de cabeza y no todos cuadran; el bueno es el que imprime el arnés). Seis guardas cambiaron de sentido —las que
exigían que un botón estuviera apagado ahora exigen lo contrario— y entraron
seis secciones nuevas (36 a 41). Las seis se probaron **volviendo a meter el
fallo**: sin escribir el puesto, ordenando el culto por hora, sin el `onClick`
de Compartir, sin guardar la firma, ignorando la bandera de duplicados, sin
invertir el parentesco y con la clave de categoría equivocada. Las siete
salieron en rojo, que es lo único que demuestra que una guarda sirve.

### Lo que está apagado por DECISIÓN, no por hueco

Estos no son deuda. Están así porque se decidió que estén así:

- ~~**"Pedir doble firma"** en el corte~~ → **cableado el 24 ago por la tarde**
  (migración 47). No se encendió el acuse: se descubrió que la segunda firma
  era otra cosa —un doble conteo, y lo da la asistente de tesorería—. El
  porqué está en `docs/cascaras-1-2.md`.
- **"Adjuntar foto de la ficha"** en el corte — la ficha la da el banco, así que
  en el corte todavía no existe. Se adjunta un paso después, al registrar el
  depósito, donde el campo lleva funcionando desde siempre.
- **"Barra lateral siempre visible"** — retirada.
- **Chip "Todas las categorías"** en Reportes — filtrar por categoría cambiaría
  lo que dice el PDF y el estado financiero dejaría de cuadrar contra el saldo.
- **Dirección en el EXPEDIENTE** — ya tiene columna y se pinta entre los datos,
  pero no entra en `camposFaltantes`: esa función marca lo **obligatorio**, y
  meterla ahí habría puesto el padrón entero en rojo de un día para otro.

---

## 5. Lo que viene después del motor

El orden lo puso Iván: **motor primero, después Supabase, después el cobro.**

1. **Motor** — lo de la sección 4. Va por la mitad larga.
2. **Supabase** — el backend y las credenciales de login. La 1.0 que está en el
   App Store es gratis, sin login y solo local; se hizo así para pasar la
   revisión de Apple. Esta versión activa el backend.
   - Queda abierta una pregunta que hay que contestar antes de mandarla: si la
     cuenta va a ser **obligatoria u opcional** (directriz 5.1.1(v) de Apple).
   - `docs/checklist-app-store.md` todavía describe el modelo de la 1.0 y hay
     que reescribirlo.
   - Hay datos de prueba (3 iglesias, 6 perfiles, 58 movimientos) en el
     proyecto de Supabase de producción.
   - La protección contra contraseñas filtradas está **apagada** en Supabase
     Auth. Es decisión de Iván encenderla.
3. **El cobro** — In-App Purchase / StoreKit. **No hay una línea de código
   todavía.** `urlCompra` se anula a la fuerza en los builds de App Store por
   la regla 3.1.1 de Apple.

---

## 6. Cómo se sabe que lo hecho sigue en pie

El arnés de Playwright (`pruebas/arnes-ipad.mjs`) corre **799 comprobaciones**
sobre el iPad, con las migraciones reales parseadas de `lib.rs`. Cada cosa que
se cablea entra ahí con una guarda, y **cada guarda se prueba volviendo a meter
el fallo** para ver que falla de verdad: una guarda que nunca ha fallado no ha
demostrado nada.

Se corre así:

```
pkill -f 'vite --port 142[0]'
CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node pruebas/arnes-ipad.mjs
```

Más `npx tsc --noEmit`, `npm run verificar-traducciones` (2654 claves en cada
idioma) y `npm run build:appstore`.
