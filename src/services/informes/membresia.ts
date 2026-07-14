import type { AsistenciaLigera, Member, ServicioLigero, TrasladoEntrada, TrasladoSalida } from "../../db";
import { estadoDeBaja } from "../../db";
import type { Umbrales } from "./umbrales";

/** Periodo seleccionado (fechas ISO YYYY-MM-DD inclusive; null = sin límite). */
export interface Periodo {
  desde: string | null;
  hasta: string | null;
}

export const PERIODO_TODO: Periodo = { desde: null, hasta: null };

export function enPeriodo(fecha: string | null, p: Periodo): boolean {
  if (!fecha) return false;
  if (p.desde && fecha < p.desde) return false;
  if (p.hasta && fecha > p.hasta) return false;
  return true;
}

// ---------- Estado efectivo ----------

export type EstadoEfectivo =
  | "activo" | "inactivo" | "visitante" | "enProceso"
  | "trasladado" | "retirado" | "fallecido" | "baja";

const ESTADOS_REGISTRO = ["activo", "inactivo", "visitante", "enProceso"];

/** Estado guardado del miembro (nunca derivado de asistencia). */
export function estadoEfectivo(m: Member): EstadoEfectivo {
  if (m.activo === 1) {
    return (ESTADOS_REGISTRO.includes(m.estado_membresia) ? m.estado_membresia : "activo") as EstadoEfectivo;
  }
  return estadoDeBaja(m.motivo_baja) as EstadoEfectivo;
}

// ---------- Expediente incompleto ----------

/** Campos requeridos que faltan (vacío = expediente completo).
 *  Requeridos: nombre, fecha en que comenzó a congregarse, contacto
 *  (correo O teléfono) y fecha de membresía solo cuando el estado implica
 *  membresía formal (activo/inactivo). Los opcionales nunca marcan. */
export function camposFaltantes(m: Member): string[] {
  const faltan: string[] = [];
  if (!m.nombre.trim()) faltan.push("nombre");
  if (!m.fecha_congregacion) faltan.push("fechaCongregacion");
  if (!(m.email ?? "").trim() && !(m.telefono ?? "").trim()) faltan.push("contacto");
  const estado = estadoEfectivo(m);
  if ((estado === "activo" || estado === "inactivo") && !m.fecha_ingreso) faltan.push("fechaIngreso");
  return faltan;
}

// ---------- Miembro nuevo ----------

export function esNuevoEnPeriodo(m: Member, p: Periodo, u: Umbrales): boolean {
  const fecha = u.nuevoPorCongregacion ? m.fecha_congregacion : m.fecha_ingreso;
  return enPeriodo(fecha, p);
}

// ---------- Asistencia por miembro ----------

export interface AsistenciaMiembro {
  asistidos: number;
  ausentes: number;
  enRoster: number;
  /** 0–100; null si no estuvo en ningún roster del periodo. */
  pct: number | null;
  ultimaAsistencia: string | null;
  /** Ausencias consecutivas hasta su servicio más reciente (global). */
  racha: number;
}

/** Calcula la asistencia de TODOS los miembros en una sola pasada.
 *  `asistencia` debe venir ordenada por fecha DESC (como la entrega
 *  listAsistenciaLigera); la racha se corta en la primera asistencia. */
export function asistenciaPorMiembro(asistencia: AsistenciaLigera[]): Map<number, AsistenciaMiembro> {
  const mapa = new Map<number, AsistenciaMiembro & { rachaCerrada: boolean }>();
  for (const a of asistencia) {
    let e = mapa.get(a.member_id);
    if (!e) {
      e = { asistidos: 0, ausentes: 0, enRoster: 0, pct: null, ultimaAsistencia: null, racha: 0, rachaCerrada: false };
      mapa.set(a.member_id, e);
    }
    e.enRoster++;
    if (a.presente === 1) {
      e.asistidos++;
      if (!e.ultimaAsistencia) e.ultimaAsistencia = a.fecha;
      e.rachaCerrada = true;
    } else {
      e.ausentes++;
      if (!e.rachaCerrada) e.racha++;
    }
  }
  const resultado = new Map<number, AsistenciaMiembro>();
  for (const [id, e] of mapa) {
    resultado.set(id, {
      asistidos: e.asistidos,
      ausentes: e.ausentes,
      enRoster: e.enRoster,
      pct: e.enRoster > 0 ? Math.round((e.asistidos / e.enRoster) * 100) : null,
      ultimaAsistencia: e.ultimaAsistencia,
      racha: e.racha,
    });
  }
  return resultado;
}

