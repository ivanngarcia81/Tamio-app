# Subir Tamio a TestFlight

_Escrito el 19 de agosto de 2026, después de que la versión se escapara dos
veces. Al día de hoy (20 de agosto) están subidas la 1.1.0, la 1.1.1 y la
1.1.2._

## Los cinco sitios que llevan la versión

Tienen que decir lo mismo, y hay que entender cuáles son FUENTE y cuáles son
GENERADOS, porque es lo que explica que una versión editada a mano "vuelva"
sola al compilar.

### Fuentes — se editan a mano

| Archivo | Clave |
|---|---|
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |

Y con `Cargo.toml` va **`src-tauri/Cargo.lock`**, que repite la versión del
paquete `tesoreria`. No es una fuente —`cargo` la reescribe sola en la
siguiente compilación— pero si no se toca a la vez, el árbol queda sucio
justo cuando estás archivando en Xcode, que es el peor momento para
preguntarse si ese cambio suelto importa. Se cambia con las otras tres.

> ⚠️ **En el `Cargo.lock` no vale buscar y reemplazar.** El número de Tamio no
> es el único que aparece: en el bump a la 1.1.5, `version = "1.1.4"` salía
> **tres veces** —las otras dos eran los crates `aho-corasick` y `rustix`, que
> por casualidad iban en esa misma versión— y cambiarlas todas rompe el
> lockfile. Hay que buscar la línea `name = "tesoreria"` y tocar la de justo
> debajo.
>
> Que en un bump concreto solo aparezca una vez **no es motivo para relajar la
> regla**: en el de la 1.1.6, `version = "1.1.5"` salía sola, pero eso depende
> de qué versiones lleven ese día las 400 dependencias del árbol — es una
> casualidad, no una garantía. Se ancla siempre en `name = "tesoreria"`.
>
> **Y en el bump a la 1.2.0 volvió a pasar.** `version = "1.1.9"` salía **dos
> veces**: la de `tesoreria` y la del crate **`flate2`**, que ese día iba
> justo en la 1.1.9. Buscar y reemplazar habría dejado el lockfile diciendo
> que `flate2` es la 1.2.0, que no existe.
>
> **Y en la 1.2.1, otra vez**: `version = "1.2.0"` salía dos veces, la de
> `tesoreria` y la de **`scopeguard`**. Van **tres de cinco** bumps con
> colisión, y cada vez con un crate distinto. Deja de ser una anécdota: en
> un árbol de 400 dependencias lo raro es que el número NO se repita. Se
> ancla siempre en `name = "tesoreria"`, sin excepciones y sin mirar
> cuántas veces sale.
>
> **En la 1.2.3, el récord**: `version = "1.2.2"` salía **cuatro** veces —
> `embed_plist`, `form_urlencoded`, `idna_adapter` y `tesoreria`. Un buscar y
> reemplazar habría dejado tres crates diciendo que van en una versión que no
> existe, y el fallo no habría salido hasta que alguien intentara resolver el
> árbol desde cero. Anclado, se cambió **una sola línea**: la 3852. Van
> **cuatro de siete** bumps con colisión.
>
> **En la 1.2.4 el choque cambió de archivo.** En `Cargo.lock`, por primera
> vez en cuatro bumps, `1.2.3` salía **una sola vez** y era la de `tesoreria`.
> Pero `package-lock.json` traía **tres** apariciones de `1.2.3`, y solo dos
> son de Tamio: la tercera es **`update-browserslist-db`**, que ese día iba
> justo en la 1.2.3 (más una cuarta como rango `^1.2.3` en las dependencias
> de otro paquete). La lección se generaliza: **el ancla no es "Cargo.lock",
> es "la línea que sabes cuál es"** — en `package.json`/`package-lock.json`,
> las dos primeras (la raíz y `packages[""]`); en `Cargo.lock`, la que sigue
> a `name = "tesoreria"`. Van **cinco de ocho** bumps con colisión.
>
> **Y en la 1.2.5, vuelta al `Cargo.lock`**: `version = "1.2.4"` salía dos
> veces, la de `tesoreria` y la del crate **`camino`**. `package-lock.json`,
> en cambio, salió limpio esta vez. Van **seis de nueve**. Ya no tiene
> sentido seguir contándolas como si fueran la excepción: **son la norma**.
>
> **En la 1.2.6, la excepción de verdad**: `1.2.5` salía **una sola vez** en
> `Cargo.lock` y **dos** en `package-lock.json`, las dos de Tamio. Ni una
> colisión en ninguno de los dos. Seis de diez.
>
> **Y en la 1.2.7, una trampa NUEVA.** Colisión exacta, ninguna. Pero
> `Cargo.lock` tiene el crate **`cc` en la 1.2.67**, y `1.2.6` es un PREFIJO
> de `1.2.67`: un buscar y reemplazar de `1.2.6` → `1.2.7` lo habría dejado en
> **`1.2.77`**, una versión que no existe, sin que ninguna colisión exacta lo
> avisara. Anclar en `name = "tesoreria"` y tocar una sola línea vale también
> para esto; buscar el número, no.
>
> **Y en la 1.2.9, una trampa que no es de colisión sino de FORMATO.** Iván
> pidió la **1.2.8.1** —cuatro números, la "1.2.8 con un arreglo encima"—. No
> se puede, y no es opinión: `Cargo.toml` exige **semver**, que es exactamente
> `MAJOR.MINOR.PATCH`, y con `version = "1.2.8.1"` cargo ni siquiera parsea el
> manifiesto:
>
> ```
> error: unexpected character '.' after patch version number
> ```
>
> O sea que `tauri ios build` falla antes de compilar una sola línea.
> `package.json` y `tauri.conf.json` piden lo mismo.
>
> Y la salida "misma versión, número de build distinto" —que en iOS es
> `CFBundleShortVersionString` fijo con `CFBundleVersion` subiendo— **tampoco
> está disponible aquí**, y ya estaba apuntada en `project.yml`: Tauri PISA
> `CFBundleVersion` con la versión de `tauri.conf.json` en cada `ios build`.
> Para subir dos veces, lo que sube es la versión. Por eso la 1.2.8.1 es
> la **1.2.9**.
>
> **En la 1.2.8, limpia**: `1.2.7` salía **diez** veces en total y las diez
> eran de Tamio —una por sitio, dos en los archivos que llevan dos claves—.
> Ni colisión exacta ni prefijo: `1.2.8` no existía en ningún `lock` y ningún
> paquete andaba por el `1.2.7x`. Seis de once. Lo que no cambia es el
> método: se comprueba ANTES de tocar y se cambia por número de línea, no por
> búsqueda, porque el bump limpio y el envenenado se ven exactamente igual
> hasta que miras.

