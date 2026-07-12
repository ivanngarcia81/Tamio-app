import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Church } from "./db";

type RGB = readonly [number, number, number];
function setText(doc: jsPDF, color: RGB): void {
  doc.setTextColor(color[0], color[1], color[2]);
}
function setDraw(doc: jsPDF, color: RGB): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}
function setFill(doc: jsPDF, color: RGB): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

export interface ReportRow {
  nombre: string;
  total: number;
}

export interface ReportData {
  church: Church;
  mesLegibleStr: string;
  filasIngreso: ReportRow[];
  filasGasto: ReportRow[];
  ingresos: number;
  gastos: number;
  balance: number;
}

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "reporte"
  );
}

function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

/**
 * Formato de dinero seguro para jsPDF: la fuente Helvetica integrada no
 * reconoce el signo menos Unicode (−, U+2212) que usa fmtMoney() para
 * pantalla — al no poder mapearlo, jsPDF rompe el cálculo de ancho de
 * TODO el string (de ahí el espaciado gigante) y sustituye el glifo por
 * un caracter incorrecto. Los negativos se muestran entre paréntesis,
 * una convención estándar de estados financieros que evita el problema
 * de raíz sin depender de ningún caracter especial.
 */
function fmtMoneyPdf(n: number, moneda: string): string {
  const abs = Math.abs(n);
  const formatted = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${moneda}`;
  return n < 0 ? `(${formatted})` : formatted;
}

// Paleta minimalista y corporativa — coincide con los acentos verde/rojo
// ya usados en el PDF (GREEN/RED) para que ambos exports luzcan consistentes.
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

/** Devuelve true si se guardó, false si el usuario canceló el diálogo. */
export async function exportReportPdf(data: ReportData): Promise<boolean> {
  const { church, mesLegibleStr, filasIngreso, filasGasto, ingresos, gastos, balance } = data;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginBottom = 56;
  const rightX = pageWidth - marginX;
  const amountColX = rightX - 92; // ancla derecha de la columna de monto
  const pctColX = rightX;         // ancla derecha de la columna de %
  let y = 60;

  const INK: RGB = [26, 26, 26];
  const MUTED: RGB = [107, 107, 110];
  const FAINT: RGB = [150, 150, 152];
  const LINE: RGB = [229, 229, 227];
  const GREEN: RGB = [5, 130, 90];
  const RED: RGB = [200, 40, 40];
  const CARD_BG: RGB = [252, 252, 251];
  const CARD_BORDER: RGB = [224, 224, 221];

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = 60;
    }
  }

  // ---------- Encabezado ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  setText(doc, INK);
  doc.text("Estado financiero mensual", marginX, y);
  y += 21;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  setText(doc, MUTED);
  doc.text(`${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`, marginX, y);
  y += 15;
  setText(doc, FAINT);
  doc.text(`Periodo: ${mesLegibleStr}`, marginX, y);
  y += 8;

  setDraw(doc, LINE);
  doc.setLineWidth(0.75);
  doc.line(marginX, y, rightX, y);
  y += 34; // respiro generoso antes de la primera sección

  // ---------- Helpers de sección ----------
  function sectionTitle(title: string) {
    ensureSpace(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    setText(doc, MUTED);
    doc.text(title.toUpperCase(), marginX, y, { charSpace: 0.6 });
    y += 16;
  }

  function dataRow(label: string, amountStr: string, pctStr: string, bold = false) {
    ensureSpace(22);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10.5 : 10);
    setText(doc, bold ? INK : [64, 64, 66]);
    doc.text(label, marginX, y);
    doc.text(amountStr, amountColX, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setText(doc, FAINT);
    doc.text(pctStr, pctColX, y, { align: "right" });
    y += 20; // ~15-20% más de aire que antes (18pt → 20pt)
  }

  function emptyRow(msg: string) {
    ensureSpace(20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText(doc, FAINT);
    doc.text(msg, marginX, y);
    y += 20;
  }

  function totalDivider() {
    ensureSpace(16);
    setDraw(doc, INK);
    doc.setLineWidth(0.75);
    doc.line(marginX, y, rightX, y);
    y += 15; // separación clara: la línea ya no atraviesa el texto
  }

  // ---------- Ingresos ----------
  sectionTitle("Ingresos del periodo");
  if (filasIngreso.length === 0) {
    emptyRow("Sin ingresos registrados este mes.");
  } else {
    for (const c of filasIngreso) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, ingresos));
    }
  }
  totalDivider();
  dataRow("Total ingresos", fmtMoneyPdf(ingresos, church.moneda), "100%", true);
  y += 30; // separación entre secciones (~20% más que antes)

  // ---------- Gastos ----------
  sectionTitle("Gastos del periodo");
  if (filasGasto.length === 0) {
    emptyRow("Sin gastos registrados este mes.");
  } else {
    for (const c of filasGasto) {
      dataRow(c.nombre, fmtMoneyPdf(c.total, church.moneda), pct(c.total, gastos));
    }
  }
  totalDivider();
  dataRow("Total gastos", fmtMoneyPdf(gastos, church.moneda), "100%", true);
  y += 24; // separación antes del resumen (reducida ~10pt respecto a la versión anterior)

  // ---------- Tarjetas de resumen ----------
  const cardH = 52;
  ensureSpace(cardH + 6);

  const gap = 14;
  const cardW = (rightX - marginX - 2 * gap) / 3;
  const radius = 16;

  const cards: { label: string; value: number; color: readonly [number, number, number] }[] = [
    { label: "Total ingresos", value: ingresos, color: GREEN },
    { label: "Total gastos", value: gastos, color: RED },
    { label: "Balance neto", value: balance, color: balance < 0 ? RED : INK },
  ];

  cards.forEach((card, i) => {
    const x = marginX + i * (cardW + gap);

    // sombra estilo Apple: varias capas de negro a muy baja opacidad en vez
    // de un relleno gris plano — simula un desenfoque suave sin bordes duros.
    doc.setGState(doc.GState({ opacity: 0.035 }));
    setFill(doc, [0, 0, 0]);
    doc.roundedRect(x + 2.25, y + 3.5, cardW, cardH, radius, radius, "F");
    doc.setGState(doc.GState({ opacity: 0.05 }));
    doc.roundedRect(x + 1.25, y + 2, cardW, cardH, radius, radius, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    // tarjeta
    setFill(doc, CARD_BG);
    setDraw(doc, CARD_BORDER);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, y, cardW, cardH, radius, radius, "FD");

    const cx = x + cardW / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(doc, MUTED);
    doc.text(card.label.toUpperCase(), cx, y + 17, { align: "center", charSpace: 0.5 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setText(doc, card.color);
    doc.text(fmtMoneyPdf(card.value, church.moneda), cx, y + 35, { align: "center" });
  });

  y += cardH + 30;

  // ---------- Pie ----------
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, FAINT);
  doc.text("Generado por Tesorería", marginX, pageHeight - 32);

  const bytes = doc.output("arraybuffer") as ArrayBuffer;

  const path = await save({
    defaultPath: `Estado-financiero-${slug(church.nombre)}-${slug(mesLegibleStr)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(bytes));
  return true;
}
