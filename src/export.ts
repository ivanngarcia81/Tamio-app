import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Church } from "./db";
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

// Paleta minimalista y corporativa para el export de Excel (pensado para
// pantalla, no para impresión monocromática, a diferencia del PDF).
const PALETTE = {
  navy: "FF1E3A5F",
  navyLight: "FFCBD6E2",
  navyFaint: "FF9FB0C3",
  ink: "FF1A1A1A",
  muted: "FF6B6B6E",
  faint: "FF9A9A9C",
  border: "FFE4E6EA",
  bandLight: "FFF7F8FA",
  white: "FFFFFFFF",
  green: "FF05825A",
  greenTint: "FFE9F5F0",
  red: "FFC82828",
  redTint: "FFFBEAEA",
} as const;

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb: string): Partial<ExcelJS.Border> {
  return { style: "thin", color: { argb } };
}

/** Devuelve true si se guardó, false si el usuario canceló el diálogo. */
export async function exportReportExcel(data: ReportData): Promise<boolean> {
  const { church, mesLegibleStr, filasIngreso, filasGasto, ingresos, gastos, balance } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = church.nombre;
  wb.created = new Date();

  const ws = wb.addWorksheet("Estado financiero", {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.45, right: 0.45, header: 0.2, footer: 0.2 },
    },
  });

  ws.columns = [{ width: 15 }, { width: 15 }, { width: 11 }, { width: 13 }, { width: 11 }, { width: 13 }];

  // Formatos monetarios nativos de Excel — el valor numérico subyacente no
  // cambia, solo cómo se muestra: separador de miles, 2 decimales y símbolo.
  const moneyFmt = `"$"#,##0.00" ${church.moneda}"`;
  const moneyFmtSigned = `"$"#,##0.00" ${church.moneda}";("$"#,##0.00" ${church.moneda}")`;

  let r = 1;

  function mergeRow(row: number, c1: number, c2: number): ExcelJS.Cell {
    ws.mergeCells(row, c1, row, c2);
    return ws.getCell(row, c1);
  }

  // ---------- Encabezado ----------
  ws.getRow(r).height = 8;
  mergeRow(r, 1, 6).fill = solidFill(PALETTE.navy);
  r++;

  const titleCell = mergeRow(r, 1, 6);
  titleCell.fill = solidFill(PALETTE.navy);
  titleCell.value = "Estado financiero mensual";
  titleCell.font = { name: "Calibri", size: 20, bold: true, color: { argb: PALETTE.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 30;
  r++;

  const subtitleCell = mergeRow(r, 1, 6);
  subtitleCell.fill = solidFill(PALETTE.navy);
  subtitleCell.value = `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}   —   Periodo: ${mesLegibleStr}`;
  subtitleCell.font = { name: "Calibri", size: 12, color: { argb: PALETTE.navyLight } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 20;
  r++;

  const fechaGeneracion = new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const genCell = mergeRow(r, 1, 6);
  genCell.fill = solidFill(PALETTE.navy);
  genCell.value = `Generado el ${fechaGeneracion}`;
  genCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: PALETTE.navyFaint } };
  genCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 16;
  r++;

  ws.getRow(r).height = 10;
  mergeRow(r, 1, 6).fill = solidFill(PALETTE.navy);
  r++;
  r++; // respiro en blanco tras la banda

  // ---------- Tarjetas de resumen ----------
  type Card = { label: string; value: number; icon: string; color: string; tint: string };
  const balanceColor = balance > 0 ? PALETTE.green : balance < 0 ? PALETTE.red : PALETTE.faint;
  const balanceTint = balance > 0 ? PALETTE.greenTint : balance < 0 ? PALETTE.redTint : PALETTE.bandLight;
  const cards: Card[] = [
    { label: "INGRESOS TOTALES", value: ingresos, icon: "▲", color: PALETTE.green, tint: PALETTE.greenTint },
    { label: "GASTOS TOTALES", value: gastos, icon: "▼", color: PALETTE.red, tint: PALETTE.redTint },
    { label: "BALANCE NETO", value: balance, icon: balance < 0 ? "▼" : "▲", color: balanceColor, tint: balanceTint },
  ];
  const colPairs: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];

  const cardTop = r;
  ws.getRow(cardTop).height = 5; // barra de acento superior
  ws.getRow(cardTop + 1).height = 18; // etiqueta
  ws.getRow(cardTop + 2).height = 28; // valor
  ws.getRow(cardTop + 3).height = 10; // relleno inferior

  cards.forEach((card, i) => {
    const [c1, c2] = colPairs[i];

    mergeRow(cardTop, c1, c2).fill = solidFill(card.color);

    for (let off = 1; off <= 3; off++) {
      const row = cardTop + off;
      const cell = mergeRow(row, c1, c2);
      cell.fill = solidFill(card.tint);
      const leftCell = ws.getCell(row, c1);
      const rightCell = ws.getCell(row, c2);
      leftCell.border = { ...leftCell.border, left: thinBorder(PALETTE.border) };
      rightCell.border = { ...rightCell.border, right: thinBorder(PALETTE.border) };
      if (off === 3) {
        leftCell.border = { ...leftCell.border, bottom: thinBorder(PALETTE.border) };
        rightCell.border = { ...rightCell.border, bottom: thinBorder(PALETTE.border) };
      }
    }

    const labelCell = ws.getCell(cardTop + 1, c1);
    labelCell.value = `${card.icon}  ${card.label}`;
    labelCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: PALETTE.muted } };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };

    const valueCell = ws.getCell(cardTop + 2, c1);
    valueCell.value = card.value;
    valueCell.numFmt = moneyFmtSigned;
    valueCell.font = { name: "Calibri", size: 15, bold: true, color: { argb: card.color } };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
  });

  r = cardTop + 4;
  ws.getRow(r).height = 16; // respiro tras las tarjetas
  r++;

  // ---------- Helpers de sección/tabla ----------
  function sectionTitle(title: string) {
    const cell = mergeRow(r, 1, 6);
    cell.value = title.toUpperCase();
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: PALETTE.navy } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: thinBorder(PALETTE.border) };
    ws.getRow(r).height = 22;
    r++;
  }

  function tableHeader() {
    ws.getRow(r).height = 20;
    const label = mergeRow(r, 1, 3);
    label.value = "Categoría";
    const amount = mergeRow(r, 4, 5);
    amount.value = "Monto";
    const percent = ws.getCell(r, 6);
    percent.value = "% del total";
    [label, amount, percent].forEach((cell, i) => {
      cell.fill = solidFill(PALETTE.navy);
      cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: PALETTE.white } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right", indent: i === 0 ? 1 : 1 };
    });
    r++;
  }

  let bandIndex = 0;
  function dataRow(nombre: string, monto: number, pctStr: string) {
    ws.getRow(r).height = 19;
    const bg = bandIndex % 2 === 0 ? PALETTE.white : PALETTE.bandLight;
    bandIndex++;

    const label = mergeRow(r, 1, 3);
    label.value = nombre;
    label.font = { name: "Calibri", size: 10.5, color: { argb: PALETTE.ink } };
    label.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    label.fill = solidFill(bg);

    const amount = mergeRow(r, 4, 5);
    amount.value = monto;
    amount.numFmt = moneyFmt;
    amount.font = { name: "Calibri", size: 10.5, color: { argb: PALETTE.ink } };
    amount.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    amount.fill = solidFill(bg);

    const percent = ws.getCell(r, 6);
    percent.value = pctStr;
    percent.font = { name: "Calibri", size: 9, color: { argb: PALETTE.muted } };
    percent.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    percent.fill = solidFill(bg);

    r++;
  }

  function emptyRow(msg: string) {
    ws.getRow(r).height = 19;
    const cell = mergeRow(r, 1, 6);
    cell.value = msg;
    cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: PALETTE.faint } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    r++;
  }

  function totalRow(label: string, monto: number, tint: string) {
    ws.getRow(r).height = 22;
    const labelCell = mergeRow(r, 1, 3);
    labelCell.value = label;
    labelCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: PALETTE.ink } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    labelCell.fill = solidFill(tint);
    labelCell.border = { top: thinBorder(PALETTE.ink) };

    const amountCell = mergeRow(r, 4, 5);
    amountCell.value = monto;
    amountCell.numFmt = moneyFmt;
    amountCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: PALETTE.ink } };
    amountCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    amountCell.fill = solidFill(tint);
    amountCell.border = { top: thinBorder(PALETTE.ink) };

    const pctCell = ws.getCell(r, 6);
    pctCell.value = "100%";
    pctCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: PALETTE.muted } };
    pctCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    pctCell.fill = solidFill(tint);
    pctCell.border = { top: thinBorder(PALETTE.ink) };

    r++;
  }

  // ---------- Ingresos ----------
  sectionTitle("Ingresos del periodo");
  tableHeader();
  bandIndex = 0;
  if (filasIngreso.length === 0) {
    emptyRow("Sin ingresos registrados este mes.");
  } else {
    for (const c of filasIngreso) dataRow(c.nombre, c.total, pct(c.total, ingresos));
  }
  totalRow("Total ingresos", ingresos, PALETTE.greenTint);

  ws.getRow(r).height = 10;
  r++;

  // ---------- Gastos ----------
  sectionTitle("Gastos del periodo");
  tableHeader();
  bandIndex = 0;
  if (filasGasto.length === 0) {
    emptyRow("Sin gastos registrados este mes.");
  } else {
    for (const c of filasGasto) dataRow(c.nombre, c.total, pct(c.total, gastos));
  }
  totalRow("Total gastos", gastos, PALETTE.redTint);

  ws.getRow(r).height = 18;
  r++;

  // ---------- Resumen visual ----------
  const resumenTitleRow = r;
  sectionTitle("Resumen del periodo");

  function resumenLine(label: string, monto: number, color: string, bold: boolean) {
    ws.getRow(r).height = 20;
    const labelCell = mergeRow(r, 1, 4);
    labelCell.value = label;
    labelCell.font = { name: "Calibri", size: 10.5, bold, color: { argb: PALETTE.ink } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    const amountCell = mergeRow(r, 5, 6);
    amountCell.value = monto;
    amountCell.numFmt = moneyFmtSigned;
    amountCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: color } };
    amountCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    r++;
  }

  resumenLine("Total de ingresos", ingresos, PALETTE.green, false);
  resumenLine("Total de gastos", gastos, PALETTE.red, false);
  resumenLine("Balance final", balance, balanceColor, true);

  // marco sutil alrededor del resumen
  const resumenFirstRow = resumenTitleRow + 1;
  const resumenLastRow = r - 1;
  for (let row = resumenFirstRow; row <= resumenLastRow; row++) {
    const first = ws.getCell(row, 1);
    const last = ws.getCell(row, 6);
    first.border = { ...first.border, left: thinBorder(PALETTE.border) };
    last.border = { ...last.border, right: thinBorder(PALETTE.border) };
  }
  for (let col = 1; col <= 6; col++) {
    const topCell = ws.getCell(resumenFirstRow, col);
    topCell.border = { ...topCell.border, top: thinBorder(PALETTE.border) };
    const bottomCell = ws.getCell(resumenLastRow, col);
    bottomCell.border = { ...bottomCell.border, bottom: thinBorder(PALETTE.border) };
  }

  ws.getRow(r).height = 20;
  r++;

  // ---------- Preparado por / Revisado por / Aprobado por ----------
  const signLabelRow = r;
  ws.getRow(signLabelRow).height = 16;
  const signLineRow = signLabelRow + 1;
  ws.getRow(signLineRow).height = 26;

  const signLabels = ["Preparado por", "Revisado por", "Aprobado por"];
  signLabels.forEach((label, i) => {
    const [c1, c2] = colPairs[i];
    const labelCell = mergeRow(signLabelRow, c1, c2);
    labelCell.value = label;
    labelCell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: PALETTE.muted } };
    labelCell.alignment = { vertical: "middle", horizontal: "left" };

    const lineCell = mergeRow(signLineRow, c1, c2);
    lineCell.border = { bottom: thinBorder(PALETTE.ink) };
  });

  r = signLineRow + 1;
  ws.getRow(r).height = 12;
  r++;

  // ---------- Pie ----------
  const footerCell = mergeRow(r, 1, 6);
  footerCell.value = "Generado por Tesorería";
  footerCell.font = { name: "Calibri", size: 8, italic: true, color: { argb: PALETTE.faint } };
  footerCell.alignment = { vertical: "middle", horizontal: "left" };

  const buffer = await wb.xlsx.writeBuffer();

  const path = await save({
    defaultPath: `Estado-financiero-${slug(church.nombre)}-${slug(mesLegibleStr)}.xlsx`,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(buffer));
  return true;
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
  const { church, mesLegibleStr, periodoISO, filasIngreso, filasGasto, ingresos, gastos, balance, generatedBy, firmaPath } = data;

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
    doc.text("Generado automáticamente por Tesorería", marginX, fy);
    doc.text(`Página ${pageIndex} de ${totalPages}`, rightX, fy, { align: "right" });
    fy += 14;

    doc.text(`${fechaGeneracion} • ${horaGeneracion}`, marginX, fy);
    doc.text(`Reporte ${reportId}`, rightX, fy, { align: "right" });
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
    doc.text("Estado financiero mensual", marginX, y, { maxWidth: contentWidth });
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.church);
    setText(doc, INK);
    doc.text(`${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`, marginX, y, { maxWidth: contentWidth });
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.period);
    setText(doc, MUTED);
    doc.text(`Periodo: ${mesLegibleStr}`, marginX, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.meta);
    setText(doc, FAINT);
    doc.text(`Moneda: ${church.moneda}`, marginX, y);
    y += 14;

    if (generatedBy) {
      doc.text(`Generado por: ${generatedBy.nombre}${generatedBy.rol ? " · " + generatedBy.rol : ""}`, marginX, y);
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
    doc.text("CATEGORÍA", labelColX, y);
    doc.text("MONTO", amountColX, y, { align: "right" });
    doc.text("% DEL TOTAL", pctColX, y, { align: "right" });
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
      doc.text(`${currentSection} (continuación)`, marginX, y);
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

  function dataRow(label: string, amountStr: string, pctStr: string) {
    ensureSpace(PDF_SPACE.md);
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
    ensureSpace(PDF_SPACE.md);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, FAINT);
    doc.text(msg, labelColX, y);
    y += PDF_SPACE.md;
  }

  function totalRow(label: string, amountStr: string) {
    ensureSpace(PDF_TYPE.total + PDF_SPACE.xs + 4 + PDF_SPACE.md);
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
  beginSection("Ingresos del periodo");
  if (filasIngreso.length === 0) {
    emptyRow("Sin ingresos registrados este mes.");
  } else {
    for (const c of filasIngreso) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, ingresos));
    }
  }
  totalRow("Total ingresos", fmtMoneyPdf(ingresos, church.moneda));
  endSection();
  y += PDF_SPACE.md;

  // ---------- Gastos ----------
  beginSection("Gastos del periodo");
  if (filasGasto.length === 0) {
    emptyRow("Sin gastos registrados este mes.");
  } else {
    for (const c of filasGasto) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, gastos));
    }
  }
  totalRow("Total gastos", fmtMoneyPdf(gastos, church.moneda));
  endSection();
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
    { label: "TOTAL INGRESOS", value: ingresos },
    { label: "TOTAL GASTOS", value: gastos },
    { label: "BALANCE NETO", value: balance },
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
  // cargo comparten el mismo centro horizontal, como una firma impresa
  // tradicional, en vez de quedar pegados al margen izquierdo.
  if (generatedBy?.nombre) {
    const sigLineW = 200;
    const sigImgMaxH = 46;
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

    ensureSpace((sigImgH > 0 ? sigImgH + PDF_SPACE.xs : 0) + 1 + lineToNameGap + nameToRoleGap + PDF_SPACE.md);

    const cx = marginX + contentWidth / 2;

    if (firmaDataUrl && sigImgH > 0) {
      doc.addImage(firmaDataUrl, "PNG", cx - sigImgW / 2, y, sigImgW, sigImgH);
      y += sigImgH + PDF_SPACE.xs;
    }

    setDraw(doc, LINE);
    doc.setLineWidth(0.75);
    doc.line(cx - sigLineW / 2, y, cx + sigLineW / 2, y);
    y += lineToNameGap;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, INK);
    doc.text(generatedBy.nombre, cx, y, { align: "center" });
    y += nameToRoleGap;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.meta);
    setText(doc, MUTED);
    doc.text(generatedBy.rol ?? "Tesorero", cx, y, { align: "center" });
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
  const fileName = `Estado-financiero-${slug(church.nombre)}-${slug(mesLegibleStr)}.pdf`;
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
