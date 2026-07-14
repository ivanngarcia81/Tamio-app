import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, mkdir, remove } from "@tauri-apps/plugin-fs";
import { slug } from "../print/printUtils";

/** Los adjuntos se copian a la carpeta de datos de la app (mismo patrón que
 *  el logo y las firmas): sobreviven respaldos y no dependen del webview. */
export async function guardarAdjunto(
  rutaOrigen: string,
  folio: string
): Promise<{ path: string; nombre: string; fecha: string }> {
  const dir = await appDataDir();
  const carpeta = await join(dir, "adjuntos");
  await mkdir(carpeta, { recursive: true });
  const nombreOriginal = rutaOrigen.split(/[\\/]/).pop() ?? "adjunto";
  const ext = nombreOriginal.includes(".") ? nombreOriginal.split(".").pop() : "bin";
  const destino = await join(carpeta, `${slug(folio)}-${Date.now()}.${ext}`);
  await copyFile(rutaOrigen, destino);
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return {
    path: destino,
    nombre: nombreOriginal,
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
  };
}

export async function eliminarAdjunto(path: string): Promise<void> {
  try {
    await remove(path);
  } catch {
    // El archivo pudo haberse movido o borrado a mano; no es un error fatal.
  }
}
