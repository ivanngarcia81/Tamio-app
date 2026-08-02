// Archivos que el usuario aporta y que la app tiene que conservar:
// comprobantes, adjuntos de cartas, el logo y las firmas.
//
// Todos siguen la misma regla, y conviene que sea una sola:
//
//   1. Se COPIAN a la carpeta de datos de la app cuando el usuario los elige.
//      Si no, la app depende de un archivo del Escritorio del usuario que él
//      puede mover, renombrar o borrar sin enterarse de que rompe algo. Y desde
//      que el alcance de archivos está acotado, ni siquiera podría leerlo.
//   2. En la base se guarda la ruta RELATIVA a esa carpeta
//      (`firmas/1754…-firma.png`), nunca la absoluta. Una ruta absoluta lleva
//      dentro el nombre de usuario del Mac donde se creó
//      (`/Users/ivan/Library/…`): al restaurar un respaldo en otro equipo ese
//      usuario no existe y todo falla, aunque los archivos vengan en el
//      paquete.
//   3. La copia la hace RUST, no el plugin `fs`. `fs:scope` limita al webview,
//      no al lado Rust, así que Rust puede leer iCloud Drive, discos externos y
//      carpetas viejas que el webview ya no alcanza.

import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

/** Subcarpetas de la carpeta de datos. Son las que entran en el respaldo. */
export const CARPETA_COMPROBANTES = "comprobantes";
export const CARPETA_IMAGENES = "imagenes";

/** ¿Es una ruta absoluta? (`/Users/…`, `C:\…`). Lo que NO lo es, es relativa a
 *  la carpeta de datos. Las filas viejas guardan rutas absolutas y hay que
 *  seguir entendiéndolas siempre, aunque ya no se escriban. */
export function esAbsoluta(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/** Ruta real en disco de lo que hay guardado en la base. */
export async function rutaEnDatos(guardado: string): Promise<string> {
  if (esAbsoluta(guardado)) return guardado;
  return join(await appDataDir(), guardado);
}

/**
 * Copia el archivo elegido a la carpeta de datos y devuelve su ruta relativa.
 *
 * Si la copia falla (disco lleno, permisos, unidad desconectada) **no se
 * interrumpe nada**: se devuelve la ruta original y el guardado sigue adelante.
 * Perder el enlace a un archivo es malo; perder el asiento contable o la
 * configuración por no poder copiar un PNG sería peor.
 */
export async function guardarEnDatos(rutaOrigen: string, subcarpeta: string): Promise<string> {
  try {
    return await invoke<string>("copiar_a_datos", { origen: rutaOrigen, subcarpeta });
  } catch {
    return rutaOrigen;
  }
}

/** ¿Sigue existiendo el archivo? Lo pregunta Rust, no el plugin `fs`: el
 *  `exists()` del plugin da falso sobre cualquier ruta fuera del alcance del
 *  webview, y "no lo puedo leer" no es lo mismo que "ya no está". */
export async function existeArchivo(rutaAbsoluta: string): Promise<boolean> {
  try {
    return await invoke<boolean>("comprobante_existe", { ruta: rutaAbsoluta });
  } catch {
    return false;
  }
}