### Generados — Tauri los reescribe al compilar para iOS

| Archivo | Clave |
|---|---|
| `src-tauri/gen/apple/project.yml` | `CFBundleShortVersionString`, `CFBundleVersion` |
| `src-tauri/gen/apple/tesoreria_iOS/Info.plist` | `CFBundleShortVersionString`, `CFBundleVersion` |

**`src-tauri/gen/` es una carpeta generada.** Está en el repo para que el
proyecto de Xcode viaje con la firma y los iconos, pero `tauri ios build` la
vuelve a escribir a partir de las fuentes de arriba. Por eso cambiar el
Info.plist a mano NO basta: al compilar vuelve el número viejo.

> Ya ha pasado dos veces. El bump a la 1.1.0 tocó `package.json`,
> `tauri.conf.json` y el `Info.plist`, y dejó fuera `project.yml` (1.0.8) y
> `Cargo.toml` (1.0.8, que no se había movido desde la 1.0.8 de verdad).
> Con las tres fuentes de acuerdo esto deja de poder pasar.

> ⚠️ **Y ha vuelto a pasar, al revés, en la 1.2.11 (24 ago 2026).** Esta vez
> se movieron las tres fuentes y se dejaron los DOS generados clavados en
> 1.2.9 — llevaban así desde la 1.2.9, o sea que las 1.2.10 y 1.2.11 los
> ignoraron. El razonamiento equivocado fue este: "son generados, Tauri los
> reescribe, así que da igual lo que digan". Y es verdad a medias.
>
> **Lo que NO da igual: si el valor guardado no coincide, la reescritura
> ENSUCIA el árbol.** Iván fue a compilar la 1.2.11 y `verificar-rama` abortó
> con `M src-tauri/gen/apple/tesoreria_iOS/Info.plist` — el rastro de su build
> de la 1.2.10. Y aborta en CADA build mientras no coincidan, porque cada
> compilación deja el mismo archivo modificado.
>
> Con los cinco en el mismo número, la reescritura de Tauri no cambia nada y
> el árbol queda limpio. Así que el bump son **cinco sitios más los dos
> lockfiles**, y los cinco se comprueban después:
>
> ```sh
> grep -rn "1\.2\.11" package.json src-tauri/tauri.conf.json \
>   src-tauri/Cargo.toml src-tauri/gen/apple/project.yml \
>   src-tauri/gen/apple/tesoreria_iOS/Info.plist
> ```

## El número de compilación NO se controla desde el repo

`CFBundleVersion` (el número de compilación) **lo pisa Tauri en cada
`ios build` con la versión de `tauri.conf.json`**. Está comprobado: se dejó
`"2"` en el `Info.plist`, se compiló, y el build lo devolvió a `"1.1.0"`.

Consecuencia práctica: **no hay un número de compilación independiente**. Lo
que Apple ve como versión y como compilación es el mismo número.

### Entonces, ¿cómo se sube dos veces?

**Subiendo la versión.** Cada subida a TestFlight necesita su propia versión
en las tres fuentes:

