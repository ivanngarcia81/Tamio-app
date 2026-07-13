import jsPDF from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Church } from "./db";
import i18n from "./i18n";
import {
  buildReportId, fmtFechaLarga, fmtHora12, fmtMoneyPdf, loadPngDataUrl, openForPrint,
  PDF_COLOR, PDF_FOOTER_BLOCK_H, PDF_MARGIN, PDF_SPACE, PDF_TYPE,
  pct, setDraw, setFill, setText, slug,
} from "./services/print/printUtils";

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
  /** Suma de los depósitos bancarios registrados en el periodo. */
  depositosBancarios?: number;
  /**
   * Preparado para cuando exista autenticación de usuarios: si se provee,
   * el PDF muestra "Generado por". Hoy no hay sistema de cuentas (ver
   * PROJECT_STATUS.md), así que ningún llamador lo pasa todavía y la
   * línea simplemente no se dibuja — sin inventar un usuario.
   */
  generatedBy?: { nombre: string; rol?: string };
  /** Ruta de la firma PNG del tesorero (Configuración → Firma del tesorero). */
  firmaPath?: string | null;
}

// ---------- Motor de reportes PDF (paginación profesional) ----------
//
// Reglas de diseño fijas — no se recalculan ni se comprimen según la
// cantidad de datos. Un reporte de 3 filas y uno de 300 usan exactamente
// la misma tipografía y el mismo espaciado; lo único que cambia es
// cuántas páginas ocupa. La escala tipográfica, el espaciado y la paleta
// viven en services/print/printUtils.ts, compartidos con el resto de los
// PDFs de la app (Dashboard, Registro) para no duplicar estas constantes.

