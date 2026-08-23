// Arnés de Playwright para el maestro-detalle del iPad: monta la app REAL
// (vite dev) con un stub de SQL (sql.js corriendo las 37 migraciones reales
// de src-tauri/src/lib.rs), siembra datos con las funciones reales de db.ts
// y mide las seis pantallas nuevas en los tamaños de iPad, las OCHO hojas
// de formulario (que en iPad salen como formSheet de 600) y la red de
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
/* Si el arnés muere a medio camino (una aserción que revienta, un click a un
   elemento invisible), vite se quedaba vivo con el puerto 1420 tomado y la
   siguiente pasada fallaba con "Port already in use" —un fallo que no tiene
   nada que ver con lo que se estaba probando. Se cierra pase lo que pase. */
process.on("exit", () => vite.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { vite.kill(); process.exit(1); });

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
    // Idioma fijo: las comprobaciones de las hojas tocan filas por su texto
    // ("Presentes", "Horario"), y el Chromium del CI arranca en inglés.
    try {
      localStorage.setItem("tesoreria-welcomed", "1");
      localStorage.setItem("tesoreria-lang", "es");
    } catch { /* noop */ }
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

    /* Cinco meses hacia atrás, para que la gráfica de barras del Inicio
       (handoff: seis columnas) tenga de verdad seis meses que dibujar. Con
       solo el mes en curso se veía una columna y cinco huecos, que es un
       estado válido pero no el que hay que medir. Montos distintos por mes:
       una escala compartida solo se puede comprobar si las barras difieren. */
    for (let k = 1; k <= 5; k++) {
      const atras = new Date(hoy.getFullYear(), hoy.getMonth() - k, 12);
      const fecha = iso(atras);
      await db.insertTx(id, iglesia.moneda, {
        tipo: "ingreso", categoria: k % 2 ? "ofrenda" : "donacion",
        concepto: "Ofrenda del mes", fecha, monto: 300000 + k * 90000, metodo_pago: "efectivo",
      });
      await db.insertTx(id, iglesia.moneda, {
        tipo: "gasto", categoria: "mantenimiento", concepto: "Mantenimiento",
        fecha, monto: 120000 + k * 40000, metodo_pago: "transferencia", beneficiario: "Taller",
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
    // Mensajes: el hilo compartido de las tres áreas. Tres mensajes de dos
    // roles distintos para que se vean las burbujas de los dos lados; el
    // separador de día sale solo (todos caen hoy).
    await db.insertMensaje(id, "tesoreria", "El corte del domingo ya está capturado, falta el comprobante del banco.");
    await db.insertMensaje(id, "secretaria", "Perfecto. Subo el acta de la administrativa esta tarde.");
    await db.insertMensaje(id, "tesoreria", "Va. Y ojo con el traslado de Javier: la carta sigue sin firma.");

    return "ok";
  });
  chk(sembrado === "ok", "datos sembrados con las funciones reales de db.ts");
  await page.close();
}
await ctxSeed.close();

