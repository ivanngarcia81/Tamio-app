# Bitácora — 21 de agosto de 2026

El día del iPad. Qué se hizo, qué se rompió por el camino y qué queda.

**21 commits en `main`. 27 archivos, +2563 / −452 líneas.**
Versión: de la 1.1.5 a la **1.1.8**. Las 1.1.6 y 1.1.7 se prepararon y **no
se distribuyeron** (ver §6). Cuatro archivos nuevos:
`docs/ipad-rediseno.md`, `src/components/DetalleMovimiento.tsx`,
`src/components/DetalleMiembro.tsx` y `src/hooks/useMediaQuery.ts`.

---

## 1. Cómo empezó el día: cinco arreglos del Mac

Antes del iPad, cinco cosas que Iván circuló en capturas de su Mac real. Las
cinco se reprodujeron y se midieron en el arnés antes de tocar nada:

| Qué se veía | Qué era |
|---|---|
| La fecha partía en dos líneas en Ingresos | la columna medía 92px y "Aug 15, 2026" pedía 94 — **dos píxeles** |
| Los avatares de Aportantes muy grandes | 32px de teléfono en una tabla de ratón; a 24 con la fila a 44 |
| Banda blanca al final del estado financiero | `.content-lienzo .card` (0,4,0) le ganaba a `.report-preview` (0,3,0) |
| El texto se salía del botón del pie | `scrollHeight 31` contra `clientHeight 20` |
| — | y una pasada por **toda** la clase: ningún control de alto fijo del Mac parte su texto |

---

## 2. El rediseño de iPad

Llegó el handoff `Diseño nativo para iPad`. Lo que lo hacía valioso no era
la estética: **cambia la estructura**. En el Mac, Ingresos es una tabla densa
de filas de 38px; en el iPad pasa a ser una lista táctil con el detalle al
lado. Eso es lo que separa la versión de iPad de "la de Mac con los dedos
gordos", que era justo lo que Iván quería.

### 2.1 El iPad deja de describirse por lo que no es

Hasta hoy el iPad era `.movil` **sin** ser `.iphone` — o sea, cogía reglas
pensadas mirando un teléfono más el layout de escritorio. Resultado medido a
1366×1024: **cabecera de 157px** (12 de relleno + 34 de acciones + 24 de
hueco + 65 del Large Title + 22) para decir "Ingresos".

Ahora tiene clase propia, `:root.ipad`, puesta en `main.tsx` antes de montar
React. **La cuenta de las cuatro:** `movil` = iPad + iPhone · `iphone` = solo
teléfono · `ipad` = táctil que no es teléfono · `mac` = escritorio.

Con ella: barra de 56px con título de 17 y subtítulo de 12, sidebar a 318px,
vuelve "Nuevo ingreso" con su texto, y se van la fila fija de glifos y el
título viajero. De paso murió un solape real del iPad de 13": pasados los
1024px la barra del ☰ no existe, pero el "+" seguía clavado en `top: 58px`,
flotando sobre el Large Title.

### 2.2 El maestro-detalle

La pieza grande. Lista a la izquierda, detalle a la derecha — y en vertical,
**el detalle empuja** a la lista como un push de iOS. Esa fue una decisión de
Iván entre dos caminos, y arrastró tres consecuencias que quedaron cumplidas
y verificadas:

- El detalle es **estado de pantalla, no modal**: se guarda un ID que se
  re-busca en cada recarga. Así una edición refresca la ficha en sitio y un
  borrado la cierra sola.
- **Sobrevive al giro**: girar el iPad con una fila abierta la deja abierta,
  comprobado en los dos sentidos.
- La animación es la de `push`, con su `prefers-reduced-motion`.

Los dos umbrales: **partido desde 700px**, **columnas desde 1150px**. Por
debajo de 1150 —todo iPad en vertical más el mini en horizontal— la lista
ocupa el ancho y el panel entra encima con "‹ Ingresos".

### 2.3 Liquid Glass, hasta donde es honesto

Iván preguntó si Tamio soporta el material de iOS 26. La respuesta corta: el
material translúcido sí, la refracción no —fingirla en CSS delata la app más
que no tenerla—. Así que la barra de 56px y los rótulos pegados de las listas
pasaron a la misma receta que ya usan las barras del iPhone
(`saturate(180%) blur(20px)`), y la barra se volvió pegajosa: sin eso el
material no significa nada, porque el contenido no le pasaba por debajo.

---

## 3. Dos bugs que aparecieron de rebote

**`$NaN` en toda cifra animada.** Al medir la ficha de un aportante a mitad
de animación salió `$NaN MXN`. La función del `requestAnimationFrame` de
`CountUp` se llamaba `paso`, igual que el prop, y lo sombreaba:
`Number(función)` = NaN. Todas las tarjetas de dinero de la app —Dashboard,
Ingresos, Gastos, Aportantes— decían "$NaN" durante los 650ms de la cuenta,
**en las tres plataformas**. Sobrevivió porque a `t=1` se pinta el valor
directo: cualquier mirada tardía se veía bien.

**El número de "hoy" invisible en el calendario del Mac.** Iván circuló un
punto negro en Agenda. `.agenda-cell.today .agenda-cell-num` (0,3,0) y
`:root.mac .agenda-cell-num` (0,3,0) **empatan**, y la de Mac va después en
el archivo: le ganaba el `color` pero no el `background`, así que el número
quedaba del color de su propio círculo. Estaba roto en los **dos** temas —en
oscuro es un punto blanco, igual de ilegible.

---

## 4. Tres veces me equivoqué, y cómo

Vale la pena dejarlo escrito, porque las tres tienen la misma forma.

