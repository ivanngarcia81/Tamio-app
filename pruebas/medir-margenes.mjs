/* ¿Empieza todo en la misma línea?
 *
 * El margen desparejo que Iván vio en su iPhone —el segmentado metido 16 px
 * más adentro que las listas— es de la familia de defectos que el ojo caza en
 * la mano y no en una captura: hay que ver dos bordes a la vez y compararlos.
 * Esto los mide, que es más fiable que mirarlos.
 *
 *   node pruebas/capturas-iphone.mjs   (para tener el vite y el stub)
 *   node pruebas/medir-margenes.mjs
 *
 * Imprime, por pantalla, el borde izquierdo de cada bloque de primer nivel y
 * marca los que se salen del valor dominante.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_BASE = "http://localhost:1420";

/* Los mismos bloques que el ojo compara: tarjetas de lista, encabezados y
   pies de grupo, segmentados, buscadores y las cifras sueltas. */
const SELECTORES = [
  ".ios-listcard", ".ios-section-header", ".ios-section-footer",
  ".dash-seg--movil", ".ios-seg5", ".ios-segmented",
  ".ios-buscar-bloque", ".ios-buscar", ".ios-buscador-grupo",
  ".ios-tarjeta-cifras", ".ios-cifra-periodo", ".ios-panel", ".ios-panel-head",
  ".rep-cabecera", ".rep-kpis", ".rep-mes", ".ios-hero", ".ios-cal",
];

const PANTALLAS = [
  ["Inicio", "/"], ["Ingresos", "/ingresos"], ["Gastos", "/gastos"],
  ["Aportantes", "/miembros"], ["Depósitos", "/depositos"],
  ["Por revisar", "/bandeja"], ["Reportes", "/reportes"],
  ["Membresía", "/membresia"], ["Actas", "/actas"], ["Bitácora", "/servicios"],
  ["Agenda", "/agenda"], ["Cartas", "/cartas"],
  ["Informes memb.", "/reporte-miembros"], ["Registro", "/inbox"],
  ["Ajustes", "/configuracion"],
];

const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { cwd: REPO, stdio: "ignore" });
process.on("exit", () => vite.kill());
await new Promise((r) => setTimeout(r, 4000));