| Subida | `version` en las tres fuentes |
|---|---|
| 18 ago | 1.1.0 |
| 19 ago | 1.1.1 |
| 19 ago | 1.1.2 |
| 20 ago | 1.1.3 — **rota**, ver abajo |
| 20 ago | 1.1.4 |
| 21 ago | 1.1.5 |
| 21 ago | 1.1.6 — el rediseño de iPad, **no distribuida** |
| 21 ago | 1.1.7 — el rediseño de iPad + el punto negro, **no distribuida** |
| 21 ago | 1.1.8 — el rediseño llega a TODOS los iPads, no solo al de 13" |
| 22 ago | 1.1.9 — el rediseño completo: las diez pantallas, Membresía, Inicio, Configuración y los formularios como hoja. La PRIMERA con el rediseño que llegó a TestFlight. **En pruebas, NO candidata a publicación** |
| 22 ago | **1.2.0** — la FUSIÓN de las dos ramas que hicieron el rediseño en paralelo: el modo vertical de una y el Inicio, Configuración y el arnés de la otra. **Subida a TestFlight**, compilada desde `claude/charming-sagan-hknqp1` |
| esta | **1.2.1** — el corte de columnas baja de 1150 a 1000: el iPad Pro de 12.9"/13" en vertical pasa a dos columnas, y Ajustes enseña por fin la versión en iPad y Mac |
| esta | **1.2.2** — la build de REVISIÓN del handoff 2: Membresía maestro-detalle, Informes de membresía con su índice, Mensajes como chat centrado, y Cartas con crear solo en el "+" |
| esta | **1.2.3** — el primer arreglo salido de revisar la 1.2.2 en un iPad de verdad: la barra lateral se esconde en vertical (la regla pasa de ancho a orientación), más el gris único del cromo del iPad —barra, columna maestra y fondo del panel, `#F7F7F9` / `#131315`— y el inventario del handoff 2 corregido contra el esquema |
| esta | **1.2.4** — el handoff 2 completo: **Agenda** (barra de 50px sobre las dos columnas, rejilla que llena el alto, pastillas de color por tipo, días vecinos en gris) y **Configuración** (las listas agrupadas cruzan al iPad, las tres miniaturas de tema, y la Zona sensible que se veía rota desde antes). Con esto, las once pantallas del handoff están recorridas |
| esta | **1.2.5** — el panel de detalle pasa al gris del lienzo (`#F2F2F7` / `#000`) y deja de fundirse con la barra y la columna maestra; de paso, la barra de vistas de la Agenda, el índice de zonas de Ajustes y la columna del día recuperan el suyo — cuatro superficies que pedían el cromo con `--sidebar-bg`, que en el iPad cuelga del lienzo. Y se pintan los **diez controles** que el handoff dibuja y la app no tiene —"Marcar depositado", "Asignar encargado" ×4, los tres de Presentación, los cuatro permisos del rol y los cuatro Controles de tesorería del handoff 1—, **apagados y con su explicación**. Todo salió de revisar la 1.2.4 en el iPad |
| esta | **1.2.6** — el cromo, terminado: la barra de vistas de la Agenda, el índice de zonas de Ajustes, la barrita de Informes y las dos superficies translúcidas que mezclaban el gris equivocado. Las cinco pedían el cromo con `--sidebar-bg`, que en el iPad cuelga del lienzo. Con guarda **sobre el archivo**, no sobre la pantalla: ninguna regla de `:root.ipad` puede volver a nombrar ese token. Y dos del chip del mes: deja de salirse 38px del panel (`.ios-bar-button` medía 44×44 fijos) y su menú deja de abrirse recortado detrás del panel (`MenuAnchor` pasa a colgar de `<body>` en `fixed`, como los otros menús de la casa) |
| esta | **1.2.7** — la tanda salida de revisar la 1.2.6 en el iPad: el chip del mes deja de salirse del panel y su menú de abrirse recortado detrás de él, el día de hoy pasa del negro al acento de la app, se va el "Nueva actividad" repetido, y Configuración se monta como pantalla partida en vez de como un rectángulo flotando. Más el `tsconfig` que sobrevive a las carpetas que macOS duplica |
| esta | **1.2.8** — dos de revisar la 1.2.7 en el iPad. **Editar un miembro** deja de abrir el modal de escritorio encima del maestro-detalle y pasa a la hoja de iOS —la misma que ya usaba el alta—, con el expediente y una pantalla de solo lectura para la asistencia, el historial y los documentos, que es lo único que el panel de detrás no enseña. Y **la raya de la barra deja de ir pegada a los botones**: el inset de la barra de estado se comía los 56px de la barra, así que ahora se le SUMA. En las dieciséis pantallas de golpe |
| **24 ago — SUBIDA, confirmada por Iván** | **1.2.9** — Depósitos rehecha con el **handoff 3** (Pendientes como revisión previa al banco: cortes por día, tres cifras vivas, los cuatro avisos y "Marcar depositado" abriendo el formulario prellenado; Depositados con su pastilla, el menú de "⋯", "Datos del depósito" y "Conciliación"; y la hoja "Nuevo corte" entera), **más TODO lo del 24 de agosto** — el número había quedado libre porque la 1.2.9 se preparó y no llegó a subir en su momento, así que se lo llevó todo junto: la sincronización entera (las 16 tablas viajan, con `verificar-sync` vigilando la paridad de columnas), la **doble firma** del corte, el **folio** del movimiento (`2026-0042`, sin numerar el pasado), los **dos permisos del rol Tesorería** —de los cuatro que dibujó el handoff— con el borrado frenado por un disparador del servidor, y las cáscaras que quedaban: puestos del culto, orden del culto, pestaña Familia, "Recopilar firmas", "Compartir" un depósito y los conteos por categoría. Nada de esto se había visto en un iPad de verdad; **esta es la build con la que se ve**. Subida y confirmada el 24 de agosto por la noche |
| **24 ago — SUBIDA, confirmada por Iván** | **1.2.10** — **el mismo .ipa con otro número.** Desde la 1.2.9 no ha cambiado ni una línea de `src/` ni de `src-tauri/`: los tres commits de por medio tocan `.gitignore` y `pruebas/arnes-ipad.mjs` —configuración y pruebas, nada que entre en el paquete—. Se compila porque la 1.2.9 ya está arriba y Apple no acepta dos veces el mismo número, no porque haya trabajo nuevo que enseñar. **Si lo que querías era revisar algo nuevo en el iPad, esta build no lo trae**: lo único que queda sin motor en toda la app es el segmentado de "Tamaño de texto" **Ojo, dos builds con este número.** El tamaño de texto entró DESPUÉS del bump, así que un .ipa compilado en `6f9ba43` y otro en `6b76b49` dicen los dos "1.2.10" y no llevan lo mismo. Se distingue en el aparato: Config → Preferencias → Presentación, y si el segmentado de "Tamaño de texto" se puede tocar, es el segundo |
| **25 ago — SUBIDA, confirmada por Iván** | **1.2.11** — **la fusión: el diseño de `charming-sagan` entra en la rama del motor.** De sagan: el **header del iPad** con su handoff (el ☰ pasa a botón de 38 con el glifo de barra lateral, y de paso destapó que el arnés nunca había simulado pantalla táctil, así que ninguna regla de `pointer:coarse` se había probado), **un solo botón de crear en Cartas** —había ocho, la misma orden repetida— y **Cartas y traslados rehecha entera**. De la rama del motor: **"Tamaño de texto"**, la última cáscara del rediseño, que no fue encender un interruptor sino mover la tipografía entera a un factor (395 `font-size` iban con píxeles a pelo, incluidas las CIFRAS DE DINERO). Con eso **no queda ni un control dibujado y apagado en toda la app**. Arnés: 1018 ✓ / 0 ✗, las 44 secciones de las dos ramas **Y otra vez dos builds con el mismo número.** Después del bump entraron OCHO commits que tocan trece archivos de la app: el editor de la carta, el **registro de lo que pasa en la iglesia** (que sustituye al chat de Mensajes) y la guarda de salida de los paneles. Se distingue en el aparato sin abrir nada: si el menú lateral dice **"Registro"** es la segunda; si dice **"Mensajes"**, la primera |
| **preparada, NUNCA subió** | **1.2.12** — **el registro de lo que pasa en la iglesia.** "La página de mensajes debería ser otra función; las personas ya tienen WhatsApp e iMessage" (Iván, 25 ago). Nueve sucesos que la app anota sola —movimiento eliminado, cortes, segunda firma, descuadre, bajas del padrón, cartas y actas—, cada quien ve lo de su área, y la nota a mano se distingue del suceso automático. Más el editor de la carta y la guarda de que de todo panel se puede salir. Arnés: 1095 ✓ / 0 ✗ **Y la primera con ETIQUETA**: `v1.2.12` sobre el commit `9c50c90`, que es la salida barata al defecto que la 1.2.10 y la 1.2.11 enseñaron dos veces —ocho commits colándose después del número—. Con la etiqueta, "la 1.2.12" es un punto exacto del historial y no un rango difuso. **OJO**: la etiqueta está puesta en el repo de Iván, no en GitHub; desde este contenedor el `git push` de etiquetas devuelve 403 (el permiso de esta sesión alcanza sólo para la rama). Para dejarla arriba, desde el Mac: `git fetch origin && git tag -a v1.2.12 9c50c90 -m "Tamio 1.2.12" && git push origin v1.2.12`. **Este número ya no sube**: el 26 de agosto Iván decidió que este trabajo, más el rediseño de iPhone, sale como **1.3.0**. Lo de aquí no se pierde — es exactamente lo que va dentro de la 1.3.0 |
| **27 ago — SUBIDA, confirmada por Iván** | **1.3.0 — el rediseño, entero: iPad e iPhone.** Iván, 26 ago: *"mover los planes de la versión 1.3 a 1.4 y hacer 1.3 la versión para TestFlight para revisar"*. Deja de ser una serie de parches y pasa a ser versión nueva, y con razón: la 1.2.x acumuló **once** builds. Lo que lleva: **el rediseño de iPad completo** (dieciséis pantallas, el header del handoff, Cartas, Depósitos con el handoff 3, el maestro-detalle); **el rediseño de iPhone completo** (iOS 26 Liquid Glass, once pantallas, 888 líneas de CSS bajo `:root.iphone`); **los dos permisos del rol Tesorería** con el borrado frenado desde el servidor; **el tamaño de texto**, que movió la tipografía entera —473 tamaños, las cifras de dinero incluidas— a un factor; **el registro de lo que pasa en la iglesia**, que sustituyó al chat de Mensajes; y **Mensajes retirado del todo** (pantalla, funciones, sincronización, tabla local en la migración 51 y filas de la nube). **No queda ni un control dibujado y apagado en toda la app.** Arnés: 1105 ✓ / 0 ✗ en 49 secciones; nueve verificaciones en verde |
| **27 ago — SUBIDA, confirmada por Iván** | **1.3.1 — la vecina del carrusel.** El desenfoque de la tira de secciones se calculaba con cuánto se SALÍA cada nombre por el borde lejano, así que dependía del LARGO del nombre y no de su distancia al centro: en el teléfono, dos vecinas con 80 px DENTRO de la pantalla salían invisibles, y por eso en Actas asomaban las dos, en Cartas una y en Informes de membresía ninguna. Una tira sin nada asomando no parece una tira: parece un título suelto, y se deja de buscar. Ahora la distancia sale del borde MÁS CERCANO al centro. **OJO, y es el mismo defecto por TERCERA vez:** este arreglo entró DESPUÉS del bump a 1.3.0 (commits `3dc8ef4` y `dd18fba` sobre `dffebaf`), así que **si Iván compiló la 1.3.0 después de traerse la rama, su .ipa YA lo lleva y esta 1.3.1 no trae nada nuevo**. Se distingue mirando: en Informes de membresía, ¿asoman las secciones vecinas a los lados del título? Si asoman, la 1.3.0 ya lo traía |
| **ninguna preparada** | **La 1.3.2 NO existe todavía, y eso es lo correcto.** Desde el bump a la 1.3.1 (`a8f814c`) no ha entrado ni un commit: la rama está exactamente donde se compiló, y sagan y móvil no traen nada nuevo. Preparar un número sin contenido es el defecto de la 1.2.10 —el mismo .ipa con otra etiqueta— y esta vez se evita no haciéndolo. **El número se sube cuando haya algo que enseñar, no antes** |
| cuando toque el plan de `docs/plan-1-4.md` | 1.4.0 |

