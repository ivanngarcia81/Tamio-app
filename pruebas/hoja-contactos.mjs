// Hoja de contactos: todas las capturas del iPhone en UNA sola imagen.
//
//   node pruebas/capturas-iphone.mjs   (primero, que esto no fotografía nada)
//   node pruebas/hoja-contactos.mjs
//
// Sale en pruebas/capturas/hoja-de-contactos.png, que NO entra en git.
//
// Para qué: una pantalla a la vez enseña si ESA pantalla está bien; las 38
// juntas enseñan si son la misma app. Los desajustes de vocabulario —una
// tarjeta con otro radio, un verde donde ya no va verde, un grupo con el
// encabezado en otro tono— solo se ven de lado a lado.
//
// El montaje lo hace el propio Chromium: se arma una rejilla en HTML que
// apunta a los PNG con file://, y se le hace una captura de página entera.
// No hace falta ImageMagick ni Pillow, que en este contenedor no están.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const REPO = "/home/user/Tamio-app";
const CAP = `${REPO}/pruebas/capturas`;

const GRUPOS = [
  ["Inicio", [
    ["1-inicio", "H1 · portada"],
    ["1-inicio-desplazado", "H1 · desplazado"],
    ["1-inicio-anio", "H1 · año"],
    ["1-detalle-mes", "H2 · detalle"],
    ["1-detalle-anio", "H2 · año"],
    ["20-inicio-secretaria", "H3 · secretaría"],
  ]],
  ["Tesorería", [
    ["2-ingresos", "Ingresos"],
    ["3-gastos", "Gastos"],
    ["5-depositos", "Depósitos"],
    ["6-por-revisar", "Por revisar"],
    ["8-informes", "Reportes"],
    ["9-informe-estado", "Estado financiero"],
    ["9-informe-gastos", "Gastos por categoría"],
    ["9-informe-anual", "Resumen anual"],
  ]],
  ["Membresía", [
    ["16-membresia-padron", "Padrón"],
    ["16-membresia-hoja-asomada", "Hoja asomada"],
    ["16-membresia-hoja-media", "Hoja a media altura"],
    ["16-membresia-filtros", "Filtros"],
    ["16-membresia-asistencia", "Asistencia"],
    ["16-membresia-seguimiento", "Seguimiento"],
    ["4-miembros", "Aportantes"],
    ["13-reporte-miembros", "Reporte de miembros"],
  ]],
  ["Cartas y traslados", [
    ["11-cartas-resumen", "Cartas"],
    ["11-cartas-solicitudes", "Solicitudes"],
    ["11-cartas-traslados", "Traslados"],
    ["11-cartas-plantillas", "Plantillas"],
    ["11-cartas-archivo", "Archivo"],
    ["12-cartas-editor", "Editor"],
  ]],
  ["Secretaría · resto", [
    ["16-actas", "Actas"],
    ["14-servicios", "Bitácora de cultos"],
    ["17-agenda", "Agenda · mes"],
    ["18-agenda-semana", "Agenda · semana"],
    ["18-agenda-lista", "Agenda · lista"],
    ["18-agenda-historial", "Agenda · historial"],
    ["19-infmem-general", "Informe general"],
    ["19-infmem-registro", "Registro de miembros"],
    ["19-infmem-seguimiento", "Informe de seguimiento"],
    ["7-ajustes", "Ajustes"],
  ]],
];

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { background: #f2f2f7; font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
         color: #1c1c1e; padding: 40px 40px 56px; width: 2020px; }
  h1 { font-size: 34px; letter-spacing: -.6px; }
  .sub { font-size: 15px; color: rgba(60,60,67,.6); margin-top: 4px; margin-bottom: 28px; }
  h2 { font-size: 13px; letter-spacing: .6px; text-transform: uppercase;
       color: rgba(60,60,67,.6); font-weight: 400; margin: 34px 0 12px; }
  .rejilla { display: grid; grid-template-columns: repeat(6, 1fr); gap: 20px 20px; }
  figure { display: flex; flex-direction: column; gap: 7px; }
  img { width: 100%; display: block; border-radius: 14px;
        box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 8px 20px -12px rgba(0,0,0,.35); }
  figcaption { font-size: 13px; color: rgba(60,60,67,.72); }
`;

let html = `<style>${css}</style>
  <h1>Tamio · iPhone</h1>
  <div class="sub">393 × 852 · modo claro · Chromium (sin verificar en dispositivo)</div>`;
for (const [titulo, filas] of GRUPOS) {
  html += `<h2>${titulo}</h2><div class="rejilla">`;
  for (const [archivo, pie] of filas) {
    html += `<figure><img src="file://${CAP}/${archivo}-light.png"><figcaption>${pie}</figcaption></figure>`;
  }
  html += `</div>`;
}
const tmp = `${CAP}/.hoja.html`;
writeFileSync(tmp, html);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 2020, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(`file://${tmp}`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${REPO}/pruebas/capturas/hoja-de-contactos.png`, fullPage: true });
await browser.close();
console.log("listo");
process.exit(0);
