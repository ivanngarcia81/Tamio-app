import { categoriaInfo, fmtFechaCorta, METODOS_PAGO, type Church, type Tx } from "../../db";
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

const COLS: PdfColumn[] = [
  { label: "Fecha", width: 66, align: "left" },
  { label: "Tipo", width: 50, align: "left" },
  { label: "Categoría", width: 100, align: "left" },
  { label: "Descripción", width: 0, align: "left" }, // se completa en tiempo de armado
  { label: "Método", width: 90, align: "left" },
  { label: "Monto", width: 90, align: "right" },
];

/** true si imprimió, false si no había nada que imprimir (llamador debe
 *  mostrar "No hay registros para imprimir." y no invocar esto de nuevo). */
export async function printRegister(opts: RegisterPrintOptions): Promise<boolean> {
  if (opts.movimientos.length === 0) return false;

  const { church, movimientos } = opts;
  const moneda = church.moneda;

  const doc = new ReportDocBuilder({
    title: `Registro de ${opts.titulo.toLowerCase()}`,
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: opts.filtroDescripcion,
    moneda,
  });

  const fixedW = COLS.filter((c) => c.width > 0).reduce((s, c) => s + c.width, 0);
  const cols: PdfColumn[] = COLS.map((c) => (c.width === 0 ? { ...c, width: doc.contentWidth - fixedW } : c));

  doc.beginTable("Movimientos", cols);

  let totalIngresos = 0;
  let totalGastos = 0;
  for (const tx of movimientos) {
    const cat = categoriaInfo(tx.tipo, tx.categoria);
    const quien = tx.member_nombre ?? tx.beneficiario ?? null;
    const descripcion = [tx.concepto, tx.detalle, quien].filter(Boolean).join(" — ");
    const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago)?.nombre ?? tx.metodo_pago;
    const signo = tx.tipo === "ingreso" ? "+" : "−";

    doc.tableRow(
      [
        fmtFechaCorta(tx.fecha),
        tx.tipo === "ingreso" ? "Ingreso" : "Gasto",
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
  doc.heading("Totales");
  doc.keyValueGrid(
    [
      { label: "Total ingresos", value: fmtMoneyPdf(totalIngresos, moneda) },
      { label: "Total gastos", value: fmtMoneyPdf(totalGastos, moneda) },
      { label: "Balance", value: fmtMoneyPdf(balance, moneda) },
      { label: "Total de registros impresos", value: String(movimientos.length) },
    ],
    2
  );

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(opts.periodoISO, "REG"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `registro-${slug(opts.titulo)}-${slug(church.nombre)}.pdf`);
  return true;
}