> **La 1.2.1 y la 1.2.2 no se subieron según se hicieron.** Iván pidió
> acumular arreglos y subir una sola vez para revisar de corrido, así que
> el número solo avanza cuando algo sube DE VERDAD a App Store Connect.
> Por eso la 1.2.2 lleva cuatro tandas de trabajo y no una.

> Para compilar la 1.2.0 hubo que intentarlo **tres veces**, y las tres salió
> la 1.1.9: dos por estar en la rama equivocada y una por `main`, que es la
> 1.1.9 a propósito. De ahí salió `verificar-rama`, que ya iba dentro de este
> mismo build y cantó `1.2.0` antes de empezar. Es lo que había que ver.
| cuando toque el plan de `docs/plan-1-4.md` | 1.4.0 |

> ⚠️ **La 1.2.0 salió de juntar DOS ramas que hicieron el rediseño a la vez.**
> Es la lección más cara del 22 de agosto y merece quedar escrita aquí, que
> es donde se mira antes de compilar.
>
> `claude/charming-sagan-hknqp1` y `claude/design-review-execution-can5gv`
> salieron las dos de `a61a5b7` e hicieron, sin saberlo, el mismo trabajo:
> las seis pantallas de maestro-detalle y las ocho hojas de formulario. La
> segunda subió su 1.1.9 a TestFlight; la primera bumpeó su propia 1.1.9 sin
> que ese número estuviera libre. **Dos ramas con la misma versión y ninguna
> en `main`.**
>
> Cómo se notó: Iván compilaba en su Mac y le seguía saliendo la 1.1.9
> después del bump. No era el bump — era que su copia estaba en la otra rama,
> donde ese commit no existe. Un `git pull` no trae lo que está en otra rama.
>
> **Arreglado el mismo día, y en este orden:** primero la 1.1.9 —la que ya
> estaba probada y en TestFlight— aterrizó en `main` por avance directo
> (`a61a5b7..a8abf3c`, sin fusión, porque `main` no tenía ningún commit propio
> desde el ancestro). `main` ES ahora esa 1.1.9, commit por commit. La 1.2.0
> espera en su rama y entrará igual, por avance directo, cuando se pruebe.
>
> El orden no es capricho: **lo que ya se probó aterriza primero.** Si la
> 1.2.0 hubiera entrado de golpe, la versión que está en TestFlight no
> existiría en ninguna rama estable, y el día que hubiera que volver a ella no
> habría a dónde volver.
>
> **Y la regla para no repetirlo: antes de subir la versión, comprobar que la
> rama en la que estás es la que compila la Mac**, y que `main` no se ha
> quedado atrás. Con `git branch -r` y un vistazo a la `version` de cada rama
> se ve en diez segundos:
>
> ```sh
> for b in $(git branch -r | grep -v HEAD); do
>   echo -n "$b  "; git show "$b:src-tauri/tauri.conf.json" | grep '"version"'
> done
> ```
>
> El plan que iba a ser la 1.2 —los siete puntos que la 1.1 apartó el 4 de
> agosto— corrió un puesto y vive ahora en **`docs/plan-1-4.md`**.

