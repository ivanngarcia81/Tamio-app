# Subir Tamio a TestFlight

_Escrito el 19 de agosto de 2026, con la 1.1.0 lista para su primera subida._

## Los cuatro sitios que llevan la versión

Tienen que decir lo mismo. **El bump a la 1.1.0 se dejó uno fuera** —
`project.yml` se quedó en 1.0.8, una versión ya publicada que App Store
Connect rechaza de plano — así que aquí quedan los cuatro anotados:

| Archivo | Clave | Qué es |
|---|---|---|
| `package.json` | `version` | La del proyecto |
| `src-tauri/tauri.conf.json` | `version` | La que Tauri pone en el bundle |
| `src-tauri/gen/apple/tesoreria_iOS/Info.plist` | `CFBundleShortVersionString` | La que ve el usuario |
| `src-tauri/gen/apple/project.yml` | `CFBundleShortVersionString` | La entrada de XcodeGen: **si el proyecto se regenera, de aquí sale el Info.plist** |

## El número de compilación es otra cosa

`CFBundleVersion` (en el Info.plist Y en `project.yml`) **no** es la versión:
es el número de compilación, y tiene que ser **único y mayor** en cada subida
de la misma versión. Va en enteros: 2, 3, 4…

- Versión (`1.1.0`): cambia cuando cambia lo que la gente ve.
- Compilación (`2`): sube **cada vez** que se sube algo a TestFlight, aunque
  sea el mismo código con un arreglo de una línea.

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
