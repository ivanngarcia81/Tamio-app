import i18n from "../src/i18n";
import { exportConstanciaPdf } from "../src/services/print/printConstancia";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
await i18n.changeLanguage("es");

const church = {
  id: 1, nombre: "Iglesia Central", ciudad: "Dallas", pais: "USA", moneda: "USD",
  logo_path: null, tesorero_nombre: "Juan Pérez", tesorero_cargo: "Tesorero",
  tesorero_email: null, tesorero_telefono: null, tesorero_firma_path: null,
} as any;

const member = {
  id: 7, church_id: 1, nombre: "Ana Ruiz García", email: "ana@ejemplo.com",
  telefono: "555-1111", rfc: "RUGA800101XX0", etiquetas: "[\"diezmador\"]",
  fecha_ingreso: null, notas: null,
} as any;

const mk = (id: number, fecha: string, cat: string, concepto: string, monto: number, metodo: string) => ({
  id, church_id: 1, tipo: "ingreso", categoria: cat, subcategoria: null, concepto,
  detalle: null, fecha, monto, moneda: "USD", metodo_pago: metodo, member_id: 7,
  member_nombre: "Ana Ruiz García", beneficiario: null, beneficiario_rfc: null,
  emitir_constancia: 1, estado: "aprobado", comprobante_path: null,
}) as any;

const aportes = [
  mk(1, "2026-06-07 11:30", "diezmo", "Diezmo junio", 1200, "transferencia"),
  mk(2, "2026-05-03 11:00", "diezmo", "Diezmo mayo", 1200, "transferencia"),
  mk(3, "2026-04-05 12:00", "ofrenda", "Ofrenda especial construcción", 800, "efectivo"),
  mk(4, "2026-03-01 11:15", "diezmo", "Diezmo marzo", 1200, "transferencia"),
  mk(5, "2026-02-02 10:45", "donacion", "Donación equipo de sonido", 2500, "cheque"),
];

const bytesPromise = new Promise<ArrayBuffer>((resolve) => {
  (globalThis as any).__capturePdf = resolve;
});
await exportConstanciaPdf({ church, member, year: "2026", aportes });
const bytes = await bytesPromise;

const doc = await pdfjs.getDocument({ data: bytes }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const viewport = page.getViewport({ scale: 1.4 });
  const canvas = document.createElement("canvas");
  canvas.id = `pdf-p${p}`;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / 2}px`;
  document.body.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
}
document.title = `done:${doc.numPages}`;