const SQL = await initSqlJs();
const db = new SQL.Database();
for (const m of (() => {
  const src = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");
  const out = []; const re = /version:\s*(\d+),[\s\S]*?sql:\s*r#"([\s\S]*?)"#/g; let x;
  while ((x = re.exec(src))) out.push({ version: Number(x[1]), sql: x[2] });
  return out.sort((a, b) => a.version - b.version);
})()) db.run(m.sql);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
await ctx.exposeFunction("__sqlStub", (esSelect, q, ps) => {
  const st = db.prepare(q); st.bind(ps ?? []);
  if (!esSelect) { st.step(); st.free(); return { rowsAffected: db.getRowsModified(), lastInsertId: 0 }; }
  const filas = []; while (st.step()) filas.push(st.getAsObject()); st.free(); return filas;
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("tesoreria-welcomed", "1");
    localStorage.setItem("tesoreria-lang", "es");
    localStorage.setItem("tesoreria-theme", "light");
  } catch { /* noop */ }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
    transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_cb${id}`] = cb; return id; },
    plugins: {},
    invoke: async (cmd, args) => {
      if (cmd === "db_select") return window.__sqlStub(true, args.query, args.params ?? []);
      if (cmd === "db_execute") return window.__sqlStub(false, args.query, args.params ?? []);
      return null;
    },
  };
});

const page = await ctx.newPage();
let desparejos = 0;
for (const [nombre, ruta] of PANTALLAS) {
  await page.goto(`${URL_BASE}/#/ajustes`, { waitUntil: "domcontentloaded" });
  await page.goto(`${URL_BASE}/#${ruta}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const medidas = await page.evaluate((sels) => {
    const out = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        // Solo lo que está dentro del scroll de la página, no dentro de otra tarjeta.
        if (el.closest(".ios-listcard") !== el && el.closest(".ios-listcard")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 4) continue;
        out.push({ sel, izq: Math.round(r.left * 10) / 10, der: Math.round(r.right * 10) / 10 });
      }
    }
    return out;
  }, SELECTORES);
  if (medidas.length === 0) { console.log(`\n${nombre}: (sin bloques)`); continue; }

  // El izquierdo dominante: contra ese se comparan los demás. Los encabezados
  // y pies de grupo llevan 4px de más a propósito, así que se les perdona.
  const cuenta = new Map();
  for (const m of medidas) cuenta.set(m.izq, (cuenta.get(m.izq) ?? 0) + 1);
  const dominante = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
  console.log(`\n${nombre}  (borde dominante: ${dominante})`);
  for (const m of medidas) {
    const esRotulo = m.sel.includes("header") || m.sel.includes("footer") || m.sel.includes("panel-head");
    const dif = Math.round((m.izq - dominante) * 10) / 10;
    const tolerado = dif === 0 || (esRotulo && Math.abs(dif) <= 4);
    if (!tolerado) desparejos++;
    console.log(`  ${tolerado ? " " : "✗"} ${String(m.izq).padStart(6)} → ${String(m.der).padStart(6)}  ${m.sel}${tolerado ? "" : `   (${dif > 0 ? "+" : ""}${dif})`}`);
  }
}
console.log(`\n${desparejos === 0 ? "✔ todos los bloques arrancan en la misma línea." : `✗ ${desparejos} bloque(s) fuera de línea.`}`);

/* Y el aire vertical: cuánto hay entre el borde de la banda verde y lo
   primero del contenido. Debe ser el mismo en todas; una pantalla que respira
   el doble que sus vecinas se nota al pasar de una a otra. */
console.log("\nAire bajo la banda:");
for (const [nombre, ruta] of PANTALLAS) {
  await page.goto(`${URL_BASE}/#/ajustes`, { waitUntil: "domcontentloaded" });
  await page.goto(`${URL_BASE}/#${ruta}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const aire = await page.evaluate(() => {
    const banda = document.querySelector(".carrusel-secciones") ?? document.querySelector(".header");
    const main = document.querySelector(".main");
    if (!banda || !main) return null;
    /* Lo primero que SE VE, no el primer contenedor: un envoltorio sin fondo
       ni texto empieza donde empieza el aire, no donde empieza el contenido, y
       medirlo a él daba 6 px en pantallas que respiran igual que las demás. */
    const suelo = banda.getBoundingClientRect().bottom;
    let mejor = null;
    for (const el of main.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.height < 4 || r.top < suelo - 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      const conFondo = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      const conTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!conFondo && !conTexto) continue;
      if (!mejor || r.top < mejor.top) mejor = { top: r.top, el, que: (el.className || el.tagName).toString().slice(0, 40) };
    }
    if (!mejor) return null;
    /* De dónde sale el aire: la cadena de márgenes y rellenos superiores
       desde ese elemento hasta `.main`. Sin esto, nivelar es adivinar. */
    const cadena = [];
    for (let el = mejor.el; el && el !== main; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const mt = parseFloat(cs.marginTop) || 0;
      const pt = parseFloat(cs.paddingTop) || 0;
      if (mt || pt) cadena.push(`${(el.className || el.tagName).toString().split(" ")[0]}(${mt ? "m" + mt : ""}${mt && pt ? "+" : ""}${pt ? "p" + pt : ""})`);
    }
    const cont = document.querySelector(".content");
    const hijos = cont ? [...cont.children].slice(0, 4).map((c) => {
      const r = c.getBoundingClientRect();
      return `${(c.className || c.tagName).toString().split(" ")[0] || "?"}:h${Math.round(r.height)}`;
    }).join(" | ") : "";
    return { hueco: Math.round(mejor.top - suelo), que: mejor.que, cadena: cadena.join(" ← "), hijos, gap: cont ? getComputedStyle(cont).rowGap : "" };
  });
  console.log(aire ? `  ${String(aire.hueco).padStart(4)} px   ${nombre.padEnd(16)} ${aire.que}\n              ${aire.cadena}\n              gap=${aire.gap}  hijos: ${aire.hijos}` : `        ${nombre}: —`);
}
await browser.close();
process.exit(0);
