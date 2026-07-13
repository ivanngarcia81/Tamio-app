import jsPDF from "jspdf";
import {
  PDF_COLOR, PDF_FOOTER_BLOCK_H, PDF_MARGIN, PDF_SPACE, PDF_TYPE,
  setDraw, setFill, setText,
} from "./printUtils";

export interface PdfColumn {
  label: string;
  width: number;
  align?: "left" | "right";
}

export interface PdfPersonSignature {
  nombre?: string | null;
  rol: string;
  firmaDataUrl?: string | null;
}

interface ReportDocOptions {
  title: string;
  churchLine: string;
  period: string;
  moneda?: string;
  generatedBy?: { nombre: string; rol?: string };
  logoDataUrl?: string | null;
}

/**
 * Motor de PDF genérico y reutilizable: encabezado repetido, tablas de
 * columnas arbitrarias con salto de página automático (repite título +
 * encabezado de columnas en la página siguiente si una tabla se corta a
 * mitad), tarjetas de resumen, cuadrícula de indicadores, imágenes
 * (gráficas capturadas, firmas) y pie de página con folio + "Página X de Y".
 *
 * Usa la misma tipografía/espaciado/paleta fijos de printUtils.ts para que
 * cualquier documento generado con esta clase luzca consistente, sea el
 * reporte mensual, el resumen del Dashboard o el registro de movimientos.
 */
export class ReportDocBuilder {
  readonly doc: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marginX: number;
  readonly rightX: number;
  readonly contentWidth: number;

  private y = PDF_MARGIN;
  private currentSection: string | null = null;
  private currentColumns: PdfColumn[] | null = null;
  private readonly opts: ReportDocOptions;

  constructor(opts: ReportDocOptions) {
    this.opts = opts;
    this.doc = new jsPDF({ unit: "pt", format: "letter" });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.marginX = PDF_MARGIN;
    this.rightX = this.pageWidth - PDF_MARGIN;
    this.contentWidth = this.rightX - this.marginX;
    this.drawRunningHeader();
  }

