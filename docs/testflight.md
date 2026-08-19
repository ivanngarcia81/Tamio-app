# Subir Tamio a TestFlight

_Escrito el 19 de agosto de 2026. La 1.1.0 se subió ese mismo día; esta nota
se quedó para la 1.1.1 y las que vengan._

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

## El número de compilación es otra cosa

`CFBundleVersion` (en el Info.plist Y en `project.yml`) **no** es la versión:
es el número de compilación, y tiene que ser **único y mayor** en cada subida
de la misma versión. Va en enteros: 2, 3, 4…

- Versión (`1.1.1`): cambia cuando cambia lo que la gente ve.
- Compilación (`1`): sube **cada vez** que se sube algo a TestFlight con la
  MISMA versión, aunque sea el mismo código con un arreglo de una línea.
  **Al cambiar la versión vuelve a empezar en 1**, porque el número solo tiene
  que ser único dentro de su versión.

Ejemplo de cómo va la cuenta:

| Subida | Versión | Compilación |
|---|---|---|
| 18 ago | 1.1.0 | 1.1.0 |
| hoy | **1.1.1** | **1** |
| un arreglo de esta misma | 1.1.1 | 2 |
| la siguiente tanda | 1.2.0 | 1 |

Si App Store Connect contesta *"The bundle version must be higher than the
previously uploaded version"*, es esto: sube `CFBundleVersion` en los dos
archivos y vuelve a compilar.

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