// ---------- "No ha asistido recientemente" ----------

/** Sin asistencia en los últimos X días O en los últimos N servicios,
 *  lo que ocurra primero (la racha ya cuenta servicios consecutivos). */
export function sinAsistirReciente(
  a: AsistenciaMiembro | undefined,
  hoyISO: string,
  u: Umbrales
): boolean {
  if (!a || a.enRoster === 0) return false;
  if (!a.ultimaAsistencia) return true;
  const limiteDias = new Date(hoyISO);
  limiteDias.setDate(limiteDias.getDate() - u.recienteDias);
  const pd = (x: number) => String(x).padStart(2, "0");
  const corteDias = `${limiteDias.getFullYear()}-${pd(limiteDias.getMonth() + 1)}-${pd(limiteDias.getDate())}`;
  const porDias = a.ultimaAsistencia < corteDias;
  const porServicios = a.racha >= u.recienteServicios;
  return porDias || porServicios;
}

// ---------- Resumen general ----------

export interface ResumenMembresia {
  total: number;
  activos: number;
  inactivos: number;
  visitantes: number;
  enProceso: number;
  nuevosEnPeriodo: number;
  recibidosPorTraslado: number;
  trasladados: number;
  ausenciasFrecuentes: number;
  incompletos: number;
}

export function resumenMembresia(
  miembros: Member[],
  periodo: Periodo,
  trasladosSalida: TrasladoSalida[],
  trasladosEntrada: TrasladoEntrada[],
  asistencia: Map<number, AsistenciaMiembro>,
  u: Umbrales
): ResumenMembresia {
  let activos = 0, inactivos = 0, visitantes = 0, enProceso = 0;
  let nuevos = 0, frecuentes = 0, incompletos = 0;
  for (const m of miembros) {
    const e = estadoEfectivo(m);
    if (e === "activo") activos++;
    else if (e === "inactivo") inactivos++;
    else if (e === "visitante") visitantes++;
    else if (e === "enProceso") enProceso++;
    if (esNuevoEnPeriodo(m, periodo, u)) nuevos++;
    if (camposFaltantes(m).length > 0) incompletos++;
    const a = asistencia.get(m.id);
    if (a && a.enRoster > 0 && a.pct !== null && a.pct < u.ausenciasFrecuentesPct) frecuentes++;
  }
  return {
    total: miembros.length,
    activos,
    inactivos,
    visitantes,
    enProceso,
    nuevosEnPeriodo: nuevos,
    recibidosPorTraslado: trasladosEntrada.filter(
      (te) => te.estado === "completado" && enPeriodo(te.fecha_recepcion ?? te.creado_en.slice(0, 10), periodo)
    ).length,
    trasladados: trasladosSalida.filter(
      (ts) => ts.estado === "completado" && enPeriodo(ts.fecha_entrega ?? ts.fecha_solicitud, periodo)
    ).length,
    ausenciasFrecuentes: frecuentes,
    incompletos,
  };
}

// ---------- Resumen de asistencia general ----------

export interface ResumenAsistencia {
  totalServicios: number;
  asistenciaTotal: number;
  promedioPorServicio: number;
  pctGeneral: number | null;
}