**4.1 El umbral en 1024px.** Lo justifiqué en el propio código: *"que
coincida con el rango del cajón lateral (601–1023) para que no puedan
discrepar"*. Sonaba sólido y era falso — ese rango se escribió pensando en
**ventanas de Mac angostas**, no en lo que iPadOS considera compacto. Un iPad
a pantalla completa tiene clase de ancho **regular** en todos sus tamaños.
Consecuencia: el mini (744), el 10.9" (820) y el 11" (834) se quedaban **en
vertical con la UI vieja entera**, y solo el Pro de 13" veía el rediseño sin
girar el aparato. Lo cazó Iván: *"sigue en su mayoría con la vieja UI"*.

Lo peor: mi propia tabla de verificación marcaba esas filas como *"no debe
cambiar"*. Estaba comprobando que el bug siguiera ahí.

**4.2 "El handoff solo maquetó dos pantallas".** Falso: son **nueve**, más
Configuración. Y lo sostuve con un argumento inventado — *"Reportes y Agenda
no son listas, no ganan nada partiéndose"* — cuando el handoff parte las dos.
Eso es peor que el error de cuenta, porque suena razonado.

**4.3 "Configuración ya está, no hay que hacer nada".** Cierto solo en el
sentido más pobre: había dos columnas, pero eran las de **antes** del
rediseño de Ajustes — ese se escribió entero bajo `:root.mac` (87 de las 92
reglas de `.settings-detail`). Lo vio Iván en el aparato.

**La lección de las tres: contar sobre el archivo, no sobre el recuerdo de
haberlo leído.** El comando que da la cuenta buena quedó en
`docs/ipad-rediseno.md` §5.

---

## 5. Estado del rediseño

De las diez pantallas que el handoff maqueta como maestro-detalle:

| Pantalla | Columna | Estado |
|---|---|---|
| Ingresos · Gastos | 400px | ✅ |
| Aportantes | 378px | ✅ |
| Configuración | 298px | ✅ |
| Por revisar | 400px | ✅ |
| Reportes | 330px | ❌ |
| Depósito bancario | 378px | ❌ |
| Actas | 358px | ❌ |
| Registro de servicios | 358px | ❌ |
| Cartas y traslados | 338px | ❌ |
| Agenda y calendario | 318px | ❌ |

**La cáscara** (barra de 56px, sidebar de 318, material, cajón con velo,
"Buscar en Tamio" con ⌘K, hoja de "Nuevo" de 600px) llega a **las 16
páginas**: es CSS sobre marcado que todas comparten.

Y el andamio está construido: `.md-split`, `.md-lista`, `.md-detalle`, el
modo de empuje, `useMediaQuery` y el patrón de "el detalle es un ID". Las
seis que faltan son sobre todo decidir qué va en la fila y qué en el panel.

---

## 6. Versiones: por qué la 1.1.6 y la 1.1.7 no salieron

| Versión | Qué pasó |
|---|---|
| 1.1.6 | preparada con el rediseño. Antes de archivar apareció el punto negro del calendario |
| 1.1.7 | preparada con ese arreglo. Antes de archivar, Iván reportó que el rediseño no salía en su iPad (§4.1) |
| **1.1.8** | el rediseño llegando a los ocho tamaños de iPad, más Configuración y Por revisar |

Ninguna de las dos primeras llegó a TestFlight. No es el caso de la 1.1.3
—aquella sí se subió rota—: estas murieron en la Mac de Iván, que es donde
deben morir.

Cada una pasó `tsc`, los doce `verificar-*` y un build con
`VITE_CANAL=appstore` con las dos guardas de Apple (sin manifiesto de
versiones por la 2.5.2, sin enlaces de pago por la 3.1.1). Desde la 1.1.6 se
comprueba además que **el bundle lleve de verdad lo que dice llevar**
(`:root.ipad`, `md-split`, `sidebar-buscar` en el CSS construido): subir un
número de versión nuevo con el bundle viejo es un fallo que no avisa.

> ⚠️ `npm run verificar-canal` **suelto no dice nada útil**. Está pensado
> para el final de `npm run build`; sin `VITE_CANAL` asume "descarga" y juzga
> con esa vara el `dist/` que haya. Tras un build de App Store "falla" sin
> que nada esté mal.

---

## 7. Lo que quedó anotado, no hecho

- **Las seis pantallas** de §5.
- **Face ID / Touch ID**: se explicó cómo encaja (no toca Supabase; el nivel
  fuerte es exigir biometría para que el Llavero entregue la llave de
  SQLCipher). Sin empezar.
- **Plaid**: se revisó el plan de `docs/plan-plaid.md` (rama
  `claude/plaid-integration-planning-8hdyx0`). Es implementable y está bien
  fundamentado —cada ruta y número de línea que cita se comprobó contra el
  repo— con tres correcciones: su sección de UI trata al iPad como un Mac y
  no menciona el maestro-detalle, una ruta está mal
  (`components/ios/NuevoDepositoIOS.tsx` está sin la subcarpeta), y
  `Depositos.tsx` no tiene segmentos hoy. No se trabajó en él a propósito.
- **Capturas del App Store**: no hacen falta para TestFlight y se heredan al
  publicar, pero las de iPad muestran el diseño viejo y conviene rehacerlas
  cuando el rediseño esté probado en uso real.

---

## 8. Cómo verificar cambios de iPad

El arnés de Playwright con las páginas reales y el stub de SQL. Los ocho
tamaños de iPad a pantalla completa (744, 820, 834 y 1024 en vertical; 1133,
1180, 1194 y 1366 en horizontal) **deben** dar el diseño nuevo. Y la red de
seguridad, que **no** debe moverse: Mac a 1440/1024/800, iPhone en las dos
orientaciones, y el Split View de ½ (507 y 678) y el Slide Over (320), que
son compactos de verdad.

Detalle completo en `docs/ipad-rediseno.md` §5.
