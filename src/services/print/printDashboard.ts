import type { Church } from "../../db";
import i18n from "../../i18n";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import {
  buildReportId, fmtFechaLarga, fmtHora12, fmtMoneyPdf, loadPngDataUrl,
  openForPrint, PDF_SPACE, pct, slug,
} from "./printUtils";

export interface DashboardResumenFinanciero {
  /** Balance del mes anterior — no existe un saldo bancario acumulado
   *  persistido en la base de datos, así que se usa el resultado del
   *  periodo previo como "balance inicial" del mes actual. */
  balanceInicial: number;
  ingresos: number;
  gastos: number;
  balanceFinal: number;
  /** Suma de los depósitos bancarios registrados en el periodo. */
  depositosBancarios: number;
  diezmos: number;
  ofrendas: number;
}

export interface DashboardIndicadores {
  ingresosDelMes: number;
  gastosDelMes: number;
  balanceDelMes: number;
  balanceDelAnio: number;
  mayorGasto: { nombre: string; monto: number } | null;
  ingresoMasFrecuente: { nombre: string; conteo: number } | null;
  miembrosActivos: number;
  ultimaActualizacion: string;
}

export interface CategoriaRow {
  nombre: string;
  monto: number;
}

export interface DashboardChartImage {
  dataUrl: string;
  caption: string;
}

export interface DashboardPrintData {
  church: Church;
  mesLegibleStr: string;
  periodoISO: string;
  generatedBy?: { nombre: string; rol?: string };
  firmaPath?: string | null;
  logoPath?: string | null;
  resumen: DashboardResumenFinanciero;
  indicadores: DashboardIndicadores;
  categoriasIngreso: CategoriaRow[];
  categoriasGasto: CategoriaRow[];
  /** Imágenes ya capturadas (p. ej. con html2canvas) de las gráficas
   *  visibles en pantalla — este módulo no conoce el DOM ni React. */
  charts: DashboardChartImage[];
}