export function resumenAsistencia(servicios: ServicioLigero[], asistencia: AsistenciaLigera[]): ResumenAsistencia {
  const totalServicios = servicios.length;
  const presentes = asistencia.filter((a) => a.presente === 1).length;
  const enRoster = asistencia.length;
  return {
    totalServicios,
    asistenciaTotal: presentes,
    promedioPorServicio: totalServicios > 0 ? Math.round(presentes / totalServicios) : 0,
    pctGeneral: enRoster > 0 ? Math.round((presentes / enRoster) * 100) : null,
  };
}

/** Top N por % de asistencia en el periodo (empates: más asistidos primero). */
export function topAsistencia(
  miembros: Member[],
  asistencia: Map<number, AsistenciaMiembro>,
  u: Umbrales
): { miembro: Member; datos: AsistenciaMiembro }[] {
  return miembros
    .map((m) => ({ miembro: m, datos: asistencia.get(m.id) }))
    .filter((x): x is { miembro: Member; datos: AsistenciaMiembro } => !!x.datos && x.datos.enRoster > 0 && x.datos.pct !== null)
    .sort((a, b) => (b.datos.pct ?? 0) - (a.datos.pct ?? 0) || b.datos.asistidos - a.datos.asistidos)
    .slice(0, u.topAsistencia);
}

// ---------- Alertas de seguimiento (administrativas: nunca cambian el estado) ----------

export type TipoAlerta =
  | "rachaServicios"
  | "diasSinAsistir"
  | "nuevoSeguimiento"
  | "expedienteIncompleto";

export interface Alerta {
  miembro: Member;
  tipo: TipoAlerta;
  /** Dato de apoyo (racha, días o campos faltantes). */
  detalle: string;
}

export function alertasSeguimiento(
  miembros: Member[],
  periodo: Periodo,
  asistencia: Map<number, AsistenciaMiembro>,
  hoyISO: string,
  u: Umbrales
): Alerta[] {
  const alertas: Alerta[] = [];
  for (const m of miembros) {
    // Solo miembros del registro (las bajas ya no se pastorean aquí).
    if (m.activo !== 1) continue;
    const a = asistencia.get(m.id);
    if (a && a.racha >= u.rachaServicios) {
      alertas.push({ miembro: m, tipo: "rachaServicios", detalle: String(a.racha) });
    } else if (a && sinAsistirReciente(a, hoyISO, u)) {
      alertas.push({ miembro: m, tipo: "diasSinAsistir", detalle: a.ultimaAsistencia ?? "" });
    }
    if (esNuevoEnPeriodo(m, periodo, u) && ((a?.asistidos ?? 0) < 2 || camposFaltantes(m).length > 0)) {
      alertas.push({ miembro: m, tipo: "nuevoSeguimiento", detalle: String(a?.asistidos ?? 0) });
    }
    const faltantes = camposFaltantes(m);
    if (faltantes.length > 0) {
      alertas.push({ miembro: m, tipo: "expedienteIncompleto", detalle: faltantes.join(",") });
    }
  }
  return alertas;
}

// ---------- Utilidades de periodo ----------

export function periodoDeMes(yyyyMM: string): Periodo {
  const [y, m] = yyyyMM.split("-").map(Number);
  const fin = new Date(y, m, 0).getDate();
  const pd = (x: number) => String(x).padStart(2, "0");
  return { desde: `${y}-${pd(m)}-01`, hasta: `${y}-${pd(m)}-${pd(fin)}` };
}

export function periodoDeTrimestre(anio: number, trimestre: 1 | 2 | 3 | 4): Periodo {
  const mesInicio = (trimestre - 1) * 3 + 1;
  const fin = new Date(anio, mesInicio + 2, 0).getDate();
  const pd = (x: number) => String(x).padStart(2, "0");
  return { desde: `${anio}-${pd(mesInicio)}-01`, hasta: `${anio}-${pd(mesInicio + 2)}-${pd(fin)}` };
}

export function periodoDeAnio(anio: number): Periodo {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}
