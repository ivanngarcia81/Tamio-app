# Bitácora — 22 de agosto de 2026

El día del iPad **en vertical**, el de las hojas de alta —que llevaban un día
esperando en un párrafo del documento de ayer— y el que cerró **las seis
pantallas de maestro-detalle que faltaban**. Con eso, las diez que el handoff
maqueta partidas están las diez.

Iván lo abrió con dos frases, mirando su aparato:

> ya el diseño del iPad está incompleto, faltó la página de membresía. los
> diseños de portrait mode no salió hay que hacerlo

y, un rato después:

> la página de membresía en landscape mode no está hecha. Y todas las
> páginas de portrait mode con sus formularios están sin hacer

Las cuatro cosas eran ciertas. Tres tenían la misma causa.

---

## 1. Por dos píxeles

El rediseño de iPad entra a partir de **700px** (esa fue la corrección de
ayer, §4.1 de la bitácora del 21). Pero el bloque del cajón lateral —`@media
(min-width: 601px) and (max-width: 1023px)`, 143 reglas escritas mirando un
teléfono— seguía alcanzando a los **tres iPads que en vertical miden menos de
1024**: el mini (744), el 10.9" (820) y el 11" (834). Solo el Pro de 13"
(1024) se libraba, por dos píxeles de ancho.

O sea: el arreglo de ayer corrigió el umbral de ENTRADA y nadie miró qué
seguía entrando por la puerta de al lado. **Es el mismo error, a medio
arreglar.**

Medido a 1023 contra 1024, con la misma página y la misma clase:

| Qué | a 1023 | a 1024 |
|---|---|---|
| Filas del sidebar | 40px | 44px |
| `.dash-canvas` | sin fondo, sin radio, sin relleno | tarjeta de 14 |
| `.summary-4` | 2 columnas, cifra de 20px | 3–4 columnas, cifra de 24 |
| Tabla de Membresía | 3 columnas (sin Contacto ni Alta) | 5 columnas |
| Filas de Inicio | sin método, sin aportante, sin hora | completas |
| `.report-preview` | apilada, sin cabecera | entera |

Traducido: **un iPad de 11" en vertical corría la maqueta del iPhone
estirada.** Que es exactamente lo que Iván describió.

### Cómo se arregló sin volver a romper nada

La guarda es `:where(:root:not(.ipad-ancho))` delante de las 143 reglas, con
`.ipad-ancho` puesta desde `main.tsx` cuando el aparato es iPad Y mide 700px
o más.

Las dos decisiones que hacen que esto sea seguro:

- **`:where()` no suma especificidad.** Cada regla del bloque pesa
  exactamente lo que pesaba y su orden con el resto del archivo no se mueve;
  lo único que cambia es a quién alcanza. Prefijar 143 reglas de otra forma
  habría sido un cambio de riesgo alto sobre un archivo de 13.000 líneas.
- **`.ipad-ancho` lleva listener de `matchMedia`**, al revés que `.ipad`,
  `.iphone` y `.mac`, que se resuelven una vez y no vuelven a cambiar: este
  valor cambia al girar y al repartir la pantalla.

El Split View y el Slide Over **sí** siguen entrando al bloque, que es lo
correcto: ahí el ancho es compacto de verdad.

La red de seguridad se midió antes y después y no se mueve un píxel: Mac a
1440/1024/800, iPhone en las dos orientaciones, Split View ½ (507 y 678) y
Slide Over (320).

---

## 2. La tira de cifras

Tres reglas se repartían el reparto de `.summary-4/5/8` y **ninguna era del
iPad**: la base (`auto-fit, minmax(240px, 1fr)`), un `@media (max-width:
860px)` genérico y un `gridTemplateColumns` en el marcado de cinco páginas.
Girar el aparato costaba media pantalla de tarjetas antes de ver un dato:

| Pantalla | vertical | horizontal |
|---|---|---|
| Depósitos | 288px | 136px |
| Servicios | 228px | 106px |
| Agenda | 228px | 106px |
| Aportantes | 200px | 92px |
| Informes de membresía | 401px | 192px |