// ---------- 6. Las mediciones ----------
// `fila` porque la columna maestra NO tiene una sola forma (ver
// docs/ipad-rediseno.md §10.1): la de FILAS agrupadas usa `.md-fila`, y la
// de ÍNDICE —Cartas y Reportes, donde la columna lista SECCIONES y no
// registros— usa `.md-indice-item`. El arnés daba `.md-fila` por sentado y
// se quedaba colgado 30s en Cartas esperando una fila que ahí no existe.
const PANTALLAS = [
  { ruta: "depositos", clase: "md-depositos", lista: 378, fila: ".md-fila" },
  // Membresía (handoff 2): lista de 400 con filas propias (.mb-fila).
  { ruta: "membresia", clase: "md-membresia", lista: 400, fila: ".mb-fila" },
  { ruta: "actas", clase: "md-actas", lista: 358, fila: ".md-fila" },
  { ruta: "servicios", clase: "md-servicios", lista: 358, fila: ".md-fila" },
  { ruta: "cartas", clase: "md-cartas", lista: 338, fila: ".md-indice-item" },
  { ruta: "reportes", clase: "md-reportes", lista: 330, fila: ".md-indice-item" },
  { ruta: "agenda", clase: "md-agenda", lista: null, fila: ".md-fila" }, // aquí la fija es la columna del día (318)
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
  const columnas = w >= 1000;  // el mismo corte que la app (styles.css y useMediaQuery)
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
        // El volver del panel del día. Se ancla en `.md-agenda .dm-volver`
        // y no en la clase de la cabecera: el panel es `.dm.ag-dia` en la
        // implementación que se envió, y atarse al nombre de un div interno
        // es lo que hizo que este arnés midiera otra rama durante horas.
        await page.click(".md-agenda .dm-volver");
      }
      continue;
    }
    const lista = await medir(page, `.${p.clase} .md-lista`);
    if (columnas) {
      chk(lista && lista.w === p.lista, `${p.ruta}: lista de ${p.lista}px (${lista?.w})`);
      const filas = await page.locator(`.${p.clase} ${p.fila}`).count();
      chk(filas > 0, `${p.ruta}: ${filas} filas en la lista`);
      // Abrir la primera fila enseña el detalle en el panel.
      await page.click(`.${p.clase} ${p.fila}:not(.sel)`);
      await page.waitForTimeout(150);
      const dm = await page.locator(`.${p.clase} .md-detalle .dm`).count();
      chk(dm > 0, `${p.ruta}: el panel enseña el detalle al tocar una fila`);
    } else {
      chk(lista && Math.abs(lista.w - w) < 3, `${p.ruta}: lista a lo ancho en empuje (${lista?.w})`);
      await page.click(`.${p.clase} ${p.fila}:not(.sel)`);
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

// ---------- 6b. Las hojas de formulario ----------
// Desde el 22-ago los OCHO formularios con hoja de iOS corren también en el
// iPad (esMovil en vez de esIPhone): acta, servicio, actividad, depósito,
// miembro, solicitud y los dos traslados. En iPad deben salir como hoja de
// formulario (.formSheet: 600px, centrada, radio 16), nunca como el modal
// de escritorio; las subpantallas se apilan como hojas encima.
console.log("\n== Hojas de formulario (iPad 1366) ==");
await page.setViewportSize({ width: 1366, height: 1024 });

async function medirHoja() {
  return page.evaluate(() => {
    const hojas = [...document.querySelectorAll(".ios-sheet")];
    const hoja = hojas[hojas.length - 1];
    if (!hoja) return null;
    const r = hoja.getBoundingClientRect();
    const grupo = hoja.querySelector(".ios-group");
    const marcar = hoja.querySelector(".ios-miembro-marcar");
    const cuenta = hoja.querySelector(".ios-cuenta");
    return {
      n: hojas.length,
      w: Math.round(r.width),
      centro: Math.round(r.x + r.width / 2),
      radio: getComputedStyle(hoja).borderRadius,
      grupoBg: grupo ? getComputedStyle(grupo).backgroundColor : null,
      marcarAlto: marcar ? getComputedStyle(marcar).minHeight : null,
      cuentaBg: cuenta ? getComputedStyle(cuenta).backgroundColor : null,
    };
  });
}
async function esperaHoja() {
  await page.waitForSelector(".ios-sheet", { timeout: 5000 }).catch(() => { /* la chk lo dirá */ });
  await page.waitForTimeout(500); // que termine `modalIn` antes de medir
}
async function cierraHoja() {
  await page.locator(".ios-sheet").last().locator(".ios-sheet-cancelar").click().catch(() => { });
  await page.waitForTimeout(400);
}
function chkHoja(nombre, m) {
  if (!m) { chk(false, `${nombre}: se abre como hoja de iOS`); return false; }
  chk(m.w === 600, `${nombre}: hoja de 600 (mide ${m.w})`);
  chk(Math.abs(m.centro - 683) <= 2, `${nombre}: centrada (centro ${m.centro})`);
  chk(m.radio === "16px", `${nombre}: radio 16 (${m.radio})`);
  chk(m.grupoBg && m.grupoBg !== "rgba(0, 0, 0, 0)", `${nombre}: grupos con fondo`);
  return true;
}

// Las cinco pantallas con botón de crear en la cabecera.
for (const { ruta, nombre } of [
  { ruta: "depositos", nombre: "deposito" },
  { ruta: "actas", nombre: "acta" },
  { ruta: "servicios", nombre: "servicio" },
  { ruta: "agenda", nombre: "actividad" },
  { ruta: "membresia", nombre: "miembro" },
]) {
  await page.goto(`${URL_BASE}/#/${ruta}`);
  await page.waitForTimeout(700);
  await page.locator(".btn-nuevo-cabecera").first().click();
  await esperaHoja();
  const m = await medirHoja();
  if (!chkHoja(nombre, m)) continue;
  if (nombre === "acta") {
    // La subpágina (Horario) se apila como segunda hoja, también a 600.
    await page.locator(".ios-sheet .ios-field--link", { hasText: "Horario" }).first().click();
    await page.waitForTimeout(500);
    const s = await medirHoja();
    chk(s?.n === 2 && s?.w === 600, `acta: subpágina apilada a 600 (${s?.n} hojas, ${s?.w})`);
    await page.locator(".ios-sheet").last().locator(".ios-back").click();
    await page.waitForTimeout(300);
  }
  if (nombre === "servicio") {
    // El padrón vive en la subpágina "Tomar asistencia" (fila Presentes).
    await page.locator(".ios-sheet .ios-field--link", { hasText: "Presentes" }).first().click();
    await page.waitForTimeout(500);
    const s = await medirHoja();
    chk(s?.marcarAlto === "44px", `servicio: fila de padrón a 44 (${s?.marcarAlto})`);
    await page.locator(".ios-sheet").last().locator(".ios-back").click();
    await page.waitForTimeout(300);
  }
  if (nombre === "miembro") {
    chk(m.cuentaBg && m.cuentaBg !== "rgba(0, 0, 0, 0)", "miembro: cuenta \"n de m\" teñida");
  }
  await cierraHoja();
}

// Cartas: solicitud y los dos traslados salen del menú de crear de la
// cabecera — el mismo MenuAnchor del Mac, que a partir de 700 vuelve a ser
// la única entrada de crear de esa pantalla (el "+" fijo muere ahí).
await page.goto(`${URL_BASE}/#/cartas`);
await page.waitForTimeout(700);
for (const [etiqueta, nombre] of [
  ["Nueva solicitud", "solicitud"],
  ["Registrar traslado de salida", "traslado salida"],
  ["Registrar traslado de entrada", "traslado entrada"],
]) {
  await page.locator(".cartas-menu-crear button").first().click();
  await page.waitForTimeout(300);
  await page.getByText(etiqueta, { exact: true }).first().click();
  await esperaHoja();
  chkHoja(nombre, await medirHoja());
  await cierraHoja();
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
  // Y el formulario sigue siendo el modal de escritorio, no una hoja.
  await pg.setViewportSize({ width: 1440, height: 900 });
  await pg.goto(`${URL_BASE}/#/servicios`);
  await pg.waitForTimeout(500);
  await pg.locator(".btn-nuevo-cabecera").first().click();
  await pg.waitForTimeout(400);
  chk(await pg.locator(".modal-card").count() > 0, "mac: Nuevo servicio es el modal de siempre");
  chk(await pg.locator(".ios-sheet").count() === 0, "mac: sin hoja de iOS");
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
  // Y la hoja del teléfono sigue siendo a lo ancho, no el formSheet de 600.
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.goto(`${URL_BASE}/#/servicios`);
  await pg.waitForTimeout(500);
  await pg.locator(".btn-crear").click();
  await pg.waitForSelector(".ios-sheet", { timeout: 5000 }).catch(() => { /* la chk lo dirá */ });
  await pg.waitForTimeout(400);
  const hojaTel = await pg.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet");
    return hoja ? Math.round(hoja.getBoundingClientRect().width) : null;
  });
  chk(hojaTel === 390, `iphone: hoja a lo ancho del teléfono (${hojaTel})`);
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

