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

---

## 10. La versión, dos veces

El rediseño salió a TestFlight como **1.1.9**, que era el número que tocaba
en la cuenta. Después Iván pidió que la versión con la que se prueba el iPad
sea la **1.2.0** — y tiene razón: diez pantallas rehechas, Membresía nueva y
el modo vertical entero no son un parche. Así que la 1.2.0 es el mismo build
con el nombre que le corresponde. En App Store Connect son dos subidas
distintas, y el bump hace falta aunque el diff sea de una línea.

Eso era verdad hasta que se descubrió que había una segunda rama (§11): la
1.2.0 que acabó saliendo no es la 1.1.9 renombrada, sino la fusión de las
dos. Se comprobó con el mismo truco del hash, pero al revés — el CSS pasó de
`index-CWJz2wN4.css` a `index-Cb9x1AEA.css` y de 273 kB a 279, y lleva
`ipad-ancho` (que solo estaba en una rama) junto a `dash-kpi` (que solo
estaba en la otra).

### Y el `Cargo.lock` volvió a intentarlo

`docs/testflight.md` avisa desde la 1.1.5 de que en el lockfile no vale
buscar y reemplazar, porque el número de Tamio no es el único que aparece.
Hoy `version = "1.1.9"` salía **dos veces**: la de `tesoreria` y la del crate
**`flate2`**, que ese día iba justo en la 1.1.9. Un reemplazo global habría
dejado escrito que `flate2` es la 1.2.0, que no existe. Van dos de cuatro
bumps con colisión: no es rara, es lo normal en un árbol de 400
dependencias, y por eso la regla es anclar en `name = "tesoreria"` y no
mirar el resto.

### El plan de la 1.2 corrió un puesto

El número estaba apalabrado desde el 4 de agosto para los siete puntos que la
1.1 apartó. Se lo llevó el rediseño, que no estaba en ninguna lista, así que
esos siete se mudaron a **`docs/plan-1-3.md`** — que es la mudanza que aquel
plan ya decía que había que hacer en cuanto la 1.1 cerrara, solo que a otro
archivo. En `docs/plan-1-1.md` queda el título de cada punto y un puntero: el
razonamiento vive en un solo sitio, que es como no acaba en dos versiones
que se contradicen.

Al mudarlos apareció algo que conviene mirar antes de darlos por pendientes:
**dos de las ideas de "Proyecto B" ya están medio hechas** por el rediseño de
estos dos días. Ajustes con índice sale en dos columnas en el iPad desde los
761 px, y el detalle en panel lateral en vez de modal es exactamente lo que
son ahora las siete pantallas de maestro-detalle. Lo que queda de las dos es
Mac y teléfono. Está anotado arriba del plan nuevo.

---

## 11. La otra rama del mismo día

Todo lo de arriba se hizo en `claude/charming-sagan-hknqp1`. **En paralelo, y
sin que ninguna de las dos lo supiera, otra sesión hizo el mismo trabajo en
`claude/design-review-execution-can5gv`** — las seis pantallas, las ocho
hojas de formulario— y además tres cosas que aquella rama sí tiene y esta no
tenía: el arnés committeado, la repasada del Inicio y la de Configuración.

Las dos ramas llegaron, por separado, a la MISMA arquitectura: `useMediaQuery`
con los umbrales de 700 y 1150, el booleano `partido`, el andamiaje `.md-*`, y
hasta los mismos anchos de columna maestra (378/358/338/330) y la misma Agenda
invertida con el panel del día de 318px a la derecha. Que dos caminos
independientes desemboquen en los mismos números dice que los números salían
del diseño, no del gusto de quien los escribió.

Se fusionaron el 22 de agosto para sacar la 1.2.0. Lo que se eligió de cada
lado está en el mensaje de la fusión; el criterio fue: mis páginas (llevan el
modo vertical cableado), su Inicio (es un superconjunto del mío). Lo que
sigue es su bitácora de aquel día, tal cual la escribió.

