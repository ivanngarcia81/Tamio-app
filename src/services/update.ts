// Comprobación de versión (Opción A): la app pregunta a un archivo público
// `version.json` cuál es la última versión disponible y, si es más nueva que la
// instalada, muestra un aviso para descargarla. No auto-instala nada: solo abre
// la página/enlace de descarga; el usuario baja el .dmg nuevo.
//
// El `version.json` lo publicas tú (en la web de Tamio) con esta forma:
//   { "version": "1.1.0", "url": "https://…/Tamio.dmg", "notas": "opcional" }
// Cada vez que lances una versión, actualizas ese número y ese enlace.

import { getVersion } from "@tauri-apps/api/app";
import { esMovil } from "../movil";

/** URL del manifiesto de versión. Se puede sobreescribir con VITE_UPDATE_URL;
 *  por defecto apunta al version.json publicado junto a la web de Tamio. */
const UPDATE_URL =
  import.meta.env.VITE_UPDATE_URL ||
  "https://ivanngarcia81.github.io/Tamio-web/version.json";

export interface ActualizacionDisponible {
  /** Versión nueva publicada (p. ej. "1.1.0"). */
  version: string;
  /** A dónde mandar al usuario para descargarla. */
  url: string;
  /** Nota opcional (qué trae la versión). */
  notas?: string;
}

/** Compara dos versiones "x.y.z". Devuelve true si `a` es MÁS NUEVA que `b`. */
function esMasNueva(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
}

/** Consulta el manifiesto y devuelve la actualización si hay una más nueva que
 *  la versión instalada. Nunca lanza: ante cualquier fallo (sin internet, JSON
 *  inválido, etc.) devuelve null y la app sigue igual. */
export async function buscarActualizacion(): Promise<ActualizacionDisponible | null> {
  // En iPad/iPhone esto no debe existir. Las actualizaciones las entrega la
  // App Store, y una app de la App Store no puede mandar al usuario a bajarse
  // software por su cuenta (regla 2.5.2 de Apple): el aviso ofrecería un .dmg
  // de Mac que en iOS ni siquiera se puede abrir. Se corta aquí, antes de la
  // petición, para no consultar siquiera el manifiesto desde el teléfono.
  if (esMovil()) return null;
  try {
    const actual = await getVersion();
    // Cache-buster para no quedarnos con una copia vieja del CDN.
    const resp = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Partial<ActualizacionDisponible>;
    if (!data.version || !data.url) return null;
    if (!esMasNueva(data.version, actual)) return null;
    return { version: data.version, url: data.url, notas: data.notas };
  } catch {
    return null;
  }
}
