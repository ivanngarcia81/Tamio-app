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

## 3. Lo que quedó anotado, no hecho

- **Probar en el aparato.** El arnés es Chromium; el patrón ya se sabe (el
  umbral de 1024, el AccentColor): lo que WKWebView decida distinto solo se
  ve en un iPad real. En particular el material translúcido y el iframe
  escalado de Cartas.
- **Face ID / Touch ID** y el plan de **Plaid**, como ayer.
- **Capturas del App Store** del iPad: siguen enseñando el diseño viejo.
