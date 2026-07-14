import { getUmbralesJson, saveUmbralesJson } from "../../db";

/** Umbrales del módulo Informes de membresía. Un solo lugar de verdad;
 *  editables desde la tarjeta "Configuración de umbrales" del módulo y
 *  persistidos en SQLite (churches.umbrales_informes). */
export interface Umbrales {
  /** Alerta: sin asistir por N servicios seguidos. */
  rachaServicios: number;
  /** Ausencias frecuentes: asistencia menor a este % en el periodo. */
  ausenciasFrecuentesPct: number;
  /** "No ha asistido recientemente": sin asistencia en X días… */
  recienteDias: number;
  /** …o en los últimos N servicios (lo que ocurra primero). */
  recienteServicios: number;
  /** Tamaño del top de mejor asistencia. */
  topAsistencia: number;
  /** Miembro nuevo: por fecha "recibido como miembro" (false) o por
   *  fecha "comenzó a congregarse" (true). */
  nuevoPorCongregacion: boolean;
}

export const UMBRALES_DEFAULT: Umbrales = {
  rachaServicios: 3,
  ausenciasFrecuentesPct: 50,
  recienteDias: 30,
  recienteServicios: 3,
  topAsistencia: 10,
  nuevoPorCongregacion: false,
};

/** Lectura tolerante: valores faltantes o corruptos caen al default. */
export function parseUmbrales(json: string | null): Umbrales {
  if (!json) return { ...UMBRALES_DEFAULT };
  try {
    const v = JSON.parse(json) as Partial<Umbrales>;
    return {
      rachaServicios: numeroValido(v.rachaServicios, UMBRALES_DEFAULT.rachaServicios),
      ausenciasFrecuentesPct: numeroValido(v.ausenciasFrecuentesPct, UMBRALES_DEFAULT.ausenciasFrecuentesPct),
      recienteDias: numeroValido(v.recienteDias, UMBRALES_DEFAULT.recienteDias),
      recienteServicios: numeroValido(v.recienteServicios, UMBRALES_DEFAULT.recienteServicios),
      topAsistencia: numeroValido(v.topAsistencia, UMBRALES_DEFAULT.topAsistencia),
      nuevoPorCongregacion: Boolean(v.nuevoPorCongregacion),
    };
  } catch {
    return { ...UMBRALES_DEFAULT };
  }
}

function numeroValido(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : def;
}

export async function cargarUmbrales(churchId: number): Promise<Umbrales> {
  return parseUmbrales(await getUmbralesJson(churchId));
}

export async function guardarUmbrales(churchId: number, u: Umbrales): Promise<void> {
  await saveUmbralesJson(churchId, JSON.stringify(u));
}
