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

Ese archivo vive en el **repo `Tamio-web`**, no en este repositorio. Se puede
cambiar la URL con la variable de entorno `VITE_UPDATE_URL` al compilar, si algún
día mueves el archivo.

> 🔴 **Corrección (1 ago 2026).** Esta guía decía antes que era el `web/version.json`
> **de este repo**. Es falso: `web/` aquí no lo lee nadie y editarlo no tiene ningún
> efecto. El único archivo que la app consulta es el del repo `Tamio-web`
> (ver `src/services/update.ts:16`).

> 🚨 **ANTES DE PUBLICAR CUALQUIER ACTUALIZACIÓN.** El `<UpdateBanner />` se
> renderiza **sin condición de plataforma** (`src/App.tsx`), así que también corre
> en iPhone y iPad. El día que subas la versión de ese `version.json`, los usuarios
> de **iOS** verán un botón que abre un **`.dmg` de Mac** — prohibido por Apple
> (directrices 3.1.1 / 2.5.2). **Hay que ocultar el banner en iOS primero.**
> Detalle en [`ideas-futuras.md`](./ideas-futuras.md) → "BLOQUEANTE antes de
> publicar cualquier actualización".

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

## Botones de descarga de la web (una sola línea)

Los botones "Descargar para Mac" de `web/index.html` y `web/en.html` leen el
enlace del `.dmg` de una **sola constante** al final del archivo:

```js
var TAMIO_DMG = "https://github.com/ivanngarcia81/tesoreria-Mac-/releases/latest/download/Tamio_universal.dmg";
var TAMIO_DMG_LISTO = false; // ← pon true cuando ya exista el primer release
```

- Mientras `TAMIO_DMG_LISTO = false`, los botones llevan a la sección de descarga
  (fallback), para no dar un enlace roto antes de publicar.
- La URL usa el patrón **`releases/latest/download/`** de GitHub: si subes el
  `.dmg` a *Releases* con el nombre exacto `Tamio_universal.dmg`, ese enlace
  apunta siempre a la última versión y **no hay que cambiarlo nunca más**.

## El primer lanzamiento

1. Firma el `.dmg` (`npm run firmar:manual`).
2. Crea un *Release* en GitHub y sube el `.dmg` con el nombre `Tamio_universal.dmg`.
3. En `web/index.html` y `web/en.html` pon `TAMIO_DMG_LISTO = true`.
4. Publica la web (`Tamio-web`).

## Qué hacer al lanzar una versión NUEVA (después del primero)

1. Sube la versión en `src-tauri/tauri.conf.json` y `package.json` (p. ej.
   `1.0.0` → `1.1.0`).
2. Firma el `.dmg` (`npm run firmar:manual`).
3. Crea un *Release* nuevo con el `.dmg` (mismo nombre `Tamio_universal.dmg`).
   Los botones de la web ya no se tocan (el enlace "latest" se actualiza solo).
4. **(Bloqueado hasta arreglar el banner en iOS — ver el aviso de arriba.)**
   Edita el `version.json` **del repo `Tamio-web`**: pon la nueva `version` (y
   `notas` si quieres). La `url` ya apunta al "latest", así que normalmente no
   cambia. Publica la web.

Con eso, todos los que ya tienen Tamio verán el aviso la próxima vez que abran la
app.

## Más adelante (Opción B)

Auto-actualización real (la app se actualiza sola con un clic) usando el
actualizador de Tauri (`@tauri-apps/plugin-updater`). Requiere una segunda llave
de firma (propia de Tauri, aparte de la de Apple) y publicar los artefactos con
su manifiesto. Es más setup; se hace cuando el producto lo amerite.
