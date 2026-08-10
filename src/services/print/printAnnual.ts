import {
  catNombre, getCategoriasGasto, getCategoriasIngreso, mesLegible,
  type Church, type MonthSummary, type YearCategorias,
} from "../../db";
import i18n from "../../i18n";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import {
  buildReportId, fmtFechaLarga, fmtHora12, fmtMoneyPdf, loadPngDataUrl, PDF_SPACE, pct, slug,
} from "./printUtils";
import { entregarArchivo } from "../entrega";
import type { Centavos } from "../../dinero";

export interface AnnualReportData {
  church: Church;
  /** Año en "YYYY". */
  year: string;
  /** Meses con movimientos (yearMonthlySummary) — este módulo no toca la BD. */
  meses: MonthSummary[];
  categorias: YearCategorias;
  depositosBancarios: Centavos;
}

/** Genera el reporte anual en PDF y abre el diálogo de guardar.
 *  Devuelve true si se guardó, false si el usuario canceló. */
export async function exportAnnualReportPdf(data: AnnualReportData): Promise<boolean> {
  const { church, year, meses, categorias } = data;
  const moneda = church.moneda;

  const [logoDataUrl, firmaDataUrl, pastorFirmaDataUrl] = await Promise.all([
    church.logo_path ? loadPngDataUrl(church.logo_path) : Promise.resolve(null),
    church.tesorero_firma_path ? loadPngDataUrl(church.tesorero_firma_path) : Promise.resolve(null),
    church.pastor_firma_path ? loadPngDataUrl(church.pastor_firma_path) : Promise.resolve(null),
  ]);

  const doc = new ReportDocBuilder({
    title: i18n.t("anual.titulo"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: year,
    moneda,
    generatedBy: church.tesorero_nombre
      ? { nombre: church.tesorero_nombre, rol: church.tesorero_cargo ?? undefined }
      : undefined,
    logoDataUrl,
  });

  const totalIngresos = meses.reduce((s, m) => s + m.ingresos, 0);
  const totalGastos = meses.reduce((s, m) => s + m.gastos, 0);
  const balance = totalIngresos - totalGastos;

  // ---------- Resumen por mes ----------
  const mesCols: PdfColumn[] = [
    { label: i18n.t("reportes.colMes"), width: doc.contentWidth - 3 * 110, align: "left" },
    { label: i18n.t("charts.ingresos"), width: 110, align: "right" },
    { label: i18n.t("charts.gastos"), width: 110, align: "right" },
    { label: i18n.t("pdf.balance"), width: 110, align: "right" },
  ];
  doc.beginTable(i18n.t("anual.resumenPorMes"), mesCols);
  if (meses.length === 0) {
    doc.emptyRow(i18n.t("anual.sinMovimientos", { anio: year }));
  } else {
    for (const m of meses) {
      doc.tableRow(
        [
          mesLegible(m.mes),
          fmtMoneyPdf(m.ingresos, moneda),
          fmtMoneyPdf(m.gastos, moneda),
          fmtMoneyPdf(m.ingresos - m.gastos, moneda),
        ],
        mesCols
      );
    }
  }
  doc.totalRow(
    [i18n.t("anual.totalAnio"), fmtMoneyPdf(totalIngresos, moneda), fmtMoneyPdf(totalGastos, moneda), fmtMoneyPdf(balance, moneda)],
    mesCols
  );
  doc.endTable();
  doc.addGap(PDF_SPACE.lg);

  // ---------- Tarjetas ----------
  doc.cardsRow([
    { label: i18n.t("pdf.cardTotalIngresos"), value: fmtMoneyPdf(totalIngresos, moneda) },
    { label: i18n.t("pdf.cardTotalGastos"), value: fmtMoneyPdf(totalGastos, moneda) },
    { label: i18n.t("anual.balanceAnioCard"), value: fmtMoneyPdf(balance, moneda) },
  ]);
  doc.addGap(PDF_SPACE.lg);

  // ---------- Categorías del año ----------
  const catCols: PdfColumn[] = [
    { label: i18n.t("tx.colCategoria"), width: doc.contentWidth - 110 - 70, align: "left" },
    { label: i18n.t("tx.colMonto"), width: 110, align: "right" },
    { label: "%", width: 70, align: "right" },
  ];

  const filasIngreso = getCategoriasIngreso()
    .map((c) => ({ id: c.id, total: categorias.porCategoriaIngreso[c.id] ?? 0 }))
    .filter((c) => c.total > 0);
  doc.beginTable(i18n.t("pdf.ingresosPorCategoria"), catCols);
  if (filasIngreso.length === 0) {
    doc.emptyRow(i18n.t("anual.sinMovimientos", { anio: year }));
  } else {
    for (const c of filasIngreso) {
      doc.tableRow([catNombre(c.id), fmtMoneyPdf(c.total, moneda), pct(c.total, totalIngresos)], catCols);
    }
  }
  doc.totalRow([i18n.t("reportes.totalIngresos"), fmtMoneyPdf(totalIngresos, moneda), "100%"], catCols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  const filasGasto = getCategoriasGasto()
    .map((c) => ({ id: c.id, total: categorias.porCategoriaGasto[c.id] ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  doc.beginTable(i18n.t("pdf.gastosPorCategoria"), catCols);
  if (filasGasto.length === 0) {
    doc.emptyRow(i18n.t("anual.sinMovimientos", { anio: year }));
  } else {
    for (const c of filasGasto) {
      doc.tableRow([catNombre(c.id), fmtMoneyPdf(c.total, moneda), pct(c.total, totalGastos)], catCols);
    }
  }
  doc.totalRow([i18n.t("reportes.totalGastos"), fmtMoneyPdf(totalGastos, moneda), "100%"], catCols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  // ---------- Depósitos del año ----------
  doc.keyValueGrid([{ label: i18n.t("anual.depositosAnio"), value: fmtMoneyPdf(data.depositosBancarios, moneda) }], 2);

  // Mismo aire que los demás reportes antes del bloque de firmas.
  doc.addGap(75);
  doc.signatureBlock([
    {
      nombre: church.tesorero_nombre,
      rol: church.tesorero_cargo ?? i18n.t("rol.tesorero"),
      firmaDataUrl,
    },
    { nombre: church.pastor_nombre, rol: church.pastor_cargo ?? i18n.t("rol.pastor"), firmaDataUrl: pastorFirmaDataUrl },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(`${year}-00`, "AN"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  const fileName = `${i18n.t("anual.archivo")}-${slug(church.nombre)}-${year}.pdf`;
  return entregarArchivo(new Uint8Array(bytes), fileName);
}
