import type { Church, Deposito } from "./db";
import i18n from "./i18n";
import type { Centavos } from "./dinero";
import { ReportBase, type BaseCol } from "./services/print/reportBase";
import {
  buildReportId, fmtFechaCortaPdf, fmtFechaLarga, fmtHora12, fmtMoneyPlain, loadPngDataUrl, openForPrint,
  PDF_COLOR, PDF_SPACE, pct, slug,
} from "./services/print/printUtils";
import { entregarArchivo } from "./services/entrega";

export interface ReportRow {
  nombre: string;
  total: number;
}

export interface ReportData {
  church: Church;
  mesLegibleStr: string;
  /** Periodo en formato ISO "YYYY-MM" — se usa para el folio de auditoría del PDF. */
  periodoISO: string;
  filasIngreso: ReportRow[];
  filasGasto: ReportRow[];
  ingresos: number;
  gastos: number;
  balance: number;
  /**
   * Saldo de tesorería al cierre del periodo anterior (db.saldoAnteriorDe:
   * saldo de apertura + acumulado de movimientos). Con él el documento
   * presenta la ecuación contable real: saldo anterior + ingresos − egresos
   * = saldo final. Si no se provee, el bloque no se dibuja — nunca se inventa.
   */
  saldoAnterior?: number;
  /** Suma de los depósitos bancarios registrados en el periodo. */
  depositosBancarios?: number;
  /** Detalle de esos depósitos (fecha, banco, referencia) para su sección. */
  depositosDetalle?: Deposito[];
  /** Reservado para cuando el PDF deba decir quién lo generó (hoy el pie y
   *  las firmas ya identifican al tesorero). */
  generatedBy?: { nombre: string; rol?: string };
  /** Ruta de la firma PNG del tesorero (Configuración → Firma del tesorero). */
  firmaPath?: string | null;
  /** Ruta de la firma PNG del pastor (Configuración → Firma del pastor). */
  firmaPastorPath?: string | null;
  /** Logo de la iglesia para el membrete (Configuración → Subir logo). */
  logoPath?: string | null;
}

// ---------- Estado financiero mensual ----------
//
// Construido sobre la plantilla base compartida (services/print/reportBase.ts):
// membrete, tablas, firmas y pie idénticos a los del Registro de movimientos.
// Aquí solo vive el CONTENIDO: qué secciones lleva y en qué orden.

