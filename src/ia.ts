// Cliente de IA para Tamio.
//
// La clave de Anthropic NUNCA vive en la app. La app llama a una función de
// Supabase (Edge Function `redactar-ia`) que guarda la clave del lado del
// servidor y habla con Claude. Aquí solo se invoca esa función.
//
// Toda la IA está detrás de una bandera (`VITE_IA_HABILITADA`) para que quede
// oculta hasta que la función esté desplegada y la clave configurada.

import { supabase } from "./supabase";

/** true solo cuando la IA está habilitada por variable de entorno y hay
 *  conexión a Supabase (donde vive la función que la ejecuta). */
export const iaHabilitada =
  Boolean(supabase) && import.meta.env.VITE_IA_HABILITADA === "1";

export interface DatosCartaIA {
  /** Tipo de documento (recomendacion, certificacion, …). */
  tipo: string;
  /** Viñetas / puntos que el usuario quiere que la carta incluya. */
  puntos: string;
  /** Nombre de la iglesia (contexto, no dinero). */
  iglesia: string;
  /** Nombre del destinatario/miembro, si aplica. */
  destinatario?: string;
  /** Nombre del pastor, para el tono/cierre. */
  pastor?: string;
  /** Idioma de salida: "es" | "en". */
  idioma: string;
}

/** Invoca la función redactar-ia y devuelve el campo pedido, con errores
 *  legibles (extrae el detalle real de la respuesta, no solo "non-2xx"). */
async function invocarIA(body: Record<string, unknown>, campo: "html" | "texto"): Promise<string> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.functions.invoke("redactar-ia", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const cuerpo = await ctx.json().catch(() => null) as { error?: string; detalle?: string } | null;
      if (cuerpo?.error) {
        throw new Error(cuerpo.detalle ? `${cuerpo.error} — ${cuerpo.detalle}` : cuerpo.error);
      }
    }
    throw error;
  }
  const valor = (data as Record<string, string> | null)?.[campo];
  if (!valor) throw new Error("La IA no devolvió contenido.");
  return valor;
}

/** Pide a la IA el cuerpo de una carta en HTML simple (<p>…</p>). */
export async function redactarCarta(datos: DatosCartaIA): Promise<string> {
  return invocarIA({ ...datos }, "html");
}

/** Redacta el desarrollo de un acta (texto plano) a partir de los puntos
 *  tratados en la reunión. */
export async function redactarActa(datos: {
  puntos: string;
  titulo?: string;
  iglesia: string;
  idioma: string;
}): Promise<string> {
  return invocarIA({ modo: "acta", ...datos }, "texto");
}

/** Narra en lenguaje natural las cifras YA CALCULADAS por la app (regla de
 *  oro: la app calcula, la IA explica — nunca inventa números). */
export async function resumirReporte(datos: { datos: string; idioma: string }): Promise<string> {
  return invocarIA({ modo: "resumen", ...datos }, "texto");
}
