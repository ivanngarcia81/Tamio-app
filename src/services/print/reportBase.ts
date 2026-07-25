import jsPDF from "jspdf";
import i18n from "../../i18n";
import {
  PDF_COLOR, PDF_FOOTER_BLOCK_H, PDF_MARGIN, PDF_SPACE,
  setDraw, setFill, setText,
} from "./printUtils";

// ---------- Plantilla base de los reportes de Tesorería ----------
//
// Diseño de documento contable compartido por el Estado financiero mensual
// (export.ts) y el Registro de movimientos (printRegister.ts): mismo membrete,
// misma escala tipográfica, mismas tablas, mismas firmas y mismo pie. Ambos
// documentos deben verse hermanos; cualquier ajuste de estilo se hace AQUÍ.
//
// La escala es propia de esta plantilla: PDF_TYPE (printUtils.ts) la siguen
// usando los reportes aún no migrados (Dashboard, Anual, Constancia, Acta) y
// cambiarla los alteraría.
export const REPORT_TYPE = {
  title: 21,     // Título del documento ("Estado financiero mensual")
  church: 16,    // Nombre de la iglesia — el elemento más prominente
  period: 10,    // Periodo · moneda · filtros
  meta: 8,       // Notas y avisos
  section: 12.5, // Encabezados de sección
  colHead: 8.5,  // Encabezados de columna (mayúsculas + letter-spacing)
  row: 10.5,     // Filas de tabla
  total: 11,     // Filas de total
  cardLabel: 7,
  cardValue: 12.5,
  sigName: 9.5,
} as const;

export interface BaseCol {
  label: string;
  /** Ancho en puntos; el llamador reparte contentWidth como quiera. */
  width: number;
  align?: "left" | "right";
}

export interface BaseFirmante {
  nombre: string;
  cargo: string;
  /** Firma escaneada (data URL) o null para dejar solo la línea. */
  img: string | null;
}

export interface ReportBaseOptions {
  /** Nombre propio de la iglesia: nunca se traduce. */
  churchNombre: string;
  titulo: string;
  /** Línea gris bajo el título: ciudad, periodo, moneda, filtros aplicados. */
  meta: string[];
  logoDataUrl?: string | null;
}

const ROW_H = PDF_SPACE.md + 2;
const TOTAL_ROW_H = REPORT_TYPE.total + PDF_SPACE.xs + 4 + PDF_SPACE.md;

export class ReportBase {
  readonly doc: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marginX: number;
  readonly rightX: number;
  readonly contentWidth: number;

  private y = PDF_MARGIN;
  private currentSection: string | null = null;
  private currentCols: BaseCol[] | null = null;
  private readonly opts: ReportBaseOptions;

  constructor(opts: ReportBaseOptions) {
    this.opts = opts;
    this.doc = new jsPDF({ unit: "pt", format: "letter" });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.marginX = PDF_MARGIN;
    this.rightX = this.pageWidth - PDF_MARGIN;
    this.contentWidth = this.rightX - this.marginX;
    this.drawMembrete();
  }

  /** Membrete: logo + iglesia (16pt, lo más prominente) + título (21pt) +
   *  línea de metadatos, cerrado por el filete verde de marca. Se repite en
   *  cada página para que una hoja suelta siga siendo identificable. */
  private drawMembrete() {
    const { doc } = this;
    const logoSize = 34;
    let textX = this.marginX;

    if (this.opts.logoDataUrl) {
      try {
        doc.addImage(this.opts.logoDataUrl, "PNG", this.marginX, this.y, logoSize, logoSize);
        textX = this.marginX + logoSize + 12;
      } catch {
        textX = this.marginX;
      }
    }

    const textW = this.rightX - textX;
    let ty = this.y + 13;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(REPORT_TYPE.church);
    setText(doc, PDF_COLOR.ink);
    doc.text(this.opts.churchNombre, textX, ty, { maxWidth: textW });
    ty += 20; // el título de 21pt necesita este avance para no solaparse

    doc.setFont("helvetica", "bold");
    doc.setFontSize(REPORT_TYPE.title);
    setText(doc, PDF_COLOR.ink);
    doc.text(this.opts.titulo, textX, ty, { maxWidth: textW });
    ty += 13;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(REPORT_TYPE.period);
    setText(doc, PDF_COLOR.muted);
    doc.text(this.opts.meta.join("  ·  "), textX, ty, { maxWidth: textW });
    ty += 8;

    this.y = Math.max(ty, this.y + (this.opts.logoDataUrl ? logoSize : 0)) + PDF_SPACE.xs;

    setDraw(doc, PDF_COLOR.brand);
    doc.setLineWidth(2);
    doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.md;
  }

