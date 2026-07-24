// Comprime una imagen a un cuadrado pequeño (JPEG) apto para guardarse como
// data URL en el perfil del usuario en Supabase. 160×160 a calidad 0.82 deja
// el data URL en ~10–20 KB: más que suficiente para un avatar y muy por debajo
// de cualquier límite de fila, así que no hace falta un bucket de Storage.

const LADO = 160;

function mimeDeRuta(ruta: string): string {
  const ext = ruta.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/** Recorta al centro (cover) y reescala a un cuadrado; devuelve un data URL JPEG. */
export function comprimirAvatar(bytes: Uint8Array, ruta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeDeRuta(ruta) });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = LADO;
      canvas.height = LADO;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen."));
        return;
      }
      const lado = Math.min(img.width, img.height);
      const sx = (img.width - lado) / 2;
      const sy = (img.height - lado) / 2;
      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("El archivo no es una imagen válida."));
    };
    img.src = url;
  });
}

/** Iniciales para el avatar cuando el usuario no tiene foto. */
export function iniciales(nombre: string | null, email: string | null): string {
  const base = (nombre && nombre.trim()) || (email ? email.split("@")[0] : "");
  const partes = base.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