  private drawRunningHeader() {
    const { doc } = this;
    let titleRightBound = this.contentWidth;

    if (this.opts.logoDataUrl) {
      try {
        const props = doc.getImageProperties(this.opts.logoDataUrl);
        const logoH = 40;
        const logoW = (props.width / props.height) * logoH;
        doc.addImage(this.opts.logoDataUrl, "PNG", this.rightX - logoW, this.y - 6, logoW, logoH);
        titleRightBound = this.contentWidth - logoW - PDF_SPACE.sm;
      } catch {
        /* si el logo no es una imagen válida, se omite sin romper el documento */
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.title);
    setText(doc, PDF_COLOR.ink);
    doc.text(this.opts.title, this.marginX, this.y, { maxWidth: titleRightBound });
    this.y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.church);
    setText(doc, PDF_COLOR.ink);
    doc.text(this.opts.churchLine, this.marginX, this.y, { maxWidth: this.contentWidth });
    this.y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(PDF_TYPE.period);
    setText(doc, PDF_COLOR.muted);
    doc.text(`Periodo: ${this.opts.period}`, this.marginX, this.y);
    this.y += 16;

    if (this.opts.moneda) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.meta);
      setText(doc, PDF_COLOR.faint);
      doc.text(`Moneda: ${this.opts.moneda}`, this.marginX, this.y);
      this.y += 14;
    }

    if (this.opts.generatedBy) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_TYPE.meta);
      setText(doc, PDF_COLOR.faint);
      doc.text(
        `Generado por: ${this.opts.generatedBy.nombre}${this.opts.generatedBy.rol ? " · " + this.opts.generatedBy.rol : ""}`,
        this.marginX, this.y
      );
      this.y += 14;
    }

    this.y += PDF_SPACE.xs;
    setDraw(doc, PDF_COLOR.line);
    doc.setLineWidth(0.75);
    doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.md;
  }

  private drawTableHeaderRaw(columns: PdfColumn[]) {
    const { doc } = this;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(PDF_TYPE.body);
    setText(doc, PDF_COLOR.muted);
    let x = this.marginX;
    for (const col of columns) {
      const tx = col.align === "right" ? x + col.width : x;
      doc.text(col.label.toUpperCase(), tx, this.y, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    this.y += PDF_SPACE.xs + 4;
    setDraw(doc, PDF_COLOR.line);
    doc.setLineWidth(0.75);
    doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.sm;
  }

  private newPage() {
    this.doc.addPage();
    this.y = PDF_MARGIN;
    this.drawRunningHeader();
    if (this.currentSection && this.currentColumns) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(PDF_TYPE.section);
      setText(this.doc, PDF_COLOR.ink);
      this.doc.text(`${this.currentSection} (continuación)`, this.marginX, this.y);
      this.y += 20;
      this.drawTableHeaderRaw(this.currentColumns);
    }
  }

  /** Deja espacio garantizado antes de dibujar algo; si no cabe, pasa de
   *  página (repitiendo encabezado y, si hay una tabla abierta, su título
   *  y columnas) ANTES de que el llamador dibuje nada — así ningún
   *  elemento se corta a la mitad entre dos páginas. */
  ensureSpace(height: number) {
    if (this.y + height > this.pageHeight - PDF_MARGIN - PDF_FOOTER_BLOCK_H) {
      this.newPage();
    }
  }

  addGap(height: number) {
    this.y += height;
  }

  /** Encabezado de sección simple (sin tabla asociada). */
  heading(title: string) {
    this.ensureSpace(20 + PDF_SPACE.xs);
    this.currentSection = null;
    this.currentColumns = null;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(PDF_TYPE.section);
    setText(this.doc, PDF_COLOR.ink);
    this.doc.text(title, this.marginX, this.y);
    this.y += 20 + PDF_SPACE.xs;
  }

  /** Inicia una sección + tabla como bloque atómico: título y encabezado
   *  de columnas siempre aparecen juntos, nunca separados por un salto. */
  beginTable(title: string, columns: PdfColumn[]) {
    this.ensureSpace(20 + PDF_TYPE.body + PDF_SPACE.xs + 4 + PDF_SPACE.sm);
    this.currentSection = title;
    this.currentColumns = columns;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(PDF_TYPE.section);
    setText(this.doc, PDF_COLOR.ink);
    this.doc.text(title, this.marginX, this.y);
    this.y += 20;
    this.drawTableHeaderRaw(columns);
  }

  endTable() {
    this.currentSection = null;
    this.currentColumns = null;
  }

  tableRow(cells: string[], columns: PdfColumn[]) {
    this.ensureSpace(PDF_SPACE.md);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(PDF_TYPE.tableRow);
    setText(this.doc, PDF_COLOR.ink);
    let x = this.marginX;
    columns.forEach((col, i) => {
      const tx = col.align === "right" ? x + col.width : x;
      this.doc.text(cells[i] ?? "", tx, this.y, {
        align: col.align === "right" ? "right" : "left",
        maxWidth: col.width - (col.align === "right" ? 4 : PDF_SPACE.xs),
      });
      x += col.width;
    });
    this.y += PDF_SPACE.md;
  }

  emptyRow(msg: string) {
    this.ensureSpace(PDF_SPACE.md);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(PDF_TYPE.body);
    setText(this.doc, PDF_COLOR.faint);
    this.doc.text(msg, this.marginX, this.y);
    this.y += PDF_SPACE.md;
  }

  totalRow(cells: string[], columns: PdfColumn[]) {
    this.ensureSpace(PDF_TYPE.total + PDF_SPACE.xs + 4 + PDF_SPACE.md);
    setDraw(this.doc, PDF_COLOR.ink);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, this.y, this.rightX, this.y);
    this.y += PDF_SPACE.xs + 4;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(PDF_TYPE.total);
    setText(this.doc, PDF_COLOR.ink);
    let x = this.marginX;
    columns.forEach((col, i) => {
      const tx = col.align === "right" ? x + col.width : x;
      this.doc.text(cells[i] ?? "", tx, this.y, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    });
    this.y += PDF_SPACE.md;
  }

  /** Tarjetas de resumen (2 a 4), mismo estilo visual en todos los reportes.
   *  Bloque atómico: si no caben todas, se mueven juntas a la siguiente página. */
  cardsRow(cards: { label: string; value: string }[]) {
    const cardH = 92;
    const cardGap = PDF_SPACE.sm;
    this.ensureSpace(cardH);

    const cardW = (this.contentWidth - (cards.length - 1) * cardGap) / cards.length;
    const cardRadius = 12;

    cards.forEach((card, i) => {
      const x = this.marginX + i * (cardW + cardGap);

      this.doc.setGState(this.doc.GState({ opacity: 0.035 }));
      setFill(this.doc, [0, 0, 0]);
      this.doc.roundedRect(x + 2.25, this.y + 3.5, cardW, cardH, cardRadius, cardRadius, "F");
      this.doc.setGState(this.doc.GState({ opacity: 0.05 }));
      this.doc.roundedRect(x + 1.25, this.y + 2, cardW, cardH, cardRadius, cardRadius, "F");
      this.doc.setGState(this.doc.GState({ opacity: 1 }));

      setFill(this.doc, PDF_COLOR.cardBg);
      setDraw(this.doc, PDF_COLOR.cardBorder);
      this.doc.setLineWidth(0.75);
      this.doc.roundedRect(x, this.y, cardW, cardH, cardRadius, cardRadius, "FD");

      const cx = x + cardW / 2;
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(PDF_TYPE.cardLabel);
      setText(this.doc, PDF_COLOR.muted);
      this.doc.text(card.label, cx, this.y + PDF_SPACE.md, { align: "center", charSpace: 0.3 });

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(PDF_TYPE.cardValue);
      setText(this.doc, PDF_COLOR.ink);
      this.doc.text(card.value, cx, this.y + cardH - PDF_SPACE.md + 4, { align: "center", maxWidth: cardW - PDF_SPACE.md });
    });

    this.y += cardH;
  }

  /** Cuadrícula de indicadores tipo "etiqueta / valor" (2 columnas por fila). */
  keyValueGrid(pairs: { label: string; value: string }[], columns = 2) {
    const colW = this.contentWidth / columns;
    const rowH = 40;
    for (let i = 0; i < pairs.length; i += columns) {
      this.ensureSpace(rowH);
      const rowItems = pairs.slice(i, i + columns);
      rowItems.forEach((item, idx) => {
        const x = this.marginX + idx * colW;
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(10);
        setText(this.doc, PDF_COLOR.muted);
        this.doc.text(item.label.toUpperCase(), x, this.y, { charSpace: 0.2 });
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(PDF_TYPE.total);
        setText(this.doc, PDF_COLOR.ink);
        this.doc.text(item.value, x, this.y + 18, { maxWidth: colW - PDF_SPACE.sm });
      });
      this.y += rowH;
    }
  }

  /** Imagen (gráfica capturada, etc.) escalada a un ancho/alto máximo,
   *  preservando su proporción real. Bloque atómico. */
  image(dataUrl: string, opts: { maxWidth: number; maxHeight: number; caption?: string }) {
    let w = opts.maxWidth;
    let h = opts.maxHeight;
    try {
      const props = this.doc.getImageProperties(dataUrl);
      const ratio = props.width / props.height;
      if (opts.maxWidth / ratio <= opts.maxHeight) {
        w = opts.maxWidth;
        h = w / ratio;
      } else {
        h = opts.maxHeight;
        w = h * ratio;
      }
    } catch {
      return;
    }

    this.ensureSpace(h + (opts.caption ? 14 + PDF_SPACE.xs : 0) + PDF_SPACE.sm);
    this.doc.addImage(dataUrl, "PNG", this.marginX, this.y, w, h);
    this.y += h + PDF_SPACE.xs;
    if (opts.caption) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(PDF_TYPE.meta);
      setText(this.doc, PDF_COLOR.muted);
      this.doc.text(opts.caption, this.marginX, this.y);
      this.y += 14;
    }
    this.y += PDF_SPACE.sm;
  }

  /** Bloque de firmas lado a lado (Tesorero, Pastor, …). Bloque atómico:
   *  si no caben todas las columnas completas, se mueven juntas. */
  signatureBlock(people: PdfPersonSignature[]) {
    const sigImgMaxH = 40;
    const gap = PDF_SPACE.lg;
    const colW = Math.min(220, (this.contentWidth - (people.length - 1) * gap) / people.length);
    const lineToNameGap = PDF_SPACE.sm; // 16pt: dentro del rango 12–20 pedido
    const nameToRoleGap = 14;

    const blockH = sigImgMaxH + PDF_SPACE.xs + 1 + lineToNameGap + nameToRoleGap + PDF_SPACE.md;
    this.ensureSpace(blockH);
    const startY = this.y;

    people.forEach((p, i) => {
      const x = this.marginX + i * (colW + gap);
      const cx = x + colW / 2;
      let cy = startY;

      if (p.firmaDataUrl) {
        try {
          const props = this.doc.getImageProperties(p.firmaDataUrl);
          const w = Math.min(colW, (props.width / props.height) * sigImgMaxH);
          this.doc.addImage(p.firmaDataUrl, "PNG", cx - w / 2, cy, w, sigImgMaxH);
        } catch {
          /* si la imagen no es válida, se omite y queda solo la línea */
        }
      }
      cy += sigImgMaxH + PDF_SPACE.xs;

      setDraw(this.doc, PDF_COLOR.line);
      this.doc.setLineWidth(0.75);
      this.doc.line(x, cy, x + colW, cy);
      cy += lineToNameGap;

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(PDF_TYPE.body);
      setText(this.doc, PDF_COLOR.ink);
      this.doc.text(p.nombre?.trim() || " ", cx, cy, { align: "center" });
      cy += nameToRoleGap;

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(PDF_TYPE.meta);
      setText(this.doc, PDF_COLOR.muted);
      this.doc.text(p.rol, cx, cy, { align: "center" });
    });

    this.y = startY + blockH;
  }

  private drawFooterBlock(
    pageIndex: number,
    totalPages: number,
    meta: { reportId: string; fechaGeneracion: string; horaGeneracion: string }
  ) {
    let fy = this.pageHeight - PDF_MARGIN - PDF_FOOTER_BLOCK_H + PDF_SPACE.sm;

    setDraw(this.doc, PDF_COLOR.line);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, fy, this.rightX, fy);
    fy += 14;

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(PDF_TYPE.footer);
    setText(this.doc, PDF_COLOR.faint);
    this.doc.text("Generado automáticamente por Tesorería", this.marginX, fy);
    this.doc.text(`Página ${pageIndex} de ${totalPages}`, this.rightX, fy, { align: "right" });
    fy += 14;

    this.doc.text(`${meta.fechaGeneracion} • ${meta.horaGeneracion}`, this.marginX, fy);
    this.doc.text(`Reporte ${meta.reportId}`, this.rightX, fy, { align: "right" });
    fy += PDF_SPACE.xs;

    setDraw(this.doc, PDF_COLOR.line);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.marginX, fy, this.rightX, fy);
  }

  /** Pasada final: estampa el pie (con "Página X de Y" ya correcto, porque
   *  recién aquí se conoce el total real de páginas) y devuelve los bytes. */
  finalize(meta: { reportId: string; fechaGeneracion: string; horaGeneracion: string }): ArrayBuffer {
    const totalPages = this.doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      this.doc.setPage(p);
      this.drawFooterBlock(p, totalPages, meta);
    }
    return this.doc.output("arraybuffer") as ArrayBuffer;
  }
}