async function buildMonthlyReportPdf(data: ReportData): Promise<{ bytes: ArrayBuffer; fileName: string }> {
  const {
    church, mesLegibleStr, periodoISO, filasIngreso, filasGasto, ingresos, gastos, balance,
    saldoAnterior, depositosBancarios, depositosDetalle, firmaPath, firmaPastorPath, logoPath,
  } = data;

  const moneda = church.moneda;
  const money = (c: Centavos) => fmtMoneyPlain(c, moneda);

  const firmaDataUrl = firmaPath ? await loadPngDataUrl(firmaPath) : null;
  const firmaPastorDataUrl = firmaPastorPath ? await loadPngDataUrl(firmaPastorPath) : null;
  const logoDataUrl = logoPath ? await loadPngDataUrl(logoPath) : null;

  const meta = [
    i18n.t("pdf.periodo", { periodo: mesLegibleStr }),
    i18n.t("pdf.moneda", { moneda }),
  ];
  if (church.ciudad) meta.unshift(church.ciudad);

  const doc = new ReportBase({
    churchNombre: church.nombre,
    titulo: i18n.t("pdf.estadoFinancieroMensual"),
    meta,
    logoDataUrl,
  });

  // Columnas fijas de las tablas de categorías: etiqueta flexible + monto +
  // porcentaje, idénticas en Ingresos y Egresos, en toda página.
  const catCols: BaseCol[] = [
    { label: i18n.t("pdf.colCategoria"), width: doc.contentWidth - 92 - 92, align: "left" },
    { label: i18n.t("pdf.colMonto"), width: 92, align: "right" },
    { label: i18n.t("pdf.colPctTotal"), width: 92, align: "right" },
  ];
  const gastoCols: BaseCol[] = [
    catCols[0],
    catCols[1],
    { label: i18n.t("pdf.colPctIngreso"), width: 92, align: "right" },
  ];

  // ---------- Tarjetas de resumen ----------
  const saldoNegativo = balance < 0;
  doc.cards([
    { label: i18n.t("pdf.efCardIngresos"), value: money(ingresos) },
    { label: i18n.t("pdf.efCardEgresos"), value: money(gastos) },
    { label: i18n.t("pdf.efCardSaldo"), value: money(balance), color: saldoNegativo ? PDF_COLOR.danger : PDF_COLOR.brand },
  ]);

  // ---------- Ingresos ----------
  doc.beginTable(i18n.t("reportes.ingresosPeriodo"), catCols);
  if (filasIngreso.length === 0) {
    doc.emptyRow(i18n.t("reportes.sinIngresosRegistrados"));
  } else {
    filasIngreso.forEach((c, i) => doc.row([c.nombre, money(c.total), pct(c.total, ingresos)], catCols, i, [2]));
  }
  doc.totalRow([i18n.t("reportes.totalIngresos"), money(ingresos), ""], catCols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  // ---------- Egresos ----------
  // El % se mide contra el INGRESO del periodo: "los sueldos fueron el 23% de
  // lo que entró" informa; "% de lo que gastamos" no dice nada nuevo.
  doc.beginTable(i18n.t("reportes.gastosPeriodo"), gastoCols);
  if (filasGasto.length === 0) {
    doc.emptyRow(i18n.t("reportes.sinGastosRegistrados"));
  } else {
    filasGasto.forEach((c, i) => doc.row([c.nombre, money(c.total), pct(c.total, ingresos)], gastoCols, i, [2]));
  }
  doc.totalRow([i18n.t("reportes.totalGastos"), money(gastos), ""], gastoCols);
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  // ---------- Saldo de tesorería ----------
  // La ecuación contable real. Solo si el llamador provee el saldo anterior.
  if (saldoAnterior != null) {
    const saldoFinal = saldoAnterior + ingresos - gastos;
    const saldoCols: BaseCol[] = [catCols[0], catCols[1], { label: "", width: 92, align: "right" }];
    doc.sectionTitle(i18n.t("pdf.saldoTesoreria"));
    const filas: [string, number][] = [
      [i18n.t("pdf.saldoAnterior"), saldoAnterior],
      [i18n.t("reportes.totalIngresos"), ingresos],
      [i18n.t("pdf.menosEgresos"), -gastos],
    ];
    filas.forEach(([label, v], i) => doc.row([label, money(v), ""], saldoCols, i));
    doc.totalRow(
      [i18n.t("pdf.saldoFinal"), money(saldoFinal), ""],
      saldoCols,
      saldoFinal < 0 ? PDF_COLOR.danger : PDF_COLOR.brand
    );
  }

  // ---------- Depósitos bancarios ----------
  const hayDetalle = depositosDetalle != null && depositosDetalle.length > 0;
  if (hayDetalle || depositosBancarios != null) {
    doc.addGap(PDF_SPACE.sm);
    const depCols: BaseCol[] = [
      { label: i18n.t("pdf.colFechaDep"), width: 78, align: "left" },
      { label: i18n.t("pdf.colBanco"), width: doc.contentWidth - 78 - 104, align: "left" },
      { label: i18n.t("pdf.colMonto"), width: 104, align: "right" },
    ];
    doc.beginTable(i18n.t("reportes.depositosBancarios"), depCols);
    if (hayDetalle) {
      depositosDetalle!.forEach((dep, i) => {
        const banco = dep.referencia ? `${dep.cuenta_banco} · ${dep.referencia}` : dep.cuenta_banco;
        doc.row([fmtFechaCortaPdf(dep.fecha), banco, money(dep.monto)], depCols, i);
      });
    } else {
      doc.emptyRow(i18n.t("pdf.sinDepositos"));
    }
    doc.totalRow([i18n.t("pdf.totalDepositos"), "", money(depositosBancarios ?? 0)], depCols);
    doc.endTable();
    // Aclaración: los depósitos son traspasos de efectivo a banco, no ingresos,
    // así que NO entran en el saldo (pueden superar el ingreso del mes).
    doc.paragraph(i18n.t("pdf.notaDepositos"));
  }

  // ---------- Firmas (tesorero + pastor) ----------
  const firmantes = [];
  if (church.tesorero_nombre) {
    firmantes.push({ nombre: church.tesorero_nombre, cargo: church.tesorero_cargo || i18n.t("rol.tesorero"), img: firmaDataUrl });
  }
  if (church.pastor_nombre) {
    firmantes.push({ nombre: church.pastor_nombre, cargo: church.pastor_cargo || i18n.t("pdf.pastorCargo"), img: firmaPastorDataUrl });
  }
  doc.firmas(firmantes);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(periodoISO),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });
  const fileName = `${i18n.t("pdf.fileEstadoFinanciero")}-${slug(church.nombre)}-${slug(mesLegibleStr)}.pdf`;
  return { bytes, fileName };
}

/** Devuelve true si se guardó, false si el usuario canceló el diálogo. */
export async function exportReportPdf(data: ReportData): Promise<boolean> {
  const { bytes, fileName } = await buildMonthlyReportPdf(data);
  return entregarArchivo(new Uint8Array(bytes), fileName);
}

/** "Imprimir": genera el mismo PDF y lo abre con el visor del sistema en
 *  vez de mostrar un diálogo de guardar — desde ahí el usuario imprime
 *  con Cmd/Ctrl+P. */
export async function printMonthlyReportPdf(data: ReportData): Promise<void> {
  const { bytes, fileName } = await buildMonthlyReportPdf(data);
  await openForPrint(bytes, fileName);
}

/** Solo para la vista previa de desarrollo: devuelve los bytes sin guardar. */
export async function buildMonthlyReportPdfBytes(data: ReportData): Promise<ArrayBuffer> {
  const { bytes } = await buildMonthlyReportPdf(data);
  return bytes;
}
