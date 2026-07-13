import i18n from "../src/i18n";
import { exportAnnualReportPdf } from "../src/services/print/printAnnual";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
await i18n.changeLanguage("es");

const church = {
  id: 1, nombre: "Iglesia Central", ciudad: "Dallas", pais: "USA", moneda: "USD",
  logo_path: null, tesorero_nombre: "Juan Pérez", tesorero_cargo: "Tesorero",
  tesorero_email: null, tesorero_telefono: null, tesorero_firma_path: null,
} as any;

const meses = [
  { mes: "2026-01", ingresos: 10200, gastos: 4100 },
  { mes: "2026-02", ingresos: 11500, gastos: 3900 },
  { mes: "2026-03", ingresos: 9800, gastos: 5200 },
  { mes: "2026-04", ingresos: 12100, gastos: 4600 },
  { mes: "2026-05", ingresos: 11900, gastos: 4300 },
  { mes: "2026-06", ingresos: 13400, gastos: 5100 },
  { mes: "2026-07", ingresos: 12500, gastos: 3380 },
];

const categorias = {
  porCategoriaIngreso: { ofrenda: 38200, diezmo: 40100, donacion: 3100 },
  porCategoriaGasto: { servicios: 11200, mantenimiento: 6800, eventos: 4100, pastores: 8480 },
};

const bytesPromise = new Promise<ArrayBuffer>((resolve) => {
  (globalThis as any).__capturePdf = resolve;
});
await exportAnnualReportPdf({ church, year: "2026", meses, categorias, depositosBancarios: 52000 } as any);
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