export async function printDashboard(data: DashboardPrintData): Promise<void> {
  const { church } = data;
  const moneda = church.moneda;

  const [logoDataUrl, firmaDataUrl, pastorFirmaDataUrl] = await Promise.all([
    data.logoPath ? loadPngDataUrl(data.logoPath) : Promise.resolve(null),
    data.firmaPath ? loadPngDataUrl(data.firmaPath) : Promise.resolve(null),
    church.pastor_firma_path ? loadPngDataUrl(church.pastor_firma_path) : Promise.resolve(null),
  ]);

  const doc = new ReportDocBuilder({
    title: i18n.t("pdf.estadoFinanciero"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: data.mesLegibleStr,
    moneda,
    generatedBy: data.generatedBy,
    logoDataUrl,
  });

  const cols: PdfColumn[] = [
    { label: i18n.t("tx.colCategoria"), width: doc.contentWidth - 100 - 64, align: "left" },
    { label: i18n.t("tx.colMonto"), width: 100, align: "right" },
    { label: "%", width: 64, align: "right" },
  ];

  // ---------- Resumen financiero ----------
  const r = data.resumen;
  doc.heading(i18n.t("pdf.resumenFinanciero"));
  doc.keyValueGrid(
    [
      { label: i18n.t("pdf.balanceInicial"), value: fmtMoneyPdf(r.balanceInicial, moneda) },
      { label: i18n.t("reportes.totalIngresos"), value: fmtMoneyPdf(r.ingresos, moneda) },
      { label: i18n.t("reportes.totalGastos"), value: fmtMoneyPdf(r.gastos, moneda) },
      { label: i18n.t("pdf.balanceFinal"), value: fmtMoneyPdf(r.balanceFinal, moneda) },
      { label: i18n.t("reportes.depositosBancarios"), value: fmtMoneyPdf(r.depositosBancarios, moneda) },
      { label: i18n.t("pdf.totalDiezmos"), value: fmtMoneyPdf(r.diezmos, moneda) },
      { label: i18n.t("pdf.totalOfrendas"), value: fmtMoneyPdf(r.ofrendas, moneda) },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Indicadores ----------
  const ind = data.indicadores;
  doc.heading(i18n.t("pdf.indicadores"));
  doc.keyValueGrid(
    [
      { label: i18n.t("dashboard.ingresosDelMes"), value: fmtMoneyPdf(ind.ingresosDelMes, moneda) },
      { label: i18n.t("dashboard.gastosDelMes"), value: fmtMoneyPdf(ind.gastosDelMes, moneda) },
      { label: i18n.t("dashboard.balanceDelMesLabel"), value: fmtMoneyPdf(ind.balanceDelMes, moneda) },
      { label: i18n.t("dashboard.balanceDelAnio"), value: fmtMoneyPdf(ind.balanceDelAnio, moneda) },
      {
        label: i18n.t("dashboard.mayorGasto"),
        value: ind.mayorGasto ? `${ind.mayorGasto.nombre} — ${fmtMoneyPdf(ind.mayorGasto.monto, moneda)}` : "—",
      },
      {
        label: i18n.t("dashboard.ingresoMasFrecuente"),
        value: ind.ingresoMasFrecuente ? `${ind.ingresoMasFrecuente.nombre} (${ind.ingresoMasFrecuente.conteo})` : "—",
      },
      { label: i18n.t("dashboard.miembrosActivos"), value: String(ind.miembrosActivos) },
      { label: i18n.t("dashboard.ultimaActualizacion"), value: ind.ultimaActualizacion },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Gráficas ----------
  if (data.charts.length > 0) {
    doc.heading(i18n.t("pdf.graficas"));
    for (const chart of data.charts) {
      doc.image(chart.dataUrl, { maxWidth: doc.contentWidth, maxHeight: 220, caption: chart.caption });
    }
  }

  // ---------- Resumen por categorías ----------
  const totalIngresos = data.categoriasIngreso.reduce((s, c) => s + c.monto, 0);
  doc.beginTable(i18n.t("pdf.ingresosPorCategoria"), cols);
  if (data.categoriasIngreso.length === 0) {
    doc.emptyRow(i18n.t("reportes.sinIngresosRegistrados"));
  } else {
    for (const c of data.categoriasIngreso) {
      doc.tableRow([c.nombre, fmtMoneyPdf(c.monto, moneda), pct(c.monto, totalIngresos)], cols);
    }
  }
  doc.totalRow([i18n.t("reportes.totalIngresos"), fmtMoneyPdf(totalIngresos, moneda), "100%"], cols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  const totalGastos = data.categoriasGasto.reduce((s, c) => s + c.monto, 0);
  doc.beginTable(i18n.t("pdf.gastosPorCategoria"), cols);
  if (data.categoriasGasto.length === 0) {
    doc.emptyRow(i18n.t("reportes.sinGastosRegistrados"));
  } else {
    for (const c of data.categoriasGasto) {
      doc.tableRow([c.nombre, fmtMoneyPdf(c.monto, moneda), pct(c.monto, totalGastos)], cols);
    }
  }
  doc.totalRow([i18n.t("reportes.totalGastos"), fmtMoneyPdf(totalGastos, moneda), "100%"], cols);
  doc.endTable();
  // Mismo aire que el estado financiero mensual antes del bloque de firmas.
  doc.addGap(32);

  // ---------- Firmas ----------
  doc.signatureBlock([
    { nombre: data.generatedBy?.nombre, rol: data.generatedBy?.rol ?? i18n.t("rol.tesorero"), firmaDataUrl },
    { nombre: church.pastor_nombre, rol: church.pastor_cargo ?? i18n.t("rol.pastor"), firmaDataUrl: pastorFirmaDataUrl },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(data.periodoISO, "DASH"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `${i18n.t("pdf.fileEstadoFinanciero").toLowerCase()}-${slug(church.nombre)}.pdf`);
}
