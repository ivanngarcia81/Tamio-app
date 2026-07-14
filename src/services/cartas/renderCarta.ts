import type { CartaFirma } from "../../db";

/** Datos ya resueltos que necesita el documento. Función pura: la misma
 *  salida alimenta la vista previa (iframe), la impresión y el PDF
 *  (diálogo de imprimir del sistema → "Guardar como PDF"). Nunca se
 *  rasteriza: el texto queda vectorial y nítido en blanco y negro. */
export interface CartaRenderData {
  church: {
    nombre: string;
    direccion: string | null;
    ciudad: string | null;
    region: string | null;
    pais: string | null;
    telefono: string | null;
    email: string | null;
    pieInstitucional: string | null;
    /** Logo ya cargado como data URL (o null). */
    logoDataUrl: string | null;
  };
  folio: string;
  /** Fecha ya formateada en texto largo (p. ej. "14 de julio de 2026"). */
  fechaLarga: string;
  lugarEmision: string | null;
  destinatarioNombre: string;
  destinatarioDireccion: string | null;
  asunto: string | null;
  saludo: string | null;
  /** HTML del editor (negritas, cursivas, listas, alineación). */
  cuerpoHtml: string;
  despedida: string | null;
  firmas: CartaFirma[];
  /** "letter" (predeterminado) o "a4". */
  papel: "letter" | "a4";
  /** Etiqueta para el pie: "Documento No." */
  etiquetaFolio: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderCartaHtml(d: CartaRenderData): string {
  const c = d.church;
  const dirLinea = [c.direccion, [c.ciudad, c.region].filter(Boolean).join(", "), c.pais]
    .filter(Boolean)
    .join(" · ");
  const contactoLinea = [c.telefono, c.email].filter(Boolean).join(" · ");
  const lugarFecha = [d.lugarEmision, d.fechaLarga].filter(Boolean).join(", ");
  const [pw, ph] = d.papel === "a4" ? ["210mm", "297mm"] : ["8.5in", "11in"];

  const firmasHtml = d.firmas
    .map(
      (f) => `
      <div class="firma">
        <div class="firma-linea"></div>
        <div class="firma-nombre">${esc(f.nombre)}</div>
        <div class="firma-cargo">${esc(f.cargo)}</div>
        ${f.fecha ? `<div class="firma-fecha">${esc(f.fecha)}</div>` : ""}
      </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(d.folio)}</title>
<style>
  /* Una sola hoja de estilos para vista previa, impresión y PDF. */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #f0f0f0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; }
  .page {
    width: ${pw};
    min-height: ${ph};
    margin: 0 auto;
    background: #fff;
    padding: 0.9in 0.9in 0.75in;
    display: flex;
    flex-direction: column;
  }
  @page { size: ${d.papel === "a4" ? "A4" : "letter"}; margin: 0; }
  @media print {
    html, body { background: #fff; }
    .page { margin: 0; width: auto; min-height: ${ph}; }
  }
  .membrete { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .membrete img { width: 52px; height: 52px; object-fit: contain; }
  .membrete .m-nombre { font-size: 16pt; font-weight: 700; letter-spacing: -0.01em; }
  .membrete .m-linea { font-size: 8.5pt; color: #333; margin-top: 3px; }
  .meta { display: flex; justify-content: space-between; align-items: baseline; margin-top: 18px; font-size: 10pt; }
  .meta .folio { font-weight: 700; letter-spacing: 0.02em; }
  .destinatario { margin-top: 26px; font-size: 11pt; line-height: 1.5; }
  .destinatario .d-nombre { font-weight: 700; }
  .asunto { margin-top: 18px; font-size: 11pt; font-weight: 700; }
  .saludo { margin-top: 18px; font-size: 11pt; }
  .cuerpo { margin-top: 12px; font-size: 11pt; line-height: 1.65; text-align: justify; }
  .cuerpo p { margin: 0 0 10px; }
  .cuerpo ul, .cuerpo ol { margin: 0 0 10px 24px; }
  .cuerpo li { margin-bottom: 4px; }
  .despedida { margin-top: 18px; font-size: 11pt; }
  .firmas { display: flex; justify-content: space-around; gap: 40px; margin-top: 84px; }
  .firma { text-align: center; min-width: 180px; }
  .firma-linea { border-bottom: 1px solid #111; margin-bottom: 6px; height: 1px; }
  .firma-nombre { font-size: 10.5pt; font-weight: 700; }
  .firma-cargo { font-size: 9pt; color: #333; margin-top: 2px; }
  .firma-fecha { font-size: 8.5pt; color: #555; margin-top: 4px; }
  .pie { margin-top: auto; padding-top: 22px; text-align: center; font-size: 8pt; color: #444; border-top: 1px solid #999; }
  .pie .p-doc { margin-top: 3px; color: #666; }
</style>
</head>
<body>
  <div class="page">
    <div class="membrete">
      ${c.logoDataUrl ? `<img src="${c.logoDataUrl}" alt="">` : ""}
      <div>
        <div class="m-nombre">${esc(c.nombre)}</div>
        ${dirLinea ? `<div class="m-linea">${esc(dirLinea)}</div>` : ""}
        ${contactoLinea ? `<div class="m-linea">${esc(contactoLinea)}</div>` : ""}
      </div>
    </div>

    <div class="meta">
      <span class="folio">${esc(d.folio)}</span>
      <span>${esc(lugarFecha)}</span>
    </div>

    <div class="destinatario">
      <div class="d-nombre">${esc(d.destinatarioNombre)}</div>
      ${d.destinatarioDireccion ? `<div>${esc(d.destinatarioDireccion)}</div>` : ""}
    </div>

    ${d.asunto ? `<div class="asunto">${esc(d.asunto)}</div>` : ""}
    ${d.saludo ? `<div class="saludo">${esc(d.saludo)}</div>` : ""}

    <div class="cuerpo">${d.cuerpoHtml}</div>

    ${d.despedida ? `<div class="despedida">${esc(d.despedida)}</div>` : ""}

    ${d.firmas.length > 0 ? `<div class="firmas">${firmasHtml}</div>` : ""}

    <div class="pie">
      ${c.pieInstitucional ? `<div>${esc(c.pieInstitucional)}</div>` : ""}
      <div class="p-doc">${esc(d.etiquetaFolio)} ${esc(d.folio)}</div>
    </div>
  </div>
</body>
</html>`;
}
