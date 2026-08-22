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
| esta | **1.2.2** — Cartas: crear vive SOLO en el "+"; "Nueva carta" deja de ser una sección del índice (lo circuló Iván probando en su iPad) |
| la siguiente | 1.2.3 |

> Para compilar la 1.2.0 hubo que intentarlo **tres veces**, y las tres salió
> la 1.1.9: dos por estar en la rama equivocada y una por `main`, que es la
> 1.1.9 a propósito. De ahí salió `verificar-rama`, que ya iba dentro de este
> mismo build y cantó `1.2.0` antes de empezar. Es lo que había que ver.
| cuando toque el plan de `docs/plan-1-3.md` | 1.3.0 |

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
> agosto— corrió un puesto y vive ahora en **`docs/plan-1-3.md`**.

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
npm run verificar-navegacion
npm run verificar-centavos
```

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

> ⚠️ **`npm run verificar-canal` suelto no dice nada útil.** Está pensado
> para correr al final de `npm run build`, comparando el bundle contra el
> canal que se pidió. Lanzado solo, sin `VITE_CANAL`, asume "descarga" y
> juzga con esa vara el `dist/` que haya — si el último build fue de App
> Store, "falla" sin que nada esté mal. La comprobación de verdad es
> `VITE_CANAL=appstore npm run build`, que lo corre con el canal correcto.
