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
> que `flate2` es la 1.2.0, que no existe. Van ya dos de cuatro bumps en los
> que la colisión aparece: no es rara, es lo normal en un árbol de 400
> dependencias.

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
| 22 ago | 1.1.9 — Membresía en iPad, las seis pantallas que faltaban y el modo vertical |
| esta | **1.2.0** — el mismo código que la 1.1.9, con el número que le toca |
| la siguiente | 1.2.1 |
| cuando toque el plan de `docs/plan-1-3.md` | 1.3.0 |

> **La 1.2.0 no trae ni una línea de código que la 1.1.9 no tuviera**, y eso
> es a propósito. El rediseño de iPad —las diez pantallas, el modo vertical,
> Membresía— se subió como 1.1.9 porque era el número que tocaba en la
> cuenta, pero es un cambio de versión menor, no un parche. La 1.2.0 es ese
> mismo build con el nombre que le corresponde, para probarlo en TestFlight
> ya llamándose como se va a llamar. En App Store Connect son dos subidas
> distintas: por eso hace falta el bump, aunque el diff sea solo el número.
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

En la 1.2.0, las mismas comprobaciones otra vez —no se dan por hechas porque
el diff sea de una línea— y una que solo cabe cuando el código no cambia: el
CSS construido salió con **el mismo nombre con hash que el de la 1.1.9**
(`index-CWJz2wN4.css`). Vite pone en ese nombre un hash del contenido, así
que dos builds con el mismo hash son el mismo bundle. Es la prueba de que la
1.2.0 es de verdad la 1.1.9 con otro número, que era justo lo que se quería.

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
