import jsPDF from "jspdf";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { currentLang } from "../../i18n";

// ---------- Sistema de diseño fijo compartido por todos los PDFs ----------
// No se recalcula ni se comprime según la cantidad de datos: un reporte de
// 3 filas y uno de 300 usan exactamente la misma tipografía y espaciado.
// Escala de documento profesional (tipo estado de cuenta bancario /
// software contable): compacta, densa en información y pensada para
// imprimirse al 100% tanto en Letter como en A4.
export const PDF_MARGIN = 48; // ~0.67in — dentro del rango 0.6–0.75in
export const PDF_SPACE = { xs: 5, sm: 9, md: 14, lg: 20 } as const;
export const PDF_TYPE = {
  title: 19,      // Título principal del documento (18–20pt)
  church: 12,     // Nombre de la iglesia
  period: 10,     // Periodo
  meta: 8,        // Moneda / Generado por / notas y avisos
  section: 11.5,  // Encabezados de sección (11–12pt)
  body: 9,        // Texto normal / encabezados de columna
  tableRow: 8.5,  // Filas de tabla (8.5–9pt)
  total: 9.5,     // Totales — énfasis por peso, no por tamaño
  cardLabel: 6.5, // Etiquetas de tarjetas de resumen
  cardValue: 10,  // Valores de tarjetas de resumen
  kvLabel: 7.5,   // Etiquetas de la cuadrícula etiqueta/valor
  footer: 7,      // Pie de página / número de página / folio
} as const;

// Alto reservado para el bloque de pie de página (2 separadores + 2 líneas
// de texto) en cada página.
export const PDF_FOOTER_BLOCK_H = PDF_SPACE.sm + 2 * 10 + PDF_SPACE.xs;

// Paleta pensada para impresión láser en blanco y negro: la jerarquía
// visual viene de tamaño/peso de fuente, no del color. Los grises se
// mantienen lo bastante oscuros para no perder contraste al imprimir.
export type RGB = readonly [number, number, number];
export const PDF_COLOR = {
  ink: [26, 26, 26] as RGB,
  muted: [90, 90, 93] as RGB,
  faint: [125, 125, 128] as RGB,
  line: [204, 204, 201] as RGB,
  cardBg: [252, 252, 251] as RGB,
  cardBorder: [190, 190, 187] as RGB,
};

export function setText(doc: jsPDF, color: RGB): void {
  doc.setTextColor(color[0], color[1], color[2]);
}
export function setDraw(doc: jsPDF, color: RGB): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}
export function setFill(doc: jsPDF, color: RGB): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "reporte"
  );
}

export function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

/**
 * Formato de dinero seguro para jsPDF: la fuente Helvetica integrada no
 * reconoce el signo menos Unicode (−, U+2212) que usa fmtMoney() en pantalla
 * — al no poder mapearlo, jsPDF rompe el cálculo de ancho de TODO el string.
 * Los negativos se muestran entre paréntesis, convención estándar de
 * estados financieros que evita el problema sin depender de un caracter especial.
 */
export function fmtMoneyPdf(n: number, moneda: string): string {
  const abs = Math.abs(n);
  const formatted = `$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${moneda}`;
  return n < 0 ? `(${formatted})` : formatted;
}

export function fmtFechaLarga(d: Date): string {
  const locale = currentLang() === "en" ? "en-US" : "es-ES";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

export function fmtHora12(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

const REPORT_SEQ_STORAGE_KEY = "tesoreria-report-seq";

/**
 * Folio consecutivo por periodo, persistido en localStorage. Todavía no hay
 * backend ni tabla de contadores — esto alcanza para dar a cada documento
 * exportado un identificador único y creciente, útil para auditorías.
 */
function nextReportSequence(periodKey: string): number {
  let map: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(REPORT_SEQ_STORAGE_KEY);
    if (raw) map = JSON.parse(raw);
  } catch {
    /* noop */
  }
  const next = (map[periodKey] ?? 0) + 1;
  map[periodKey] = next;
  try {
    localStorage.setItem(REPORT_SEQ_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
  return next;
}

/** Folio con formato {prefix}-YYYYMM-###### a partir del periodo reportado. */
export function buildReportId(periodoISO: string, prefix = "EF"): string {
  const periodKey = periodoISO.replace("-", "");
  const seq = nextReportSequence(periodKey);
  return `${prefix}-${periodKey}-${String(seq).padStart(6, "0")}`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Lee un PNG local y lo convierte a data URL para jsPDF.addImage(). */
export async function loadPngDataUrl(path: string): Promise<string | null> {
  try {
    const bytes = await readFile(path);
    return `data:image/png;base64,${uint8ToBase64(bytes)}`;
  } catch {
    return null;
  }
}

/**
 * "Imprimir" en un escritorio Tauri no tiene un diálogo nativo de impresora
 * directo y confiable — en vez de eso, se guarda el PDF ya generado en la
 * carpeta de datos de la app (mismo directorio que la base de datos, ya
 * autorizado en fs:scope) y se abre con el visor de PDF del sistema
 * (Vista Previa en macOS, el visor por defecto en Windows/Linux), desde
 * donde el usuario imprime con Cmd/Ctrl+P. Da un resultado consistente y
 * de calidad, a diferencia de window.print() sobre el HTML de la app.
 */
export async function openForPrint(bytes: ArrayBuffer, fileName: string): Promise<void> {
  const dir = await appDataDir();
  const path = await join(dir, fileName);
  await writeFile(path, new Uint8Array(bytes));
  await openPath(path);
}
