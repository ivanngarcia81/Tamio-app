import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import i18n from "../i18n";

/**
 * Entrega de archivos generados (PDF, CSV, respaldos) según la plataforma:
 *
 *  - Escritorio: diálogo "Guardar como…" + escritura directa (como siempre).
 *  - iPad/iPhone: hoja de compartir nativa (Web Share API) — Archivos,
 *    AirDrop, Mail e Imprimir. En iOS no existe "guardar en una carpeta";
 *    la hoja ES la manera correcta de sacar un documento de una app.
 *
 * Punto único: cualquier exportación nueva debe pasar por aquí para que
 * funcione en las dos plataformas sin pensarlo.
 */

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  db: "application/octet-stream",
  html: "text/html",
};

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** true en iPad/iPhone (la clase la pone main.tsx al detectar iOS). */
export function esMovil(): boolean {
  return document.documentElement.classList.contains("movil");
}

/** Entrega el archivo al usuario. true = entregado, false = canceló. */
export async function entregarArchivo(bytes: Uint8Array, fileName: string): Promise<boolean> {
  if (!esMovil()) {
    const ext = extension(fileName);
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: ext.toUpperCase() || "Archivo", extensions: [ext || "*"] }],
    });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }

  const file = new File([bytes as unknown as BlobPart], fileName, {
    type: MIME[extension(fileName)] ?? "application/octet-stream",
  });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title: fileName });
      return true;
    } catch (e) {
      // Cerrar la hoja sin elegir destino no es un error.
      if ((e as DOMException)?.name === "AbortError") return false;
      throw e;
    }
  }
  throw new Error(i18n.t("common.compartirNoDisponible"));
}
