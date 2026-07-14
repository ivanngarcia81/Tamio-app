import { fmtFechaCorta, type Acta, type Church } from "../../db";
import i18n from "../../i18n";
import { parseAcuerdos, parseMociones } from "../../components/ActaModal";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import { fmtFechaLarga, fmtHora12, loadPngDataUrl, openForPrint, PDF_SPACE, slug } from "./printUtils";

function nombres(json: string): string {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length > 0 ? v.join(", ") : "—";
  } catch {
    return "—";
  }
}

/** Genera el acta en PDF con el motor compartido (membrete, folio, firmas)
 *  y la abre en el visor del sistema para imprimir o guardar. */
export async function printActaPdf(church: Church, acta: Acta): Promise<void> {
  const t = i18n.t.bind(i18n);

  const [logoDataUrl, pastorFirmaDataUrl] = await Promise.all([
    church.logo_path ? loadPngDataUrl(church.logo_path) : Promise.resolve(null),
    church.pastor_firma_path ? loadPngDataUrl(church.pastor_firma_path) : Promise.resolve(null),
  ]);

  const doc = new ReportDocBuilder({
    title: `${t("actas.pdfTitulo")} ${acta.folio}`,
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: fmtFechaCorta(acta.fecha),
    moneda: church.moneda,
    generatedBy: acta.secretario ? { nombre: acta.secretario, rol: t("actas.rolSecretario") } : undefined,
    logoDataUrl,
  });

  // ---------- Información básica ----------
  doc.heading(t("actas.secBasica"));
  doc.keyValueGrid(
    [
      { label: t("actas.tipoReunion"), value: t(`actas.tipo.${acta.tipo}`) },
      { label: t("actas.tituloActa"), value: acta.titulo },
      { label: t("tx.colFecha"), value: fmtFechaCorta(acta.fecha) },
      { label: t("actas.lugar"), value: acta.lugar ?? "—" },
      { label: t("actas.horaInicio"), value: acta.hora_inicio ?? "—" },
      { label: t("actas.horaCierre"), value: acta.hora_cierre ?? "—" },
      { label: t("actas.preside"), value: acta.preside ?? "—" },
      { label: t("actas.secretarioRedacta"), value: acta.secretario ?? "—" },
      { label: t("actas.quorum"), value: acta.quorum === 1 ? t("common.si") : t("common.no") },
      { label: t("actas.estadoActa"), value: t(`actas.estado.${acta.estado}`) },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Asistencia ----------
  doc.heading(t("actas.secAsistencia"));
  doc.keyValueGrid(
    [
      { label: t("actas.presentes"), value: nombres(acta.presentes) },
      { label: t("actas.ausentes"), value: nombres(acta.ausentes) },
      { label: t("actas.invitados"), value: nombres(acta.invitados) },
    ],
    1
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Contenido ----------
  if (acta.agenda) {
    doc.heading(t("actas.agenda"));
    doc.paragraph(acta.agenda);
    doc.addGap(PDF_SPACE.md);
  }
  if (acta.resumen) {
    doc.heading(t("actas.resumen"));
    doc.paragraph(acta.resumen);
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Mociones ----------
  const mociones = parseMociones(acta.mociones);
  if (mociones.length > 0) {
    const cols: PdfColumn[] = [
      { label: t("actas.mocionTexto"), width: doc.contentWidth - 90 - 90 - 110, align: "left" },
      { label: t("actas.colPresenta"), width: 90, align: "left" },
      { label: t("actas.colSecunda"), width: 90, align: "left" },
      { label: t("actas.colResultado"), width: 110, align: "left" },
    ];
    doc.beginTable(t("actas.secMociones"), cols);
    for (const m of mociones) {
      doc.tableRow([m.texto, m.presenta || "—", m.secunda || "—", m.resultado || "—"], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Acuerdos ----------
  const acuerdos = parseAcuerdos(acta.acuerdos);
  if (acuerdos.length > 0) {
    const cols: PdfColumn[] = [
      { label: t("actas.acuerdoTexto"), width: doc.contentWidth - 130 - 100, align: "left" },
      { label: t("actas.acuerdoResponsable"), width: 130, align: "left" },
      { label: t("actas.colFechaLimite"), width: 100, align: "left" },
    ];
    doc.beginTable(t("actas.secAcuerdos"), cols);
    for (const a of acuerdos) {
      doc.tableRow([a.texto, a.responsable || "—", a.fecha_limite ? fmtFechaCorta(a.fecha_limite) : "—"], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Aprobación ----------
  if (acta.fecha_aprobacion) {
    doc.keyValueGrid(
      [{ label: t("actas.fechaAprobacion"), value: fmtFechaCorta(acta.fecha_aprobacion) }],
      2
    );
  }

  // Mismo aire que los reportes de tesorería antes del bloque de firmas.
  doc.addGap(75);
  doc.signatureBlock([
    { nombre: acta.secretario, rol: t("actas.rolSecretario"), firmaDataUrl: null },
    {
      nombre: acta.preside ?? church.pastor_nombre,
      rol: acta.preside ? t("actas.rolPreside") : church.pastor_cargo ?? i18n.t("rol.pastor"),
      firmaDataUrl: !acta.preside || acta.preside === church.pastor_nombre ? pastorFirmaDataUrl : null,
    },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: acta.folio,
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `${slug(acta.folio)}-${slug(church.nombre)}.pdf`);
}
