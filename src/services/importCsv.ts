import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, METODOS_PAGO, catNombre, metodoNombre, type NewTx } from "../db";
import i18n from "../i18n";
import type { CsvField } from "./csvImport";

export const MOVIMIENTOS_FIELDS: CsvField[] = [
  { key: "fecha", label: "campo.fecha", required: true, aliases: ["fecha", "date", "fecha_movimiento"] },
  { key: "tipo", label: "campo.tipo", required: true, aliases: ["tipo", "type"] },
  { key: "categoria", label: "campo.categoria", required: true, aliases: ["categoria", "categoría", "category"] },
  { key: "concepto", label: "campo.concepto", required: true, aliases: ["concepto", "descripcion", "descripción", "description", "concept"] },
  { key: "monto", label: "campo.monto", required: true, aliases: ["monto", "amount", "importe", "cantidad", "valor"] },
  { key: "metodo_pago", label: "campo.metodo_pago", required: false, aliases: ["metodo_pago", "método de pago", "metodo de pago", "payment_method", "metodo"] },
  { key: "beneficiario", label: "campo.beneficiario", required: false, aliases: ["beneficiario", "proveedor", "payee", "vendor"] },
  { key: "notas", label: "campo.notas", required: false, aliases: ["notas", "notes", "observaciones", "comentarios"] },
];

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
    // Acepta el id interno, el nombre canónico en español o el nombre en
    // el idioma activo de la app (para archivos exportados en inglés).
    const found = lista.find(
      (c) =>
        c.id.toLowerCase() === q.toLowerCase() ||
        c.nombre.toLowerCase() === q.toLowerCase() ||
        catNombre(c.id).toLowerCase() === q.toLowerCase()
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
  const found = METODOS_PAGO.find(
    (m) => m.id.toLowerCase() === q || m.nombre.toLowerCase() === q || metodoNombre(m.id).toLowerCase() === q
  );
  return found?.id ?? "efectivo";
}

/**
 * Valida una fila ya mapeada a las claves internas (fecha, tipo, categoria,
 * concepto, monto, metodo_pago, beneficiario, notas) — el mapeo de columnas
 * del archivo original ya se aplicó antes de llegar aquí (ver csvImport.ts).
 *
 * `hoy` es la fecha de hoy en "YYYY-MM-DD", pasada desde afuera para poder
 * probar esta función con fechas fijas.
 */
export function validarFilaMovimiento(row: Record<string, string>, hoy: string): { data?: NewTx; error?: string } {
  const tipoRaw = (row.tipo ?? "").trim().toLowerCase();
  const tipo: "ingreso" | "gasto" | null =
    tipoRaw === "ingreso" || tipoRaw === "income" ? "ingreso"
    : tipoRaw === "gasto" || tipoRaw === "expense" || tipoRaw === "egreso" ? "gasto"
    : null;
  if (tipo === null) {
    return { error: i18n.t("csvVal.tipoInvalido", { valor: row.tipo ?? "" }) };
  }

  const fecha = (row.fecha ?? "").trim();
  if (!esFechaValida(fecha)) {
    return { error: i18n.t("csvVal.fechaInvalida", { valor: row.fecha ?? "" }) };
  }
  if (fecha > hoy) {
    return { error: i18n.t("csvVal.fechaFutura") };
  }

  const concepto = (row.concepto ?? "").trim();
  if (!concepto) {
    return { error: i18n.t("csvVal.conceptoObligatorio") };
  }

  const monto = parseMontoCsv(row.monto ?? "");
  if (monto === null) {
    return { error: i18n.t("csvVal.montoInvalido", { valor: row.monto ?? "" }) };
  }

  const cat = matchCategoria(tipo, row.categoria ?? "");
  if (!cat) {
    return { error: i18n.t("csvVal.categoriaNoReconocida", { tipo: tipo === "ingreso" ? i18n.t("tx.ingreso").toLowerCase() : i18n.t("tx.gasto").toLowerCase(), valor: row.categoria ?? "" }) };
  }

  return {
    data: {
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
    },
  };
}