/* ---------- 7 bis. El gris del cromo (ficha de color del handoff 2) ----------
   Barra, columna maestra y panel tienen que ser EL MISMO gris, y el que el
   diseño manda: #F7F7F9 en claro, #131315 en oscuro. Se mide con estilos
   computados y no a ojo, porque medio tono de diferencia no se ve en una
   captura y sí se ve en un iPad al lado de otro. */
console.log("\n== El gris del cromo ==");
{
  const ctxC = await nuevoContexto("ipad");
  const pg = await ctxC.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });
  for (const [tema, esperado] of [["light", "rgb(247, 247, 249)"], ["dark", "rgb(19, 19, 21)"]]) {
    await pg.emulateMedia({ colorScheme: tema });
    await pg.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(500);
    const c = await pg.evaluate(() => {
      const bg = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null; };
      return { barra: bg(".header"), lista: bg(".md-lista"), panel: bg(".md-detalle") };
    });
    for (const [k, v] of Object.entries(c)) {
      chk(v === esperado, `${tema}: ${k} = ${v} (esperado ${esperado})`);
    }
  }
  await ctxC.close();
}

/* ---------- 8. La pantalla once: Informes de membresía (y Mensajes) ----------
   Ninguna de las dos está en el handoff — y §12 de docs/ipad-rediseno.md ya
   contó lo que pasa con lo que no está en la maqueta: no se revisa. Aquí se
   miden las dos cosas que SÍ puede decir un arnés sin diseño de referencia:
   que nada se desborde en horizontal, y que ningún mando quede recortado
   por la barra. Con captura, para poder VER la página. */
console.log("\n== Informes de membresía y Mensajes (fuera del handoff) ==");
{
  const ctxInf = await nuevoContexto("ipad");
  const pg = await ctxInf.newPage();
  const DIR = process.env.CAPTURAS || "";
  for (const [w, h] of [[1366, 1024], [1024, 1366], [1210, 1614]]) {
    await pg.setViewportSize({ width: w, height: h });
    for (const ruta of ["", "miembros", "reporte-miembros", "inbox", "membresia"]) {
      await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
      await pg.waitForTimeout(600);
      const m = await pg.evaluate(() => {
        const doc = document.documentElement;
        const contenido = document.querySelector(".content");
        // Mandos recortados: algo interactivo cuyo cajón se sale por arriba
        // del contenido o queda debajo de la barra.
        const barra = document.querySelector(".header")?.getBoundingClientRect();
        const recortados = [];
        for (const el of document.querySelectorAll(".content button, .content input, .content select, .content .chip")) {
          const r = el.getBoundingClientRect();
          if (r.height === 0 || r.width === 0) continue;
          if (barra && r.top < barra.bottom - 2) recortados.push(el.className || el.tagName);
        }
        return {
          desbordaX: doc.scrollWidth > doc.clientWidth,
          desbordaContenido: contenido ? contenido.scrollWidth > contenido.clientWidth + 1 : null,
          recortados: recortados.slice(0, 4),
        };
      });
      const nom = ruta || "inicio";
      chk(m.desbordaX === false, `${nom} ${w}×${h}: sin scroll horizontal de página`);
      chk(m.desbordaContenido !== true, `${nom} ${w}×${h}: el contenido no se desborda (${m.desbordaContenido})`);
      chk(m.recortados.length === 0, `${nom} ${w}×${h}: ningún mando bajo la barra (${m.recortados.join(", ") || "ok"})`);
      if (DIR) await pg.screenshot({ path: `${DIR}/${nom}-${w}x${h}.png`, fullPage: false });
      // Membresía además con ficha abierta y en la vista de asistencia: son
      // los dos estados del panel y una captura sin ellos no enseña nada.
      if (DIR && ruta === "membresia") {
        await pg.click(".mb-fila").catch(() => {});
        await pg.waitForTimeout(350);
        await pg.screenshot({ path: `${DIR}/${ruta}-ficha-${w}x${h}.png`, fullPage: false });
        await pg.click(".mb-seg-opcion:nth-child(2)").catch(() => {});
        await pg.waitForTimeout(350);
        await pg.screenshot({ path: `${DIR}/${ruta}-asistencia-${w}x${h}.png`, fullPage: false });
        await pg.click(".mb-seg-opcion:nth-child(1)").catch(() => {});
      }
    }
  }
  await ctxInf.close();
}