---

El día en que el rediseño de iPad se terminó: las seis pantallas de
maestro-detalle que quedaban del handoff `Diseño nativo para iPad`, más el
arnés que las verifica, ahora committeado en vez de reconstruido por sesión.

**Las diez pantallas del handoff están hechas.** El detalle de cada decisión
—qué va en la fila, qué en el panel, y qué del handoff no existe en la app y
se descartó— quedó en `docs/ipad-rediseno.md` §10, que es el documento vivo
del rediseño; aquí solo el resumen del día.

---

### 11.1 Las seis pantallas

| Pantalla | Columna | Panel |
|---|---|---|
| Depósito bancario | 378px, agrupada por PERÍODO | `DetalleDeposito` — la anatomía de `DetalleMovimiento` |
| Actas | 358px, por año | `DetalleActa` — el acta como documento serif, las secciones del PDF |
| Registro de servicios | 358px, por mes, con bloque de fecha | `DetalleServicio` — la ficha del culto en el orden del formulario |
| Cartas y traslados | 338px, por mes de emisión | `DetalleCarta` — el MISMO HTML de imprimir, en iframe a escala |
| Reportes | 330px, los informes que existen | el informe elegido; el anual ganó vista en pantalla |
| Agenda y calendario | calendario flexible + columna del DÍA de 318px | los papeles invertidos, como la app de Calendario |

Tres cosas que valen la pena recordar:

- **La hoja carta se escala, no se re-maqueta.** El panel de Cartas mide
  menos que 8.5in; la primera versión recortaba el documento por la derecha
  (se vio en la captura, no en el código). El iframe ahora se pinta a tamaño
  real (816×1056) y se escala al ancho del marco con un ResizeObserver —
  reducir la hoja, nunca reacomodarla, que para eso es el documento que va a
  salir en papel.
