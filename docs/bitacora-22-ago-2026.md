# Bitácora — 22 de agosto de 2026

El día en que el rediseño de iPad se terminó: las seis pantallas de
maestro-detalle que quedaban del handoff `Diseño nativo para iPad`, más el
arnés que las verifica, ahora committeado en vez de reconstruido por sesión.

**Las diez pantallas del handoff están hechas.** El detalle de cada decisión
—qué va en la fila, qué en el panel, y qué del handoff no existe en la app y
se descartó— quedó en `docs/ipad-rediseno.md` §3.9, que es el documento vivo
del rediseño; aquí solo el resumen del día.

---

## 1. Las seis pantallas

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

## 2. El arnés dejó de ser desechable

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

## 3. La repasada que pidió Iván

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

## 4. La tercera pasada: Configuración

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

## 5. La cuarta pasada: los formularios

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

## 6. El resumen de la sesión, de principio a fin

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
   `git checkout -- package-lock.json`.

## 7. Lo que quedó anotado, no hecho

- **Probar en el aparato.** El arnés es Chromium; el patrón ya se sabe (el
  umbral de 1024, el AccentColor): lo que WKWebView decida distinto solo se
  ve en un iPad real. En particular el material translúcido y el iframe
  escalado de Cartas.
- **Face ID / Touch ID** y el plan de **Plaid**, como ayer.
- **Capturas del App Store** del iPad: siguen enseñando el diseño viejo.