Con 150px de vía mínima entran en una fila en los ocho tamaños. Solo para
tarjetas que son **etiqueta y número**: las de Inicio llevan dentro barra de
proporción, desglose de dos columnas o pastilla de categoría con nombres
largos, y a 160px de ancho eso no se lee. La frontera se escribe sobre lo
que la tarjeta CONTIENE (`:not(:has(…))`) y no sobre en qué página vive, así
que una tarjeta nueva cae del lado correcto sola.

---

## 3. La barra se aplastaba (y esto no era de vertical)

`.main` es flex en columna y `.header` es uno de sus hijos. Poner
`min-height: 56px` en un hijo de un flex **sustituye al mínimo automático de
contenido**: en vez de garantizar 56, permitía que la caja bajara HASTA 56
con lo que hubiera dentro.

Inicio lo enseñaba a diario y nadie lo había medido: su cabecera no es un
título, es el saldo del mes —saludo, cifra de 40px y "Balance de agosto",
87px de bloque— dentro de una caja de 56. La cifra quedaba partida por la
línea de la barra y el subtítulo pintado encima del contenido. **En los ocho
tamaños y en las dos orientaciones.**

`flex: 0 0 auto` lo arregla y de paso devuelve lo que el comentario del
`min-height` decía querer: que la barra pueda CRECER cuando toca. Reportes en
vertical es el caso — sus acciones no caben en la misma línea que el título y
ahora la barra pasa a 101px en vez de recortarlas.

Con la barra sana, Inicio se pone en línea con el handoff: título "Inicio" y
subtítulo "Resumen de agosto 2026", como las otras quince pantallas. El saldo
no se pierde: vive en la tarjeta consolidada de abajo, que es donde el diseño
lo pone. Se van con él el saludo del encabezado (que solo salía en iPad), su
CSS y sus tres claves.

---

## 4. Membresía

La única pantalla del rediseño sin tocar. En el iPad salía la tabla de RATÓN
del Mac: filas de ratón, iconos que solo aparecen al pasar el puntero (en una
pantalla donde no hay puntero) y las cuatro tarjetas partidas en dos filas.

El handoff la maqueta como pantalla de **una columna** —solo ella e Inicio lo
son—: cuatro cifras arriba en una fila, un segmentado a la izquierda de su
barra de controles, y una tabla de tarjeta con cabecera en versalitas y filas
de 58px. Eso es lo que hay ahora.

Tres decisiones que conviene dejar escritas:

- **Los tres chips se pintan como el segmentado de iOS**, no como un
  `.ios-alcance` (ese es el del teléfono, de ancho completo bajo el buscador
  con su pulgar animado). Para poder hacerlo, las dos medidas que estaban en
  `style=` pasaron a clases **con los mismos valores**: un estilo en línea
  gana a cualquier hoja. En Mac no cambia un píxel — está medido.
- **Entra Ministerio** (`members.ministerios`), que el handoff pide y que
  existe de verdad. Cae por debajo de 1024, donde con seis vías los nombres
  se partían a la mitad; Asistencia se queda, porque es la columna que
  responde "¿este miembro sigue viniendo?".
- **Entra "Asistencia"**, la quinta columna — pero no como en el handoff.

### La quinta columna, y una regla que sale de ella

La primera versión de hoy dejó Asistencia fuera con este argumento: "es un
cálculo por periodo que vive en Informes de membresía, ponerlo aquí sería
inventar un dato". La mitad era cierta —el 96% que dibuja el handoff sí es
de adorno— y la conclusión no. Lo corrigió Iván en una frase:

> lo más correcto es poner que no hay suficiente información hasta que haya
> información que compilar

Es mejor regla que "quitar la columna", y no vale solo aquí: **una columna
sin datos TODAVÍA no es lo mismo que una columna que no corresponde.** La
primera se enseña vacía y diciendo por qué; la segunda no se enseña.

El dato existe: sale de `servicio_asistencia` con la misma función que usa
Informes de membresía (`asistenciaPorMiembro`), no con una cuenta paralela
que se desviaría al primer cambio. Y tiene tres estados:

| Situación | Qué se pinta |
|---|---|
| Ni un culto del año con lista tomada | "Sin listas", y **una** nota al pie que explica de dónde saldría el dato |
| Hay listas, pero este miembro no estuvo en ningún roster | "—", que aquí sí significa lo que parece |
| Hay dato | el porcentaje y, debajo, de cuántos cultos sale |

Ese "de cuántos" no es adorno: un 100% de un culto y un 100% de cuarenta no
son la misma noticia, y el porcentaje solo no los distingue. Es el mismo
problema de "no hay suficiente información", una fila más abajo.

Y la nota va **una vez**, debajo de la tabla, no repetida en cada celda: el
motivo es el mismo para todas las filas, y treinta veces "sin datos" no
informa treinta veces.

---

## 5. Las ocho hojas de alta

El documento de ayer dejó escrito el porqué y no lo cerró: *"las otras 148
[clases de iOS] siguen en `:root.iphone` y el iPad no las alcanza, porque sus
componentes siguen detrás de `esIPhone()`"*. De "Nuevo ingreso/gasto" en
adelante, **ninguna otra alta cruzó** — y el handoff maqueta Servicios,
Cartas, Agenda, Actas, Miembro, Depósito, Solicitud y los dos Traslados como
hojas de formulario.

Ocho puertas del mismo tamaño: `esIPhone()` → `esMovil()`. La edición de la
ficha de miembro no se toca (ahí la ficha completa es justo lo que se viene a
ver); el alta sí.

**Las reglas que faltaban no se movieron a ojo.** Se sacó la lista de clases
que monta de verdad cada hoja siguiendo sus imports, se cruzó con los 275
selectores `:root.iphone` del archivo, y salieron 24 reglas de 13 clases
exclusivas de las hojas. Las demás se quedan donde están: son de la
bienvenida, de Ayuda, del carrusel o de Ajustes del teléfono.

**Y se comprobó midiendo, no mirando**, que es el método a repetir: se abre
cada hoja a 820×1180 con clase de iPhone y con clase de iPad y se comparan
los estilos calculados de cada clase. Antes salían tres desajustes reales —el
contador de campos sin su pastilla, el total del culto sin tinte, los días de
la repetición sin su chip—. Ahora la única diferencia que queda es la que
debe quedar: 16px de radio en vez de 12, el tirador de arrastre apagado y las
esquinas del formSheet.

---

## 6. Lo que esto destapó

**Cartas y traslados no tenía NINGUNA forma de crear en un iPad.** Su menú de
alta (`.cartas-menu-crear`) se escondía bajo `:root.movil` porque en el
teléfono el "+" fijo ya lo cubre — pero el "+" fijo del iPad no existe desde
el rediseño de ayer. Ni botón de cabecera, ni flotante, ni acción en el
estado vacío: cero controles de alta visibles en toda la pantalla, en los
ocho tamaños.

**Las cabeceras de tabla salían a 17px y en versalitas**, porque
`.data-table .th` hereda `--fs-body` y en táctil son 17. En Informes de
membresía la fila de cabecera medía 74px y "Ministerio, cargo e instrumentos"
ocupaba tres renglones. Y no era consistente ni consigo misma: las columnas
ordenables son `<button class="th">` con `font: inherit` en línea, así que
heredaban los 10.5px del `.thead` — menos de la mitad — y sin versalitas.

**Esconder una celda de una rejilla no quita su vía.** Apagar Ministerio con
`display: none` por debajo de 1024 dejaba a la columna de acciones ocupando
la vía de 1.2fr y un hueco muerto de 104px al final de cada fila, en los
tres iPads chicos en vertical. Qué columnas se pintan pasa a decidirse en el
marcado, con `useMediaQuery`.

**El "···" de una tabla medía 25×28**, la medida de un ratón. Eso y el
esconder los iconos de puntero eran cosas que el bloque del cajón daba al
iPad chico **por accidente**; ahora se escriben donde les toca y valen para
los ocho tamaños y las dos orientaciones.

---

## 7. Cómo se verificó

El arnés de Playwright con las páginas reales y un stub de SQL que sirve las
migraciones de verdad (se extraen de `src-tauri/src/lib.rs` y se corren sobre
`node:sqlite`), así que las pantallas se miden con datos, no vacías.

Tres pasadas, todas automáticas:

