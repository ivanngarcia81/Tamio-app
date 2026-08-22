// Arnés de Playwright para el maestro-detalle del iPad: monta la app REAL
// (vite dev) con un stub de SQL (sql.js corriendo las 37 migraciones reales
// de src-tauri/src/lib.rs), siembra datos con las funciones reales de db.ts
// y mide las seis pantallas nuevas en los tamaños de iPad y la red de
// seguridad (Mac, iPhone, Split View).
//
// Requiere dos paquetes que NO son dependencias de la app (no ensucian el
// package.json):
//
//   npm i --no-save playwright sql.js
//   node pruebas/arnes-ipad.mjs
//
// Si el Chromium de Playwright no está descargado, apuntar CHROMIUM al
// ejecutable de un Chrome/Chromium local.
//
import { chromium } from "playwright";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_BASE = "http://localhost:1420";

let fallos = 0;
function chk(ok, msg) {
  if (ok) console.log(`  ✓ ${msg}`);
  else { fallos++; console.log(`  ✗ ${msg}`); }
}

// ---------- 1. Migraciones reales desde lib.rs ----------
function extraerMigraciones() {
  const src = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");
  const out = [];
  const re = /version:\s*(\d+),[\s\S]*?sql:\s*r#"([\s\S]*?)"#/g;
  let m;
  while ((m = re.exec(src))) out.push({ version: Number(m[1]), sql: m[2] });
  out.sort((a, b) => a.version - b.version);
  return out;
}

// ---------- 2. Base en memoria ----------
const SQL = await initSqlJs();
const db = new SQL.Database();
const migs = extraerMigraciones();
if (migs.length < 30) { console.error(`solo ${migs.length} migraciones extraídas`); process.exit(1); }
for (const mig of migs) {
  try { db.exec(mig.sql); }
  catch (e) { console.error(`migración ${mig.version} falló: ${e.message}`); process.exit(1); }
}
console.log(`base lista: ${migs.length} migraciones aplicadas`);

function bindParams(params) {
  const obj = {};
  params.forEach((p, i) => { obj[`$${i + 1}`] = p === undefined ? null : p; });
  return obj;
}

