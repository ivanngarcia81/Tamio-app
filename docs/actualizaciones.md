# Aviso de versión nueva (Opción A)

Cómo avisarle al usuario, dentro de la app, que salió una versión nueva.

## Cómo funciona

- La app, al abrir (a los ~2.5 s), consulta un archivo público `version.json` y
  compara la versión de ahí con la que tiene instalada (la de
  `src-tauri/tauri.conf.json` → `version`).
- Si la del `version.json` es **más nueva**, muestra un banner verde arriba:
  *"Hay una versión nueva de Tamio (x.y.z) — Descargar"*.
- El botón **Descargar** abre el enlace `url` del `version.json` en el navegador
  (la página de descarga o el `.dmg` directo). La app **no se auto-instala**: el
  usuario baja el `.dmg` nuevo y reemplaza la app (arrastra a Aplicaciones).
- **Ahora no** (la ✕) descarta ESA versión; no vuelve a molestar con la misma,
  pero reaparece cuando publiques una posterior.
- Si no hay internet o el archivo falla, no pasa nada: la app sigue igual.

## Dónde vive el `version.json`

Por defecto la app lo busca en:

    https://ivanngarcia81.github.io/Tamio-web/version.json

Es el archivo `web/version.json` de este repo, que se publica junto a la web en
GitHub Pages (repo `Tamio-web`). Se puede cambiar la URL con la variable de
entorno `VITE_UPDATE_URL` al compilar, si algún día mueves el archivo.

Forma del archivo:

```json
{
  "version": "1.1.0",
  "url": "https://.../Tamio-1.1.0.dmg",
  "notas": "Correcciones y mejoras de rendimiento"
}
```

- `version`: la última versión disponible (debe coincidir con la que pusiste en
  `tauri.conf.json` al compilar ese `.dmg`).
- `url`: a dónde mandar al usuario (el `.dmg` directo, o la sección de descarga
  de la web).
- `notas`: opcional, una línea de qué trae la versión.

## Qué hacer al lanzar una versión nueva

1. Sube la versión en `src-tauri/tauri.conf.json` y `package.json` (p. ej.
   `1.0.0` → `1.1.0`).
2. Firma el `.dmg` en la Mac del certificado (`npm run firmar:manual`).
3. Sube el `.dmg` nuevo a donde lo distribuyes (GitHub Releases o Storage).
4. Edita `web/version.json`: pon la nueva `version` y la nueva `url`, y publícalo
   en la web (`Tamio-web`).

Con eso, todos los que ya tienen Tamio verán el aviso la próxima vez que abran la
app.

## Más adelante (Opción B)

Auto-actualización real (la app se actualiza sola con un clic) usando el
actualizador de Tauri (`@tauri-apps/plugin-updater`). Requiere una segunda llave
de firma (propia de Tauri, aparte de la de Apple) y publicar los artefactos con
su manifiesto. Es más setup; se hace cuando el producto lo amerite.