/* ---------- 9. El cajón del sidebar se decide por ORIENTACIÓN ----------
   Llegó de TestFlight: "en portrait mode el side bar no se esconde, sigue
   afuera como lo hace landscape mode". La regla se preguntaba solo por
   ancho (max-width: 1149.98px) y el 13" con "Más espacio" reporta ~1210pt
   en vertical, así que se salía del rango y la barra se quedaba fija.

   Aquí se mide lo único que importa y que una captura no dice bien: la
   POSICIÓN calculada de la barra. En vertical tiene que ser `fixed` y estar
   fuera de pantalla (borde derecho ≤ 0) con el ☰ encendido; en horizontal
   ancho, al revés: en el flujo, a la vista, y sin ☰. El 1210×1614 es el
   caso que falló — si algún día se vuelve a tocar el umbral, este es el que
   avisa. */
console.log("\n== Cajón del sidebar por orientación ==");
{
  const ctxSb = await nuevoContexto("ipad");
  const pg = await ctxSb.newPage();
  const CASOS = [
    [744, 1133, "cajón"],   // mini vertical
    [1024, 1366, "cajón"],  // 13" vertical
    [1210, 1614, "cajón"],  // 13" vertical con "Más espacio" — el del fallo
    [1133, 744, "cajón"],   // mini horizontal: 1133 < 1150, tampoco cabe
    [1194, 834, "fija"],    // 11" horizontal
    [1366, 1024, "fija"],   // 13" horizontal
  ];
  for (const [w, h, modo] of CASOS) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
    // 600 > los 280ms de la transición del cajón: al cambiar de tamaño la
    // barra se desliza, y midiendo antes se lee un borde a medio camino
    // (salió un 1 donde tocaba 0 en la primera pasada).
    await pg.waitForTimeout(600);
    const m = await pg.evaluate(() => {
      const sb = document.querySelector(".sidebar");
      const ham = document.querySelector(".menu-hamburguesa");
      if (!sb) return null;
      const r = sb.getBoundingClientRect();
      return {
        position: getComputedStyle(sb).position,
        derecha: Math.round(r.right),
        ancho: Math.round(r.width),
        ham: ham ? getComputedStyle(ham).display : "sin botón",
      };
    });
    if (!m) { chk(false, `${w}×${h}: no hay .sidebar`); continue; }
    if (modo === "cajón") {
      chk(m.position === "fixed", `${w}×${h}: barra superpuesta (position ${m.position})`);
      chk(m.derecha <= 0, `${w}×${h}: barra escondida fuera de pantalla (borde derecho ${m.derecha})`);
      chk(m.ham !== "none", `${w}×${h}: el ☰ está encendido (${m.ham})`);
    } else {
      chk(m.position !== "fixed", `${w}×${h}: barra en el flujo (position ${m.position})`);
      chk(m.derecha > 0 && m.ancho > 0, `${w}×${h}: barra a la vista (${m.ancho}px, borde ${m.derecha})`);
      chk(m.ham === "none", `${w}×${h}: sin ☰ (${m.ham})`);
    }
  }
  // Y que el cajón ABRA donde tiene que abrir: el caso del fallo, con el
  // velo puesto. Sin esto la prueba de arriba pasaría con un sidebar roto
  // que nunca se deja ver.
  await pg.setViewportSize({ width: 1210, height: 1614 });
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.click(".menu-hamburguesa");
  await pg.waitForTimeout(450);
  const abierto = await pg.evaluate(() => {
    const sb = document.querySelector(".sidebar");
    const velo = document.querySelector(".menu-telon");
    return {
      x: Math.round(sb.getBoundingClientRect().x),
      velo: velo ? getComputedStyle(velo).display : "sin velo",
    };
  });
  chk(abierto.x === 0, `1210×1614: el ☰ saca el cajón (x ${abierto.x})`);
  chk(abierto.velo === "block", `1210×1614: con velo (${abierto.velo})`);
  await ctxSb.close();
}

