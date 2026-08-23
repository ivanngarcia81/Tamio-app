import { CERO, sumar, type Centavos } from "../../dinero";
import type { MonthTotals } from "../../db";

/**
 * El periodo del Inicio: mes, trimestre o año.
 *
 * El handoff dibuja un segmentado de tres opciones —Mes · Trimestre · Año— en
 * la cabecera del Inicio. En el prototipo los tres botones son estáticos (no
 * llevan `onClick`), así que qué significa cada uno lo decide la contabilidad
 * de la iglesia, no el dibujo. Aquí son **periodos de calendario**, no
 * ventanas móviles:
 *
 *   · mes       → el mes en curso
 *   · trimestre → el trimestre natural en curso (ene–mar, abr–jun, …)
 *   · año       → el año en curso
 *
 * La razón es que los libros de una iglesia se cierran por calendario: el
 * corte de mes, el informe trimestral al consejo y la constancia anual caen
 * los tres en fronteras fijas. Un "últimos 90 días" daría una cifra que no
 * coincide con ningún papel que la iglesia firme.
 *
 * Todo lo de aquí es puro —cadenas "YYYY-MM" y aritmética— para poder
 * probarlo sin base de datos y sin Tauri.
 */

export type Periodo = "mes" | "trimestre" | "anio";

const p2 = (n: number) => String(n).padStart(2, "0");

/** Los meses "YYYY-MM" que componen el periodo que contiene a `mesActual`. */
export function mesesDePeriodo(periodo: Periodo, mesActual: string): string[] {
  const [y, m] = mesActual.split("-").map(Number);
  if (periodo === "mes") return [mesActual];
  if (periodo === "trimestre") {
    // El primer mes del trimestre natural: 1, 4, 7 o 10.
    const inicio = Math.floor((m - 1) / 3) * 3 + 1;
    return [0, 1, 2].map((i) => `${y}-${p2(inicio + i)}`);
  }
  return Array.from({ length: 12 }, (_, i) => `${y}-${p2(i + 1)}`);
}

/** Los meses del periodo ANTERIOR al que contiene a `mesActual`. */
export function mesesDePeriodoAnterior(periodo: Periodo, mesActual: string): string[] {
  const [y, m] = mesActual.split("-").map(Number);
  if (periodo === "mes") {
    return m === 1 ? [`${y - 1}-12`] : [`${y}-${p2(m - 1)}`];
  }
  if (periodo === "trimestre") {
    const inicio = Math.floor((m - 1) / 3) * 3 + 1;
    // Retroceder un trimestre puede cruzar el año.
    const antes = inicio - 3;
    const [ay, ai] = antes >= 1 ? [y, antes] : [y - 1, antes + 12];
    return [0, 1, 2].map((i) => `${ay}-${p2(ai + i)}`);
  }
  return Array.from({ length: 12 }, (_, i) => `${y - 1}-${p2(i + 1)}`);
}

/** El último día "YYYY-MM-DD" del mes dado. Sirve para cerrar un periodo. */
export function ultimoDiaDe(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  // Día 0 del mes siguiente = último del actual, sin tabla de días ni bisiestos.
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/**
 * Junta varios `MonthTotals` en uno.
 *
 * Se suma mes a mes en vez de pedir un SELECT con rango porque el periodo ya
 * se resuelve como una LISTA de meses: con una sola forma de contar, el mes,
 * el trimestre y el año no pueden discrepar entre sí, que es lo que pasaría
 * con tres consultas distintas afinadas por separado. Los conteos se suman
 * como enteros (no son centavos) y por eso no pasan por `sumar`.
 */
export function juntarTotales(partes: MonthTotals[]): MonthTotals {
  const out: MonthTotals = {
    ingresos: CERO, gastos: CERO,
    porCategoriaIngreso: {}, porCategoriaGasto: {},
    conteoCategoriaIngreso: {}, conteoCategoriaGasto: {},
  };
  for (const p of partes) {
    out.ingresos = sumar(out.ingresos, p.ingresos);
    out.gastos = sumar(out.gastos, p.gastos);
    for (const [k, v] of Object.entries(p.porCategoriaIngreso)) {
      out.porCategoriaIngreso[k] = sumar(out.porCategoriaIngreso[k] ?? CERO, v as Centavos);
    }
    for (const [k, v] of Object.entries(p.porCategoriaGasto)) {
      out.porCategoriaGasto[k] = sumar(out.porCategoriaGasto[k] ?? CERO, v as Centavos);
    }
    for (const [k, v] of Object.entries(p.conteoCategoriaIngreso)) {
      out.conteoCategoriaIngreso[k] = (out.conteoCategoriaIngreso[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(p.conteoCategoriaGasto)) {
      out.conteoCategoriaGasto[k] = (out.conteoCategoriaGasto[k] ?? 0) + v;
    }
  }
  return out;
}

/**
 * El color del punto de "Esta semana", por tipo de actividad.
 *
 * El handoff pinta un punto de color a la derecha de cada compromiso —morado,
 * verde, naranja, cian— pero no dice qué los separa: en el prototipo son
 * cuatro filas fijas. La app SÍ tiene el dato (`agenda.tipo`, 23 valores del
 * catálogo `TIPOS_ACTIVIDAD`), así que el punto pasa a decir algo: agrupa los
 * 23 tipos en las cuatro familias con las que una iglesia piensa su semana.
 *
 * Un color por tipo serían 23 colores que nadie distingue; cuatro familias se
 * leen de un vistazo, que es para lo que el diseño puso el punto.
 */
export type FamiliaActividad = "culto" | "reunion" | "fecha" | "otra";

const FAMILIAS: Record<string, FamiliaActividad> = {
  cultoRegular: "culto", cultoEspecial: "culto", santaCena: "culto", bautismo: "culto",
  presentacionNinos: "culto", vigilia: "culto", campana: "culto", escuelaBiblica: "culto",
  reunionLideres: "reunion", reunionAdministrativa: "reunion", asamblea: "reunion", ensayo: "reunion",
  fechaLimite: "fecha", boda: "fecha", funeral: "fecha",
};

export function familiaDeActividad(tipo: string): FamiliaActividad {
  return FAMILIAS[tipo] ?? "otra";
}
