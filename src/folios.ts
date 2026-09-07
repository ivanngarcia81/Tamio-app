/**
 * El folio de un documento que se firma.
 *
 * **El número lo da el servidor.** Cartas y actas lo calculaban aquí —`max + 1`
 * o, peor, `count(*)` de las del año— y eso repite folio en cuanto hay dos
 * aparatos sin sincronizar, o en cuanto se borra una. No es teoría: en la base
 * de la iglesia hay CUATRO actas con el folio ACTA-2026-001.
 *
 * El contador de Postgres entrega el siguiente y lo reserva en un solo
 * statement (`siguiente_folio_anual`, migración 20260907), que es lo que hace
 * imposible que dos llamadas simultáneas reciban el mismo número. Es el mismo
 * mecanismo que usan los movimientos desde el 3 de septiembre.
 *
 * **Sin red se cuenta en local, como antes.** Un documento no puede quedarse
 * sin poder crearse porque el wifi se cayó; y para ese caso ya existe
 * `repararFoliosDuplicados`, que renumera al sincronizar. Lo que cambia es que
 * el caso normal —con red— deja de poder repetir.
 */
import { supabase } from "./supabase";

export type SerieAnual = "carta" | "acta" | "traslado_salida" | "traslado_entrada" | "solicitud";

/** El uuid de la iglesia de quien está dentro. `null` sin sesión o sin red. */
async function churchIdRemoto(): Promise<string | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const authId = userData.user?.id;
  if (!authId) return null;
  const { data } = await supabase
    .from("perfiles")
    .select("church_id")
    .eq("id", authId)
    .single();
  return (data as { church_id?: string } | null)?.church_id ?? null;
}

/**
 * Reserva el siguiente número de una serie y un año. Devuelve `null` cuando no
 * se pudo —sin sesión, sin red, o el servidor dijo que no—, y entonces quien
 * llama cuenta en local como toda la vida.
 *
 * **Nunca lanza.** Que el contador no conteste no puede impedir emitir un
 * documento; el número se arregla al sincronizar.
 */
export async function siguienteSeq(serie: SerieAnual, anio: string): Promise<number | null> {
  try {
    if (!supabase) return null;
    const churchId = await churchIdRemoto();
    if (!churchId) return null;
    const { data, error } = await supabase.rpc("siguiente_folio_anual", {
      p_church_id: churchId,
      p_serie: serie,
      p_anio: Number(anio),
    });
    if (error || typeof data !== "number") return null;
    return data;
  } catch {
    return null;
  }
}
