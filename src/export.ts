import jsPDF from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Church, Deposito } from "./db";
import i18n from "./i18n";
import {
  buildReportId, fmtFechaCortaPdf, fmtFechaLarga, fmtHora12, fmtMoneyPlain, loadPngDataUrl, openForPrint,
  PDF_COLOR, PDF_FOOTER_BLOCK_H, PDF_MARGIN, PDF_SPACE,
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
  /**
   * Saldo de tesorería acumulado al cierre del periodo anterior
   * (db.saldoAcumuladoAntesDe). Con él el documento presenta la ecuación
   * contable real: saldo anterior + ingresos − egresos = saldo final.
   * Si no se provee, el bloque de saldos no se dibuja en vez de inventarlo.
   */
  saldoAnterior?: number;
  /** Suma de los depósitos bancarios registrados en el periodo. */
  depositosBancarios?: number;
  /** Detalle de esos depósitos (fecha, banco, referencia) para su sección. */
  depositosDetalle?: Deposito[];
  /**
   * Preparado para cuando exista autenticación de usuarios: si se provee,
   * el PDF muestra "Generado por". Hoy no hay sistema de cuentas (ver
   * PROJECT_STATUS.md), así que ningún llamador lo pasa todavía y la
   * línea simplemente no se dibuja — sin inventar un usuario.
   */
  generatedBy?: { nombre: string; rol?: string };
  /** Ruta de la firma PNG del tesorero (Configuración → Firma del tesorero). */
  firmaPath?: string | null;
  /** Ruta de la firma PNG del pastor (Configuración → Firma del pastor). */
  firmaPastorPath?: string | null;
  /** Logo de la iglesia para el membrete (Configuración → Subir logo). */
  logoPath?: string | null;
}

// ---------- Motor del estado financiero mensual ----------
//
// Documento contable, no una página web impresa. Reglas de diseño fijas: un
// reporte de 3 filas y uno de 300 usan la misma tipografía y el mismo
// espaciado; lo único que cambia es cuántas páginas ocupa.
//
// La escala tipográfica es LOCAL a este reporte a propósito: PDF_TYPE en
// printUtils.ts la comparten los otros cinco PDFs (Dashboard, Anual,
// Constancia, Acta, Registro) y cambiarla los alteraría a todos.
const T = {
  title: 21,     // "Estado financiero mensual"
  church: 16,    // Nombre de la iglesia — el elemento más prominente
  period: 10,    // Periodo y moneda
  meta: 8,       // Notas y avisos
  section: 12.5, // Encabezados de sección
  colHead: 8.5,  // Encabezados de columna (mayúsculas + letter-spacing)
  row: 10.5,     // Filas de tabla
  total: 11,     // Filas de total
  cardLabel: 7,
  cardValue: 12.5,
  sigName: 9.5,
} as const;

