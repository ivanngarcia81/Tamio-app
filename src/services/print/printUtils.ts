import jsPDF from "jspdf";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { currentLang } from "../../i18n";
import { currencySymbol, currencyLocale } from "../../currencies";
import { aDecimal, type Centavos } from "../../dinero";
import { entregarArchivo, esMovil } from "../entrega";
import { rutaEnDatos } from "../archivos";
import type { Church } from "../../db";

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
  // Acento de marca (verde Tamio #059669) y rojo de saldo negativo. Se usan
  // como filete fino y color de cifra, nunca como relleno de área: el
  // documento sigue siendo legible impreso en blanco y negro.
  brand: [5, 150, 105] as RGB,
  brandSoft: [167, 243, 208] as RGB,
  danger: [185, 28, 28] as RGB,
  rowAlt: [248, 249, 248] as RGB,
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

/** Ciudad, estado/provincia y código postal de la iglesia en una sola línea
 *  ("Miami, FL 33101"), solo con las partes que existan — para el membrete
 *  de los reportes financieros. */
export function direccionCompacta(church: Church): string {
  const cityState = [church.ciudad, church.estado_provincia].filter(Boolean).join(", ");
  return [cityState, church.codigo_postal].filter(Boolean).join(" ").trim();
}

/** Línea "EIN 12-3456789" para el membrete, o cadena vacía si la iglesia no
 *  tiene identificación fiscal registrada (Configuración → Iglesia). */
export function einLinea(church: Church): string {
  return church.ein ? `EIN ${church.ein}` : "";
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
 * Agrupación de miles y decimales de un importe según la moneda de la iglesia.
 *
 * En pantalla el formato lo manda el DISPOSITIVO (ver `localeDeNumeros` en
 * db.ts): es la app del tesorero y debe verse como él tiene configurado su
 * Mac. Un PDF no: se imprime, se archiva y se entrega al concilio o a
 * Hacienda, así que sigue al país de la iglesia y no al equipo desde el que
 * se generó — el mismo estado financiero exportado desde el iPad del pastor
 * y desde la Mac de la secretaria tiene que salir idéntico.
 *
 * El separador se toma de la moneda configurada en Ajustes (selector cerrado)
 * y no del campo "País", que es texto libre.
 */
function agrupa(abs: number, moneda: string): string {
  return abs
    .toLocaleString(currencyLocale(moneda), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    // Algunos locales separan los miles con espacio duro (U+00A0) o fino
    // (U+202F). El primero lo dibuja bien Helvetica pero se ve como un hueco
    // raro en una columna de cifras, y el segundo ni siquiera lo mapea. Se
    // normalizan a espacio normal.
    .replace(/[\u00a0\u202f]/g, " ");
}

/**
 * Formato de dinero seguro para jsPDF: la fuente Helvetica integrada no
 * reconoce el signo menos Unicode (−, U+2212) que usa fmtMoney() en pantalla
 * — al no poder mapearlo, jsPDF rompe el cálculo de ancho de TODO el string.
 * Los negativos se muestran entre paréntesis, convención estándar de
 * estados financieros que evita el problema sin depender de un caracter especial.
 */
export function fmtMoneyPdf(c: Centavos, moneda: string): string {
  const n = aDecimal(c);
  const abs = Math.abs(n);
  // Dos decimales, igual que fmtMoneyPlain y que la pantalla.
  const formatted = `${currencySymbol(moneda)}${agrupa(abs, moneda)} ${moneda}`;
  return n < 0 ? `(${formatted})` : formatted;
}

/**
 * Dinero sin el código de moneda y siempre con 2 decimales ("$1,720.00").
 * El estado financiero mensual declara la moneda una sola vez en el membrete,
 * así que repetirla en cada fila solo añade ruido. Los negativos van entre
 * paréntesis por la misma razón que fmtMoneyPdf (Helvetica de jsPDF no mapea
 * el signo menos Unicode).
 */
export function fmtMoneyPlain(c: Centavos, moneda: string): string {
  const n = aDecimal(c);
  const abs = Math.abs(n);
  const s = `${currencySymbol(moneda)}${agrupa(abs, moneda)}`;
  return n < 0 ? `(${s})` : s;
}

/** Fecha corta para filas de tabla, a partir de un ISO "YYYY-MM-DD" o
 *  "YYYY-MM-DD HH:MM". Respeta el idioma activo ("12 jul 2026" / "Jul 12, 2026")
 *  y no depende de la zona horaria: parsea las partes a mano. */
export function fmtFechaCortaPdf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, yy, mm, dd] = m;
  const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
  const locale = currentLang() === "en" ? "en-US" : "es-ES";
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
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

/** Lee un PNG local y lo convierte a data URL para jsPDF.addImage().
 *
 *  Resuelve la ruta aquí y no en cada llamada: por esta función pasan el logo y
 *  las dos firmas de TODOS los documentos (estado financiero, constancia,
 *  anual, actas, cartas, informes). Con la resolución centralizada, que las
 *  rutas sean relativas a la carpeta de datos no obliga a tocar los quince
 *  sitios que la llaman. */
export async function loadPngDataUrl(path: string): Promise<string | null> {
  try {
    const bytes = await readFile(await rutaEnDatos(path));
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
  // iPad/iPhone: no hay visor externo — la hoja de compartir incluye
  // "Imprimir" (y Archivos, AirDrop…), que es el equivalente correcto.
  if (esMovil()) {
    await entregarArchivo(new Uint8Array(bytes), fileName);
    return;
  }
  const dir = await appDataDir();
  const path = await join(dir, fileName);
  await writeFile(path, new Uint8Array(bytes));
  await openPath(path);
}
