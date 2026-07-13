import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { catNombre, fmtFechaCorta, metodoNombre, METODOS_PAGO, type Church, type Member, type Tx } from "../../db";
import i18n from "../../i18n";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import {
  buildReportId, fmtFechaLarga, fmtHora12, fmtMoneyPdf, loadPngDataUrl, PDF_SPACE, slug,
} from "./printUtils";

export interface ConstanciaData {
  church: Church;
  member: Member;
  /** Año de la constancia en "YYYY". */
  year: string;
  /** Aportes del año, ya consultados (listMemberAportes) — este módulo no toca la BD. */
  aportes: Tx[];
}

/** Genera la constancia anual de aportaciones de un miembro y abre el
 *  diálogo de guardar. Devuelve true si se guardó, false si se canceló. */
export async function exportConstanciaPdf(data: ConstanciaData): Promise<boolean> {
  const { church, member, year, aportes } = data;
  const moneda = church.moneda;

  const [logoDataUrl, firmaDataUrl] = await Promise.all([
    church.logo_path ? loadPngDataUrl(church.logo_path) : Promise.resolve(null),
    church.tesorero_firma_path ? loadPngDataUrl(church.tesorero_firma_path) : Promise.resolve(null),
  ]);

  const doc = new ReportDocBuilder({
    title: i18n.t("constancia.titulo"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: year,
    moneda,
    generatedBy: church.tesorero_nombre
      ? { nombre: church.tesorero_nombre, rol: church.tesorero_cargo ?? undefined }
      : undefined,
    logoDataUrl,
  });

  // ---------- Datos del aportante ----------
  doc.heading(i18n.t("constancia.aportante"));
  doc.keyValueGrid(
    [
      { label: i18n.t("usuarios.colNombre"), value: member.nombre },
      { label: i18n.t("recordModal.rfc"), value: member.rfc ?? "—" },
      { label: i18n.t("tesorero.correo"), value: member.email ?? "—" },
      { label: i18n.t("tesorero.telefono"), value: member.telefono ?? "—" },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Tabla de aportes ----------
  const fixedCols: PdfColumn[] = [
    { label: i18n.t("tx.colFecha"), width: 80, align: "left" },
    { label: i18n.t("tx.colCategoria"), width: 110, align: "left" },
    { label: i18n.t("tx.colConcepto"), width: 0, align: "left" }, // flexible
    { label: i18n.t("tx.colMetodo"), width: 92, align: "left" },
    { label: i18n.t("tx.colMonto"), width: 92, align: "right" },
  ];
  const fixedW = fixedCols.filter((c) => c.width > 0).reduce((s, c) => s + c.width, 0);
  const cols = fixedCols.map((c) => (c.width === 0 ? { ...c, width: doc.contentWidth - fixedW } : c));

  const total = aportes.reduce((s, a) => s + a.monto, 0);

  doc.beginTable(i18n.t("constancia.aportesRegistrados"), cols);
  if (aportes.length === 0) {
    doc.emptyRow(i18n.t("detalleMiembro.sinAportes", { anio: year }));
  } else {
    for (const a of aportes) {
      const metodo = METODOS_PAGO.some((m) => m.id === a.metodo_pago) ? metodoNombre(a.metodo_pago) : a.metodo_pago;
      doc.tableRow(
        [fmtFechaCorta(a.fecha), catNombre(a.categoria), a.concepto, metodo, fmtMoneyPdf(a.monto, a.moneda)],
        cols
      );
    }
  }
  doc.totalRow([i18n.t("constancia.total"), "", "", "", fmtMoneyPdf(total, moneda)], cols);
  doc.endTable();
  doc.addGap(PDF_SPACE.lg);

  // ---------- Tarjetas de resumen ----------
  doc.cardsRow([
    { label: i18n.t("constancia.totalAportado"), value: fmtMoneyPdf(total, moneda) },
    { label: i18n.t("constancia.numeroAportes"), value: String(aportes.length) },
  ]);

  // Mismo aire que los demás reportes antes del bloque de firmas.
  doc.addGap(68);
  doc.signatureBlock([
    {
      nombre: church.tesorero_nombre,
      rol: church.tesorero_cargo ?? i18n.t("rol.tesorero"),
      firmaDataUrl,
    },
  ]);

  doc.addGap(PDF_SPACE.md);
  doc.paragraph(i18n.t("constancia.nota"));

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(`${year}-00`, "CONST"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  const fileName = `${i18n.t("constancia.archivo")}-${slug(member.nombre)}-${year}.pdf`;
  const path = await save({ defaultPath: fileName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return false;
  await writeFile(path, new Uint8Array(bytes));
  return true;
}