Si App Store Connect contesta *"The bundle version must be higher than the
previously uploaded version"*, es esto: sube el tercer número en
`package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`, y
vuelve a compilar.

> Se puede fijar un número de compilación aparte editándolo en Xcode antes de
> archivar, pero entonces deja de estar en el repo y se olvida. Subir la
> versión es una línea en tres archivos y no tiene forma de fallar.

## TestFlight no es publicar

Son dos puertas distintas, y todas las versiones de la tabla de arriba han
cruzado solo la primera:

- **Subir a TestFlight** es lo que hacen `npm run ios:appstore` y el
  Organizer: la build queda instalable por ti y por los probadores que
  invites, y nada más.
- **Publicar en el App Store** es otra cosa: crear la versión en App Store
  Connect, adjuntarle una build y **enviarla a revisión**, con sus
  metadatos, su "qué hay de nuevo" y sus capturas.

Estar en TestFlight no envía nada a revisión. Se sube ahí para probar, y
probar es lo que se está haciendo.

**La 1.1.9 no es candidata a publicación.** Está en TestFlight para ver el
rediseño de iPad en aparatos reales —el material translúcido, la hoja carta
escalada, las hojas de formulario al dedo, todo lo que Chromium no puede
juzgar— y **el diseño sigue en trabajo**: lo que salga de esas pruebas entra
en las versiones siguientes. Cuando de verdad toque publicar, además hay que
rehacer las **capturas del App Store del iPad**, que siguen enseñando el
diseño viejo y ya no representan la app.

## La orden

```sh
npm run ios:appstore
```

Pone `VITE_CANAL=appstore`, compila el frontend y empaqueta para App Store
Connect en un solo paso. **No compiles a mano**: sin ese canal se cuela el
enlace de compra (regla 3.1.1 de Apple) y el aviso de versión nueva (2.5.2).
`verificar-canal.mjs` corre solo al final y aborta si alguno se coló.

Después, Xcode → Organizer → Distribute → TestFlight.

### `verificar-rama` corre antes, y dice qué vas a compilar

Desde el 22 de agosto, `ios:appstore` y `dist:appstore` empiezan por
`node scripts/verificar-rama.mjs`, que imprime esto **antes** de que Tauri
toque nada:

```
────────────────────────────────────────────────────────────────
  Vas a compilar la versión  1.1.9
  desde la rama              main
────────────────────────────────────────────────────────────────
```

**Por qué hacía falta un script y no bastaba la regla escrita aquí.** Ese día
la versión salió mal DOS veces, y la segunda ya con la regla puesta en este
documento. El motivo es que el número de versión no aparece por ningún lado
hasta el FINAL del log de Xcode —después de compilar Rust, enlazar, firmar y
exportar—, en la línea `Setting version of project tesoreria to: 1.1.9`,
cuando ya no queda nadie leyendo. Ahora se dice al principio, cuando todavía
sirve de algo.

Aborta en dos casos, los dos en los que el .ipa no correspondería a ningún
commit del repositorio:

- **el árbol tiene cambios sin confirmar** — lo que se compila sale del disco,
  no del último commit, así que después no hay forma de reconstruir lo que se
  subió (y es justo el `Cargo.lock` a medio tocar del que avisa el recuadro de
  arriba);
- **la rama va por detrás de su remoto** — compilarías código viejo. Fue el
  fallo del primer intento: el bump estaba empujado y la Mac no lo tenía.

Y **avisa sin frenar** cuando otra rama tiene una versión más alta, con la
orden para cambiarse. Eso fue el segundo fallo, y no es un error del build:
`main` es la 1.1.9 a propósito, y la 1.2.0 espera en su rama hasta probarse,
así que compilar `main` es legítimo — solo hay que saber que es lo que estás
haciendo.

Escotilla, para cuando sabes lo que haces:

```sh
SALTAR_VERIFICAR_RAMA=1 npm run ios:appstore
```

## Antes de subir

```sh
npm run verificar-csp
npm run verificar-hooks
npm run verificar-traducciones
npm run verificar-tipografia
npm run verificar-navegacion
npm run verificar-centavos
```

`verificar-tipografia` se añadió el 24 de agosto de 2026 con "Tamaño de
texto", y **está pensada para una fusión que todavía no ha ocurrido**: la
rama de diseño `charming-sagan` se escribió ANTES de que existiera
`--fs-escala`, así que sus reglas nuevas traen `font-size` con píxeles a
pelo. Eso se fusiona sin un solo conflicto, compila sin avisos y se ve
perfecto en "Normal" — y se rompe solo en el aparato de quien eligió la
letra grande, que es justo quien menos va a saber explicarlo.

`verificar-hooks` se añadió después de que la 1.1.3 saliera con un `useState`
por debajo de la puerta de autenticación de `App.tsx`: React aborta con el
error #310 y la app se queda en blanco justo al terminar de cargar la sesión —
con sesión en la nube, que es cuando esa puerta existe. `tsc` no lo ve y el
proyecto no usa ESLint, así que nada lo cazaba.

**No distribuyas la 1.1.3.** La 1.1.4 fue la misma tanda con ese arreglo.

Las cinco pasan en verde en el commit que dejó esta nota, y también en el de
la 1.1.5 — donde además pasaron los doce `verificar-*` del proyecto y un build
con `VITE_CANAL=appstore` que confirma las dos guardas de Apple (sin
manifiesto de versiones, sin enlaces de pago).

Lo mismo en la 1.1.6 y en la 1.1.7: `tsc`, los doce `verificar-*` y el build
del canal `appstore` con sus dos guardas confirmadas. Además se comprobó que
el rediseño de iPad viajaba de verdad en el bundle (`:root.ipad`,
`md-split`, `sidebar-buscar` y `backdrop-filter` presentes en el CSS
construido) — el número de versión y el código son cosas distintas, y subir
una versión nueva con el bundle viejo es un fallo silencioso.

