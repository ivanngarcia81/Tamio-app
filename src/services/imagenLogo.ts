// Convierte cualquier imagen elegida (JPG, HEIC, WEBP, PNG…) a bytes PNG, para
// que el logo y la firma no dependan de que el usuario tenga ya un archivo PNG.
// En iPhone/iPad las fotos casi nunca son PNG (son HEIC/JPG), así que sin esta
// conversión el selector de PNG no dejaba elegir nada.

const MAX_LADO = 800; // suficiente para un logo/firma en el PDF; evita archivos enormes

function mimeDeRuta(ruta: string): string {
  const ext = ruta.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

/** Reescala conservando la proporción (lado mayor ≤ MAX_LADO) y devuelve los
 *  bytes en formato PNG, listos para escribir a disco. */
export function convertirImagenAPng(bytes: Uint8Array, ruta: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeDeRuta(ruta) });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width === 0 || img.height === 0) {
        reject(new Error("La imagen no es válida."));
        return;
      }
      const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
      const width = Math.round(img.width * escala);
      const height = Math.round(img.height * escala);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((out) => {
        if (!out) {
          reject(new Error("No se pudo convertir la imagen."));
          return;
        }
        out.arrayBuffer()
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(() => reject(new Error("No se pudo leer la imagen convertida.")));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("El archivo no es una imagen válida."));
    };
    img.src = url;
  });
}
