# Subir Tamio a TestFlight

_Escrito el 19 de agosto de 2026, después de que la versión se escapara dos
veces. La 1.1.0 y la 1.1.1 ya están subidas._

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
| esta | **1.1.2** |
| la siguiente | 1.1.3 |
| cuando toque la 1.2 del plan | 1.2.0 |

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
npm run verificar-traducciones
npm run verificar-navegacion
npm run verificar-centavos
```

Las cuatro pasan en verde en el commit que dejó esta nota.