En la 1.1.9, lo mismo: `tsc`, los doce `verificar-*` —los seis sueltos más
los cinco del dinero que arrastra `verificar-centavos`, y `verificar-canal`
al final del build— y el build del canal `appstore` con sus dos guardas
confirmadas.

Y la comprobación del bundle **se amplió a lo que trae esta tanda**, que es
la parte que se olvida. Buscar solo `:root.ipad` y `md-split` seguiría
saliendo en verde con el trabajo nuevo fuera del bundle: esas clases ya
estaban en la 1.1.6. Así que se buscaron también, en el CSS construido,
`ipad-ancho` (la clase del modo vertical), `tabla-membresia`,
`membresia-segmentado`, `md-indice`, `md-agenda`, `ag-dia-fila`, `ds-tira`,
`da-doc`, `md-dia` y `rep-documento` —una por cada pantalla nueva—, y en el
JS la línea que pone y quita `ipad-ancho` al girar el iPad. **La lista de
clases que se comprueba se alarga con cada tanda**; si no, la comprobación
deja de comprobar lo que se acaba de escribir.

En la 1.2.0, las mismas comprobaciones y una más, porque esta versión salió
de una fusión y una fusión puede compilar perfectamente y aun así haber
perdido la mitad de una pantalla.

En la **1.2.9** —la que sube de verdad, con todo el trabajo del 24 de agosto
dentro— las mismas y con la lista de clases alargada otra vez, que
es la parte que se olvida: buscar `:root.ipad` y `md-split` habría salido en
verde con TODO el trabajo de esta tanda fuera del bundle, porque esas clases
llevan ahí desde la 1.1.6. Así que se buscó, en el bundle construido con
`VITE_CANAL=appstore`, una marca por cada pieza nueva —`dm-folio` (el folio en
el panel), `cat-conteo` (los conteos por categoría), y en el JS
"Permisos del rol Tesorería", `fijar_permisos_tesoreria`,
`tesorero_puede_eliminar` ×9, `tesorero_ve_padron` ×9, "Segunda firma",
"Recopilar firmas", `servicio_puestos` ×9 y `parentescos` ×14—. Las once
salieron, y `ipad-ancho` ×201 con ellas, que es la prueba de que el rediseño
no se perdió por el camino.

> ⚠️ **El 24 de agosto por la noche este documento MINTIÓ, y merece quedar
> escrito.** Al preparar la build de revisión de esa tanda, la tabla de arriba
> daba por subidas la 1.1.9 y toda la serie 1.2 hasta la 1.2.9, así que se
> subió el número a **1.2.10**. Iván lo corrigió: en App Store Connect lo más
> alto es la **1.2.8**, y la 1.2.9 se preparó pero nunca llegó a subir. El
> bump se deshizo entero.
>
> **La regla que falló ya estaba escrita aquí**, en la nota de la 1.2.1: *"el
> número solo avanza cuando algo sube DE VERDAD a App Store Connect"*. Lo que
> falta no es la regla, es la PRUEBA: cada fila de la tabla se escribió al
> **preparar** la build, no al confirmarla, y "preparada" y "subida" se ven
> exactamente igual desde dentro del repositorio. Ningún `verificar-*` puede
> cazarlo — el dato vive en App Store Connect, fuera del repo.
>
> Por eso la última fila ya no dice "esta" sino **"la que sube"**, y ese
> marbete solo se mueve cuando Iván confirma que subió. **Antes de tocar el
> número, pregúntale cuál es el más alto que ve en TestFlight.** No lo deduzcas
> de esta tabla.
>
> **Y funcionó a la primera.** Ese mismo día, un par de horas después, Iván
> pidió "la siguiente versión". En vez de deducirla se le preguntó, y confirmó
> que la 1.2.9 sí había subido — así que la 1.2.10 es legítima. De paso salió
> el dato que la pregunta no buscaba y que resultó ser el importante: **desde
> la 1.2.9 no había cambiado una sola línea de lo que se compila**, así que la
> 1.2.10 es el mismo .ipa con otro número. Eso también hay que decirlo antes de
> compilar, no después.
>
> **Y una tercera lección, la más incómoda: el número se gastó ANTES de que
> hubiera contenido.** La 1.2.10 se preparó diciendo con todas las letras que
> era "el mismo .ipa con otro número"… y dos horas después llegó el tamaño de
> texto. Resultado: dos compilaciones distintas que se llaman igual, y la
> única forma de distinguirlas es abrir Ajustes en el aparato.
>
> Lo que hay que hacer distinto: **el bump va AL FINAL, cuando el contenido
> está cerrado**, no cuando alguien pide "la siguiente versión". Si no hay
> trabajo nuevo, la respuesta no es subir el número: es decir que no hay nada
> que enseñar. Eso se dijo —está escrito en la fila de la 1.2.10— pero se
> subió el número igualmente, y ahí estuvo el error.
>
> **Y volvió a pasar con la 1.2.11, más grande.** Después de aquel bump
> entraron OCHO commits que tocan trece archivos de la app —el editor de la
> carta, el registro entero, la guarda de salida—, así que hay dos .ipa
> llamados "1.2.11" que no llevan lo mismo. Dos veces seguidas deja de ser un
> despiste y pasa a ser un defecto del método.
>
> **Lo que falla no es acordarse: es que nada lo impide.** El número vive en
> cinco archivos que se pueden tocar cualquier día, y nada relaciona ese número
> con "aquí se cerró el contenido". Mientras eso siga así, seguirá pasando.
>
> La salida barata, hasta que exista una guarda: **etiquetar el commit del bump**
> (`git tag v1.2.11` justo antes de compilar) y compilar SIEMPRE desde la
> etiqueta. Entonces "la 1.2.11" es un punto exacto del historial y no un rango
> difuso, y `verificar-rama` podría un día comparar HEAD contra ella.
>
> **La etiqueta hay que ponerla desde el Mac.** En la 1.2.12 se hizo por primera
> vez y ahí se descubrió el estorbo: desde el contenedor donde trabaja Claude,
> `git push origin refs/tags/...` devuelve **HTTP 403**. El permiso de la sesión
> alcanza para la rama de trabajo y no para las etiquetas (las que ya están
> arriba —`v1.0.0`, `archivo/…`— las puso Iván). Así que el paso queda así:
> Claude deja la etiqueta anotada aquí con su commit exacto, e Iván la sube
> desde su máquina antes de compilar:
> `git fetch origin && git tag -a v1.2.12 9c50c90 -m "Tamio 1.2.12" && git push origin v1.2.12`.
> La etiqueta es contabilidad, no requisito: la .ipa compila igual sin ella.

