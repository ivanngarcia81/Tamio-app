import type { Actividad, ExcepcionAgenda, RecFin, Recurrencia, RecurrenciaTipo } from "../../db";

export const RECURRENCIA_NINGUNA: Recurrencia = { tipo: "ninguna", intervalo: 1, diasSemana: [], fin: { tipo: "nunca" } };

export function parseRecurrencia(json: string | null | undefined): Recurrencia {
  if (!json) return { ...RECURRENCIA_NINGUNA };
  try {
    const r = JSON.parse(json) as Partial<Recurrencia>;
    const tipo = (r?.tipo ?? "ninguna") as RecurrenciaTipo;
    const fin: RecFin = (r?.fin && typeof r.fin === "object") ? (r.fin as RecFin) : { tipo: "nunca" };
    const intervaloOk = typeof r?.intervalo === "number" && Number.isFinite(r.intervalo) && r.intervalo > 0;
    return {
      tipo,
      intervalo: intervaloOk ? Math.floor(r!.intervalo as number) : (tipo === "quincenal" ? 2 : 1),
      diasSemana: Array.isArray(r?.diasSemana) ? r!.diasSemana!.filter((x) => x >= 0 && x <= 6) : [],
      fin,
    };
  } catch {
    return { ...RECURRENCIA_NINGUNA };
  }
}

export function parseExcepciones(json: string | null | undefined): ExcepcionAgenda[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.fechaOriginal === "string") : [];
  } catch {
    return [];
  }
}

/** Una ocurrencia lista para mostrar: campos efectivos + referencia a la maestra. */
export interface OcurrenciaVista extends Actividad {
  /** La actividad maestra real en la base de datos. */
  _master: Actividad;
  /** Fecha original de la ocurrencia (identifica la excepción). */
  _fechaOriginal: string;
  /** true si proviene de una serie recurrente. */
  _esOcurrencia: boolean;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function isoDate(dt: Date): string {
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function addDays(isoStr: string, n: number): string {
  const [y, m, d] = isoStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoDate(dt);
}

/** Genera las fechas de la serie en orden ascendente (infinito; el llamador corta). */
function* fechasSerie(rec: Recurrencia, anchor: string): Generator<string> {
  const [ay, am, ad] = anchor.split("-").map(Number);

  if (rec.tipo === "ninguna") { yield anchor; return; }

  if (rec.tipo === "mensual" || rec.tipo === "anual") {
    const stepM = rec.tipo === "mensual" ? Math.max(1, rec.intervalo) : Math.max(1, rec.intervalo) * 12;
    for (let k = 0; ; k++) {
      const totalMonths = (am - 1) + k * stepM;
      const y = ay + Math.floor(totalMonths / 12);
      const mo = totalMonths % 12; // 0-11
      const lastDay = new Date(y, mo + 1, 0).getDate();
      yield iso(y, mo + 1, Math.min(ad, lastDay));
    }
  }

  // Familia semanal: semanal (1), quincenal (2), personalizada (intervalo).
  const intervalo = rec.tipo === "quincenal" ? 2 : rec.tipo === "semanal" ? 1 : Math.max(1, rec.intervalo);
  const anchorDate = new Date(ay, am - 1, ad);
  const dias = (rec.diasSemana.length ? [...rec.diasSemana] : [anchorDate.getDay()]).sort((a, b) => a - b);
  const dom0 = new Date(anchorDate);
  dom0.setDate(anchorDate.getDate() - anchorDate.getDay()); // domingo de la semana ancla
  for (let w = 0; ; w++) {
    if (w % intervalo !== 0) continue;
    for (const d of dias) {
      const dt = new Date(dom0);
      dt.setDate(dom0.getDate() + w * 7 + d);
      if (dt >= anchorDate) yield isoDate(dt);
    }
  }
}

function aplicarCambios(master: Actividad, fechaOriginal: string, cambios?: Record<string, unknown>): Actividad {
  const base: Actividad = { ...master, fecha: fechaOriginal };
  if (cambios) Object.assign(base, cambios);
  return base;
}

function vista(efectiva: Actividad, master: Actividad, fechaOriginal: string, esOcurrencia: boolean): OcurrenciaVista {
  return { ...efectiva, _master: master, _fechaOriginal: fechaOriginal, _esOcurrencia: esOcurrencia };
}

const HARD_CAP = 3000;

/** Expande una actividad (única o recurrente) a sus ocurrencias visibles en
 *  [desde, hasta], aplicando excepciones (overrides y borrados). */
export function expandirActividad(master: Actividad, desde: string, hasta: string): OcurrenciaVista[] {
  const rec = parseRecurrencia(master.recurrencia);

  if (rec.tipo === "ninguna") {
    return (master.fecha >= desde && master.fecha <= hasta)
      ? [vista(master, master, master.fecha, false)]
      : [];
  }

  const excMap = new Map(parseExcepciones(master.excepciones).map((e) => [e.fechaOriginal, e]));
  const padHasta = addDays(hasta, 31); // margen para ocurrencias movidas por un override
  const out: OcurrenciaVista[] = [];
  const gen = fechasSerie(rec, master.fecha);
  let count = 0;

  for (let i = 0; i < HARD_CAP; i++) {
    const next = gen.next();
    if (next.done) break;
    const fechaOriginal = next.value;

    if (rec.fin.tipo === "hasta" && fechaOriginal > rec.fin.hasta) break;
    count++;
    if (rec.fin.tipo === "conteo" && count > rec.fin.conteo) break;
    if (fechaOriginal > padHasta) break;

    const e = excMap.get(fechaOriginal);
    if (e?.eliminada) continue;
    const efectiva = aplicarCambios(master, fechaOriginal, e?.cambios as Record<string, unknown> | undefined);
    if (efectiva.fecha >= desde && efectiva.fecha <= hasta) {
      out.push(vista(efectiva, master, fechaOriginal, true));
    }
  }
  return out;
}

/** Expande varias actividades a un rango y las devuelve como ocurrencias. */
export function expandirTodas(actividades: Actividad[], desde: string, hasta: string): OcurrenciaVista[] {
  const out: OcurrenciaVista[] = [];
  for (const a of actividades) out.push(...expandirActividad(a, desde, hasta));
  return out;
}

/** ¿Se solapan en horario dos actividades de la misma fecha? (día completo choca con todo). */
export function solapanHorario(
  a: { dia_completo: number; hora_inicio: string | null; hora_fin: string | null },
  b: { dia_completo: number; hora_inicio: string | null; hora_fin: string | null },
): boolean {
  if (a.dia_completo || b.dia_completo) return true;
  const ai = a.hora_inicio, bi = b.hora_inicio;
  if (!ai || !bi) return true;          // sin hora definida → posible choque
  if (ai === bi) return true;           // mismo inicio
  const af = a.hora_fin || ai;
  const bf = b.hora_fin || bi;
  return ai < bf && bi < af;
}

/** Normaliza un lugar para comparar (minúsculas, sin espacios extra ni acentos). */
export function normalizarLugar(lugar: string | null | undefined): string {
  return (lugar ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