function sqlSelect(query, params) {
  const stmt = db.prepare(query);
  try {
    if (params?.length) stmt.bind(bindParams(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally { stmt.free(); }
}

function sqlExecute(query, params) {
  if (!params?.length) { db.exec(query); }
  else {
    const stmt = db.prepare(query);
    try { stmt.bind(bindParams(params)); stmt.step(); } finally { stmt.free(); }
  }
  const last = sqlSelect("SELECT last_insert_rowid() AS id", []);
  return { rowsAffected: db.getRowsModified(), lastInsertId: last[0]?.id ?? 0 };
}

// ---------- 3. Servidor vite ----------
const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], {
  cwd: REPO, stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite no arrancó")), 30000);
  vite.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
  vite.stderr.on("data", (d) => process.stderr.write(d));
});
console.log("vite arriba");

// ---------- 4. Navegador ----------
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

/** Contexto con la plataforma pedida. */
async function nuevoContexto(plataforma) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    userAgent: plataforma === "iphone"
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  await ctx.exposeFunction("__sqlStub", (esSelect, query, params) => {
    try {
      return esSelect ? sqlSelect(query, params) : sqlExecute(query, params);
    } catch (e) {
      console.error(`SQL falló (${esSelect ? "select" : "execute"}): ${e.message}\n  ${query.slice(0, 120)}`);
      throw e;
    }
  });
  await ctx.addInitScript(({ plataforma }) => {
    // iPadOS se disfraza de Mac con pantalla táctil; main.tsx clasifica así.
    if (plataforma === "ipad") {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
    }
    try { localStorage.setItem("tesoreria-welcomed", "1"); } catch { /* noop */ }
    const noop = async () => null;
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
      transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_cb${id}`] = cb; return id; },
      plugins: {},
      invoke: async (cmd, args) => {
        if (cmd === "db_select") return window.__sqlStub(true, args.query, args.params ?? []);
        if (cmd === "db_execute") return window.__sqlStub(false, args.query, args.params ?? []);
        return noop();
      },
    };
  }, { plataforma });
  return ctx;
}

// ---------- 5. Sembrar datos con las funciones reales de db.ts ----------
const ctxSeed = await nuevoContexto("ipad");
{
  const page = await ctxSeed.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sidebar, .app", { timeout: 30000 });
  const sembrado = await page.evaluate(async () => {
    const db = await import("/src/db.ts");
    const iglesia = await db.getOrCreateChurch();
    const id = iglesia.id;
    const hoy = new Date();
    const p = (x) => String(x).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const hace = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    const en = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

    // Miembros y movimientos
    for (const nombre of ["Ana Martínez", "Juan Pérez", "María López", "Pedro Salas"]) {
      await db.insertMember(id, { nombre, fecha_ingreso: hace(400) });
    }
    const miembros = await db.listMembers(id);
    for (let i = 0; i < 8; i++) {
      await db.insertTx(id, iglesia.moneda, {
        tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo",
        fecha: hace(i * 3), monto: 120000 + i * 5000, metodo_pago: "efectivo",
        member_id: miembros[i % miembros.length].id,
      });
      await db.insertTx(id, iglesia.moneda, {
        tipo: "gasto", categoria: "servicios", concepto: "Luz y agua",
        fecha: hace(i * 4 + 1), monto: 80000 + i * 3000, metodo_pago: "transferencia",
        beneficiario: "CFE",
      });
    }

    // Depósitos (uno de período distinto al mes de su fecha)
    await db.insertDeposito(id, iglesia.moneda, {
      fecha: hace(2), periodo: hace(2).slice(0, 7), monto: 1854000,
      cuenta_banco: "Banorte ••4821", referencia: "F-1042",
    });
    await db.insertDeposito(id, iglesia.moneda, {
      fecha: hace(9), periodo: hace(40).slice(0, 7), monto: 2118000,
      cuenta_banco: "Banorte ••4821", referencia: "F-1041", notas: "Corte del domingo",
    });
    await db.insertDeposito(id, iglesia.moneda, {
      fecha: hace(45), periodo: hace(45).slice(0, 7), monto: 1690500,
      cuenta_banco: "Banorte ••4821", referencia: null,
    });

    // Actas
    await db.insertActa(id, {
      tipo: "administrativa", titulo: "Reunión del consejo de agosto", fecha: hace(1),
      hora_inicio: "19:00", hora_cierre: "21:00", lugar: "Salón anexo",
      preside: "Pastor Abel Ramos", secretario: "Lucía Márquez",
      presentes: ["Abel Ramos", "Lucía Márquez", "Pedro Salas"], ausentes: ["Jorge Hernández"],
      invitados: [], quorum: true, agenda: "1. Finanzas\n2. Sonido",
      resumen: "Se revisó el estado financiero de julio y la compra del equipo de sonido.",
      mociones: [{ texto: "Comprar equipo de sonido", presenta: "Pedro Salas", secunda: "Lucía Márquez", resultado: "Aprobada 7-0" }],
      acuerdos: [{ texto: "Se aprueba el estado financiero de julio", responsable: "Tesorero", fecha_limite: null }],
      estado: "borrador", confidencial: false, fecha_aprobacion: null,
    });
    await db.insertActa(id, {
      tipo: "asamblea", titulo: "Asamblea general de julio", fecha: hace(35),
      hora_inicio: "18:00", hora_cierre: null, lugar: "Templo",
      preside: "Pastor Abel Ramos", secretario: "Lucía Márquez",
      presentes: ["Abel Ramos"], ausentes: [], invitados: [], quorum: true,
      agenda: null, resumen: "Asamblea ordinaria.", mociones: [], acuerdos: [],
      estado: "aprobada", confidencial: false, fecha_aprobacion: hace(30),
    });

    // Servicios
    await db.insertServicio(id, {
      fecha: hace(3), tipo: "dominical", dirige: "Lucía Márquez", predica: "Pastor Abel Ramos",
      titulo_mensaje: "La iglesia que ora", texto_biblico: "Hechos 2:42-47",
      resumen_mensaje: "La comunión del principio.", participaciones: ["Coro de jóvenes"],
      tema_escuela: "Parábolas", maestro_escuela: "Pedro Salas",
      asistencia: [
        { member_id: miembros[0].id, presente: true, razon: null, razon_otra: null, seguimiento: false, nombre_snapshot: miembros[0].nombre },
        { member_id: miembros[1].id, presente: false, razon: "trabajo", razon_otra: null, seguimiento: false, nombre_snapshot: miembros[1].nombre },
      ],
      visitantes: [{ nombre: "Carlos Vega", telefono: null, correo: null, invitado_por: "Ana Martínez", primera_visita: true, notas: null }],
      ninos: 12, jovenes: 20, adultos: 48, eventos: null,
    });
    await db.insertServicio(id, {
      fecha: hace(10), tipo: "oracion", dirige: "Pedro Salas", predica: null,
      titulo_mensaje: null, texto_biblico: null, resumen_mensaje: null, participaciones: [],
      tema_escuela: null, maestro_escuela: null, asistencia: [], visitantes: [],
      ninos: 4, jovenes: 8, adultos: 22, eventos: null,
    });

    // Cartas
    await db.insertCarta(id, {
      tipo: "traslado", fecha_emision: hace(2), lugar_emision: "Monterrey, N.L.",
      destinatario_tipo: "iglesia", member_id: null,
      destinatario_nombre: "Iglesia El Buen Pastor", destinatario_direccion: null,
      asunto: "Traslado de Javier Medina", saludo: "A la congregación hermana:",
      cuerpo_html: "<p>Hacemos constar que <b>Javier Medina Cruz</b> ha sido miembro en plena comunión desde 2018.</p>",
      despedida: "Fraternalmente,",
      firmas: [{ rol: "pastor", nombre: "Abel Ramos", cargo: "Pastor", firmado: false, fecha: null }],
      observaciones: null, estado: "firma", entregada_a: null, fecha_entrega: null,
    });
    await db.insertCarta(id, {
      tipo: "constanciaActivo", fecha_emision: hace(20), lugar_emision: null,
      destinatario_tipo: "miembro", member_id: miembros[0].id,
      destinatario_nombre: miembros[0].nombre, destinatario_direccion: null,
      asunto: null, saludo: null, cuerpo_html: "<p>Constancia de membresía.</p>", despedida: null,
      firmas: [], observaciones: "Entregar en mano", estado: "entregada",
      entregada_a: miembros[0].nombre, fecha_entrega: hace(18),
    });

    // Agenda: hoy y esta semana
    await db.insertActividad(id, {
      nombre: "Culto matutino", tipo: "cultoRegular", tipo_personalizado: null,
      fecha: iso(hoy), hora_inicio: "10:00", hora_fin: "12:00", dia_completo: false,
      lugar: "Templo principal", descripcion: null, responsable_member_id: null,
      responsable_persona: "Lucía Márquez", responsable_ministerio: "Alabanza",
      invitado: null, contacto: null, estado: "confirmada", es_fecha_importante: false,
    });
    await db.insertActividad(id, {
      nombre: "Reunión de oración", tipo: "cultoRegular", tipo_personalizado: null,
      fecha: en(3), hora_inicio: "19:30", hora_fin: null, dia_completo: false,
      lugar: "Salón anexo", descripcion: null, responsable_member_id: null,
      responsable_persona: null, responsable_ministerio: null,
      invitado: null, contacto: null, estado: "programada", es_fecha_importante: false,
    });
    return "ok";
  });
  chk(sembrado === "ok", "datos sembrados con las funciones reales de db.ts");
  await page.close();
}
await ctxSeed.close();

// ---------- 6. Las mediciones ----------
const PANTALLAS = [
  { ruta: "depositos", clase: "md-depositos", lista: 378 },
  { ruta: "actas", clase: "md-actas", lista: 358 },
  { ruta: "servicios", clase: "md-servicios", lista: 358 },
  { ruta: "cartas", clase: "md-cartas", lista: 338 },
  { ruta: "reportes", clase: "md-reportes", lista: 330 },
  { ruta: "agenda", clase: "md-agenda", lista: null }, // aquí la fija es la columna del día (318)
];

const IPADS = [
  [744, 1133], [820, 1180], [834, 1194], [1024, 1366],
  [1133, 744], [1180, 820], [1194, 834], [1366, 1024],
];

async function medir(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
  }, sel);
}

const ctx = await nuevoContexto("ipad");
const page = await ctx.newPage();
page.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });

for (const [w, h] of IPADS) {
  const columnas = w >= 1150;
  console.log(`\n== iPad ${w}×${h} (${columnas ? "columnas" : "empuje"}) ==`);
  await page.setViewportSize({ width: w, height: h });
  for (const p of PANTALLAS) {
    await page.goto(`${URL_BASE}/#/${p.ruta}`);
    const objetivo = p.ruta === "agenda" ? `.md-split.${p.clase} .md-detalle` : `.md-split.${p.clase} .md-lista`;
    const split = await page.waitForSelector(objetivo, { timeout: 10000, state: "attached" }).catch(() => null);
    if (!split) { chk(false, `${p.ruta}: .md-split.${p.clase} no aparece`); continue; }
    if (p.ruta === "agenda") {
      const dia = await medir(page, ".md-agenda .md-detalle");
      if (columnas) chk(dia && dia.w === 318, `agenda: columna del día de 318px (${dia?.w})`);
      else {
        // En empuje la columna vive fuera de pantalla hasta tocar un día.
        const abierto = await page.evaluate(() => document.querySelector(".md-agenda")?.classList.contains("md-abierto"));
        chk(abierto === false, "agenda: la columna del día empieza cerrada en empuje");
        await page.click(".agenda-cell:not(.empty)");
        const abierto2 = await page.evaluate(() => document.querySelector(".md-agenda")?.classList.contains("md-abierto"));
        chk(abierto2 === true, "agenda: tocar un día abre su columna");
        const dia2 = await medir(page, ".md-agenda .md-detalle");
        chk(dia2 && Math.abs(dia2.w - w) < 3, `agenda: la columna empuja a lo ancho (${dia2?.w})`);
        await page.click(".agenda-dia-cab .dm-volver");
      }
      continue;
    }
    const lista = await medir(page, `.${p.clase} .md-lista`);
    if (columnas) {
      chk(lista && lista.w === p.lista, `${p.ruta}: lista de ${p.lista}px (${lista?.w})`);
      const filas = await page.locator(`.${p.clase} .md-fila`).count();
      chk(filas > 0, `${p.ruta}: ${filas} filas en la lista`);
      // Abrir la primera fila enseña el detalle en el panel.
      await page.click(`.${p.clase} .md-fila`);
      await page.waitForTimeout(150);
      const dm = await page.locator(`.${p.clase} .md-detalle .dm`).count();
      chk(dm > 0, `${p.ruta}: el panel enseña el detalle al tocar una fila`);
    } else {
      chk(lista && Math.abs(lista.w - w) < 3, `${p.ruta}: lista a lo ancho en empuje (${lista?.w})`);
      await page.click(`.${p.clase} .md-fila`);
      await page.waitForTimeout(400);
      const abierto = await page.evaluate((c) => document.querySelector(`.${c}`)?.classList.contains("md-abierto"), p.clase);
      chk(abierto === true, `${p.ruta}: tocar una fila empuja el detalle`);
      const volver = await page.locator(`.${p.clase} .dm-volver`).first().isVisible().catch(() => false);
      chk(volver, `${p.ruta}: botón de volver visible en empuje`);
      await page.locator(`.${p.clase} .dm-volver`).first().click();
      await page.waitForTimeout(350);
    }
  }
}

// ---------- 7. La red de seguridad ----------
console.log("\n== Red de seguridad ==");
await page.close();
await ctx.close();

// Mac: nada de md-split en las seis pantallas nuevas.
{
  const ctxMac = await nuevoContexto("mac");
  const pg = await ctxMac.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror mac:", e.message); });
  for (const [w, h] of [[1440, 900], [1024, 900], [800, 700]]) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".content", { timeout: 10000 });
    for (const p of PANTALLAS) {
      await pg.goto(`${URL_BASE}/#/${p.ruta}`);
      await pg.waitForTimeout(300);
      const n = await pg.locator(".md-split").count();
      chk(n === 0, `mac ${w}: ${p.ruta} sin md-split`);
    }
  }
  await ctxMac.close();
}