**Esta vez no hay bump que auditar, y esa es la noticia.** El número se queda
en la **1.2.9** que el repositorio ya tenía, porque esa versión nunca subió.
El bump a 1.2.10 llegó a hacerse —auditado y todo: `version = "1.2.9"` salía
**una sola vez** en `Cargo.lock`, la línea 3852 bajo `name = "tesoreria"`, y
**dos** en `package-lock.json`, las dos de Tamio, sin colisión y sin ningún
paquete en `1.2.9x`— y se deshizo entero al saber que sobraba. La auditoría
estaba bien hecha; lo que estaba mal era el dato de partida.

**Y el 1.3.0 sigue reservado** para los siete puntos de `docs/plan-1-3.md`.
> [Ya no. El 26 de agosto de 2026 la 1.3.0 pasó a ser la versión del rediseño
> —iPad e iPhone— y esos siete puntos corrieron a `docs/plan-1-4.md`.]
Esta tanda no es ninguno de ellos: es la continuación del handoff de iPad, que
es la serie 1.2.x.

En la **1.2.11** vuelve a hacer falta la comprobación de FUSIÓN, porque esta
versión también sale de juntar dos ramas — y esta vez a propósito y con el
reparto acordado: `charming-sagan` llevaba el diseño y esta el motor.

Del lado de sagan, en el CSS construido: `header-actions` ×5,
`menu-hamburguesa` ×10, `cartas-filtros` ×5, `btn-nuevo-cabecera` ×2 y
`md-cartas` ×14, más `IconSidebar` en `App.tsx`. Del lado del motor:
`dm-folio`, `cat-conteo`, `fijar_permisos_tesoreria`,
`tesorero_puede_eliminar` ×9, `folio_seq` ×5, `parentescos` ×14,
"Segunda firma" y `tamio-tamano-texto`. Y `--fs-escala` ×432, que es lo que
ahora une a las dos.

> **Dos "faltas" que no lo eran, y conviene saberlo porque el método falla
> así.** `cartas-menu-crear` salió como ausente: no era pérdida, sagan retiró
> esa clase al dejar un solo botón de crear y en su hoja ya solo vive dentro
> de un comentario. Y `header-acciones` no existía: la clase real es
> `header-actions`, en inglés — el marcador estaba inventado, no el bundle.
> Moraleja: **un marcador que "falta" se comprueba contra la rama de origen
> antes de gritar**, porque la mitad de las veces el equivocado es el
> marcador.

Y una guarda nueva que esta fusión estrenó: **`verificar-tipografia`**
encontró 21 tamaños de sagan fuera de la escala —7 en el CSS y 14 en el
`Cartas.tsx` nuevo—, **ninguno en conflicto**. Los 21 habrían entrado en
silencio y "Tamaño de texto" se habría roto justo en las dos pantallas recién
rehechas. Se construyó el día antes, para este momento exacto.

**La comprobación de la fusión: que el bundle lleve clases de LAS DOS ramas.**
El CSS construido (`index-Cb9x1AEA.css`, 279 kB frente a los 273 de la
1.1.9) tiene `ipad-ancho` ×201 y `tabla-membresia` —que solo existían en una
rama— y `dash-kpi` y `dash-dos-listas` —que solo existían en la otra—. Si
faltara cualquiera de los dos grupos, la fusión se habría comido un lado
entero sin que `tsc` dijera nada.

**Y el cruce de clases, que es lo que caza un Frankenstein:** cada clase
`.md-*`, `.dm-*`, `.da-*`, `.ds-*`, `.ag-*` y `.dash-*` que aparece en un
`.tsx` tiene que tener regla en `styles.css`, y al revés. Sin ese cruce, una
página de una rama estilada por el CSS de la otra compila igual de bien y
sale en blanco en el iPad. Salieron cinco clases sin regla —`.ag-dia`,
`.da-campos`, `.dm-cab`, `.md-movimientos`, `.tabla-membresia-ipad`— y se
comprobó una por una que **ya estaban así en las dos ramas y en el ancestro**:
son marcadores sin estilo, no algo que la fusión perdiera.

**La 1.1.6 se quedó sin distribuir**: se preparó, y antes de archivarla
apareció el número invisible de "hoy" en el calendario de la Mac. Se arregló
y se subió a la 1.1.7 en vez de distribuir una versión con un fallo
conocido. No es la 1.1.3 (aquella sí llegó a subirse rota); esta murió en la
Mac de Iván.

En la **1.2.4**, lo de siempre —`tsc`, los doce `verificar-*`, el build del
canal `appstore` con sus dos guardas— y la lista de clases del bundle alargada
con lo de esta tanda, que es lo que se olvida: `ag-barra`, `ag-seg`, `ag-hoy`,
`ag-nav` y las cuatro familias de color de la Agenda (`fam-culto`,
`fam-reunion`, `fam-fecha`, `fam-otra`), más `pf-temas`, `pf-lienzo` y
`pf-renglon` de las miniaturas de tema. Y las tres clases que este cambio
**mudó** de `:root.iphone` a `:root.movil` —`ios-choice-row`, `ios-color-dot`,
`ios-swipe`—, comprobando en el CSS construido que `movil .ios-row` sale 11
veces y `iphone .ios-row` solo 5: las cinco que se quedan a propósito
(`.ios-row-value` y `.ios-row-accion`, que solo usa el teléfono).

