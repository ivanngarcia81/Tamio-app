import Papa from "papaparse";
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, METODOS_PAGO, type NewTx } from "../db";

export interface ImportRowError {
  fila: number;
  mensaje: string;
}

export interface ImportResult {
  validas: NewTx[];
  errores: ImportRowError[];
  totalFilas: number;
}

export const CSV_TEMPLATE =
  "fecha,tipo,categoria,concepto,monto,metodo_pago,beneficiario,notas\n" +
  "2026-03-02,ingreso,Ofrenda,Ofrenda servicio dominical,1500,efectivo,,\n" +
  "2026-03-05,gasto,Servicios,CFE - Energia electrica,850,transferencia,Comision Federal de Electricidad,\n";

function parseMontoCsv(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function esFechaValida(fecha: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(new Date(`${fecha}T00:00:00`).getTime());
}

function matchCategoria(
  tipo: "ingreso" | "gasto",
  texto: string
): { categoria: string; subcategoria: string | null } | null {
  const q = texto.trim();
  const lista = tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;
  if (q) {
    const found = lista.find(
      (c) => c.id.toLowerCase() === q.toLowerCase() || c.nombre.toLowerCase() === q.toLowerCase()
    );
    if (found) return { categoria: found.id, subcategoria: null };
  }
  // "Otros" es una categoría válida de ingreso con texto libre en subcategoria;
  // los gastos no tienen una categoría catch-all, así que sin coincidencia es error.
  if (tipo === "ingreso") return { categoria: "otros", subcategoria: q || null };
  return null;
}

function matchMetodo(texto: string): string {
  const q = texto.trim().toLowerCase();
  if (!q) return "efectivo";
  const found = METODOS_PAGO.find((m) => m.id.toLowerCase() === q || m.nombre.toLowerCase() === q);
  return found?.id ?? "efectivo";
}

/**
 * Convierte el texto de un CSV en movimientos listos para insertar.
 * Nunca lanza: cada fila inválida se reporta en `errores` y se omite de
 * `validas`, para poder importar el resto sin que un typo tire todo.
 *
 * `hoy` es la fecha de hoy en formato "YYYY-MM-DD" — se pasa desde afuera
 * en vez de calcularla aquí para poder probar esta función con fechas fijas.
 */
export function parseCsv(text: string, hoy: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const validas: NewTx[] = [];
  const errores: ImportRowError[] = [];

  parsed.data.forEach((row, i) => {
    const fila = i + 2; // +1 por el encabezado, +1 porque las filas de hoja de cálculo empiezan en 1

    const tipoRaw = (row.tipo ?? "").trim().toLowerCase();
    if (tipoRaw !== "ingreso" && tipoRaw !== "gasto") {
      errores.push({ fila, mensaje: `"tipo" debe ser "ingreso" o "gasto" (se encontró "${row.tipo ?? ""}").` });
      return;
    }
    const tipo = tipoRaw as "ingreso" | "gasto";

    const fecha = (row.fecha ?? "").trim();
    if (!esFechaValida(fecha)) {
      errores.push({ fila, mensaje: `Fecha inválida, usa el formato AAAA-MM-DD (se encontró "${row.fecha ?? ""}").` });
      return;
    }
    if (fecha > hoy) {
      errores.push({ fila, mensaje: "No se pueden importar movimientos con fecha futura." });
      return;
    }

    const concepto = (row.concepto ?? "").trim();
    if (!concepto) {
      errores.push({ fila, mensaje: "El concepto es obligatorio." });
      return;
    }

    const monto = parseMontoCsv(row.monto ?? "");
    if (monto === null) {
      errores.push({ fila, mensaje: `Monto inválido (se encontró "${row.monto ?? ""}"), debe ser mayor a cero.` });
      return;
    }

    const cat = matchCategoria(tipo, row.categoria ?? "");
    if (!cat) {
      errores.push({ fila, mensaje: `Categoría de ${tipo} no reconocida: "${row.categoria ?? ""}".` });
      return;
    }

    validas.push({
      tipo,
      categoria: cat.categoria,
      subcategoria: cat.subcategoria,
      concepto,
      detalle: (row.notas ?? "").trim() || null,
      fecha: `${fecha} 12:00`,
      monto,
      metodo_pago: matchMetodo(row.metodo_pago ?? ""),
      beneficiario: tipo === "gasto" ? (row.beneficiario ?? "").trim() || null : null,
      estado: "aprobado",
    });
  });

  return { validas, errores, totalFilas: parsed.data.length };
}
