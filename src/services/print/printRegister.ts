import { categoriaInfo, fmtFechaCorta, metodoNombre, METODOS_PAGO, type Church, type Tx } from "../../db";
import i18n from "../../i18n";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import {
  buildReportId, fmtFechaLarga, fmtHora12, fmtMoneyPdf, openForPrint, PDF_SPACE, slug,
} from "./printUtils";

export interface RegisterPrintOptions {
  church: Church;
  /** Título de la página que se estaba viendo — p. ej. "Ingresos", "Gastos". */
  titulo: string;
  /** Descripción legible del filtro/búsqueda activos, para dejar constancia
   *  de qué se imprimió exactamente (p. ej. "Julio 2026 · Categoría: Servicios"). */
  filtroDescripcion: string;
  periodoISO: string;
  /** Movimientos EXACTAMENTE como se están mostrando en pantalla — ya
   *  filtrados, buscados y ordenados. Este módulo no vuelve a filtrar nada. */
  movimientos: Tx[];
}

function buildCols(): PdfColumn[] {
  return [
    { label: i18n.t("tx.colFecha"), width: 66, align: "left" },
    { label: i18n.t("movImport.colTipo"), width: 50, align: "left" },
    { label: i18n.t("tx.colCategoria"), width: 100, align: "left" },
    { label: i18n.t("tx.colDescripcion"), width: 0, align: "left" }, // se completa en tiempo de armado
    { label: i18n.t("tx.colMetodo"), width: 90, align: "left" },
    { label: i18n.t("tx.colMonto"), width: 90, align: "right" },
  ];
}

/** true si imprimió, false si no había nada que imprimir (llamador debe
 *  mostrar "No hay registros para imprimir." y no invocar esto de nuevo). */
export async function printRegister(opts: RegisterPrintOptions): Promise<boolean> {
  if (opts.movimientos.length === 0) return false;

  const { church, movimientos } = opts;
  const moneda = church.moneda;

  const doc = new ReportDocBuilder({
    title: i18n.t("pdf.registroDe", { titulo: opts.titulo.toLowerCase() }),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: opts.filtroDescripcion,
    moneda,
  });

  const COLS = buildCols();
  const fixedW = COLS.filter((c) => c.width > 0).reduce((s, c) => s + c.width, 0);
  const cols: PdfColumn[] = COLS.map((c) => (c.width === 0 ? { ...c, width: doc.contentWidth - fixedW } : c));

  doc.beginTable(i18n.t("pdf.movimientos"), cols);

  let totalIngresos = 0;
  let totalGastos = 0;
  for (const tx of movimientos) {
    const cat = categoriaInfo(tx.tipo, tx.categoria);
    const quien = tx.member_nombre ?? tx.beneficiario ?? null;
    const descripcion = [tx.concepto, tx.detalle, quien].filter(Boolean).join(" — ");
    const metodo = METODOS_PAGO.some((m) => m.id === tx.metodo_pago) ? metodoNombre(tx.metodo_pago) : tx.metodo_pago;
    const signo = tx.tipo === "ingreso" ? "+" : "−";

    doc.tableRow(
      [
        fmtFechaCorta(tx.fecha),
        tx.tipo === "ingreso" ? i18n.t("tx.ingreso") : i18n.t("tx.gasto"),
        cat.nombre,
        descripcion,
        metodo,
        `${signo}${fmtMoneyPdf(tx.monto, tx.moneda).replace("(", "").replace(")", "")}`,
      ],
      cols
    );

    if (tx.tipo === "ingreso") totalIngresos += tx.monto;
    else totalGastos += tx.monto;
  }
  doc.endTable();
  doc.addGap(PDF_SPACE.sm);

  const balance = totalIngresos - totalGastos;
  doc.heading(i18n.t("pdf.totales"));
  doc.keyValueGrid(
    [
      { label: i18n.t("reportes.totalIngresos"), value: fmtMoneyPdf(totalIngresos, moneda) },
      { label: i18n.t("reportes.totalGastos"), value: fmtMoneyPdf(totalGastos, moneda) },
      { label: i18n.t("pdf.balance"), value: fmtMoneyPdf(balance, moneda) },
      { label: i18n.t("pdf.registrosImpresos"), value: String(movimientos.length) },
    ],
    2
  );

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(opts.periodoISO, "REG"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `${i18n.t("pdf.fileRegistro")}-${slug(opts.titulo)}-${slug(church.nombre)}.pdf`);
  return true;
}