async function buildMonthlyReportPdf(data: ReportData): Promise<{ bytes: ArrayBuffer; fileName: string }> {
  const {
    church, mesLegibleStr, periodoISO, filasIngreso, filasGasto, ingresos, gastos, balance,
    depositosBancarios, generatedBy, firmaPath,
  } = data;

  const now = new Date();
  const reportId = buildReportId(periodoISO);
  const fechaGeneracion = fmtFechaLarga(now);
  const horaGeneracion = fmtHora12(now);
  const firmaDataUrl = firmaPath ? await loadPngDataUrl(firmaPath) : null;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const marginX = PDF_MARGIN;
  const rightX = pageWidth - PDF_MARGIN;
  const contentWidth = rightX - marginX;
  const footerReserve = PDF_FOOTER_BLOCK_H;

  // Anchos de columna fijos: se conservan idénticos en toda tabla, toda
  // sección y toda página — nunca se recalculan por cantidad de filas.
  const pctColX = rightX;
  const amountColX = rightX - 96;
  const labelColX = marginX;

  // Paleta compartida (printUtils.ts), pensada para impresión láser en
  // blanco y negro: la jerarquía visual viene de tamaño/peso de fuente,
  // no del color.
  const { ink: INK, muted: MUTED, faint: FAINT, line: LINE, cardBg: CARD_BG, cardBorder: CARD_BORDER } = PDF_COLOR;

  let y = PDF_MARGIN;
  // Título de la sección/tabla en curso — si un salto de página ocurre
  // mientras hay una tabla abierta, se repite en la página siguiente.
  let currentSection: string | null = null;

  /**
   * Pie de página profesional (componente reutilizable): folio de
   * auditoría, fecha/hora real de generación y numeración "Página X de Y".
   * Se dibuja en una pasada final (ver el cierre de la función) porque el
   * total de páginas solo se conoce una vez que todo el contenido ya
   * existe — así el número "de Y" siempre es correcto.
   *
   * La firma del tesorero ya se dibuja (ver el bloque justo antes de esta
   * pasada final, después de las tarjetas). Punto de extensión futuro para
   * auditorías: firma del pastor y sello de la iglesia, en columnas junto
   * a la del tesorero, usando el mismo ancho de contenido (marginX/rightX)
   * como referencia — todavía no hay datos de esos roles que dibujar.
   */
  function drawFooterBlock(pageIndex: number, totalPages: number) {
    let fy = pageHeight - PDF_MARGIN - footerReserve + PDF_SPACE.sm;

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, fy, rightX, fy);
    fy += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.footer);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.generadoAutomaticamente"), marginX, fy);
    doc.text(i18n.t("pdf.pagina", { x: pageIndex, y: totalPages }), rightX, fy, { align: "right" });
    fy += 14;

    doc.text(`${fechaGeneracion} • ${horaGeneracion}`, marginX, fy);
    doc.text(i18n.t("pdf.reporte", { id: reportId }), rightX, fy, { align: "right" });
    fy += PDF_SPACE.xs;

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, fy, rightX, fy);
  }

  /** Encabezado repetido (componente reutilizable): título, iglesia,
   *  periodo, moneda y — cuando exista autenticación — quién lo generó. */
  function drawRunningHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.title);
    setText(doc, INK);
    doc.text(i18n.t("pdf.estadoFinancieroMensual"), marginX, y, { maxWidth: contentWidth });
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.church);
    setText(doc, INK);
    doc.text(`${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`, marginX, y, { maxWidth: contentWidth });
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.period);
    setText(doc, MUTED);
    doc.text(i18n.t("pdf.periodo", { periodo: mesLegibleStr }), marginX, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.meta);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.moneda", { moneda: church.moneda }), marginX, y);
    y += 14;

    if (generatedBy) {
      doc.text(i18n.t("pdf.generadoPor", { quien: `${generatedBy.nombre}${generatedBy.rol ? " · " + generatedBy.rol : ""}` }), marginX, y);
      y += 14;
    }

    y += PDF_SPACE.xs;
    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.md;
  }

  /** Dibuja el encabezado de columnas de la tabla — sin comprobar espacio:
   *  solo se llama justo después de asegurar espacio para el bloque completo. */
  function drawTableHeaderRaw() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, MUTED);
    doc.text(i18n.t("pdf.colCategoria"), labelColX, y);
    doc.text(i18n.t("pdf.colMonto"), amountColX, y, { align: "right" });
    doc.text(i18n.t("pdf.colPctTotal"), pctColX, y, { align: "right" });
    y += PDF_SPACE.xs + 4;
    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.sm;
  }

  function newPage() {
    doc.addPage();
    y = PDF_MARGIN;
    drawRunningHeader();
    if (currentSection) {
      // La página ya tiene espacio de sobra recién creada: se dibuja
      // directamente, sin volver a pasar por ensureSpace.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PDF_TYPE.section);
      setText(doc, INK);
      doc.text(i18n.t("pdf.continuacion", { seccion: currentSection }), marginX, y);
      y += 20;
      drawTableHeaderRaw();
    }
  }

  function ensureSpace(height: number) {
    if (y + height > pageHeight - PDF_MARGIN - footerReserve) {
      newPage();
    }
  }

  /** Inicia una sección + tabla como bloque atómico: título y encabezado
   *  de columnas siempre aparecen juntos, nunca separados por un salto. */
  function beginSection(title: string) {
    ensureSpace(20 + PDF_TYPE.body + PDF_SPACE.xs + 4 + PDF_SPACE.sm);
    currentSection = title;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.section);
    setText(doc, INK);
    doc.text(title, marginX, y);
    y += 20;
    drawTableHeaderRaw();
  }

  function endSection() {
    currentSection = null;
  }

  // Alto de la fila de total — las filas de datos lo reservan además del
  // suyo para que el total nunca quede huérfano en la página siguiente.
  const TOTAL_ROW_H = PDF_TYPE.total + PDF_SPACE.xs + 4 + PDF_SPACE.md;

  function dataRow(label: string, amountStr: string, pctStr: string) {
    ensureSpace(PDF_SPACE.md + TOTAL_ROW_H);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.tableRow);
    setText(doc, INK);
    doc.text(label, labelColX, y, { maxWidth: amountColX - labelColX - PDF_SPACE.sm });
    doc.text(amountStr, amountColX, y, { align: "right" });
    setText(doc, FAINT);
    doc.text(pctStr, pctColX, y, { align: "right" });
    y += PDF_SPACE.md;
  }

  function emptyRow(msg: string) {
    ensureSpace(PDF_SPACE.md + TOTAL_ROW_H);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, FAINT);
    doc.text(msg, labelColX, y);
    y += PDF_SPACE.md;
  }

  function totalRow(label: string, amountStr: string) {
    ensureSpace(TOTAL_ROW_H);
    setDraw(doc, INK);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.xs + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.total);
    setText(doc, INK);
    doc.text(label, labelColX, y);
    doc.text(amountStr, amountColX, y, { align: "right" });
    doc.text("100%", pctColX, y, { align: "right" });
    y += PDF_SPACE.md;
  }

  // ---------- Página 1 ----------
  drawRunningHeader();

  // ---------- Ingresos ----------
  beginSection(i18n.t("reportes.ingresosPeriodo"));
  if (filasIngreso.length === 0) {
    emptyRow(i18n.t("reportes.sinIngresosRegistrados"));
  } else {
    for (const c of filasIngreso) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, ingresos));
    }
  }
  totalRow(i18n.t("reportes.totalIngresos"), fmtMoneyPdf(ingresos, church.moneda));
  endSection();
  y += PDF_SPACE.md;

  // ---------- Gastos ----------
  beginSection(i18n.t("reportes.gastosPeriodo"));
  if (filasGasto.length === 0) {
    emptyRow(i18n.t("reportes.sinGastosRegistrados"));
  } else {
    for (const c of filasGasto) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, gastos));
    }
  }
  totalRow(i18n.t("reportes.totalGastos"), fmtMoneyPdf(gastos, church.moneda));
  endSection();

  // ---------- Depósitos bancarios (solo si se provee) ----------
  if (depositosBancarios != null) {
    y += PDF_SPACE.md;
    ensureSpace(PDF_SPACE.md);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, INK);
    doc.text(i18n.t("reportes.depositosBancarios"), labelColX, y);
    doc.text(fmtMoneyPdf(depositosBancarios, church.moneda), amountColX, y, { align: "right" });
    y += PDF_SPACE.md;
  }
  y += PDF_SPACE.lg;

  // ---------- Tarjetas de resumen ----------
  // Bloque atómico: si no caben completas, ensureSpace mueve las TRES
  // tarjetas juntas a la siguiente página — nunca se dividen entre sí.
  const cardH = 92;
  const cardGap = PDF_SPACE.sm;
  ensureSpace(cardH);

  const cardW = (contentWidth - 2 * cardGap) / 3;
  const cardRadius = 12;
  // Jerarquía por tamaño/peso de fuente, nunca por color — los tres
  // valores usan el mismo negro para verse igual de nítidos en blanco
  // y negro; un balance negativo se distingue con paréntesis, no con rojo.
  const cards: { label: string; value: number }[] = [
    { label: i18n.t("pdf.cardTotalIngresos"), value: ingresos },
    { label: i18n.t("pdf.cardTotalGastos"), value: gastos },
    { label: i18n.t("pdf.cardBalanceNeto"), value: balance },
  ];

  cards.forEach((card, i) => {
    const x = marginX + i * (cardW + cardGap);

    // sombra estilo Apple: varias capas de negro a muy baja opacidad en vez
    // de un relleno gris plano — simula un desenfoque suave sin bordes duros.
    doc.setGState(doc.GState({ opacity: 0.035 }));
    setFill(doc, [0, 0, 0]);
    doc.roundedRect(x + 2.25, y + 3.5, cardW, cardH, cardRadius, cardRadius, "F");
    doc.setGState(doc.GState({ opacity: 0.05 }));
    doc.roundedRect(x + 1.25, y + 2, cardW, cardH, cardRadius, cardRadius, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    setFill(doc, CARD_BG);
    setDraw(doc, CARD_BORDER);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, cardW, cardH, cardRadius, cardRadius, "FD");

    const cx = x + cardW / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.cardLabel);
    setText(doc, MUTED);
    doc.text(card.label, cx, y + PDF_SPACE.md, { align: "center", charSpace: 0.3 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.cardValue);
    setText(doc, INK);
    doc.text(fmtMoneyPdf(card.value, church.moneda), cx, y + cardH - PDF_SPACE.md + 4, { align: "center" });
  });

  y += cardH;

  // ---------- Firma del tesorero (solo si está configurada) ----------
  // Bloque atómico, igual que las tarjetas: si no cabe completo se mueve
  // entero a la siguiente página en vez de partirse. Línea, nombre y
  // cargo comparten el mismo margen izquierdo (firma tradicional tipo
  // carta), separados de las tarjetas de resumen por un espacio propio
  // para que no queden pegados a ellas.
  if (generatedBy?.nombre) {
    const sigLineW = 200;
    const sigImgMaxH = 46;
    const cardsToSigGap = 68; // 68pt de aire respecto a las tarjetas de resumen
    const lineToNameGap = PDF_SPACE.sm; // 16pt: dentro del rango 12–20 pedido
    const nameToRoleGap = 14;
    let sigImgH = 0;
    let sigImgW = 0;
    if (firmaDataUrl) {
      try {
        const props = doc.getImageProperties(firmaDataUrl);
        sigImgH = sigImgMaxH;
        sigImgW = Math.min(sigLineW, (props.width / props.height) * sigImgH);
      } catch {
        sigImgH = 0;
      }
    }

    ensureSpace(cardsToSigGap + (sigImgH > 0 ? sigImgH + PDF_SPACE.xs : 0) + 1 + lineToNameGap + nameToRoleGap + PDF_SPACE.md);
    y += cardsToSigGap;

    if (firmaDataUrl && sigImgH > 0) {
      doc.addImage(firmaDataUrl, "PNG", marginX, y, sigImgW, sigImgH);
      y += sigImgH + PDF_SPACE.xs;
    }

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, marginX + sigLineW, y);
    y += lineToNameGap;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, INK);
    doc.text(generatedBy.nombre, marginX, y);
    y += nameToRoleGap;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.meta);
    setText(doc, MUTED);
    doc.text(generatedBy.rol ?? i18n.t("rol.tesorero"), marginX, y);
    y += PDF_SPACE.md;
  }

  // ---------- Pie de página en todas las páginas ----------
  // El total de páginas solo se conoce ahora que ya se dibujó todo el
  // contenido, así que "Página X de Y" se estampa en una pasada final
  // sobre cada página ya generada.
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooterBlock(p, totalPages);
  }

  const bytes = doc.output("arraybuffer") as ArrayBuffer;
  const fileName = `${i18n.t("pdf.fileEstadoFinanciero")}-${slug(church.nombre)}-${slug(mesLegibleStr)}.pdf`;
  return { bytes, fileName };
}

/** Devuelve true si se guardó, false si el usuario canceló el diálogo. */
export async function exportReportPdf(data: ReportData): Promise<boolean> {
  const { bytes, fileName } = await buildMonthlyReportPdf(data);
  const path = await save({ defaultPath: fileName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return false;
  await writeFile(path, new Uint8Array(bytes));
  return true;
}

/** "Imprimir": genera el mismo PDF y lo abre con el visor del sistema en
 *  vez de mostrar un diálogo de guardar — desde ahí el usuario imprime
 *  con Cmd/Ctrl+P. Reemplaza el uso de window.print() sobre el HTML de
 *  la app, que no producía un resultado utilizable. */
export async function printMonthlyReportPdf(data: ReportData): Promise<void> {
  const { bytes, fileName } = await buildMonthlyReportPdf(data);
  await openForPrint(bytes, fileName);
}