- **Depósitos agrupa por período, no por fecha.** Es como agrupan los
  totales y los reportes: un depósito de julio pagado el 2 de agosto sale
  bajo "Julio 2026", donde suma. La fila del diseño ("Corte del domingo 23 ·
  14 movimientos") presuponía vínculos con `transactions` que no existen.
- **En la Agenda el detalle es un DÍA, no una fila.** `cursor` ya era estado
  de pantalla, así que la regla de "la selección sobrevive al giro" salió
  gratis. Tocar un día en el iPad lo elige (antes creaba una actividad);
  crear quedó a un toque, en el "+" de la propia columna del día.

### 11.2 El arnés dejó de ser desechable

Hasta hoy "el arnés de Playwright con el stub de SQL" se reconstruía en cada
sesión y moría con ella. Ahora es `pruebas/arnes-ipad.mjs`: la app real con
`vite dev`, `invoke("db_select"/"db_execute")` sustituido por sql.js
corriendo las migraciones REALES extraídas de `src-tauri/src/lib.rs` (36
aplicadas), datos sembrados con las funciones reales de `db.ts`, y 189
comprobaciones:

- Los **ocho iPads** a pantalla completa: columnas de la medida del diseño a
  partir de 1150 (378/358/358/338/330 y el día de 318 en Agenda), lista a lo
  ancho y detalle que EMPUJA por debajo, botón de volver visible, y en la
  Agenda el día que se abre al tocar la celda.
- La **red de seguridad**: Mac a 1440/1024/800, iPhone en las dos
  orientaciones y el Split View de ½ (507/678) y el Slide Over (320) — ni un
  `.md-split` en ninguna de las seis pantallas.

Todo en verde, más `tsc`, los doce `verificar-*` y el build completo (con la
comprobación de que el bundle construido lleva las clases nuevas de verdad —
la lección de la 1.1.6).

### 11.3 La repasada que pidió Iván

Segunda pasada del día, sobre Inicio, Ingresos, Gastos, Aportantes y
Reportes, "por si no se aplicó bien el diseño". Ingresos, Gastos, Aportantes
y Reportes estaban fieles (columna, filas, detalle y pie como el handoff, con
las desviaciones ya documentadas); lo que la repasada cazó:

- **Inicio era la pantalla menos aplicada** — seguía siendo el dashboard del
  Mac con el saludo y el saldo de 34px metidos en la barra (una barra de
  ~110px en una cáscara que promete 56). Ahora es el del diseño: barra de
  56px con el balance del mes de subtítulo, saludo como h1 en el contenido
  con "el corte de mes cierra en N días", los cuatro KPI (el cuarto es la
  bandeja, con su conteo real y "Abrir bandeja →"), y "Últimos movimientos ·
  Esta semana" a dos columnas — la semana sale de `expandirTodas`, las
  mismas ocurrencias de la Agenda. El Mes/Trimestre/Año del handoff no
  existe como concepto y no se inventó.
- **Faltaba "Ver ficha"** en el detalle de un ingreso (el salto del diseño a
  la ficha del aportante). El dato existía (`member_id`); ahora
  `DetalleMovimiento` lo pinta y navega a Aportantes con el miembro abierto,
  por el mismo puente de `location.state` de Agenda→Servicios.
- **La fila de Aportantes** decía el correo (o "Sin correo registrado" en
  cadena); el diseño dice "Miembro desde 2014 · diezma", y los dos datos son
  reales (`fecha_ingreso`, etiquetas). Ahora dice eso, con el correo de
  repuesto.

Verificado igual que lo demás: arnés completo en verde (189 comprobaciones),
capturas del Inicio nuevo a 1366 y 834, y el salto de "Ver ficha" probado de
punta a punta en el navegador.

### 11.4 La tercera pasada: Configuración

También pedida por Iván. A 1366 y 834 el bloque del día 21 aplica el handoff
tal cual (medido con estilos computados: índice de 298, filas de 40, tinte
al 10%, columna de 680, héroe en rejilla). Lo que cazó fue en el rango
APILADO del mini a 744, y uno de los dos ni siquiera era de Ajustes:

- Las filas del índice apilado salían en `--text-2` — siete filas que
  parecían deshabilitadas. Tinta entera ahora.
- **El cajón cerrado pintaba su sombra**: con `translateX(-100%)` el borde
  derecho queda en x=0 y `box-shadow: 12px 0 40px` proyecta una franja gris
  dentro de la pantalla, en toda página del rango. Estaba en los dos bloques
  de cajón (el del iPad y el viejo de 601–1023 sin plataforma — o sea que
  también manchaba el Mac angosto y el iPhone apaisado). En ambos, la sombra
  ahora solo existe con el cajón abierto. La franja llevaba ahí desde que
  existe el cajón; la cazó una captura, no el código.

### 11.5 La cuarta pasada: los formularios

Iván preguntó si TODAS las páginas tenían ya el handoff, "incluyendo sus
formularios". La respuesta honesta era no: el 21 solo la hoja de "Nuevo
ingreso/gasto" había cruzado al iPad; los otros ocho formularios con hoja
de iOS (acta, culto, actividad, depósito, solicitud, los dos traslados y el
alta de miembro) seguían detrás de `esIPhone()` y en el iPad salían como el
modal de escritorio — justo lo que el diseño reemplaza con su hoja centrada
de ~600.

El arreglo fue barato porque el cascarón ya estaba: cambiar el gancho de
cada modal a `esMovil()` y mover las ~25 reglas de CSS que sus filas
montan y seguían solo bajo `:root.iphone` (extraídas leyendo los
componentes, como el 21). Las subpantallas —"Tomar asistencia", el
buscador de nombres, horario/mociones/acuerdos— ya eran `.ios-sheet`, así
que en iPad se apilan solas como segunda hoja de 600.

De paso cayó un hallazgo que no era de formularios: **el iPad grande no
tenía NINGUNA forma de crear en Cartas** (desde 700 el "+" fijo se apaga y
el menú de crear de la cabecera estaba oculto para todo `movil`), ni
entrada alguna a la pestaña de Solicitudes. El menú de crear ahora vuelve
en iPad desde 700, como los botones de cabecera.

El editor de Cartas se queda como página de escritorio en iPad (meterlo en
una hoja de 600 es un rediseño del editor, anotado); las hojas de
Configuración del diseño (categoría, invitar) siguen como modales.

Verificado con el arnés, que creció para quedarse: las ocho hojas a 1366
(600 de ancho, centrada, radio 16, grupos con fondo, subpáginas apiladas,
padrón a 44) y en la red de seguridad que el Mac conserva su modal y el
iPhone su hoja a lo ancho — 227 comprobaciones en verde (eran 189), más
tsc, los doce `verificar-*` y el build con las clases movidas en el bundle.

### 11.6 El resumen de la sesión, de principio a fin

Toda la jornada fue UNA conversación con Claude, en seis commits sobre la
rama `claude/design-review-execution-can5gv`. Lo que se pidió y lo que pasó,
en orden:

1. **"Revisa el repo y ejecuta el diseño por completo"** (con el bundle del
   handoff de Claude Design adjunto). El repo decía 4 de 10 pantallas
   hechas del día 21; se ejecutaron las seis restantes (§1) y el arnés de
   verificación entró al repo (§2). Commits `30a76a7` y `dcf6a81`.
2. **"Revisa Ingresos, Gastos, Inicio, Aportantes y Reportes por si no se
   aplicó bien."** Cuatro estaban fieles; el Inicio era la pantalla menos
   aplicada y se rehízo, más "Ver ficha" y la fila de Aportantes (§3).
   Commit `01261cc`.
3. **"Revisa también Ajustes."** Fiel a 1366/834; dos arreglos en el rango
   apilado del mini, uno de ellos la sombra del cajón cerrado que manchaba
   toda la app (§4). Commit `db7efc9`.
4. **"¿Ya todas las páginas tienen el handoff, incluyendo sus
   formularios?"** La respuesta honesta era no — y de ahí salió la cuarta
   pasada entera (§5). Commit `1cf05fc`.
5. **"Mándame la versión para TestFlight."** Desde el contenedor no se
   puede compilar iOS (eso pide Mac, Xcode y la firma); lo que sí: la
   **1.1.9** preparada según `docs/testflight.md` — bump en las tres
   fuentes y el lock, las cinco verificaciones, build del canal `appstore`
   con las dos guardas de Apple y el bundle comprobado. Commit `97eec6b`.
6. **"Salió la 1.1.8 al compilar."** No era la compilación: la Mac estaba
   en `main`, que se quedó en el día 21 — todo lo de hoy vive en la rama.
   La moraleja para la próxima: **antes de compilar, confirmar la rama y
   que `grep '"version"' package.json` diga el número que se espera** (esa
   comprobación ya casi se escapa dos veces; el `grep` la caza en un
   segundo). El estorbo real del cambio de rama fue un `package-lock.json`
   tocado por `npm install`, que se descarta con
   `git checkout -- package-lock.json`. Resuelto eso, **la 1.1.9 subió a
   TestFlight ese mismo día** — la primera versión con el rediseño del
   iPad que llegó de verdad a los probadores (las 1.1.6, 1.1.7 y 1.1.8
   murieron antes de archivar).

### 11.7 Lo que quedó anotado, no hecho

- **Probar en el aparato.** El arnés es Chromium; el patrón ya se sabe (el
  umbral de 1024, el AccentColor): lo que WKWebView decida distinto solo se
  ve en un iPad real. En particular el material translúcido y el iframe
  escalado de Cartas.
- **Face ID / Touch ID** y el plan de **Plaid**, como ayer.
- **Capturas del App Store** del iPad: siguen enseñando el diseño viejo.
- **Publicar.** La 1.1.9 está en TestFlight para PROBAR, no para salir: el
  rediseño sigue en trabajo y lo que digan los iPads reales entra en las
  siguientes versiones. Ninguna versión de este repo se ha enviado todavía a
  revisión del App Store — ver "TestFlight no es publicar" en
  `docs/testflight.md`.

---

## 12. Cómo se fusionaron, y qué quedó a medias

20 archivos en conflicto, 78 puntos. No eran cambios ajenos chocando: eran
**dos implementaciones de la misma pantalla**, así que resolver hunk por hunk
habría dado un Frankenstein que compila y se ve mal. El criterio fue elegir
por archivo entero y luego cazar lo que sobrara:

| | Se quedó | Por qué |
|---|---|---|
| Depósitos, Actas, Servicios, Reportes, Cartas, Agenda | la mía | van cableadas al modo vertical y a mi `styles.css` |
| `DetalleDeposito`, `DetalleActa`, `DetalleServicio` | la mía | son las que esas páginas montan |
| **Inicio (`Dashboard.tsx`)** | **la suya** | 812 líneas contra 622: su repasada del Inicio es un superconjunto, y su subtítulo conserva la cifra del mes en vez de solo el rótulo |
| `styles.css` | los dos lados | su bloque `.dash-*` lo pide el Inicio que entró; mi `.da-*`/`.ds-*`/`ipad-ancho` lo piden mis páginas |
| Modales, `Miembros`, `Movimientos`, arnés, Plaid, icono | la suya, sin conflicto | no chocaban con nada |

Las dos ramas coincidieron en los anchos (378/358/338/330) y en la Agenda
invertida de 318px. Donde discreparon fue en detalles: `.cartas-menu-crear`
en `inline-flex` (mía) contra `block` (suya) — las dos habían encontrado, por
separado, que **Cartas en el iPad no tenía ningún control de alta**.

### Lo que la fusión dejó a medias, escrito para que no se olvide

- **`DetalleCarta.tsx` no lo renderiza nadie.** Es de su rama y su idea es
  mejor que la que quedó: enseña la carta REAL —el mismo HTML que sale por la
  impresora, en un iframe escalado— en vez de una segunda maqueta de los
  mismos campos. No se cableó porque mi `Cartas.tsx` tiene un modelo de
  pestañas que ese componente no conoce, y meterlo a la fuerza dentro de una
  fusión de dos ramas era pedir un fallo. Está en el árbol con la nota puesta
  en su propia cabecera.
- **27 reglas de CSS quedaron sin usar**, de las implementaciones que
  perdieron: `.papel-*` (su `DetalleActa`), `.agenda-dia-*` y `.agenda-lienzo`
  (su Agenda), `.dm-seccion` (su `DetalleServicio`). Van marcadas una por una
  en `styles.css` con quién las pedía y por qué siguen ahí. **No se borraron a
  propósito:** meter una poda de CSS en el mismo cambio que junta dos ramas es
  cómo se rompe algo sin poder culpar a nadie. Es su propia tarea, de diez
  minutos.
- ~~**`main` sigue en 1.1.8**~~ — **arreglado el mismo día.** Iván lo pidió en
  cuanto se vio el lío: primero la 1.1.9 a `main`, y la 1.2 después. `main`
  avanzó de `a61a5b7` a `a8abf3c` **sin fusión** —avance directo, porque no
  tenía ningún commit propio desde el ancestro— así que `main` ES ahora,
  commit por commit, la 1.1.9 que está en TestFlight. Consecuencia práctica:
  la Mac ya puede compilar desde `main`, y la 1.2.0 entrará también por
  avance directo cuando se pruebe.

  El orden importaba y era el suyo: **lo que ya se probó aterriza primero.**
  Meter la 1.2.0 en `main` de golpe habría dejado la versión que está en
  TestFlight sin existir en ninguna rama estable, y el día que hubiera que
  volver a ella no habría a dónde volver.

## 13. El sidebar que no se escondía en vertical

Primer hallazgo de Iván revisando la 1.2.2 en TestFlight, y el único de la
tanda que era un fallo de verdad y no una diferencia de gusto:

> "ya revise la app en testflight una cosa que vi es que en portrait mode el
> side bar no se esconde sigue afuera como si como lo hace landscape mode."

La causa, entera, en una línea de CSS: el cajón con velo se encendía por
ancho (`max-width: 1149.98px`) cuando lo que decide es la **orientación**.
Su iPad de 13" con "Más espacio" reporta ~1210pt en vertical, se salía del
rango por 60 puntos y se quedaba con la barra fija. El detalle largo, con la
tabla de los seis aparatos, está en `docs/ipad-rediseno.md` §13.

Tres cosas que quedan dichas:

- **El arnés no lo vio porque medía el iPad de catálogo.** 1024×1366 pasaba;
  1210×1614 nunca se preguntó por el sidebar (estaba en la lista de tamaños
  solo para las pantallas de la sección 8). Ahora hay una sección propia que
  mide la `position` calculada de la barra en seis tamaños, y el primero de
  la lista de sospechosos es el suyo.
- **Se reprodujo el fallo antes de arreglarlo.** Con la regla vieja puesta a
  mano, las tres aserciones de 1210×1614 fallan —`position static`, borde
  derecho 318, ☰ en `none`—; con la nueva, las 308 pasan. Sin ese paso el
  arreglo sería una conjetura con buena pinta.
- **De paso, el arnés ya no deja vite colgado.** Cuando reventaba a medio
  camino, el puerto 1420 quedaba tomado y la pasada siguiente fallaba con
  "Port already in use", que no tiene nada que ver con lo que se estaba
  probando. Dos veces perdí una carrera en eso hoy.

La versión sigue en **1.2.2**: Iván pidió que no se moviera hasta que él
diga que sube un build.

## 14. La 1.2.3 sale a TestFlight

Bump limpio, sin sorpresas salvo una: `version = "1.2.2"` salía **cuatro
veces** en el `Cargo.lock` —`embed_plist`, `form_urlencoded`,
`idna_adapter` y `tesoreria`—, el récord hasta hoy. Van cuatro de siete
bumps con colisión, cada vez con crates distintos. La regla de anclar en
`name = "tesoreria"` (`docs/testflight.md`) volvió a ser lo único que
separaba un bump correcto de un lockfile roto: se cambió **una sola línea**,
la 3852.

Los siete sitios, de acuerdo: `package.json`, `package-lock.json` (las dos
entradas del paquete raíz), `src-tauri/tauri.conf.json`, `Cargo.toml`,
`Cargo.lock`, `gen/apple/project.yml` y el `Info.plist`.

**Qué lleva la 1.2.3 encima de la 1.2.2** —las tres cosas que salieron de
que Iván revisara la 1.2.2 en un iPad de verdad:

- La barra lateral se esconde en vertical (§13). El único fallo de verdad
  de la tanda.
- El gris único del cromo del iPad: barra de estado, columna maestra y
  fondo del panel son la misma superficie, `#F7F7F9` / `#131315`.
- El inventario del handoff 2 corregido contra el esquema: cinco de las
  siete funciones que yo había declarado imposibles sí se pueden con lo
  que la base ya tiene.

**Lo que NO lleva, y hay que decirlo:** "Por revisar" sigue con su lista de
siempre. El motor de las cinco alertas está escrito y probado en
`src/services/bandeja/alertas.ts`, pero `Bandeja.tsx` todavía no lo llama,
así que en esta build no se ve nada nuevo ahí. Es lo siguiente.

Comprobado antes de subir: `tsc` limpio, `build:appstore` con los dos
guardas de Apple en verde (2.5.2 y 3.1.1), los seis verificadores
—hooks, invitación, navegación, traducciones (2376 = 2376) y los cinco de
centavos— y las **308** medidas del arnés de iPad.
