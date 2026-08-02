// El logo y las dos firmas: mismo problema que tenían los comprobantes.
//
// - Las **firmas** guardaban la ruta del PNG que el usuario eligió en su
//   Escritorio. Bastaba con que moviera ese archivo para que todos los
//   documentos oficiales salieran sin firmar, y sin ningún aviso. Además nunca
//   entraban en el respaldo, así que restaurar en otra Mac dejaba la tesorería
//   emitiendo constancias y estados financieros sin firma.
// - El **logo** sí se copiaba dentro de la app, pero se guardaba con ruta
//   absoluta (`/Users/ivan/Library/…`). Al restaurar en otro equipo ese usuario
//   no existe y el logo desaparecía de la barra lateral y de todos los PDF.
//
// Los dos pasan a ser rutas relativas a la carpeta de datos, en `imagenes/`.

import { getDb } from "../db";
import { CARPETA_IMAGENES, esAbsoluta, guardarEnDatos } from "./archivos";

const COLUMNAS = ["logo_path", "tesorero_firma_path", "pastor_firma_path"] as const;

export interface MigracionImagenes {
  /** Estaban fuera de la app y se copiaron adentro. */
  copiados: number;
  /** Ya estaban adentro pero con ruta absoluta; solo se reescribió la ruta. */
  normalizados: number;
  /** No se pudieron recuperar: el archivo ya no está donde se eligió. */
  perdidos: number;
}

/**
 * Trae adentro el logo y las firmas de instalaciones anteriores.
 *
 * Con datos ya sanos cuesta una consulta y no hace nada, así que puede correr
 * en cada arranque sin marcador de "ya migrado".
 *
 * No toca `updated_at`: una ruta relativa ya vale en cualquier equipo, pero el
 * momento de la migración es asunto local y no un cambio del usuario.
 */
export async function migrarImagenesIglesia(churchId: number): Promise<MigracionImagenes> {
  const d = await getDb();
  let copiados = 0;
  let normalizados = 0;
  let perdidos = 0;

  const filas = await d.select<Record<string, string | null>[]>(
    `SELECT logo_path, tesorero_firma_path, pastor_firma_path FROM churches WHERE id = $1`,
    [churchId]
  );
  const fila = filas[0];
  if (!fila) return { copiados, normalizados, perdidos };

  for (const columna of COLUMNAS) {
    const guardado = fila[columna];
    if (!guardado || !esAbsoluta(guardado)) continue;

    const nueva = await guardarEnDatos(guardado, CARPETA_IMAGENES);
    if (nueva === guardado) { perdidos++; continue; } // no se pudo copiar
    await d.execute(
      `UPDATE churches SET ${columna} = $1 WHERE id = $2`,
      [nueva, churchId]
    );
    // Si ya estaba dentro de la carpeta de la app, Rust devuelve su forma
    // relativa sin duplicar el archivo: eso es normalizar, no copiar.
    if (nueva.startsWith(`${CARPETA_IMAGENES}/`)) copiados++;
    else normalizados++;
  }
  return { copiados, normalizados, perdidos };
}
