import { appDataDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import type { Carta, CartaFirma, Church } from "../../db";
import i18n from "../../i18n";
import { fmtFechaLarga, loadPngDataUrl, slug } from "../print/printUtils";
import { renderCartaHtml, type CartaRenderData } from "./renderCarta";
import { entregarArchivo, esMovil } from "../entrega";

function fechaLargaDe(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return fmtFechaLarga(new Date(y, m - 1, d));
}

export function parseFirmas(json: string): CartaFirma[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Arma los datos del documento desde la carta + Ajustes. Ruta única:
 *  este mismo HTML alimenta vista previa, impresión y PDF. */
export async function buildCartaHtml(
  church: Church,
  carta: Pick<Carta, "folio" | "fecha_emision" | "lugar_emision" | "destinatario_nombre" | "destinatario_direccion" | "asunto" | "saludo" | "cuerpo_html" | "despedida">,
  firmas: CartaFirma[],
  papel: "letter" | "a4" = "letter"
): Promise<string> {
  const logoDataUrl = church.logo_path ? await loadPngDataUrl(church.logo_path) : null;
  const data: CartaRenderData = {
    church: {
      nombre: church.nombre,
      direccion: church.direccion,
      ciudad: church.ciudad,
      region: church.region,
      pais: church.pais,
      telefono: church.telefono,
      email: church.email,
      pieInstitucional: church.pie_institucional,
      logoDataUrl,
    },
    folio: carta.folio,
    fechaLarga: fechaLargaDe(carta.fecha_emision),
    lugarEmision: carta.lugar_emision,
    destinatarioNombre: carta.destinatario_nombre,
    destinatarioDireccion: carta.destinatario_direccion,
    asunto: carta.asunto,
    saludo: carta.saludo,
    cuerpoHtml: carta.cuerpo_html,
    despedida: carta.despedida,
    firmas: firmas.map((f) => ({ ...f, fecha: f.fecha ? fechaLargaDe(f.fecha) : null })),
    papel,
    etiquetaFolio: i18n.t("cartas.etiquetaFolio"),
  };
  return renderCartaHtml(data);
}

/** Imprimir / guardar PDF: se escribe el HTML del documento en la carpeta
 *  de datos de la app y se abre con el navegador del sistema, donde
 *  Cmd/Ctrl+P imprime o guarda como PDF (mismo patrón que openForPrint
 *  para los reportes; window.print() del webview ya se descartó en este
 *  proyecto por calidad). */
export async function abrirCartaParaImprimir(html: string, folio: string): Promise<void> {
  // iPad/iPhone: sin navegador externo — el documento sale por la hoja de
  // compartir (se abre/imprime desde Archivos o Safari).
  if (esMovil()) {
    await entregarArchivo(new TextEncoder().encode(html), `${slug(folio)}.html`);
    return;
  }
  const dir = await appDataDir();
  const path = await join(dir, `${slug(folio)}.html`);
  await writeTextFile(path, html);
  await openPath(path);
}