async function buildMonthlyReportPdf(data: ReportData): Promise<{ bytes: ArrayBuffer; fileName: string }> {
  const {
    church, mesLegibleStr, periodoISO, filasIngreso, filasGasto, ingresos, gastos, balance,
    saldoAnterior, depositosBancarios, depositosDetalle, firmaPath, firmaPastorPath, logoPath,
  } = data;

  const moneda = church.moneda;
  const money = (n: number) => fmtMoneyPlain(n, moneda);

  const now = new Date();
  const reportId = buildReportId(periodoISO);
  const fechaGeneracion = fmtFechaLarga(now);
  const horaGeneracion = fmtHora12(now);
  const firmaDataUrl = firmaPath ? await loadPngDataUrl(firmaPath) : null;
  const firmaPastorDataUrl = firmaPastorPath ? await loadPngDataUrl(firmaPastorPath) : null;
  const logoDataUrl = logoPath ? await loadPngDataUrl(logoPath) : null;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const marginX = PDF_MARGIN;
  const rightX = pageWidth - PDF_MARGIN;
  const contentWidth = rightX - marginX;
  const footerReserve = PDF_FOOTER_BLOCK_H;

  // Anchos de columna fijos: idénticos en toda tabla, sección y página.
  // Los encabezados MONTO y % usan exactamente estas mismas X que sus
  // valores, con align:"right", así quedan a plomo sobre su columna.
  const pctColX = rightX;
  const amountColX = rightX - 92;
  const labelColX = marginX;

  const {
    ink: INK, muted: MUTED, faint: FAINT, line: LINE,
    cardBg: CARD_BG, cardBorder: CARD_BORDER,
    brand: BRAND, danger: DANGER, rowAlt: ROW_ALT,
  } = PDF_COLOR;

  let y = PDF_MARGIN;
  let currentSection: string | null = null;

  /** Pie de página: folio de auditoría, fecha/hora de generación y "Página X
   *  de Y". Se estampa en una pasada final porque el total de páginas solo se
   *  conoce cuando todo el contenido ya existe. */
  function drawFooterBlock(pageIndex: number, totalPages: number) {
    let fy = pageHeight - PDF_MARGIN - footerReserve + PDF_SPACE.sm;

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, fy, rightX, fy);
    fy += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.generadoAutomaticamente"), marginX, fy);
    doc.text(i18n.t("pdf.pagina", { x: pageIndex, y: totalPages }), rightX, fy, { align: "right" });
    fy += 10;

    doc.text(`${fechaGeneracion} • ${horaGeneracion}`, marginX, fy);
    doc.text(i18n.t("pdf.reporte", { id: reportId }), rightX, fy, { align: "right" });
    fy += PDF_SPACE.xs;

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, fy, rightX, fy);
  }

  /**
   * Membrete: logo + nombre de la iglesia (lo más prominente) + título del
   * documento + periodo y moneda. Se repite en cada página para que una hoja
   * suelta siga siendo identificable.
   */
  function drawRunningHeader() {
    const logoSize = 34;
    let textX = marginX;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", marginX, y, logoSize, logoSize);
        textX = marginX + logoSize + 12;
      } catch {
        textX = marginX;
      }
    }

    const textW = rightX - textX;
    let ty = y + 13;

    // El nombre de la iglesia es un nombre propio: nunca se traduce.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.church);
    setText(doc, INK);
    doc.text(church.nombre, textX, ty, { maxWidth: textW });
    // 20pt de avance: el título que sigue es de 21pt y con menos se solapan
    // los trazos ascendentes con los descendentes del nombre.
    ty += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.title);
    setText(doc, INK);
    doc.text(i18n.t("pdf.estadoFinancieroMensual"), textX, ty, { maxWidth: textW });
    ty += 13;

    // Ciudad · periodo · moneda en una sola línea. "Generado por" NO va aquí:
    // el pie ya lleva la metadata de generación y el bloque de firmas al
    // tesorero, así que repetirlo solo consumía altura de página.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(T.period);
    setText(doc, MUTED);
    const meta = [
      i18n.t("pdf.periodo", { periodo: mesLegibleStr }),
      i18n.t("pdf.moneda", { moneda }),
    ];
    if (church.ciudad) meta.unshift(church.ciudad);
    doc.text(meta.join("  ·  "), textX, ty, { maxWidth: textW });
    ty += 8;

    y = Math.max(ty, y + (logoDataUrl ? logoSize : 0)) + PDF_SPACE.xs;

    // Filete de marca bajo el membrete: 2pt verde + hairline gris.
    setDraw(doc, BRAND);
    doc.setLineWidth(2);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.md;
  }

  /** Encabezado de columnas: mayúsculas, letter-spacing y alineado a la
   *  derecha exactamente sobre la columna de sus valores. */
  function drawTableHeaderRaw(pctLabel: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.colHead);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.colCategoria").toUpperCase(), labelColX, y, { charSpace: 0.5 });
    doc.text(i18n.t("pdf.colMonto").toUpperCase(), amountColX, y, { align: "right", charSpace: 0.5 });
    doc.text(pctLabel.toUpperCase(), pctColX, y, { align: "right", charSpace: 0.5 });
    y += PDF_SPACE.xs + 3;
    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.sm + 1;
  }

  // Guarda el % de la sección abierta para repetir el encabezado correcto
  // cuando una tabla cruza a la página siguiente.
  let currentPctLabel = i18n.t("pdf.colPctTotal");

  function newPage() {
    doc.addPage();
    y = PDF_MARGIN;
    drawRunningHeader();
    if (currentSection) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(T.section);
      setText(doc, INK);
      doc.text(i18n.t("pdf.continuacion", { seccion: currentSection }), marginX, y);
      y += 5;
      setDraw(doc, BRAND);
      doc.setLineWidth(1);
      doc.line(marginX, y, rightX, y);
      y += PDF_SPACE.sm + 2;
      drawTableHeaderRaw(currentPctLabel);
    }
  }

  function ensureSpace(height: number) {
    if (y + height > pageHeight - PDF_MARGIN - footerReserve) {
      newPage();
    }
  }

  /** Título de sección con filete verde debajo (el acento fino de marca). */
  function sectionTitle(title: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.section);
    setText(doc, INK);
    doc.text(title, marginX, y);
    y += 5;
    setDraw(doc, BRAND);
    doc.setLineWidth(1);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.sm + 2;
  }

  /** Sección + encabezado de tabla como bloque atómico: nunca se separan. */
  function beginSection(title: string, pctLabel: string) {
    ensureSpace(5 + PDF_SPACE.sm + 2 + T.colHead + PDF_SPACE.xs + 3 + PDF_SPACE.sm + 1 + 3 * PDF_SPACE.md);
    currentSection = title;
    currentPctLabel = pctLabel;
    sectionTitle(title);
    drawTableHeaderRaw(pctLabel);
  }

  function endSection() {
    currentSection = null;
  }

  const ROW_H = PDF_SPACE.md + 2;
  const TOTAL_ROW_H = T.total + PDF_SPACE.xs + 4 + PDF_SPACE.md;

  /** Fila de datos con cebra muy clara para guiar el ojo en tablas largas. */
  function dataRow(label: string, amountStr: string, pctStr: string, index: number) {
    ensureSpace(ROW_H + TOTAL_ROW_H);
    if (index % 2 === 1) {
      setFill(doc, ROW_ALT);
      doc.rect(marginX, y - ROW_H + 4, contentWidth, ROW_H, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(T.row);
    setText(doc, INK);
    doc.text(label, labelColX, y, { maxWidth: amountColX - labelColX - PDF_SPACE.sm });
    doc.text(amountStr, amountColX, y, { align: "right" });
    setText(doc, FAINT);
    doc.text(pctStr, pctColX, y, { align: "right" });
    y += ROW_H;
  }

  function emptyRow(msg: string) {
    ensureSpace(ROW_H + TOTAL_ROW_H);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(T.row);
    setText(doc, FAINT);
    doc.text(msg, labelColX, y);
    y += ROW_H;
  }

  /** Fila de total: sin celda de "100%" (no aporta información). */
  function totalRow(label: string, amountStr: string) {
    ensureSpace(TOTAL_ROW_H);
    setDraw(doc, INK);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.xs + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.total);
    setText(doc, INK);
    doc.text(label, labelColX, y);
    doc.text(amountStr, amountColX, y, { align: "right" });
    y += PDF_SPACE.md;
  }

  // ==================== 1. Membrete ====================
  drawRunningHeader();

  // ==================== 2. Tarjetas de resumen ====================
  // Bloque atómico: las tres viajan juntas a la página siguiente si no caben.
  const cardH = 44;
  const cardGap = PDF_SPACE.sm;
  ensureSpace(cardH + PDF_SPACE.lg);

  const cardW = (contentWidth - 2 * cardGap) / 3;
  const cardRadius = 8;
  const saldoNegativo = balance < 0;
  const cards: { label: string; value: number; color?: typeof INK }[] = [
    { label: i18n.t("pdf.efCardIngresos"), value: ingresos },
    { label: i18n.t("pdf.efCardEgresos"), value: gastos },
    { label: i18n.t("pdf.efCardSaldo"), value: balance, color: saldoNegativo ? DANGER : BRAND },
  ];

  cards.forEach((card, i) => {
    const x = marginX + i * (cardW + cardGap);

    // Sombra suave (varias capas a baja opacidad, no un gris plano).
    doc.setGState(doc.GState({ opacity: 0.035 }));
    setFill(doc, [0, 0, 0]);
    doc.roundedRect(x + 1.1, y + 1.75, cardW, cardH, cardRadius, cardRadius, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    setFill(doc, CARD_BG);
    // La tarjeta del saldo lleva borde de marca; las otras, borde neutro.
    setDraw(doc, card.color ? card.color : CARD_BORDER);
    doc.setLineWidth(card.color ? 1 : 0.75);
    doc.roundedRect(x, y, cardW, cardH, cardRadius, cardRadius, "FD");

    const cx = x + cardW / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.cardLabel);
    setText(doc, MUTED);
    doc.text(card.label.toUpperCase(), cx, y + PDF_SPACE.xs + 6, { align: "center", charSpace: 0.4 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.cardValue);
    setText(doc, card.color ?? INK);
    doc.text(money(card.value), cx, y + cardH - PDF_SPACE.sm - 2, { align: "center" });
  });

  y += cardH + PDF_SPACE.lg;

  // ==================== 3. Ingresos ====================
  beginSection(i18n.t("reportes.ingresosPeriodo"), i18n.t("pdf.colPctTotal"));
  if (filasIngreso.length === 0) {
    emptyRow(i18n.t("reportes.sinIngresosRegistrados"));
  } else {
    filasIngreso.forEach((c, i) => dataRow(c.nombre, money(c.total), pct(c.total, ingresos), i));
  }
  totalRow(i18n.t("reportes.totalIngresos"), money(ingresos));
  endSection();
  y += PDF_SPACE.md;

  // ==================== 4. Egresos ====================
  // El % se mide contra el INGRESO del periodo, no contra el total de egresos:
  // "los sueldos fueron el 23% de lo que entró" informa; "el 76% de lo que
  // gastamos" no dice nada que el monto no diga ya.
  beginSection(i18n.t("reportes.gastosPeriodo"), i18n.t("pdf.colPctIngreso"));
  if (filasGasto.length === 0) {
    emptyRow(i18n.t("reportes.sinGastosRegistrados"));
  } else {
    filasGasto.forEach((c, i) => dataRow(c.nombre, money(c.total), pct(c.total, ingresos), i));
  }
  totalRow(i18n.t("reportes.totalGastos"), money(gastos));
  endSection();
  y += PDF_SPACE.md;

  // ==================== 5. Saldo de tesorería ====================
  // La ecuación contable real. Solo se dibuja si el llamador provee el saldo
  // anterior — nunca se inventa un valor.
  if (saldoAnterior != null) {
    const saldoFinal = saldoAnterior + ingresos - gastos;
    const filas: { label: string; value: number; strong?: boolean }[] = [
      { label: i18n.t("pdf.saldoAnterior"), value: saldoAnterior },
      { label: i18n.t("reportes.totalIngresos"), value: ingresos },
      { label: i18n.t("pdf.menosEgresos"), value: -gastos },
    ];

    ensureSpace(5 + PDF_SPACE.sm + 2 + filas.length * ROW_H + TOTAL_ROW_H);
    sectionTitle(i18n.t("pdf.saldoTesoreria"));

    filas.forEach((f, i) => {
      if (i % 2 === 1) {
        setFill(doc, ROW_ALT);
        doc.rect(marginX, y - ROW_H + 4, contentWidth, ROW_H, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(T.row);
      setText(doc, INK);
      doc.text(f.label, labelColX, y);
      doc.text(money(f.value), amountColX, y, { align: "right" });
      y += ROW_H;
    });

    setDraw(doc, INK);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.xs + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.total);
    setText(doc, INK);
    doc.text(i18n.t("pdf.saldoFinal"), labelColX, y);
    // Verde si es positivo, rojo si es negativo.
    setText(doc, saldoFinal < 0 ? DANGER : BRAND);
    doc.text(money(saldoFinal), amountColX, y, { align: "right" });
    y += PDF_SPACE.md;
  }

  // ==================== 6. Depósitos bancarios ====================
  const totalDepositos = depositosBancarios ?? 0;
  const hayDepositos = depositosDetalle != null && depositosDetalle.length > 0;
  if (hayDepositos || depositosBancarios != null) {
    y += PDF_SPACE.sm;
    const bankColX = amountColX - 12;

    ensureSpace(5 + PDF_SPACE.sm + 2 + T.colHead + 2 * ROW_H + TOTAL_ROW_H);
    currentSection = null; // esta tabla tiene columnas propias, no se repite
    sectionTitle(i18n.t("reportes.depositosBancarios"));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.colHead);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.colFechaDep").toUpperCase(), labelColX, y, { charSpace: 0.5 });
    doc.text(i18n.t("pdf.colBanco").toUpperCase(), labelColX + 78, y, { charSpace: 0.5 });
    doc.text(i18n.t("pdf.colMonto").toUpperCase(), bankColX, y, { align: "right", charSpace: 0.5 });
    y += PDF_SPACE.xs + 3;
    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.sm + 1;

    if (hayDepositos) {
      depositosDetalle!.forEach((dep, i) => {
        ensureSpace(ROW_H + TOTAL_ROW_H);
        if (i % 2 === 1) {
          setFill(doc, ROW_ALT);
          doc.rect(marginX, y - ROW_H + 4, contentWidth, ROW_H, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(T.row);
        setText(doc, INK);
        doc.text(fmtFechaCortaPdf(dep.fecha), labelColX, y);
        const banco = dep.referencia ? `${dep.cuenta_banco} · ${dep.referencia}` : dep.cuenta_banco;
        doc.text(banco, labelColX + 78, y, { maxWidth: bankColX - labelColX - 78 - PDF_SPACE.sm });
        doc.text(money(dep.monto), bankColX, y, { align: "right" });
        y += ROW_H;
      });
    } else {
      emptyRow(i18n.t("pdf.sinDepositos"));
    }

    ensureSpace(TOTAL_ROW_H);
    setDraw(doc, INK);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += PDF_SPACE.xs + 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(T.total);
    setText(doc, INK);
    doc.text(i18n.t("pdf.totalDepositos"), labelColX, y);
    doc.text(money(totalDepositos), bankColX, y, { align: "right" });
    y += PDF_SPACE.sm + 2;

    // Aclaración: los depósitos son un movimiento de efectivo a banco, no un
    // ingreso, así que NO entran en el saldo. Sin esta nota, un total mayor
    // que el ingreso del mes (dinero de meses previos) confunde al lector.
    doc.setFont("helvetica", "italic");
    doc.setFontSize(T.meta);
    setText(doc, FAINT);
    doc.text(i18n.t("pdf.notaDepositos"), labelColX, y, { maxWidth: contentWidth });
    y += PDF_SPACE.md;
  }

  // ==================== 7. Firmas (tesorero + pastor) ====================
  const firmantes: { nombre: string; cargo: string; img: string | null }[] = [];
  if (church.tesorero_nombre) {
    firmantes.push({
      nombre: church.tesorero_nombre,
      cargo: church.tesorero_cargo || i18n.t("rol.tesorero"),
      img: firmaDataUrl,
    });
  }
  if (church.pastor_nombre) {
    firmantes.push({
      nombre: church.pastor_nombre,
      cargo: church.pastor_cargo || i18n.t("pdf.pastorCargo"),
      img: firmaPastorDataUrl,
    });
  }

  if (firmantes.length > 0) {
    // El espacio para la imagen solo se reserva si al menos un firmante tiene
    // firma escaneada; con líneas vacías ese hueco empujaba el bloque entero
    // a una segunda página casi en blanco.
    const hayImagen = firmantes.some((f) => f.img != null);
    const sigImgMaxH = hayImagen ? 26 : 0;
    const sigLineW = firmantes.length > 1 ? (contentWidth - 60) / 2 : 190;
    const gapAntes = PDF_SPACE.lg + 6;
    const lineToName = PDF_SPACE.sm + 3;

    ensureSpace(gapAntes + sigImgMaxH + PDF_SPACE.xs + 1 + lineToName + 10 + PDF_SPACE.md);
    y += gapAntes;

    const baseY = y;
    let maxBottom = y;

    firmantes.forEach((f, i) => {
      const x = marginX + i * (sigLineW + 60);
      let fy = baseY;

      // La firma escaneada se dibuja justo encima de la línea.
      if (f.img) {
        try {
          const props = doc.getImageProperties(f.img);
          const h = sigImgMaxH;
          const w = Math.min(sigLineW, (props.width / props.height) * h);
          doc.addImage(f.img, "PNG", x, fy, w, h);
        } catch { /* firma ilegible: se deja solo la línea */ }
      }
      fy += sigImgMaxH + PDF_SPACE.xs;

      setDraw(doc, LINE);
      doc.setLineWidth(0.75);
      doc.line(x, fy, x + sigLineW, fy);
      fy += lineToName;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(T.sigName);
      setText(doc, INK);
      doc.text(f.nombre, x, fy, { maxWidth: sigLineW });
      fy += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(T.meta);
      setText(doc, MUTED);
      doc.text(f.cargo, x, fy, { maxWidth: sigLineW });
      fy += PDF_SPACE.sm;

      maxBottom = Math.max(maxBottom, fy);
    });

    y = maxBottom;
  }

  // ==================== 8. Pie en todas las páginas ====================
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
