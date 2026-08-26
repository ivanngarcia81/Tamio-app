import i18n from "../../i18n";
import { fmtFecha, fmtFechaCorta } from "../../db";

/** Un grupo de la lista: su encabezado y lo que va dentro. */
export interface GrupoIOS<T> {
  /** Clave estable para el `key` de React (la fecha o el mes en ISO). */
  clave: string;
  /** Lo que se lee en el encabezado: "Hoy", "17 ago 2026", "Agosto 2026", "A". */
  etiqueta: string;
  items: T[];
}

/** Hoy en local y en el mismo formato que guarda la base (YYYY-MM-DD). */
function hoyISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ayer, con la misma cuenta que `hoyISO` — pasando por `Date` para que el
 *  cambio de mes y el de año se resuelvan solos. */
function ayerISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Etiqueta de un día para el encabezado de sección: "Hoy" y "Ayer" los dos
 * días que el usuario tiene en la cabeza, la fecha corta para el resto.
 *
 * Las claves ya existían (`fechas.hoy`, `fechas.ayer`, usadas por `fmtRelativo`
 * y por el maestro-detalle del iPad): no se inventa vocabulario nuevo.
 */
export function etiquetaDeDia(diaISO: string): string {
  if (diaISO === hoyISO()) return i18n.t("fechas.hoy");
  if (diaISO === ayerISO()) return i18n.t("fechas.ayer");
  return fmtFechaCorta(diaISO);
}

/**
 * Agrupa por día conservando el orden de entrada.
 *
 * Conservarlo importa: las pantallas ya ordenan por fecha descendente en su
 * consulta, y reordenar aquí (o agrupar con un `Map` recorrido por claves)
 * habría cambiado ese orden en silencio en cuanto una lista viniera ordenada
 * por otra cosa —Miembros por nombre, Bandeja por prioridad—.
 */
export function agruparPorDia<T>(items: T[], fechaDe: (item: T) => string): GrupoIOS<T>[] {
  const grupos: GrupoIOS<T>[] = [];
  let actual: GrupoIOS<T> | null = null;
  for (const item of items) {
    const dia = fechaDe(item).slice(0, 10);
    if (!actual || actual.clave !== dia) {
      actual = { clave: dia, etiqueta: etiquetaDeDia(dia), items: [] };
      grupos.push(actual);
    }
    actual.items.push(item);
  }
  return grupos;
}

/** Igual que `agruparPorDia`, pero por mes — "Agosto 2026". El historial de
 *  depósitos abarca años y una sección por día lo dejaría en encabezados. */
export function agruparPorMes<T>(items: T[], fechaDe: (item: T) => string): GrupoIOS<T>[] {
  const grupos: GrupoIOS<T>[] = [];
  let actual: GrupoIOS<T> | null = null;
  for (const item of items) {
    const mes = fechaDe(item).slice(0, 7);
    if (!actual || actual.clave !== mes) {
      actual = { clave: mes, etiqueta: fmtFecha(fechaDe(item)).mesAnio, items: [] };
      grupos.push(actual);
    }
    actual.items.push(item);
  }
  return grupos;
}

/**
 * Agrupa por inicial, para el índice alfabético de Miembros.
 *
 * Lo que no es letra —un nombre que empieza por número o por símbolo— cae en
 * "#", como en Contactos. Los acentos se pliegan a su letra base con NFD: sin
 * eso "Álvarez" abría una sección "Á" propia, separada de la "A" y a la que
 * el índice no podía llevar.
 */
export function inicialDe(nombre: string): string {
  const limpio = nombre.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = limpio.charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function agruparPorInicial<T>(items: T[], nombreDe: (item: T) => string): GrupoIOS<T>[] {
  const grupos: GrupoIOS<T>[] = [];
  let actual: GrupoIOS<T> | null = null;
  for (const item of items) {
    const letra = inicialDe(nombreDe(item));
    if (!actual || actual.clave !== letra) {
      actual = { clave: letra, etiqueta: letra, items: [] };
      grupos.push(actual);
    }
    actual.items.push(item);
  }
  return grupos;
}