// iPhone: tampoco.
{
  const ctxIp = await nuevoContexto("iphone");
  const pg = await ctxIp.newPage();
  for (const [w, h] of [[390, 844], [844, 390]]) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(500);
    const clases = await pg.evaluate(() => document.documentElement.className);
    chk(clases.includes("iphone"), `iphone ${w}: clase iphone (${clases})`);
    for (const p of PANTALLAS) {
      await pg.goto(`${URL_BASE}/#/${p.ruta}`);
      await pg.waitForTimeout(300);
      const n = await pg.locator(".md-split").count();
      chk(n === 0, `iphone ${w}: ${p.ruta} sin md-split`);
    }
  }
  await ctxIp.close();
}

// Split View / Slide Over compactos de iPad: tampoco (partido pide ≥700).
{
  const ctxSv = await nuevoContexto("ipad");
  const pg = await ctxSv.newPage();
  for (const [w, h] of [[507, 1194], [678, 1024], [320, 1194]]) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(500);
    for (const p of PANTALLAS) {
      await pg.goto(`${URL_BASE}/#/${p.ruta}`);
      await pg.waitForTimeout(300);
      const n = await pg.locator(".md-split").count();
      chk(n === 0, `split view ${w}: ${p.ruta} sin md-split`);
    }
  }
  await ctxSv.close();
}

await browser.close();
vite.kill();
console.log(fallos === 0 ? "\nTODO EN VERDE" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