  private newPage() {
    this.doc.addPage();
    this.y = PDF_MARGIN;
    this.drawMembrete();
    if (this.currentSection && this.currentCols) {
      this.sectionTitleRaw(i18n.t("pdf.continuacion", { seccion: this.currentSection }));
      this.colHeadersRaw(this.currentCols);
    }
  }

  ensureSpace(height: number) {
    if (this.y + height > this.pageHeight - PDF_MARGIN - PDF_FOOTER_BLOCK_H) {
      this.newPage();
    }
  }

  addGap(height: number) {
    this.y += height;
  }

  /** Título de sección con el filete verde fino debajo (acento de marca). */
  private sectionTitleRaw(title: string) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(REPORT_TYPE.section);
    setText(this.doc, PDF_COLOR.ink);
    this.doc.text(title, this.marginX, this.y);
    this.y += 5;
    setDraw(this.doc, PDF_COLOR.brand);
    this.doc.setLineWidth(1);
    this.doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.sm + 2;
  }

  sectionTitle(title: string) {
    this.ensureSpace(5 + PDF_SPACE.sm + 2 + 2 * ROW_H);
    this.currentSection = null;
    this.currentCols = null;
    this.sectionTitleRaw(title);
  }

  /** Encabezados de columna: mayúsculas, letter-spacing, y las columnas
   *  numéricas alineadas a la derecha EXACTAMENTE sobre sus valores. */
  private colHeadersRaw(cols: BaseCol[]) {
    const { doc } = this;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(REPORT_TYPE.colHead);
    setText(doc, PDF_COLOR.faint);
    let x = this.marginX;
    for (const col of cols) {
      const tx = col.align === "right" ? x + col.width : x;
      doc.text(col.label.toUpperCase(), tx, this.y, { align: col.align === "right" ? "right" : "left", charSpace: 0.5 });
      x += col.width;
    }
    this.y += PDF_SPACE.xs + 3;
    setDraw(doc, PDF_COLOR.line);
    doc.setLineWidth(0.75);
    doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.sm + 1;
  }

  /** Sección + encabezado de columnas como bloque atómico. */
  beginTable(title: string, cols: BaseCol[]) {
    this.ensureSpace(5 + PDF_SPACE.sm + 2 + REPORT_TYPE.colHead + PDF_SPACE.xs + 3 + PDF_SPACE.sm + 1 + 3 * ROW_H);
    this.currentSection = title;
    this.currentCols = cols;
    this.sectionTitleRaw(title);
    this.colHeadersRaw(cols);
  }

  endTable() {
    this.currentSection = null;
    this.currentCols = null;
  }

  /** Fila de datos con cebra sutil. Una celda larga se envuelve y la fila
   *  crece según la celda más alta. `faintCols` pinta en gris tenue las
   *  columnas secundarias (p. ej. el "% del total"). */
  row(cells: string[], cols: BaseCol[], index: number, faintCols: number[] = []) {
    this.doc.setFontSize(REPORT_TYPE.row);
    const anchos = cols.map((c) => c.width - (c.align === "right" ? 4 : PDF_SPACE.xs));
    const maxLineas = Math.max(
      1,
      ...cols.map((_, i) => (this.doc.splitTextToSize(cells[i] ?? "", anchos[i]) as string[]).length)
    );
    const rowH = ROW_H + (maxLineas - 1) * (REPORT_TYPE.row * 1.15);
    this.ensureSpace(rowH + TOTAL_ROW_H);

    if (index % 2 === 1) {
      setFill(this.doc, PDF_COLOR.rowAlt);
      this.doc.rect(this.marginX, this.y - ROW_H + 4, this.contentWidth, rowH, "F");
    }
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(REPORT_TYPE.row);
    let x = this.marginX;
    cols.forEach((col, i) => {
      const tx = col.align === "right" ? x + col.width : x;
      setText(this.doc, faintCols.includes(i) ? PDF_COLOR.faint : PDF_COLOR.ink);
      this.doc.text(cells[i] ?? "", tx, this.y, { align: col.align === "right" ? "right" : "left", maxWidth: anchos[i] });
      x += col.width;
    });
    this.y += rowH;
  }

  emptyRow(msg: string) {
    this.ensureSpace(ROW_H + TOTAL_ROW_H);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(REPORT_TYPE.row);
    setText(this.doc, PDF_COLOR.faint);
    this.doc.text(msg, this.marginX, this.y);
    this.y += ROW_H;
  }

  /** Fila de total: línea de cierre + etiqueta y monto en bold. Sin celdas
   *  de "100%". `color` tiñe el ÚLTIMO monto (saldo final verde/rojo). */
  totalRow(cells: string[], cols: BaseCol[], color?: readonly [number, number, number]) {
    this.ensureSpace(TOTAL_ROW_H);
    setDraw(this.doc, PDF_COLOR.ink);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.xs + 3;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(REPORT_TYPE.total);
    let x = this.marginX;
    const ultimaConTexto = cells.reduce((last, c, i) => (c ? i : last), 0);
    cols.forEach((col, i) => {
      const tx = col.align === "right" ? x + col.width : x;
      setText(this.doc, color && i === ultimaConTexto ? color : PDF_COLOR.ink);
      if (cells[i]) this.doc.text(cells[i], tx, this.y, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    });
    this.y += PDF_SPACE.md;
  }

  /** Nota en cursiva gris (aclaraciones, avisos). */
  paragraph(text: string) {
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(REPORT_TYPE.meta);
    const lines = this.doc.splitTextToSize(text, this.contentWidth) as string[];
    const lineH = REPORT_TYPE.meta + 3;
    this.ensureSpace(lines.length * lineH);
    setText(this.doc, PDF_COLOR.faint);
    for (const line of lines) {
      this.doc.text(line, this.marginX, this.y);
      this.y += lineH;
    }
  }

  /** Tarjetas de resumen; `color` da borde y cifra de marca (o rojo). */
  cards(items: { label: string; value: string; color?: readonly [number, number, number] }[]) {
    const cardH = 44;
    const cardGap = PDF_SPACE.sm;
    this.ensureSpace(cardH + PDF_SPACE.lg);

    const cardW = (this.contentWidth - (items.length - 1) * cardGap) / items.length;
    const radius = 8;

    items.forEach((card, i) => {
      const x = this.marginX + i * (cardW + cardGap);

      this.doc.setGState(this.doc.GState({ opacity: 0.035 }));
      setFill(this.doc, [0, 0, 0]);
      this.doc.roundedRect(x + 1.1, this.y + 1.75, cardW, cardH, radius, radius, "F");
      this.doc.setGState(this.doc.GState({ opacity: 1 }));

      setFill(this.doc, PDF_COLOR.cardBg);
      setDraw(this.doc, card.color ?? PDF_COLOR.cardBorder);
      this.doc.setLineWidth(card.color ? 1 : 0.75);
      this.doc.roundedRect(x, this.y, cardW, cardH, radius, radius, "FD");

      const cx = x + cardW / 2;
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(REPORT_TYPE.cardLabel);
      setText(this.doc, PDF_COLOR.muted);
      this.doc.text(card.label.toUpperCase(), cx, this.y + PDF_SPACE.xs + 6, { align: "center", charSpace: 0.4 });

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(REPORT_TYPE.cardValue);
      setText(this.doc, card.color ?? PDF_COLOR.ink);
      this.doc.text(card.value, cx, this.y + cardH - PDF_SPACE.sm - 2, { align: "center", maxWidth: cardW - PDF_SPACE.sm });
    });

    this.y += cardH + PDF_SPACE.lg;
  }

  /** Bloque de firmas (Tesorero / Pastor): línea, nombre y cargo alineados a
   *  la izquierda de cada columna. Solo reserva alto de imagen si al menos un
   *  firmante tiene firma escaneada. Bloque atómico. */
  firmas(people: BaseFirmante[]) {
    if (people.length === 0) return;
    const hayImagen = people.some((p) => p.img != null);
    const sigImgMaxH = hayImagen ? 26 : 0;
    const colW = people.length > 1 ? (this.contentWidth - 60) / 2 : 190;
    const gapAntes = PDF_SPACE.lg + 6;
    const lineToName = PDF_SPACE.sm + 3;

    this.ensureSpace(gapAntes + sigImgMaxH + PDF_SPACE.xs + 1 + lineToName + 10 + PDF_SPACE.md);
    this.y += gapAntes;

    const baseY = this.y;
    let maxBottom = this.y;

    people.forEach((f, i) => {
      const x = this.marginX + i * (colW + 60);
      let fy = baseY;

      if (f.img) {
        try {
          const props = this.doc.getImageProperties(f.img);
          const h = sigImgMaxH;
          const w = Math.min(colW, (props.width / props.height) * h);
          this.doc.addImage(f.img, "PNG", x, fy, w, h);
        } catch { /* firma ilegible: queda solo la línea */ }
      }
      fy += sigImgMaxH + PDF_SPACE.xs;

      setDraw(this.doc, PDF_COLOR.line);
      this.doc.setLineWidth(0.75);
      this.doc.line(x, fy, x + colW, fy);
      fy += lineToName;

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(REPORT_TYPE.sigName);
      setText(this.doc, PDF_COLOR.ink);
      this.doc.text(f.nombre, x, fy, { maxWidth: colW });
      fy += 10;

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(REPORT_TYPE.meta);
      setText(this.doc, PDF_COLOR.muted);
      this.doc.text(f.cargo, x, fy, { maxWidth: colW });
      fy += PDF_SPACE.sm;

      maxBottom = Math.max(maxBottom, fy);
    });

    this.y = maxBottom;
  }

  private drawFooter(pageIndex: number, totalPages: number, meta: { reportId: string; fechaGeneracion: string; horaGeneracion: string }) {
    let fy = this.pageHeight - PDF_MARGIN - PDF_FOOTER_BLOCK_H + PDF_SPACE.sm;

    setDraw(this.doc, PDF_COLOR.line);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, fy, this.rightX, fy);
    fy += 10;

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    setText(this.doc, PDF_COLOR.faint);
    this.doc.text(i18n.t("pdf.generadoAutomaticamente"), this.marginX, fy);
    this.doc.text(i18n.t("pdf.pagina", { x: pageIndex, y: totalPages }), this.rightX, fy, { align: "right" });
    fy += 10;

    this.doc.text(`${meta.fechaGeneracion} • ${meta.horaGeneracion}`, this.marginX, fy);
    this.doc.text(i18n.t("pdf.reporte", { id: meta.reportId }), this.rightX, fy, { align: "right" });
    fy += PDF_SPACE.xs;

    setDraw(this.doc, PDF_COLOR.line);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, fy, this.rightX, fy);
  }

  /** Pasada final: pie con "Página X de Y" en cada página y bytes del PDF. */
  finalize(meta: { reportId: string; fechaGeneracion: string; horaGeneracion: string }): ArrayBuffer {
    const totalPages = this.doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      this.doc.setPage(p);
      this.drawFooter(p, totalPages, meta);
    }
    return this.doc.output("arraybuffer") as ArrayBuffer;
  }
}
