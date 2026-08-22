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
| 22 ago | **1.1.9** — el rediseño completo: las diez pantallas, Inicio, Configuración y los formularios como hoja. La PRIMERA con el rediseño que llegó a TestFlight. **En pruebas, NO candidata a publicación** |
| la siguiente | 1.1.10 |
| cuando toque la 1.2 del plan | 1.2.0 |

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
