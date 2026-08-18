import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import i18n from "../i18n";
import { esMovil } from "../movil";

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

/** true en iPad/iPhone. Se reexporta desde aquí porque varias rutas de
 *  exportación ya lo importaban de este módulo. */
export { esMovil };

/** Hoja de compartir nativa de iOS (Archivos, AirDrop, Mail, Imprimir). */
async function compartirMovil(bytes: Uint8Array, fileName: string): Promise<boolean> {
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

  // PDFs en iPad/iPhone: primero se VE el documento en el visor de la app
  // (en iOS no hay Vista Previa); su botón Compartir abre la hoja nativa.
  //
  // Si el visor no carga, NO se cancela la entrega: se cae a la hoja de
  // compartir, que es de donde iOS ya sabe previsualizar, imprimir y guardar
  // en Archivos. Antes cualquier fallo aquí dejaba al usuario con un aviso
  // de error y sin PDF, teniendo a mano un camino que sí funciona.
  //
  // El visor arrastra `pdfjs-dist`, que pide iOS bastante reciente
  // (`Promise.withResolvers` es de iOS 17.4; los bloques `static {}`, de
  // Safari 16.4). En un iPhone más viejo el módulo ni siquiera parsea y
  // Safari lo reporta como "Importing a module script failed".
  if (extension(fileName) === "pdf") {
    try {
      const { mostrarPdf } = await import("./visorPdf");
      mostrarPdf(bytes, fileName, async () => { await compartirMovil(bytes, fileName); });
      return true;
    } catch (e) {
      console.warn("El visor de PDF no cargó; se comparte directo:", e);
    }
  }

  return compartirMovil(bytes, fileName);
}