1. **El corte 1023/1024.** La misma página a los dos anchos, comparando los
   estilos calculados de cada clase. Antes: 30 diferencias por página. Ahora:
   solo el píxel de ancho.
2. **Los ocho tamaños de iPad × trece pantallas.** Ninguna barra recorta su
   contenido, ninguna tabla desborda ni parte un nombre, ninguna fila de
   sidebar baja de 44.
3. **La red de seguridad**, antes y después: Mac a 1440/1024/800, iPhone en
   las dos orientaciones, Split View ½ (507 y 678) y Slide Over (320).
   Idéntica.

Más `tsc`, los `verificar-*` y un build completo comprobando que el bundle
lleva de verdad lo que dice llevar (`:root.ipad`, `md-split`,
`sidebar-buscar`, y ahora `ipad-ancho`).

---

## 8. Las seis que faltaban

Cerradas el mismo día, después de la quinta columna. El andamio de ayer
aguantó entero: `.md-split`, `.md-lista`, `.md-detalle`, el modo de empuje
con su animación, los dos umbrales (700 y 1150) y el patrón de "el detalle
es un ID que se re-busca". Ninguna de las seis lo tocó.

Lo que sí hizo falta fue descubrir que **la columna maestra tiene tres
formas**, no una:

| Forma | Pantallas | Por qué |
|---|---|---|
| Lista de registros | Ingresos, Aportantes, Bandeja, **Depósitos**, **Actas**, **Servicios** | Hay muchos y llegan más |
| Índice de destinos | **Reportes**, **Cartas**, Configuración | Son cinco o siete destinos FIJOS: una fila de lista miente, promete que hay muchos y que llegan más |
| Panel a la derecha | **Agenda** | Un calendario mensual no cabe en una columna de lista, así que la que se estrecha es la otra |

La tercera se monta sobre las MISMAS dos clases y solo invierte cuál es fija
y cuál flexible. Un andamio paralelo habría duplicado el modo de empuje, su
animación y el botón de volver.

Tres cosas que salieron de hacerlas:

- **Actas estrenó un panel que no es una ficha**: es el documento. Un acta se
  lee de arriba abajo, y sus mociones y acuerdos van en un `<ol>` de verdad
  porque el número es cómo se cita un acuerdo después.
- **Servicios pone la fecha en pastilla delante**: en una lista de cultos la
  fecha no es un dato más, es la identidad de la fila.
- **Cartas no tenía forma de volver.** Se entraba a una sección desde las
  tarjetas del resumen y no había manera de regresar ni de saltar a otra sin
  salir de la pantalla — no hay barra de pestañas en ningún lado. Con el
  índice siempre a la vista, las siete están a un toque.

Y lo de siempre, seis veces más: **decidir qué del handoff es estructura y
qué es contenido inventado.** Fuera se quedaron el desglose Efectivo/Cheques
y la lista de movimientos de un depósito (un depósito es una fila; no guarda
qué lo compone), el "Roster" por puestos y el "Orden del culto" de Servicios
(no hay catálogo de puestos ni horario minuto a minuto), los botones
"Recopilar firmas" y "Cerrar acta" y la firma de un "Testigo" que el modelo
no guarda, las entradas "Aportantes" y "Depósitos del periodo" del índice de
Reportes (son dos pantallas con su entrada en el sidebar: meterlas ahí
duplica la navegación) y la tercera columna de "Campos de la carta"
(`CartaEditor` ya los enseña; repetirlos al lado no añade, repite).

Cada exclusión queda escrita **en su propio componente**, no solo aquí, para
que no se "arregle" luego por error.

---

## 9. Lo que sigue pendiente

- **`CartaEditor` sigue en su forma de escritorio en el iPad**, a propósito:
  es un documento a página completa, no una hoja, y a 820px o más se lee bien
  en dos columnas. Si se quiere su versión de iOS, es su propia tarea.
- **Nada de esto se ha abierto todavía en un iPad de verdad.** Todo está
  medido en el arnés. Es lo mismo que pasó ayer con las 1.1.6 y 1.1.7, y la
  lección de aquel día sigue valiendo: estas cosas mueren en la Mac de Iván,
  que es donde deben morir.
