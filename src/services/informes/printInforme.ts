import {
  fmtFechaCorta, memberAsistenciaStats, memberDocs,
  type Church, type Member,
} from "../../db";
import i18n from "../../i18n";
import { estadoEfectivo } from "./membresia";
import { ReportDocBuilder, type PdfColumn } from "../print/pdfGenerator";
import { buildReportId, fmtFechaLarga, fmtHora12, loadPngDataUrl, openForPrint, PDF_SPACE, slug } from "../print/printUtils";

function traducirLista(json: string, prefijo: string): string {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || arr.length === 0) return "—";
    return arr.map((v: string) => (i18n.exists(`${prefijo}.${v}`) ? i18n.t(`${prefijo}.${v}`) : v)).join(", ");
  } catch {
    return "—";
  }
}

function nombreEstado(k: string): string {
  return ["activo", "inactivo", "visitante", "enProceso", "trasladado", "retirado", "fallecido", "baja"].includes(k)
    ? i18n.t(`membresia.estado.${k}`) : k;
}

/** Informe individual del miembro. Solo datos de membresía y servicio —
 *  nunca información financiera. Monocromo (motor B/N por diseño). */
export async function printInformeIndividual(church: Church, member: Member): Promise<void> {
  const t = i18n.t.bind(i18n);
  const [logoDataUrl, stats, docs] = await Promise.all([
    church.logo_path ? loadPngDataUrl(church.logo_path) : Promise.resolve(null),
    memberAsistenciaStats(member.id, church.id),
    memberDocs(member.id, church.id),
  ]);

  const doc = new ReportDocBuilder({
    title: t("informesPdf.tituloIndividual"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: member.nombre,
    moneda: church.moneda,
    generatedBy: church.secretaria_nombre
      ? { nombre: church.secretaria_nombre, rol: church.secretaria_cargo ?? t("cartas.rolSecretaria") }
      : undefined,
    logoDataUrl,
  });

  // ---------- Datos del miembro ----------
  doc.heading(t("informesPdf.datosMiembro"));
  doc.keyValueGrid(
    [
      { label: t("usuarios.colNombre"), value: member.nombre },
      { label: t("membresia.colEstado"), value: nombreEstado(estadoEfectivo(member)) },
      { label: t("ficha.fechaCongregacion"), value: member.fecha_congregacion ? fmtFechaCorta(member.fecha_congregacion) : "—" },
      { label: t("ficha.fechaIngreso"), value: member.fecha_ingreso ? fmtFechaCorta(member.fecha_ingreso) : "—" },
      { label: t("ficha.iglesiaAnterior"), value: member.iglesia_anterior ?? "—" },
      { label: t("tesorero.correo"), value: member.email ?? "—" },
      { label: t("tesorero.telefono"), value: member.telefono ?? "—" },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Vida espiritual y servicio ----------
  doc.heading(t("informesPdf.vidaServicio"));
  doc.keyValueGrid(
    [
      { label: t("ficha.bautizadoAgua"), value: member.bautizado_agua === 1 ? (member.fecha_bautismo_agua ? fmtFechaCorta(member.fecha_bautismo_agua) : t("common.si")) : t("common.no") },
      { label: t("ficha.bautizadoEspiritu"), value: member.bautizado_espiritu === 1 ? t("common.si") : t("common.no") },
      { label: t("ficha.cursoMembresia"), value: member.curso_membresia === 1 ? t("common.si") : t("common.no") },
      { label: t("ficha.cargosLabel"), value: traducirLista(member.cargos, "ficha.cargo") },
      { label: t("ficha.ministerios"), value: traducirLista(member.ministerios, "ficha.ministerio") },
      { label: t("ficha.instrumentos"), value: traducirLista(member.instrumentos, "ficha.instrumento") },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Resumen de asistencia ----------
  doc.heading(t("informesPdf.resumenAsistencia"));
  doc.keyValueGrid(
    [
      { label: t("informes.colAsistidos"), value: String(stats.asistencias) },
      { label: t("informes.colAusentes"), value: String(stats.ausencias) },
      { label: t("informes.pctGeneral"), value: stats.pct !== null ? `${stats.pct}%` : "—" },
      { label: t("informes.colUltima"), value: stats.ultimaAsistencia ? fmtFechaCorta(stats.ultimaAsistencia) : "—" },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Historial de estados ----------
  let cambios: { de: string; a: string; fecha: string }[] = [];
  try { cambios = JSON.parse(member.historial_estados); } catch { /* noop */ }
  if (cambios.length > 0) {
    const cols: PdfColumn[] = [
      { label: t("tx.colFecha"), width: 100, align: "left" },
      { label: t("ficha.cambiosEstado"), width: doc.contentWidth - 100, align: "left" },
    ];
    doc.beginTable(t("ficha.secHistorial"), cols);
    for (const c of cambios) {
      doc.tableRow([c.fecha.slice(0, 10), c.de ? `${nombreEstado(c.de)} → ${nombreEstado(c.a)}` : nombreEstado(c.a)], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Cartas y traslados ----------
  if (docs.length > 0) {
    const cols: PdfColumn[] = [
      { label: t("actas.colFolio"), width: 120, align: "left" },
      { label: t("cartas.colDocumento"), width: doc.contentWidth - 120 - 90 - 110, align: "left" },
      { label: t("tx.colFecha"), width: 90, align: "left" },
      { label: t("membresia.colEstado"), width: 110, align: "left" },
    ];
    doc.beginTable(t("ficha.secDocumentos"), cols);
    for (const d of docs) {
      const estadoTxt = d.clase === "carta" ? t(`cartas.estado.${d.estado}`)
        : d.clase === "solicitud" ? t(`solicitudes.estado.${d.estado}`)
          : d.clase === "salida" ? t(`traslados.estadoTS.${d.estado}`)
            : t(`traslados.estadoTE.${d.estado}`);
      doc.tableRow([d.folio, t(`ficha.docClase.${d.clase}`), fmtFechaCorta(d.fecha), estadoTxt], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Notas administrativas ----------
  let notas: { fecha: string; texto: string }[] = [];
  try { notas = JSON.parse(member.seguimiento_notas); } catch { /* noop */ }
  if (notas.length > 0) {
    doc.heading(t("ficha.notasAdmin"));
    for (const n of notas) {
      doc.paragraph(`${n.fecha.slice(0, 10)} — ${n.texto}`);
    }
  }

  doc.addGap(75);
  doc.signatureBlock([
    { nombre: church.secretaria_nombre, rol: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmaDataUrl: null },
    { nombre: church.pastor_nombre, rol: church.pastor_cargo ?? t("rol.pastor"), firmaDataUrl: null },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(`${now.getFullYear()}-00`, "MEMB"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });
  await openForPrint(bytes, `${slug(t("informesPdf.archivoIndividual"))}-${slug(member.nombre)}.pdf`);
}

// ---------- Informe general ----------

export interface InformeGeneralData {
  periodoLabel: string;
  resumen: {
    total: number; activos: number; inactivos: number; nuevosEnPeriodo: number;
    recibidosPorTraslado: number; trasladados: number; ausenciasFrecuentes: number; incompletos: number;
  };
  pctAsistencia: number | null;
  distMinisterio: { clave: string; n: number }[];
  distCargo: { clave: string; n: number }[];
  movimientos: { folio: string; tipo: "recibido" | "enviado"; persona: string; fecha: string; iglesia: string; estado: string }[];
}

export async function printInformeGeneral(church: Church, data: InformeGeneralData): Promise<void> {
  const t = i18n.t.bind(i18n);
  const logoDataUrl = church.logo_path ? await loadPngDataUrl(church.logo_path) : null;

  const doc = new ReportDocBuilder({
    title: t("informesPdf.tituloGeneral"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: data.periodoLabel,
    moneda: church.moneda,
    generatedBy: church.secretaria_nombre
      ? { nombre: church.secretaria_nombre, rol: church.secretaria_cargo ?? t("cartas.rolSecretaria") }
      : undefined,
    logoDataUrl,
  });

  doc.heading(t("informesPdf.resumenGeneral"));
  doc.keyValueGrid(
    [
      { label: t("informes.cardTotal"), value: String(data.resumen.total) },
      { label: t("informes.cardActivos"), value: String(data.resumen.activos) },
      { label: t("informes.cardInactivos"), value: String(data.resumen.inactivos) },
      { label: t("informes.cardNuevos"), value: String(data.resumen.nuevosEnPeriodo) },
      { label: t("informes.cardRecibidos"), value: String(data.resumen.recibidosPorTraslado) },
      { label: t("informes.cardTrasladados"), value: String(data.resumen.trasladados) },
      { label: t("informes.cardFrecuentes"), value: String(data.resumen.ausenciasFrecuentes) },
      { label: t("informes.cardIncompletos"), value: String(data.resumen.incompletos) },
      { label: t("informes.pctGeneral"), value: data.pctAsistencia !== null ? `${data.pctAsistencia}%` : "—" },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  const distCols = (titulo: string): PdfColumn[] => [
    { label: titulo, width: doc.contentWidth - 90, align: "left" },
    { label: t("informes.movTipo"), width: 90, align: "right" },
  ];

  if (data.distMinisterio.length > 0) {
    const cols = distCols(t("informes.distMinisterio"));
    cols[1].label = "";
    doc.beginTable(t("informes.distMinisterio"), cols);
    for (const d of data.distMinisterio) {
      doc.tableRow([i18n.exists(`ficha.ministerio.${d.clave}`) ? t(`ficha.ministerio.${d.clave}`) : d.clave, String(d.n)], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  if (data.distCargo.length > 0) {
    const cols = distCols(t("ficha.cargosLabel"));
    cols[1].label = "";
    doc.beginTable(t("ficha.cargosLabel"), cols);
    for (const d of data.distCargo) {
      doc.tableRow([i18n.exists(`ficha.cargo.${d.clave}`) ? t(`ficha.cargo.${d.clave}`) : d.clave, String(d.n)], cols);
    }
    doc.endTable();
    doc.addGap(PDF_SPACE.md);
  }

  // ---------- Movimientos del periodo ----------
  const movCols: PdfColumn[] = [
    { label: t("actas.colFolio"), width: 110, align: "left" },
    { label: t("informes.movTipo"), width: 80, align: "left" },
    { label: t("informes.movPersona"), width: doc.contentWidth - 110 - 80 - 90 - 100, align: "left" },
    { label: t("tx.colFecha"), width: 90, align: "left" },
    { label: t("membresia.colEstado"), width: 100, align: "left" },
  ];
  doc.beginTable(t("informes.movimientos"), movCols);
  if (data.movimientos.length === 0) {
    doc.emptyRow(t("informes.sinMovimientos"));
  } else {
    for (const mv of data.movimientos) {
      doc.tableRow(
        [mv.folio, mv.tipo === "recibido" ? t("informes.movRecibido") : t("informes.movEnviado"), `${mv.persona} — ${mv.iglesia}`, fmtFechaCorta(mv.fecha), mv.estado],
        movCols
      );
    }
  }
  doc.endTable();

  doc.addGap(75);
  doc.signatureBlock([
    { nombre: church.secretaria_nombre, rol: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmaDataUrl: null },
    { nombre: church.pastor_nombre, rol: church.pastor_cargo ?? t("rol.pastor"), firmaDataUrl: null },
  ]);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(`${now.getFullYear()}-00`, "MEMBGEN"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });
  await openForPrint(bytes, `${slug(t("informesPdf.archivoGeneral"))}-${slug(church.nombre)}.pdf`);
}
