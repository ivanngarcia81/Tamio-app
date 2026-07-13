import type { Church } from "../../db";
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
  /** Ingresos cuyo método de pago es "transferencia" — el dato más
   *  cercano disponible a "depósitos bancarios" (no existe un campo de
   *  banco/depósito dedicado en el modelo de datos todavía). */
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

  const [logoDataUrl, firmaDataUrl] = await Promise.all([
    data.logoPath ? loadPngDataUrl(data.logoPath) : Promise.resolve(null),
    data.firmaPath ? loadPngDataUrl(data.firmaPath) : Promise.resolve(null),
  ]);

  const doc = new ReportDocBuilder({
    title: "Estado financiero",
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: data.mesLegibleStr,
    moneda,
    generatedBy: data.generatedBy,
    logoDataUrl,
  });

  const cols: PdfColumn[] = [
    { label: "Categoría", width: doc.contentWidth - 100 - 64, align: "left" },
    { label: "Monto", width: 100, align: "right" },
    { label: "%", width: 64, align: "right" },
  ];

  // ---------- Resumen financiero ----------
  const r = data.resumen;
  doc.heading("Resumen financiero");
  doc.keyValueGrid(
    [
      { label: "Balance inicial (mes anterior)", value: fmtMoneyPdf(r.balanceInicial, moneda) },
      { label: "Total ingresos", value: fmtMoneyPdf(r.ingresos, moneda) },
      { label: "Total gastos", value: fmtMoneyPdf(r.gastos, moneda) },
      { label: "Balance final", value: fmtMoneyPdf(r.balanceFinal, moneda) },
      { label: "Depósitos bancarios (transferencias)", value: fmtMoneyPdf(r.depositosBancarios, moneda) },
      { label: "Total diezmos", value: fmtMoneyPdf(r.diezmos, moneda) },
      { label: "Total ofrendas", value: fmtMoneyPdf(r.ofrendas, moneda) },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Indicadores ----------
  const ind = data.indicadores;
  doc.heading("Indicadores");
  doc.keyValueGrid(
    [
      { label: "Ingresos del mes", value: fmtMoneyPdf(ind.ingresosDelMes, moneda) },
      { label: "Gastos del mes", value: fmtMoneyPdf(ind.gastosDelMes, moneda) },
      { label: "Balance del mes", value: fmtMoneyPdf(ind.balanceDelMes, moneda) },
      { label: "Balance del año", value: fmtMoneyPdf(ind.balanceDelAnio, moneda) },
      {
        label: "Mayor gasto",
        value: ind.mayorGasto ? `${ind.mayorGasto.nombre} — ${fmtMoneyPdf(ind.mayorGasto.monto, moneda)}` : "—",
      },
      {
        label: "Ingreso más frecuente",
        value: ind.ingresoMasFrecuente ? `${ind.ingresoMasFrecuente.nombre} (${ind.ingresoMasFrecuente.conteo})` : "—",
      },
      { label: "Miembros activos", value: String(ind.miembrosActivos) },
      { label: "Última actualización", value: ind.ultimaActualizacion },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Gráficas ----------
  if (data.charts.length > 0) {
    doc.heading("Gráficas");
    for (const chart of data.charts) {
      doc.image(chart.dataUrl, { maxWidth: doc.contentWidth, maxHeight: 220, caption: chart.caption });
    }
  }

  // ---------- Resumen por categorías ----------
  const totalIngresos = data.categoriasIngreso.reduce((s, c) => s + c.monto, 0);
  doc.beginTable("Ingresos por categoría", cols);
  if (data.categoriasIngreso.length === 0) {
    doc.emptyRow("Sin ingresos registrados este mes.");
  } else {
    for (const c of data.categoriasIngreso) {
      doc.tableRow([c.nombre, fmtMoneyPdf(c.monto, moneda), pct(c.monto, totalIngresos)], cols);
    }
  }
  doc.totalRow(["Total ingresos", fmtMoneyPdf(totalIngresos, moneda), "100%"], cols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  const totalGastos = data.categoriasGasto.reduce((s, c) => s + c.monto, 0);
  doc.beginTable("Gastos por categoría", cols);
  if (data.categoriasGasto.length === 0) {
    doc.emptyRow("Sin gastos registrados este mes.");
  } else {
    for (const c of data.categoriasGasto) {
      doc.tableRow([c.nombre, fmtMoneyPdf(c.monto, moneda), pct(c.monto, totalGastos)], cols);
    }
  }
  doc.totalRow(["Total gastos", fmtMoneyPdf(totalGastos, moneda), "100%"], cols);
  doc.endTable();
  doc.addGap(PDF_SPACE.lg);

  // ---------- Firmas ----------
  doc.signatureBlock([
    { nombre: data.generatedBy?.nombre, rol: data.generatedBy?.rol ?? "Tesorero", firmaDataUrl },
    { nombre: null, rol: "Pastor", firmaDataUrl: null },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(data.periodoISO, "DASH"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `estado-financiero-${slug(church.nombre)}.pdf`);
}
