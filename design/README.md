# design/

El **maestro a 1024** del icono de Tamio: el libro abierto con la plumilla
dorada sobre verde, que es la marca de la app desde el 25 de julio de 2026.

`tamio-icon-source-1024.png` sale del icono de App Store
(`src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`),
que es el tamaño mayor que existe en el repo: 1024×1024, RGB sin alfa, con
las esquinas ya redondeadas. Sirve para mirarlo y para partir de él; si algún
día se rehace el icono de verdad, el vectorial no vive aquí.

**Esta carpeta no la usa nada** — ni el código, ni el build, ni Tauri. Los
iconos que de verdad se instalan están en:

- `src-tauri/icons/` — Mac (`icon.icns`), Windows (`icon.ico`) y los PNG que
  declara `tauri.conf.json`
- `src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/` — iPhone y iPad
- `src/assets/tamio-icon.png` — la marca DENTRO de la app (login, bienvenida,
  sidebar); es copia exacta de `src-tauri/icons/128x128@2x.png`

> Aquí vivió hasta el 22 de agosto de 2026 un archivo con el logo ANTERIOR
> —la "T" con barras de crecimiento, del 16 de julio— que se quedó cuando el
> icono cambió. Sobrevivió un mes fingiendo ser el logo oficial y llegó a
> confundir a quien vino a comprobarlo. De ahí este README: una carpeta que
> guarda un maestro tiene que decir de qué es maestro.