> ⚠️ **Ojo con buscar nombres de función en el JS construido.** El primer
> intento de comprobar el bundle buscó `matrizMesVecinos`, `enListas` y
> `TemasIPad` y salieron **cero las tres** — no porque faltaran, sino porque
> el minificador les cambia el nombre. Lo que sobrevive son las **cadenas**:
> los nombres de clase (`ag-barra` ×4, `pf-tema` ×3, `fam-` ×3,
> `settings-zona--ios-flat` ×7) y las claves de traducción
> (`agenda.vistaHistorial` ×2). Un cero en esa búsqueda no significa que el
> trabajo no viaje; significa que se buscó lo que no era.

Y las once pantallas del handoff quedan recorridas con esta versión. El
repaso pantalla por pantalla está en `docs/ipad-rediseno.md` §14–§24.

En la **1.2.9**, lo de siempre, más las clases de Depósitos (`dep-carta`,
`dep-aviso`, `dep-mov`) y el token `--relleno-ios` en el CSS; en el JS, las
claves de la revisión previa (`sinVinculoTitulo`, `corteSinMotorAyuda`,
`cuentasUsadas`). Las dos últimas son las que distinguen la pantalla nueva de
la vieja: si el bundle no las lleva, lo que viajó es el cartel de antes.

En la **1.2.8**, lo de siempre, y dos comprobaciones del bundle: en el CSS,
`--barra-inset` y `min-height:calc(56px` —el inset con nombre y la suma que
despega la raya de los botones— más `ios-field-nota`; en el JS, las tres
claves nuevas de la hoja de ficha (`iosExpediente`, `iosHistorialFila`,
`iosRegistrado`). Las tres son de la EDICIÓN: si el bundle no las lleva, lo
que viajó es la hoja de alta de siempre y el arreglo se quedó en casa.

Y una comprobación que esta tanda añade al arnés y que no es del bundle sino
del método: **`--barra-inset` existe para poder medir un `env()`**. En un
navegador de escritorio `env(safe-area-inset-top)` vale 0, así que todo lo que
dependa del inset da verde aquí y falla en el aparato — que es exactamente lo
que pasó durante diez versiones con la raya de la barra. Con el inset detrás
de una variable, la prueba le pone los 24px del iPad y mide lo que se ve allí.
Cualquier cosa nueva que dependa de la zona segura debería colgar de ese token
por el mismo motivo.

En la **1.2.7**, lo de siempre, y la lista del bundle con lo de esta tanda:
`ios-bar-button{…min-width:44px}` (el disparador que ya no se desborda),
`.ios-menu{…position:fixed}` y `ios-menu-backdrop` en el JS (el menú colgado
de `<body>`), `--brand-contrast` ×14, `agenda-cell.today{background:var(--brand)}`
y `main .content-ajustes{…flex:1}` (Configuración como pantalla partida).

En la **1.2.6**, lo de siempre. Y una comprobación que ya no es de clases
sino de **color computado**, porque es lo que esta tanda arregla: el arnés
mide la barra de vistas de la Agenda, la barrita de Informes y el índice de
zonas de Ajustes contra el gris de la barra lateral —no contra un literal—,
así que si el cromo cambia algún día la comprobación sigue valiendo. Y una
guarda que no mira la pantalla sino **el propio `styles.css`**: ninguna regla
bajo `:root.ipad` puede nombrar `--sidebar-bg`. Medir superficie por
superficie solo encuentra las que a alguien se le ocurra medir; esto encuentra
la regla en cuanto se escribe. Probada quitándola: con el token puesto de
vuelta en una regla, sale en rojo.

En la **1.2.5**, lo de siempre. Las clases nuevas comprobadas en el bundle:
`sv-puesto-asignar`, `ios-field--apagado`, `pf-seg`, `ios-field-textos` y
`ios-field-sub` —los diez controles dibujados sin motor— y en el JS sus
claves (`marcarDepositado`, `asignarEncargado`, `presentacion.titulo`,
`permisos.titulo`, `controlesTesoreria.titulo`). Más la comprobación de que **el arreglo de color**
viaja: en el CSS construido, `root.ipad .md-detalle{…;
background:var(--bg)}` —el panel con el gris del lienzo— y las **dos** reglas
de `md-agenda .md-detalle` con `--ipad-cromo`, que son la excepción. Un
arreglo de color es justo el que se puede quedar fuera del bundle sin que
nada falle, porque no rompe ninguna prueba: solo se ve.

## Cuando el build muere con 22 `TS2688` y todos los nombres acaban en " 2"

```
error TS2688: Cannot find type definition file for 'react 2'.
error TS2688: Cannot find type definition file for 'node 2'.
… 22 en total
```

**No es el código.** Es macOS: con iCloud Drive, o tras un copiar/pegar del
Finder que colisiona, el sistema duplica carpetas añadiéndoles **" 2"** al
nombre. TypeScript enumera `node_modules/@types/*` y trata **cada carpeta**
como un paquete de tipos; las copias no lo son, y cada una es un error. Que
los errores sean exactamente 22 —los 22 paquetes de `@types` del proyecto— es
la firma que lo delata.

Le pasó a Iván el 23 de agosto compilando la 1.2.6, y el build de Tauri se
paró en `beforeBuildCommand`.

**En la Mac, para salir del paso:**

```sh
ls node_modules/@types | grep ' 2$'   # confirmar que están
rm -rf node_modules && npm ci         # NO borrar package-lock.json: va versionado
```

**Y para que no vuelva:** `tsconfig.json` lleva desde ese día `"types": []`,
que apaga la inclusión automática. Es seguro porque `src` no usa ningún tipo
global —lo de React llega por `react-jsx` y todo lo demás por `import`— y está
comprobado de las dos formas: creando las carpetas duplicadas a mano, `tsc`
falla sin esa línea y pasa con ella.

Si el proyecto vive dentro de iCloud Drive (Escritorio/Documentos
sincronizados), conviene sacarlo: `node_modules` con decenas de miles de
archivos es justo lo que hace que iCloud duplique.

> ⚠️ **`npm run verificar-canal` suelto no dice nada útil.** Está pensado
> para correr al final de `npm run build`, comparando el bundle contra el
> canal que se pidió. Lanzado solo, sin `VITE_CANAL`, asume "descarga" y
> juzga con esa vara el `dist/` que haya — si el último build fue de App
> Store, "falla" sin que nada esté mal. La comprobación de verdad es
> `VITE_CANAL=appstore npm run build`, que lo corre con el canal correcto.