/* ---------- 10. El Inicio del handoff: periodo, gráficas y listas ----------
   El segmentado Mes · Trimestre · Año es lo único de esta pantalla que un
   arnés puede comprobar de verdad: que existe, que cambia de estado, y que al
   cambiarlo cambian las cifras. Lo demás (la dona, las barras) se mide como
   presencia y como forma —seis columnas, un anillo con tramos— porque su
   valor exacto ya lo garantizan los verificadores de centavos. */
console.log("\n== Inicio del iPad (handoff) ==");
{
  const ctxIn = await nuevoContexto("ipad");
  const pg = await ctxIn.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(700);

  const base = await pg.evaluate(() => ({
    seg: [...document.querySelectorAll(".dash-seg button")].map((b) => b.textContent.trim()),
    sel: document.querySelector(".dash-seg button.sel")?.textContent.trim(),
    kpis: [...document.querySelectorAll(".dash-kpi .stat-label")].map((e) => e.textContent.trim()),
    columnas: document.querySelectorAll(".dash-barras .dash-barra-col").length,
    anillo: getComputedStyle(document.querySelector(".dash-dona")).backgroundImage,
    ingresos: document.querySelectorAll(".dash-kpi .stat-value")[1]?.textContent.trim(),
    // El saludo, que es donde se coló una clave sin traducir (§ verificar-traducciones).
    saludo: document.querySelector(".dash-hero h1")?.textContent.trim(),
    listas: document.querySelectorAll(".dash-dos-listas .dash-lista-card").length,
    puntos: document.querySelectorAll(".dash-fila-punto").length,
  }));
  chk(base.seg.length === 3, `el segmentado tiene tres opciones (${base.seg.join(" · ")})`);
  chk(base.sel === base.seg[0], `arranca en la primera (${base.sel})`);
  chk(base.kpis.length === 4, `cuatro KPI (${base.kpis.length})`);
  chk(/caja|hand/i.test(base.kpis[0] || ""), `la primera KPI es el saldo en caja (${base.kpis[0]})`);
  chk(base.columnas === 6, `la gráfica dibuja seis meses (${base.columnas})`);
  chk(base.anillo.includes("conic-gradient"), "la dona es un conic-gradient");
  chk(base.listas === 2, `las dos listas del pie (${base.listas})`);
  chk(base.puntos > 0, `los compromisos llevan su punto de color (${base.puntos})`);
  /* Ninguna cadena de pantalla puede parecerse a una clave i18n sin traducir
     ("dashboard.saludo.manana"): eso es exactamente lo que se escapó. */
  chk(base.saludo && !/^[a-z]+(\.[a-zA-Z]+)+$/.test(base.saludo), `el saludo está traducido (${base.saludo})`);

  if (DIR) await pg.screenshot({ path: `${DIR}/inicio-mes-1366x1024.png` });

  // Trimestre y Año: el segmentado tiene que mover las cifras, no solo el relieve.
  const vistos = new Map([[base.sel, base.ingresos]]);
  for (const i of [1, 2]) {
    await pg.click(`.dash-seg button:nth-child(${i + 1})`);
    await pg.waitForTimeout(700);
    const m = await pg.evaluate(() => ({
      sel: document.querySelector(".dash-seg button.sel")?.textContent.trim(),
      etiqueta: document.querySelector(".dash-kpi .stat-label")?.textContent.trim(),
      ingresos: document.querySelectorAll(".dash-kpi .stat-value")[1]?.textContent.trim(),
      rotulo: document.querySelector(".dash-dona-periodo")?.textContent.trim(),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    chk(m.sel === base.seg[i], `"${base.seg[i]}" queda seleccionado (${m.sel})`);
    chk(m.desborda === false, `"${base.seg[i]}": sin scroll horizontal`);
    chk(!!m.rotulo, `"${base.seg[i]}": la dona rotula su periodo (${m.rotulo})`);
    vistos.set(m.sel, m.ingresos);
    if (DIR) await pg.screenshot({ path: `${DIR}/inicio-${base.seg[i].toLowerCase()}-1366x1024.png` });
  }
  /* Con los datos sembrados hay movimientos fuera del mes en curso, así que
     mes ≠ año a la fuerza. Si salieran iguales, el segmentado sería adorno. */
  chk(vistos.get(base.seg[0]) !== vistos.get(base.seg[2]),
      `el periodo cambia los ingresos (${vistos.get(base.seg[0])} → ${vistos.get(base.seg[2])})`);
  await ctxIn.close();
}

/* ---------- 11. Ingresos/Gastos: la lista y el panel del handoff ---------- */
console.log("\n== Movimientos del iPad (handoff) ==");
{
  const ctxMv = await nuevoContexto("ipad");
  const pg = await ctxMv.newPage();
  const DIR = process.env.CAPTURAS || "";
  for (const [w, h] of [[1366, 1024], [1024, 1366]]) {
    await pg.setViewportSize({ width: w, height: h });
    for (const ruta of ["ingresos", "gastos"]) {
      await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
      await pg.waitForSelector(".md-movimientos .md-fila", { timeout: 10000 });
      await pg.waitForTimeout(300);
      const m = await pg.evaluate(() => ({
        seg: [...document.querySelectorAll(".md-seg-tipo a")].map((a) => a.textContent.trim()),
        segSel: document.querySelector(".md-seg-tipo a.sel")?.textContent.trim(),
        chipMes: document.querySelector(".chip-mes")?.textContent.trim(),
        // La navegación de mes de la cabecera tiene que estar APAGADA: el chip
        // hace lo mismo y dos mandos iguales en la misma pantalla confunden.
        navMes: document.querySelector(".header .month-nav")
          ? getComputedStyle(document.querySelector(".header .month-nav")).display : "sin nav",
        puntos: document.querySelectorAll(".md-movimientos .md-fila .md-cat-dot").length,
        filas: document.querySelectorAll(".md-movimientos .md-fila").length,
        // La cabecera de día tiene que quedarse pegada al desplazar.
        grupoSticky: document.querySelector(".md-movimientos .md-grupo")
          ? getComputedStyle(document.querySelector(".md-movimientos .md-grupo")).position : null,
        pie: !!document.querySelector(".md-movimientos .md-pie"),
      }));
      const et = `${ruta} ${w}×${h}`;
      chk(m.seg.length === 2, `${et}: segmentado Ingresos|Gastos (${m.seg.join("|")})`);
      chk(!!m.segSel, `${et}: el segmentado marca la lista abierta (${m.segSel})`);
      chk(!!m.chipMes, `${et}: chip del mes en los filtros (${m.chipMes})`);
      chk(m.navMes === "none", `${et}: la navegación ‹mes› de la cabecera está apagada (${m.navMes})`);
      /* El cuadrito de color en TODAS las filas: estaba solo en gastos y el
         handoff lo pinta en las dos listas. */
      chk(m.puntos === m.filas, `${et}: cuadrito de categoría en cada fila (${m.puntos}/${m.filas})`);
      chk(m.grupoSticky === "sticky", `${et}: la cabecera del día se queda pegada (${m.grupoSticky})`);
      chk(m.pie, `${et}: pie con conteo y total`);

      // El panel: se abre tocando una fila y trae lo que el handoff pide.
      await pg.click(".md-movimientos .md-fila:not(.sel)");
      await pg.waitForTimeout(400);
      const d = await pg.evaluate(() => ({
        titular: document.querySelector(".dm-titular")?.textContent.trim(),
        monto: !!document.querySelector(".dm-monto"),
        rastro: document.querySelectorAll(".dm-rastro-item").length,
        // El sello de "Registrado" sale de created_at, que SQLite escribe en
        // UTC y con segundos. Tiene que llegar convertido y sin segundos: si
        // aparece "hh:mm:ss", `utcALocal` dejó de aplicarse.
        selloCreado: document.querySelector(".dm-rastro-item .dm-rastro-detalle")?.textContent.trim(),
        comp: !!document.querySelector(".dm-comp-falta, .dm-comp-hay"),
        compartir: [...document.querySelectorAll(".dm-acciones button")]
          .some((b) => /compartir|share/i.test(b.textContent)),
        desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      chk(!!d.titular, `${et}: el panel titula el movimiento (${d.titular})`);
      chk(d.monto, `${et}: y enseña el importe`);
      /* Al menos dos entradas: "Registrado" (created_at) y el estado. Si
         saliera una sola, es que created_at no está llegando. */
      chk(d.rastro >= 2, `${et}: rastro de auditoría con lo que la base sabe (${d.rastro})`);
      chk(!/\d{2}:\d{2}:\d{2}/.test(d.selloCreado || ""), `${et}: el sello va en hora local sin segundos (${d.selloCreado})`);
      chk(d.comp, `${et}: tarjeta de comprobante (con o sin archivo)`);
      chk(d.compartir, `${et}: botón Compartir`);
      chk(d.desborda === false, `${et}: sin scroll horizontal con el panel abierto`);
      if (DIR) await pg.screenshot({ path: `${DIR}/${ruta}-${w}x${h}.png` });
    }
  }
  await ctxMv.close();
}

/* ---------- 12. Aportantes: filtro del padrón y ficha de cuatro pestañas ---------- */
console.log("\n== Aportantes del iPad (handoff) ==");
{
  const ctxAp = await nuevoContexto("ipad");
  const pg = await ctxAp.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-miembros .md-fila", { timeout: 10000 });
  await pg.waitForTimeout(300);

  const lista = await pg.evaluate(() => ({
    seg: [...document.querySelectorAll(".md-miembros .md-seg-tipo button")].map((b) => b.textContent.trim()),
    sel: document.querySelector(".md-miembros .md-seg-tipo button.sel")?.textContent.trim(),
    conteo: document.querySelector(".md-miembros .md-conteo")?.textContent.trim(),
    filas: document.querySelectorAll(".md-miembros .md-fila").length,
  }));
  chk(lista.seg.length === 3, `el padrón filtra por tres (${lista.seg.join(" · ")})`);
  chk(lista.sel === lista.seg[0], `arranca en activos (${lista.sel})`);
  chk(!!lista.conteo, `conteo bajo el filtro (${lista.conteo})`);

  // La ficha: cuatro pestañas y la columna del dinero fija.
  await pg.click(".md-miembros .md-fila:not(.sel)");
  await pg.waitForTimeout(400);
  const ficha = await pg.evaluate(() => ({
    pestanas: [...document.querySelectorAll(".fm-seg button")].map((b) => b.textContent.trim()),
    abierta: document.querySelector(".fm-seg button.sel")?.textContent.trim(),
    tarjeta: !!document.querySelector(".fm-tarjeta"),
    barras: document.querySelectorAll(".fm-barra").length,
  }));
  chk(ficha.pestanas.length === 4, `la ficha trae cuatro pestañas (${ficha.pestanas.join(" · ")})`);
  chk(!!ficha.abierta, `abre en la primera (${ficha.abierta})`);
  chk(ficha.tarjeta, "la columna del dinero está fija a la derecha");

  /* El acento del handoff (#047857) es `--ink`, que en esta app NO es un
     verde fijo: es el acento que el usuario elige en Configuración —neutro
     (negro) de fábrica, o verde/azul/morado/ámbar—. Lo que hay que comprobar
     no es "sale verde" sino que el chip y la barra estén ATADOS al acento y
     no a un hexadecimal copiado del prototipo: se cambia el acento y tienen
     que moverse los dos. */
  const acento = await pg.evaluate(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute("data-acento");
    const leer = () => ({
      chip: getComputedStyle(document.querySelector(".chip-mes") || document.body).backgroundColor,
      barra: getComputedStyle(document.querySelector(".fm-barra.actual") || document.body).backgroundColor,
    });
    const antes = leer();
    raiz.setAttribute("data-acento", "verde");
    const despues = leer();
    if (previo) raiz.setAttribute("data-acento", previo); else raiz.removeAttribute("data-acento");
    return { antes, despues };
  });
  chk(acento.despues.barra !== acento.antes.barra,
      `la barra del año sigue el acento elegido (${acento.antes.barra} → ${acento.despues.barra})`);

  /* Cada pestaña tiene que enseñar ALGO: una pestaña que se marca y deja el
     panel en blanco es peor que no tenerla. Familia es la que no tiene motor
     todavía y por eso se comprueba que explique por qué está vacía. */
  for (let i = 1; i < 4; i++) {
    await pg.click(`.fm-seg button:nth-child(${i + 1})`);
    await pg.waitForTimeout(350);
    const m = await pg.evaluate(() => ({
      sel: document.querySelector(".fm-seg button.sel")?.textContent.trim(),
      hay: (document.querySelector(".fm-izq")?.textContent || "").trim().length,
      tarjeta: !!document.querySelector(".fm-tarjeta"),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    chk(m.sel === ficha.pestanas[i], `"${ficha.pestanas[i]}" queda abierta (${m.sel})`);
    chk(m.hay > 0, `"${ficha.pestanas[i]}": el panel dice algo (${m.hay} caracteres)`);
    chk(m.tarjeta, `"${ficha.pestanas[i]}": el dinero sigue a la vista`);
    chk(m.desborda === false, `"${ficha.pestanas[i]}": sin scroll horizontal`);
    if (DIR) await pg.screenshot({ path: `${DIR}/miembros-${ficha.pestanas[i].toLowerCase()}-1366x1024.png` });
  }
  await ctxAp.close();
}

/* ---------- 13. Reportes: los mandos viven CON el informe ---------- */
console.log("\n== Reportes del iPad (handoff) ==");
{
  const ctxRp = await nuevoContexto("ipad");
  const pg = await ctxRp.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/reportes`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-reportes .md-indice-item", { timeout: 10000 });
  await pg.click(".md-reportes .md-indice-item:not(.sel)");
  await pg.waitForTimeout(500);
  const m = await pg.evaluate(() => ({
    indice: document.querySelectorAll(".md-reportes .md-indice-item").length,
    barra: !!document.querySelector(".rep-barra"),
    chipMes: document.querySelector(".rep-barra .chip-mes")?.textContent.trim(),
    botones: [...document.querySelectorAll(".rep-barra .chip")].map((b) => b.textContent.trim()),
    // La ‹ › de la cabecera se apaga: el chip del mes ya hace eso.
    navMes: document.querySelector(".header .month-nav")
      ? getComputedStyle(document.querySelector(".header .month-nav")).display : "sin nav",
    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  chk(m.indice === 5, `el índice trae los cinco informes (${m.indice})`);
  chk(m.barra, "el informe lleva su barra de mandos");
  chk(!!m.chipMes, `con el chip del periodo (${m.chipMes})`);
  chk(m.botones.length >= 3, `y las salidas del informe (${m.botones.join(" · ")})`);
  chk(m.navMes === "none", `la ‹ › de la cabecera está apagada (${m.navMes})`);
  chk(m.desborda === false, "sin scroll horizontal");
  /* Una captura por informe: son cinco documentos distintos y el panel cambia
     entero entre ellos, así que una sola captura no dice si los otros cuatro
     siguen en pie. De paso comprueba que ninguno se desborde. */
  const nombres = await pg.evaluate(() =>
    [...document.querySelectorAll(".md-reportes .md-indice-nombre")].map((e) => e.textContent.trim()));
  for (let i = 0; i < nombres.length; i++) {
    /* `.nth(i)` del localizador y NO `:nth-of-type()`: la columna mezcla el
       rótulo del grupo (un div) con los informes (botones), y `nth-of-type`
       cuenta por ETIQUETA, no por posición. Con el desfase de uno que eso
       provocaba, cada captura salía con el nombre del informe vecino. */
    await pg.locator(".md-reportes .md-indice-item").nth(i).click();
    await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => ({
      barra: !!document.querySelector(".rep-barra"),
      cuerpo: (document.querySelector(".md-reportes .md-detalle")?.textContent || "").trim().length,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    chk(r.barra, `"${nombres[i]}": conserva la barra de mandos`);
    chk(r.cuerpo > 40, `"${nombres[i]}": el panel dice algo (${r.cuerpo} caracteres)`);
    chk(r.desborda === false, `"${nombres[i]}": sin scroll horizontal`);
    if (DIR) {
      const slug = nombres[i].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
      await pg.screenshot({ path: `${DIR}/reportes-${slug}-1366x1024.png` });
    }
  }
  await ctxRp.close();
}

/* ---------- 14. Depósitos: el corte del handoff, con sus huecos a la vista ---------- */
console.log("\n== Depósitos del iPad (handoff) ==");
{
  const ctxDp = await nuevoContexto("ipad");
  const pg = await ctxDp.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos .md-fila", { timeout: 10000 });
  await pg.waitForTimeout(300);

  const lista = await pg.evaluate(() => {
    const f = document.querySelector(".md-depositos .md-fila");
    return {
      seg: [...document.querySelectorAll(".md-depositos .md-seg-tipo button")].map((b) => b.textContent.trim()),
      sel: document.querySelector(".md-depositos .md-seg-tipo button.sel")?.textContent.trim(),
      alto: f ? Math.round(f.getBoundingClientRect().height) : 0,
      estados: document.querySelectorAll(".md-depositos .dep-estado").length,
      filas: document.querySelectorAll(".md-depositos .md-fila").length,
    };
  });
  chk(lista.seg.length === 2, `el segmentado del corte (${lista.seg.join(" · ")})`);
  chk(lista.sel === "Depositados", `arranca en lo que la app sí tiene (${lista.sel})`);
  chk(lista.alto >= 72, `la fila del corte mide 72 o más (${lista.alto})`);
  chk(lista.estados === lista.filas, `cada corte dice su estado (${lista.estados}/${lista.filas})`);

  // El panel: tres cifras, movimientos incluidos y ficha del banco.
  await pg.click(".md-depositos .md-fila:not(.sel)");
  await pg.waitForTimeout(400);
  const det = await pg.evaluate(() => ({
    titular: document.querySelector(".dm-titular")?.textContent.trim(),
    cifras: document.querySelectorAll(".dep-cifra").length,
    sinMotor: document.querySelectorAll(".dep-cifra--sinmotor").length,
    tarjetas: document.querySelectorAll(".dep-cuerpo .dm-tarjeta").length,
    ficha: !!document.querySelector(".dm-comp-falta, .dm-comp-hay"),
    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  chk(!!det.titular, `el panel titula el corte (${det.titular})`);
  chk(det.cifras === 3, `las tres cifras del corte (${det.cifras})`);
  /* Dos de las tres esperan la relación depósito↔movimientos, y tienen que
     DECIRLO en vez de enseñar un cero que parecería un dato. */
  chk(det.sinMotor === 2, `dos dicen que esperan motor (${det.sinMotor})`);
  chk(det.tarjetas === 2, `movimientos incluidos y ficha del banco (${det.tarjetas})`);
  chk(det.ficha, "la ficha del banco tiene su hueco o su archivo");
  chk(det.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-1366x1024.png` });

  // La pestaña Pendientes explica qué le falta, con la cifra real.
  await pg.click(".md-depositos .md-seg-tipo button:nth-child(1)");
  await pg.waitForTimeout(350);
  const pend = await pg.evaluate(() => ({
    texto: (document.querySelector(".dep-pendientes")?.textContent || "").trim(),
    filas: document.querySelectorAll(".md-depositos .md-fila").length,
  }));
  chk(pend.filas === 0, `"Pendientes" no finge cortes que no hay (${pend.filas} filas)`);
  chk(/\$/.test(pend.texto), "y da el efectivo por depositar, que sí se sabe");
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-pendientes-1366x1024.png` });
  await ctxDp.close();
}

await browser.close();
vite.kill();
console.log(fallos === 0 ? "\nTODO EN VERDE" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
