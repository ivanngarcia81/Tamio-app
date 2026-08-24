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

    /* Casos que disparan la taxonomía de "Por revisar". Sin ellos la bandeja
       sale vacía y no hay nada que medir: cada uno enciende UNA regla del
       motor (services/bandeja/alertas.ts). */
    await db.insertTx(id, iglesia.moneda, {   // gasto grande sin comprobante
      tipo: "gasto", categoria: "mantenimiento", concepto: "Pintura del anexo",
      fecha: hace(2), monto: 239100, metodo_pago: "efectivo", beneficiario: "Ferretería del Norte",
    });
    for (const dia of [4, 6]) {               // duplicado probable (mismo monto y concepto)
      await db.insertTx(id, iglesia.moneda, {
        tipo: "gasto", categoria: "limpieza", concepto: "Renta del anexo",
        fecha: hace(dia), monto: 175500, metodo_pago: "transferencia", beneficiario: "Arrendador",
      });
    }
    await db.insertTx(id, iglesia.moneda, {   // categoría vacía
      tipo: "ingreso", categoria: "", concepto: "Ofrenda sin clasificar",
      fecha: hace(3), monto: 78000, metodo_pago: "efectivo",
    });
    await db.insertTx(id, iglesia.moneda, {   // diezmo sin aportante vinculado
      tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo en sobre",
      fecha: hace(5), monto: 96000, metodo_pago: "efectivo",
    });

    /* Dos ingresos en CHEQUE. Sin ellos la pestaña Pendientes de Depósitos
       sale con "Cheques $0.00" siempre y no hay forma de comprobar ni el
       desglose ni la insignia CH de la fila: todo lo demás que se siembra
       entra en efectivo o por transferencia. */
    await db.insertTx(id, iglesia.moneda, {
      tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo en cheque",
      fecha: hace(0), monto: 250000, metodo_pago: "cheque",
      member_id: miembros[0].id,
    });
    await db.insertTx(id, iglesia.moneda, {
      tipo: "ingreso", categoria: "ofrenda", concepto: "Ofrenda en cheque",
      fecha: hace(3), monto: 90000, metodo_pago: "cheque",
    });

    /* Un ingreso registrado CON sesión abierta, para que "Registrado por"
       tenga algo que enseñar. El arnés corre en modo local —sin credenciales
       de Supabase— así que no hay sesión de verdad; `sesion.ts` es justo el
       módulo que permite ponerla a mano, que es lo que hace `App.tsx` cuando
       alguien entra. Se pone, se inserta y se quita: así quedan filas con
       nombre y filas sin él, que son los dos casos que hay que comprobar. */
    const ses = await import("/src/sesion.ts");
    ses.setQuienRegistra({ nombre: "Rosa Elena Vega", rol: "tesorero" });
    await db.insertTx(id, iglesia.moneda, {
      tipo: "ingreso", categoria: "ofrenda", concepto: "Ofrenda con firma",
      fecha: hace(1), monto: 45000, metodo_pago: "efectivo",
    });
    ses.setQuienRegistra(null);

    /* Y un movimiento en estado PENDIENTE. `countPendingTx` cuenta filas con
       `estado = 'pendiente'`, no las alertas que calcula Por revisar: sin uno
       de verdad, el aviso "N movimientos marcados por revisar" del panel de
       Depósitos no tiene nada que contar y no se pinta —que es lo correcto,
       pero deja la guarda sin qué medir. */
    await db.insertTx(id, iglesia.moneda, {
      tipo: "ingreso", categoria: "ofrenda", concepto: "Ofrenda por confirmar",
      fecha: hace(1), monto: 64000, metodo_pago: "efectivo", estado: "pendiente",
    });

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
    /* Las cuatro familias de color de la rejilla (culto, reunión, fecha
       límite y "lo demás") y un compromiso YA HECHO: sin esto la Agenda del
       iPad se pinta con un solo color y nunca se ve el tachado. */
    await db.insertActividad(id, {
      nombre: "Consejo de agosto", tipo: "reunionLideres", tipo_personalizado: null,
      fecha: en(2), hora_inicio: "19:00", hora_fin: null, dia_completo: false,
      lugar: "Salón anexo", descripcion: null, responsable_member_id: null,
      responsable_persona: null, responsable_ministerio: null,
      invitado: null, contacto: null, estado: "confirmada", es_fecha_importante: false,
    });
    await db.insertActividad(id, {
      nombre: "Depósito bancario", tipo: "fechaLimite", tipo_personalizado: null,
      fecha: en(5), hora_inicio: null, hora_fin: null, dia_completo: true,
      lugar: null, descripcion: null, responsable_member_id: null,
      responsable_persona: null, responsable_ministerio: null,
      invitado: null, contacto: null, estado: "programada", es_fecha_importante: true,
    });
    await db.insertActividad(id, {
      nombre: "Entregar carta de traslado", tipo: "otra", tipo_personalizado: "Trámite",
      fecha: en(6), hora_inicio: "12:00", hora_fin: null, dia_completo: false,
      lugar: null, descripcion: null, responsable_member_id: null,
      responsable_persona: null, responsable_ministerio: null,
      invitado: null, contacto: null, estado: "borrador", es_fecha_importante: false,
    });
    await db.insertActividad(id, {
      nombre: "Firmar acta de julio", tipo: "reunionAdministrativa", tipo_personalizado: null,
      fecha: iso(hoy), hora_inicio: "09:00", hora_fin: null, dia_completo: false,
      lugar: null, descripcion: null, responsable_member_id: null,
      responsable_persona: null, responsable_ministerio: null,
      invitado: null, contacto: null, estado: "completada", es_fecha_importante: false,
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
  if (nombre === "deposito") {
    /* Las cuentas ya usadas, a un toque: el handoff las dibuja como chips y
       sin ellas hay que abrir una hoja para no cambiar nada. Se comprueba que
       están Y que una sale marcada cuando el campo ya trae esa cuenta. */
    const cu = await page.evaluate(() => {
      const chips = [...document.querySelectorAll(".ios-sheet .dia-chip")];
      return { n: chips.length, textos: chips.map((c) => c.textContent.trim()) };
    });
    chk(cu.n > 0, `deposito: chips de cuentas ya usadas (${cu.textos.join(" · ")})`);
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
   Barra y columna maestra van con el CROMO —#F7F7F9 claro, #131315 oscuro—
   y el panel de detalle con el LIENZO —#F2F2F7 y #000—. Se mide con estilos
   computados y no a ojo, porque medio tono de diferencia no se ve en una
   captura y sí se ve en un iPad al lado de otro.

   ⚠️ Este bloque exigía el MISMO gris en los tres hasta el 23 de agosto, y
   estaba mal: el handoff pinta `<main>` con `--bg` y el panel de detalle no
   declara fondo, así que lo hereda. Lo cazó Iván en el iPad. */
console.log("\n== El gris del cromo ==");
{
  const ctxC = await nuevoContexto("ipad");
  const pg = await ctxC.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });
  const ESPERADO = {
    light: { cromo: "rgb(247, 247, 249)", lienzo: "rgb(242, 242, 247)" },
    dark: { cromo: "rgb(19, 19, 21)", lienzo: "rgb(0, 0, 0)" },
  };
  for (const tema of ["light", "dark"]) {
    const e = ESPERADO[tema];
    await pg.emulateMedia({ colorScheme: tema });
    await pg.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(500);
    const c = await pg.evaluate(() => {
      const bg = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null; };
      return { barra: bg(".header"), lista: bg(".md-lista"), panel: bg(".md-detalle") };
    });
    chk(c.barra === e.cromo, `${tema}: barra = ${c.barra} (cromo ${e.cromo})`);
    chk(c.lista === e.cromo, `${tema}: lista = ${c.lista} (cromo ${e.cromo})`);
    chk(c.panel === e.lienzo, `${tema}: panel = ${c.panel} (lienzo ${e.lienzo})`);
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
    tarjetas: document.querySelectorAll(".dep-cuerpo .dep-carta").length,
    ficha: !!document.querySelector(".dm-comp-falta, .dm-comp-hay"),
    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  chk(!!det.titular, `el panel titula el corte (${det.titular})`);
  chk(det.cifras === 3, `las tres cifras del corte (${det.cifras})`);
  /* Dos de las tres esperan la relación depósito↔movimientos, y tienen que
     DECIRLO en vez de enseñar un cero que parecería un dato. */
  chk(det.sinMotor === 2, `dos dicen que esperan motor (${det.sinMotor})`);
  /* Cuatro con el handoff 3: datos del depósito y movimientos a la
     izquierda, ficha del banco y conciliación a la derecha. */
  chk(det.tarjetas === 4, `las cuatro tarjetas del detalle (${det.tarjetas})`);
  chk(det.ficha, "la ficha del banco tiene su hueco o su archivo");
  chk(det.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-1366x1024.png` });

  /* La pestaña Pendientes. **Esta comprobación cambió de sentido el 24 ago**:
     hasta la 1.2.8 exigía CERO filas —la pestaña era un bloque que explicaba
     que le faltaba motor— y el handoff 3 la convirtió en la lista de cortes
     por día. Dejarla como estaba habría sido una guarda protegiendo el
     estado viejo, que es la tercera vez que pasa en este archivo. Lo que
     sigue valiendo, y es lo que se mide: hay una fila por día con dinero en
     caja, y el pie sigue dando el efectivo por depositar. */
  await pg.click(".md-depositos .md-seg-tipo button:nth-child(1)");
  await pg.waitForTimeout(350);
  const pend = await pg.evaluate(() => ({
    pie: (document.querySelector(".dep-lista-pie")?.textContent || "").trim(),
    filas: document.querySelectorAll(".md-depositos .md-fila").length,
    estados: [...document.querySelectorAll(".md-depositos .dep-estado--pendiente")].length,
    enCaja: [...document.querySelectorAll(".md-depositos .dep-estado--caja")].length,
  }));
  chk(pend.filas > 0, `"Pendientes" lista los días con dinero (${pend.filas} filas)`);
  /* Con el motor del corte (migración 38) la lista tiene DOS grupos y el
     estado ya no es el mismo para todos: "Sin depositar" es el dinero que ya
     salió de la caja en manos de alguien, "En caja" el que sigue dentro. Sin
     cortes creados, todo está en caja. */
  chk(pend.enCaja === pend.filas, `sin cortes hechos, todas están "En caja" (${pend.enCaja}/${pend.filas})`);
  chk(/\$/.test(pend.pie), "y el pie sigue dando el efectivo por depositar");
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-pendientes-1366x1024.png` });
  await ctxDp.close();
}

/* ---------- 15. Por revisar: la taxonomía de alertas ---------- */
console.log("\n== Por revisar del iPad (handoff) ==");
{
  const ctxBn = await nuevoContexto("ipad");
  const pg = await ctxBn.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/bandeja`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-bandeja .al-fila", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const lista = await pg.evaluate(() => {
    const f = document.querySelector(".md-bandeja .al-fila");
    return {
      conteo: document.querySelector(".al-conteo")?.textContent.trim(),
      filas: document.querySelectorAll(".md-bandeja .al-fila").length,
      alto: f ? Math.round(f.getBoundingClientRect().height) : 0,
      marcas: document.querySelectorAll(".al-marca").length,
      chips: [...document.querySelectorAll(".al-chips .chip")].map((c) => c.textContent.trim()),
      titulares: [...document.querySelectorAll(".md-bandeja .al-fila .md-fila-titular")]
        .map((e) => e.textContent.trim()),
    };
  });
  chk(!!lista.conteo, `la cabecera cuenta los asuntos (${lista.conteo})`);
  /* La cabecera de la PÁGINA tiene que decir lo mismo que la lista. Decía "No
     tienes pendientes" encima de doce asuntos, porque contaba solo dos de las
     siete reglas. */
  const sub = await pg.evaluate(() => document.querySelector(".header .page-sub")?.textContent.trim() || "");
  chk(!/No tienes|No pending/i.test(sub) , `la cabecera no contradice a la lista (${sub})`);
  chk(lista.alto >= 70, `la fila del asunto mide 70 o más (${lista.alto})`);
  chk(lista.marcas === lista.filas, `cada asunto lleva su marca (${lista.marcas}/${lista.filas})`);
  /* Lo que de verdad hay que comprobar: que el motor encuentra MÁS DE UN
     TIPO. Con solo "pendiente" la pantalla sería la de antes con otra ropa. */
  const tipos = new Set(lista.titulares);
  chk(tipos.size >= 3, `el motor distingue varios tipos de asunto (${[...tipos].join(" · ")})`);
  chk(lista.chips.length >= 3, `y ofrece filtrarlos (${lista.chips.length} chips)`);

  // El panel: pastilla, titular, párrafo con datos y acciones propias.
  await pg.click(".md-bandeja .al-fila:not(.sel)");
  await pg.waitForTimeout(400);
  const det = await pg.evaluate(() => ({
    pastilla: document.querySelector(".al-pastilla")?.textContent.trim(),
    titulo: document.querySelector(".al-titulo")?.textContent.trim(),
    texto: (document.querySelector(".al-texto")?.textContent || "").trim(),
    acciones: [...document.querySelectorAll(".al-acciones .btn")].map((b) => b.textContent.trim()),
    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  chk(!!det.pastilla, `el panel abre con su pastilla (${det.pastilla})`);
  chk(!!det.titulo, `y su titular (${det.titulo})`);
  /* El párrafo tiene que traer DATOS del caso, no un texto fijo: si no
     aparece una cifra, la interpolación se rompió. */
  chk(det.texto.length > 60 && /\$/.test(det.texto), `explica el caso con sus cifras (${det.texto.length} caracteres)`);
  chk(det.acciones.length >= 1, `con acciones propias (${det.acciones.join(" · ")})`);
  chk(det.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/bandeja-1366x1024.png` });

  /* Recorrer un asunto de cada tipo: cada uno tiene su texto y sus botones, y
     un tipo que reventara el panel se vería aquí y no en TestFlight. */
  const nChips = await pg.locator(".al-chips .chip").count();
  for (let i = 1; i < Math.min(nChips, 5); i++) {
    await pg.locator(".al-chips .chip").nth(i).click();
    await pg.waitForTimeout(300);
    const hay = await pg.locator(".md-bandeja .al-fila").count();
    if (hay === 0) continue;
    await pg.locator(".md-bandeja .al-fila").first().click();
    await pg.waitForTimeout(350);
    const m = await pg.evaluate(() => ({
      titulo: document.querySelector(".al-titulo")?.textContent.trim(),
      texto: (document.querySelector(".al-texto")?.textContent || "").trim(),
      acciones: document.querySelectorAll(".al-acciones .btn").length,
    }));
    chk(!!m.titulo && m.texto.length > 40, `"${m.titulo}": tiene su explicación (${m.texto.length} car.)`);
    chk(m.acciones >= 1, `"${m.titulo}": y su acción (${m.acciones})`);
  }
  await ctxBn.close();
}

/* ---------- 16. Actas: la barra del trámite y el documento ---------- */
console.log("\n== Actas del iPad (handoff) ==");
{
  const ctxAc = await nuevoContexto("ipad");
  const pg = await ctxAc.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/actas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });
  await pg.click(".md-actas .md-fila:not(.sel)");
  await pg.waitForTimeout(450);

  const m = await pg.evaluate(() => ({
    barra: !!document.querySelector(".ac-barra"),
    estado: document.querySelector(".ac-barra .tag")?.textContent.trim(),
    botones: [...document.querySelectorAll(".ac-barra .chip")].map((b) => ({
      texto: b.textContent.trim(), apagado: b.disabled,
    })),
    firmas: document.querySelectorAll(".da-firma").length,
    testigo: !!document.querySelector(".da-firma--enblanco"),
    desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  chk(m.barra, "el acta lleva su barra de trámite");
  chk(!!m.estado, `con el estado del documento (${m.estado})`);
  chk(m.botones.length >= 1, `y sus acciones (${m.botones.map((b) => b.texto).join(" · ")})`);
  /* **Al revés desde el 24 ago 2026** (migración 44): "Recopilar firmas" tiene
     motor, así que en un acta CON firmantes tiene que estar VIVO. Solo se
     apaga cuando el acta no dice quién preside, quién redacta ni quién es
     testigo — y entonces no es falta de columna, es que no hay a quién
     recogerle la firma. El flujo entero va en la sección 38. */
  const firmas = m.botones.find((b) => /firmas|signatures/i.test(b.texto));
  chk(firmas?.apagado === false, `"Recopilar firmas" está vivo: tiene motor (${firmas?.apagado})`);
  chk(m.firmas === 3, `el documento lleva las tres rayas de firma (${m.firmas})`);
  /* **Cambió de sentido el 24 ago 2026.** La raya discontinua era la marca de
     "sin motor"; ahora el testigo SÍ se guarda (migración 41) y esa raya
     significa lo que siempre debió significar: todavía nadie ha firmado ahí.
     El acta sembrada no trae testigo, así que sale en blanco. */
  chk(m.testigo, "y la del testigo sale en blanco mientras nadie la firme");
  chk(m.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/actas-1366x1024.png` });
  await ctxAc.close();
}

/* ---------- 17. Servicios: roster por puestos y orden del culto ---------- */
console.log("\n== Servicios del iPad (handoff) ==");
{
  const ctxSv = await nuevoContexto("ipad");
  const pg = await ctxSv.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/servicios`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-servicios .md-fila", { timeout: 10000 });
  await pg.click(".md-servicios .md-fila:not(.sel)");
  await pg.waitForTimeout(450);

  const m = await pg.evaluate(() => {
    const f = document.querySelector(".md-servicios .md-fila");
    return {
      alto: f ? Math.round(f.getBoundingClientRect().height) : 0,
      dia: !!document.querySelector(".md-servicios .md-dia"),
      puestos: document.querySelectorAll(".sv-puesto").length,
      cubiertos: document.querySelectorAll(".sv-puesto-avatar").length,
      /* El hueco se dice de DOS formas, según por qué esté vacío: los dos
         puestos que la tabla sí guarda dicen "Sin asignar" (nadie los ha
         llenado todavía) y los cuatro que no sabe guardar traen el
         "Asignar encargado" apagado del handoff (falta el motor). */
      sinAsignar: document.querySelectorAll(".sv-puesto-sin").length,
      sinMotor: document.querySelectorAll(".sv-puesto-asignar").length,
      orden: !!document.querySelector(".sv-orden"),
      acciones: [...document.querySelectorAll(".dm-acciones .btn")].map((b) => b.textContent.trim()),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(m.alto >= 76, `la fila del culto mide 76 o más (${m.alto})`);
  chk(m.dia, "con la pastilla de fecha del diseño");
  /* Los seis puestos del handoff, siempre: los que la tabla guarda y los que
     todavía no. Si solo salieran los cubiertos, el hueco desaparecería. */
  chk(m.puestos >= 6, `el roster enseña sus puestos (${m.puestos})`);
  chk(m.cubiertos >= 1, `alguno viene cubierto de la base (${m.cubiertos})`);
  chk(m.sinAsignar + m.sinMotor >= 1, `y los que no, lo dicen (${m.sinAsignar} sin asignar · ${m.sinMotor} sin motor)`);
  chk(m.orden, "la tarjeta del orden del culto está");
  chk(m.acciones.some((a) => /asistencia|attendance/i.test(a)), `y "Tomar asistencia" (${m.acciones.join(" · ")})`);
  chk(m.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/servicios-1366x1024.png` });
  await ctxSv.close();
}

/* ---------- 18. Cartas: el papel en vivo junto a sus campos ---------- */
console.log("\n== Cartas del iPad (handoff) ==");
{
  const ctxCa = await nuevoContexto("ipad");
  const pg = await ctxCa.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-cartas .md-indice-item", { timeout: 10000 });

  /* Redactar NO está en el índice: desde la 1.2.2 crear vive solo en el "+"
     de la cabecera (había dos entradas para lo mismo). Se abre por ahí, que
     es como lo abre una persona. */
  await pg.click(".cartas-menu-crear button");
  await pg.waitForTimeout(300);
  await pg.locator(".ios-menu button, .menu-anclado button, [role=menuitem]").first().click();
  await pg.waitForTimeout(400);
  const abierto = await pg.locator(".ce-split").count();
  chk(abierto > 0, `el "+" de la cabecera abre el editor (${abierto})`);
  // El papel se pinta con freno de medio segundo; se le da margen.
  await pg.waitForTimeout(1600);

  const m = await pg.evaluate(() => {
    const h = document.querySelector(".ce-hoja iframe");
    return {
      barra: !!document.querySelector(".ce-barra"),
      campos: document.querySelector(".ce-barra-campos")?.textContent.trim(),
      hoja: !!h,
      ancho: h ? Math.round(h.getBoundingClientRect().width) : 0,
      alto: h ? Math.round(h.getBoundingClientRect().height) : 0,
      formulario: !!document.querySelector(".ce-split .card, .ce-split .carta-ios"),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(m.barra, "la barra del papel está");
  chk(/\d/.test(m.campos || ""), `y cuenta los campos (${m.campos})`);
  chk(m.hoja, "la hoja de la carta se pinta al lado");
  /* La hoja tiene que tener proporción de carta: si el aspect-ratio no
     agarrara, el iframe saldría de alto cero y no se vería nada. */
  chk(m.alto > m.ancho, `con proporción de hoja (${m.ancho}×${m.alto})`);
  chk(m.formulario, "y el formulario sigue a su derecha");
  chk(m.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/cartas-1366x1024.png` });
  await ctxCa.close();
}

/* ---------- 19. Agenda: barra de 50px y rejilla que llena el alto ---------- */
console.log("\n== Agenda del iPad (handoff) ==");
{
  const ctxAg = await nuevoContexto("ipad");
  const pg = await ctxAg.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".ag-barra", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const b = await pg.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const barra = r(".ag-barra");
    const split = r(".md-split.md-agenda");
    const grid = r(".md-agenda-cal .agenda-grid");
    const cal = r(".md-agenda-cal .agenda-cal");
    const seg = document.querySelectorAll(".ag-seg button");
    const filas = getComputedStyle(document.querySelector(".md-agenda-cal .agenda-grid")).gridTemplateRows.split(" ").length;
    return {
      alto: barra ? Math.round(barra.height) : 0,
      // La barra cruza las DOS columnas: su ancho es el del partido entero.
      anchoBarra: barra ? Math.round(barra.width) : 0,
      anchoSplit: split ? Math.round(split.width) : 0,
      // …y está POR ENCIMA del partido, no dentro.
      encima: barra && split ? barra.bottom <= split.top + 1 : false,
      pestanas: seg.length,
      activa: document.querySelector(".ag-seg button.activo")?.textContent.trim(),
      mes: document.querySelector(".ag-barra-mes")?.textContent.trim(),
      hoy: !!document.querySelector(".ag-hoy"),
      flechas: document.querySelectorAll(".ag-nav").length,
      // La rejilla llena lo que queda: su base coincide con la del calendario.
      llena: grid && cal ? Math.abs(grid.bottom - cal.bottom) < 2 : false,
      altoGrid: grid ? Math.round(grid.height) : 0,
      filas,
      // Lo que el handoff NO dibuja en Agenda y aquí se le cede el alto.
      cifras: document.querySelectorAll(".md-agenda-cal .summary-4").length,
      filtros: document.querySelectorAll(".md-agenda-cal .agenda-filtros").length,
      barraVieja: document.querySelectorAll(".agenda-toolbar").length,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(b.alto === 50, `la barra mide 50px de alto (${b.alto})`);
  chk(Math.abs(b.anchoBarra - b.anchoSplit) < 2, `y cruza las dos columnas (${b.anchoBarra} vs ${b.anchoSplit})`);
  chk(b.encima, "por encima del partido, no dentro del calendario");
  chk(b.pestanas === 4, `el segmentado trae las cuatro vistas (${b.pestanas})`);
  chk(!!b.activa, `con Mes activa (${b.activa})`);
  chk(/\d/.test(b.mes || ""), `el mes al lado (${b.mes})`);
  chk(b.hoy && b.flechas === 2, `y ‹ · Hoy · › al otro extremo (${b.flechas} flechas)`);
  chk(b.cifras === 0, "en Mes no está la fila de cuatro cifras");
  chk(b.filtros === 0, "ni la fila de filtros");
  chk(b.barraVieja === 0, "ni la barra vieja de vistas");
  chk(b.llena, "la rejilla llega hasta abajo del calendario");
  chk(b.altoGrid > 480, `con alto de verdad (${b.altoGrid}px)`);
  chk(b.filas >= 5, `y filas repartidas a partes iguales (${b.filas})`);
  chk(b.desborda === false, "sin scroll horizontal");

  /* Las celdas: 10px de radio sobre el lienzo, los días vecinos en gris y
     el de hoy tintado entero con el acento. */
  const c = await pg.evaluate(() => {
    const cel = document.querySelector(".md-agenda-cal .agenda-cell");
    const hoy = document.querySelector(".md-agenda-cal .agenda-cell.today");
    const fuera = document.querySelector(".md-agenda-cal .agenda-cell.fuera");
    const cs = (e) => (e ? getComputedStyle(e) : null);
    return {
      radio: cel ? cs(cel).borderRadius : "",
      vecinos: document.querySelectorAll(".md-agenda-cal .agenda-cell.fuera").length,
      vacias: document.querySelectorAll(".md-agenda-cal .agenda-cell.empty").length,
      numFuera: fuera ? cs(fuera.querySelector(".agenda-cell-num")).color : "",
      numDentro: cel && !cel.classList.contains("fuera") ? cs(cel.querySelector(".agenda-cell-num")).color : "",
      hoyFondo: hoy ? cs(hoy).backgroundColor : "",
      inkVar: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
      familias: [...document.querySelectorAll(".md-agenda-cal .agenda-evt")]
        .map((e) => [...e.classList].find((k) => k.startsWith("fam-")))
        .filter(Boolean),
    };
  });
  chk(c.radio.startsWith("10px"), `las celdas son tarjetas de 10px (${c.radio})`);
  chk(c.vecinos > 0, `los días del mes de al lado se pintan (${c.vecinos})`);
  chk(c.vacias === 0, "sin huecos en blanco");
  chk(c.numFuera !== c.numDentro, `y en gris, no como los del mes (${c.numFuera})`);
  chk(!!c.hoyFondo && c.hoyFondo !== "rgba(0, 0, 0, 0)", `hoy va tintado entero (${c.hoyFondo})`);
  const fams = new Set(c.familias);
  chk(fams.size >= 3, `las pastillas se tiñen por tipo, no por estado (${[...fams].join(", ")})`);
  if (DIR) await pg.screenshot({ path: `${DIR}/agenda-mes-1366x1024.png` });

  /* El día de HOY va con el acento de la app, no con `--ink`: con el acento
     de fábrica ("neutro") `--ink` es #0f0f0f y la celda salía como un bloque
     NEGRO. La regla ya estaba escrita en styles.css sobre `--brand` ("iOS no
     usa negro puro como estado activo") y la Agenda no la seguía; lo cazó
     Iván en el iPad. Se comprueba de las dos formas: que no sea negro, y que
     siga al acento cuando el usuario elige uno. */
  const bgHoy = () => pg.evaluate(() =>
    getComputedStyle(document.querySelector(".md-agenda-cal .agenda-cell.today")).backgroundColor);
  const fabrica = await bgHoy();
  /* El cambio de acento y la lectura van en pasadas SEPARADAS: leer el color
     en el mismo `evaluate` que pone el atributo devuelve el valor viejo —el
     recálculo de estilo no ha llegado al elemento— y la comprobación salía en
     rojo con el código bien. */
  await pg.evaluate(() => document.documentElement.setAttribute("data-acento", "morado"));
  await pg.waitForTimeout(150);
  const morado = await bgHoy();
  await pg.evaluate(() => document.documentElement.removeAttribute("data-acento"));
  await pg.waitForTimeout(150);
  chk(fabrica === "rgb(5, 150, 105)", `hoy va con el verde de la app, no en negro (${fabrica})`);
  chk(morado !== fabrica, `y sigue al acento elegido (morado → ${morado})`);

  /* Un solo "Nueva actividad" en pantalla: había otro igual al pie de la
     columna del día y con un día abierto se veían los dos verdes. */
  const botones = await pg.evaluate(() => {
    const t = [...document.querySelectorAll("button")].map((b) => b.textContent.trim());
    const n = t.filter((x) => /Nueva actividad|New activity/.test(x));
    return { cuantos: n.length, cuales: n };
  });
  chk(botones.cuantos === 1, `un solo "Nueva actividad" (${botones.cuantos}: ${botones.cuales.join(" · ")})`);

  /* La columna del día: 22px de fecha, el conteo, y lo ya hecho tachado. */
  await pg.click(".md-agenda-cal .agenda-cell.today");
  await pg.waitForTimeout(400);
  const d = await pg.evaluate(() => {
    const tit = document.querySelector(".ag-dia-titulo");
    const hecha = document.querySelector(".ag-dia-fila.estado-completada");
    return {
      titulo: tit?.textContent.trim(),
      tam: tit ? getComputedStyle(tit).fontSize : "",
      sub: document.querySelector(".ag-dia-sub")?.textContent.trim(),
      filas: document.querySelectorAll(".ag-dia-fila").length,
      hecha: !!hecha,
      tachada: hecha ? getComputedStyle(hecha.querySelector(".ag-dia-nombre")).textDecorationLine : "",
      apagada: hecha ? Number(getComputedStyle(hecha).opacity) : 1,
    };
  });
  chk(!!d.titulo, `el día se abre con su fecha (${d.titulo})`);
  chk(d.tam === "22px", `a 22px como el handoff (${d.tam})`);
  chk(/\d/.test(d.sub || ""), `y su cuenta de compromisos (${d.sub})`);
  chk(d.filas >= 2, `con las actividades del día (${d.filas})`);
  chk(d.hecha, "lo ya hecho aparece");
  chk(d.tachada.includes("line-through"), `tachado (${d.tachada})`);
  chk(d.apagada < 0.7, `y en segundo plano (opacidad ${d.apagada})`);
  if (DIR) await pg.screenshot({ path: `${DIR}/agenda-dia-1366x1024.png` });

  /* La marca del día elegido en la rejilla. Se prueba en un día CUALQUIERA
     y no en hoy: hoy va tintado de por sí y taparía el fallo. Lo tapó una
     vez —`.agenda-cell.sel` tiene la misma especificidad que el fondo de
     tarjeta nuevo y perdía por orden de aparición. */
  await pg.click(".md-agenda-cal .agenda-cell:not(.today):not(.fuera)");
  await pg.waitForTimeout(350);
  const sel = await pg.evaluate(() => {
    const s = document.querySelector(".md-agenda-cal .agenda-cell.sel");
    const otra = document.querySelector(".md-agenda-cal .agenda-cell:not(.sel):not(.today):not(.fuera)");
    const cs = (e) => (e ? getComputedStyle(e) : null);
    return {
      hay: !!s,
      hoy: s ? s.classList.contains("today") : false,
      fondo: s ? cs(s).backgroundColor : "",
      otro: otra ? cs(otra).backgroundColor : "",
      sombra: s ? cs(s).boxShadow : "",
    };
  });
  chk(sel.hay && !sel.hoy, "un día cualquiera se puede elegir");
  chk(sel.fondo !== sel.otro, `y queda marcado en la rejilla (${sel.fondo} vs ${sel.otro})`);
  chk(sel.sombra !== "none", "con su filo de acento");

  /* Lista: ahí las cifras y los filtros SÍ vuelven — no se han quitado de
     la pantalla, se han quitado de donde el calendario necesita el alto. */
  await pg.click(".ag-seg button:nth-child(3)");
  await pg.waitForTimeout(400);
  const l = await pg.evaluate(() => ({
    cifras: document.querySelectorAll(".md-agenda-cal .summary-4").length,
    filtros: document.querySelectorAll(".md-agenda-cal .agenda-filtros").length,
    mes: document.querySelectorAll(".ag-barra-mes").length,
    nav: document.querySelectorAll(".ag-barra-nav").length,
  }));
  chk(l.cifras === 1, `en Lista vuelven las cuatro cifras (${l.cifras})`);
  chk(l.filtros === 1, "y la fila de filtros");
  chk(l.mes === 0 && l.nav === 0, "y la barra suelta el mes y las flechas, que ahí no significan nada");

  /* La barra en el iPad más estrecho (mini en vertical, 744). Ahí caben
     cuatro pestañas, el mes Y ‹ · Hoy · › en 744px justos, y si no cupieran
     lo que se rompería es la fila entera. */
  await pg.click(".ag-seg button:nth-child(1)");
  await pg.setViewportSize({ width: 744, height: 1133 });
  await pg.waitForTimeout(400);
  const n = await pg.evaluate(() => {
    const b = document.querySelector(".ag-barra");
    const r = b.getBoundingClientRect();
    return {
      alto: Math.round(r.height),
      desbordaBarra: b.scrollWidth > b.clientWidth + 1,
      /* Todos los hijos en UNA línea. Se mira el CENTRO, no el borde de
         arriba: con `align-items: center` cada pieza tiene su propio alto
         (el segmentado 30, el texto 16, las flechas 32) y sus `top` no
         coinciden aunque estén en la misma fila. */
      dispersion: (() => {
        const c = [...b.children].map((e) => {
          const r = e.getBoundingClientRect();
          return (r.top + r.bottom) / 2;
        });
        return Math.round(Math.max(...c) - Math.min(...c));
      })(),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(n.alto === 50, `en 744 la barra sigue midiendo 50 (${n.alto})`);
  chk(n.desbordaBarra === false, "sin desbordarse a lo ancho");
  chk(n.dispersion <= 1, `y en una sola línea (${n.dispersion}px de dispersión)`);
  chk(n.desborda === false, "sin scroll horizontal en 744");
  if (DIR) await pg.screenshot({ path: `${DIR}/agenda-744x1133.png` });
  await ctxAg.close();
}

/* ---------- 20. Configuración: las listas insertadas del handoff ---------- */
console.log("\n== Configuración del iPad (handoff) ==");
{
  const ctxCf = await nuevoContexto("ipad");
  const pg = await ctxCf.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".settings-nav-item", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const zonas = await pg.$$eval(".settings-nav-item", (ns) => ns.map((n) => n.textContent.trim()));
  chk(zonas.length >= 6, `el índice trae sus zonas (${zonas.length}: ${zonas.join(" · ")})`);

  /* Y que sea una COLUMNA, no un rectángulo flotando. Configuración se monta
     como cualquier pantalla partida: el índice pegado a la barra lateral y a
     la cabecera, y llegando hasta abajo. Antes traía el padding y el ancho
     máximo centrado de `.content`, así que arrancaba en x=350/y=68 y su alto
     lo daba lo que hubiera dentro (1168 sobre una ventana de 1024). */
  const col = await pg.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), b2: Math.round(b.bottom), r2: Math.round(b.right) }; };
    return {
      nav: r(".settings-nav"),
      sidebar: r(".sidebar"),
      header: r(".header"),
      alto: window.innerHeight,
      // La página no desplaza: desplaza cada columna por su cuenta.
      desplazaPagina: document.querySelector(".main").scrollHeight > document.querySelector(".main").clientHeight + 1,
    };
  });
  chk(col.nav.x === col.sidebar.r2, `el índice arranca pegado a la barra lateral (${col.nav.x} = ${col.sidebar.r2})`);
  chk(col.nav.y === col.header.b2, `y pegado a la cabecera (${col.nav.y} = ${col.header.b2})`);
  chk(col.nav.b2 === col.alto, `y llega hasta abajo (${col.nav.b2} = ${col.alto})`);
  chk(col.desplazaPagina === false, "la página no desplaza: lo hace cada columna");

  /* Iglesia: lista agrupada, no la tarjeta de escritorio. */
  const ig = await pg.evaluate(() => {
    const g = document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-group");
    const h = document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-section-header");
    const f = document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-field");
    const lab = f?.querySelector(".ios-field-label");
    const cs = (e) => (e ? getComputedStyle(e) : null);
    return {
      lista: !!document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-form"),
      tarjetas: document.querySelectorAll(".settings-zona:not(.settings-zona-inactiva) .settings-card").length,
      radio: g ? cs(g).borderRadius : "",
      sombra: g ? cs(g).boxShadow : "",
      cab: h ? { t: cs(h).textTransform, s: cs(h).fontSize, w: cs(h).fontWeight } : null,
      alto: f ? Math.round(f.getBoundingClientRect().height) : 0,
      etiqueta: lab ? Math.round(lab.getBoundingClientRect().width) : 0,
      ancho: Math.round(document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-form").getBoundingClientRect().width),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(ig.lista, "Iglesia se pinta como lista agrupada");
  chk(ig.tarjetas === 0, `y ya no como tarjetas de escritorio (${ig.tarjetas})`);
  chk(ig.ancho > 600 && ig.ancho <= 680, `en la columna de lectura, con 680 de tope (${ig.ancho})`);
  chk(ig.radio.startsWith("12px"), `tarjeta de 12px de radio (${ig.radio})`);
  chk(ig.sombra !== "none", "con su sombra de 1px");
  chk(ig.cab?.t === "uppercase" && ig.cab?.s === "12.5px", `encabezado en versalitas de 12.5 (${ig.cab?.s} ${ig.cab?.t})`);
  chk(ig.alto >= 52, `filas de 52 o más (${ig.alto})`);
  chk(ig.etiqueta === 190, `con la etiqueta en columna de 190 (${ig.etiqueta})`);
  chk(ig.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/config-iglesia-1366x1024.png` });

  /* Preferencias: las tres miniaturas de tema y los cinco tintes a 40px. */
  const iPref = zonas.findIndex((z) => /Preferenc|Appearance|Preferences/i.test(z));
  await pg.locator(".settings-nav-item").nth(iPref).click();
  await pg.waitForTimeout(400);
  const pref = await pg.evaluate(() => {
    const t = document.querySelectorAll(".pf-tema");
    const sel = document.querySelector(".pf-tema.sel");
    const dot = document.querySelector(".settings-zona:not(.settings-zona-inactiva) .ios-color-dot");
    const claro = document.querySelector(".pf-lienzo--light");
    const oscuro = document.querySelector(".pf-lienzo--dark");
    const cs = (e) => (e ? getComputedStyle(e) : null);
    return {
      temas: t.length,
      alto: t[0] ? Math.round(t[0].querySelector(".pf-lienzo").getBoundingClientRect().height) : 0,
      elegido: !!sel,
      // La miniatura clara es clara y la oscura oscura, pase lo que pase con
      // el tema del iPad: son retratos, no superficies.
      fondoClaro: claro ? cs(claro).backgroundColor : "",
      fondoOscuro: oscuro ? cs(oscuro).backgroundColor : "",
      dots: document.querySelectorAll(".settings-zona:not(.settings-zona-inactiva) .ios-color-dot").length,
      dotAncho: dot ? Math.round(dot.getBoundingClientRect().width) : 0,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(pref.temas === 3, `Apariencia trae las tres miniaturas (${pref.temas})`);
  chk(pref.alto === 104, `de 104px de alto (${pref.alto})`);
  chk(pref.elegido, "con una marcada");
  chk(pref.fondoClaro === "rgb(242, 242, 247)", `la clara se ve clara (${pref.fondoClaro})`);
  chk(pref.fondoOscuro === "rgb(0, 0, 0)", `y la oscura oscura (${pref.fondoOscuro})`);
  chk(pref.dots === 5, `los cinco tintes del acento (${pref.dots})`);
  chk(pref.dotAncho === 40, `a 40px como el handoff (${pref.dotAncho})`);
  chk(pref.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/config-preferencias-1366x1024.png` });

  /* Zona sensible: la única sin lista agrupada, y por eso la que se rompía.
     `.settings-masonry` son DOS columnas y solo vuelve a una en
     `max-width: 1180px` — una media query de VIEWPORT que en 1366 no
     dispara aunque el panel mida 680. */
  const iDel = zonas.length - 1;
  await pg.locator(".settings-nav-item").nth(iDel).click();
  await pg.waitForTimeout(400);
  const del = await pg.evaluate(() => {
    const m = document.querySelector(".settings-zona:not(.settings-zona-inactiva) .settings-masonry");
    const cards = m ? [...m.children].map((c) => Math.round(c.getBoundingClientRect().width)) : [];
    return {
      hay: !!m,
      columnas: m ? getComputedStyle(m).gridTemplateColumns.split(" ").length : 0,
      anchoMin: cards.length ? Math.min(...cards) : 0,
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  chk(del.hay, "la Zona sensible conserva sus tarjetas");
  chk(del.columnas === 1, `en UNA columna (${del.columnas})`);
  chk(del.anchoMin > 600, `a todo el ancho de lectura (${del.anchoMin}px la más angosta)`);
  chk(del.desborda === false, "sin scroll horizontal");
  if (DIR) await pg.screenshot({ path: `${DIR}/config-sensible-1366x1024.png` });
  await ctxCf.close();
}

/* ---------- 21. Los cuatro grises del cromo ---------- */
console.log("\n== Los grises del iPad (handoff) ==");
{
  const ctxGr = await nuevoContexto("ipad");
  const pg = await ctxGr.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-movimientos .md-fila", { timeout: 10000 });
  await pg.waitForTimeout(400);

  /* El handoff reparte CUATRO superficies, y solo tres son el mismo gris:
     barra lateral, barra de arriba y columna maestra llevan `--sb`; el panel
     de detalle NO declara fondo y hereda el `--bg` del `<main>`. Confundir
     las dos fue el fallo de la 1.2.3 —todo salía de un solo gris— y lo cazó
     Iván en el iPad, señalando que el panel tenía que ser el gris de
     `.dash-canvas`. */
  const g = await pg.evaluate(() => {
    const bg = (s) => {
      const e = document.querySelector(s);
      return e ? getComputedStyle(e).backgroundColor : null;
    };
    const raiz = getComputedStyle(document.documentElement);
    return {
      sidebar: bg(".sidebar"),
      cabecera: bg(".header"),
      lista: bg(".md-movimientos .md-lista"),
      panel: bg(".md-movimientos .md-detalle"),
      lienzo: bg(".md-detalle .dash-canvas"),
      tokenBg: raiz.getPropertyValue("--bg").trim(),
      // El token en rgb(), para poder compararlo con un `backgroundColor`.
      tokenBgRGB: (() => {
        const d = document.createElement("div");
        d.style.backgroundColor = "var(--bg)";
        document.body.appendChild(d);
        const v = getComputedStyle(d).backgroundColor;
        d.remove();
        return v;
      })(),
      tokenCromo: raiz.getPropertyValue("--ipad-cromo").trim(),
    };
  });
  chk(g.sidebar === g.cabecera, `barra lateral y cabecera, el mismo cromo (${g.sidebar})`);
  chk(g.lista === g.sidebar, "y la columna maestra también");
  chk(!!g.panel && g.panel !== g.sidebar, `el panel de detalle NO es ese gris (${g.panel})`);
  /* El panel tiene que valer el token del lienzo. Antes se comparaba contra
     el fondo de `.dash-canvas` —era el gris que Iván señaló con la flecha—,
     pero desde que ese lienzo dejó de pintar (una elevación de más) ya no hay
     nada que comparar: se mira el token, que es lo que se quería decir. */
  chk(g.panel === g.tokenBgRGB, `es el del lienzo (${g.panel} = ${g.tokenBgRGB})`);
  chk(g.lienzo === "rgba(0, 0, 0, 0)", `y .dash-canvas ya no pinta nada debajo (${g.lienzo})`);
  chk(g.tokenBg !== g.tokenCromo, `y los dos tokens son distintos (${g.tokenBg} vs ${g.tokenCromo})`);

  /* Todo lo que en el iPad tiene que ser CROMO. `--sidebar-bg` cuelga de
     `--canvas`, que aquí vale el lienzo, así que cualquier superficie de
     cromo que lo use sale del gris equivocado — y ya pasó dos veces (la
     columna del día de la Agenda y la barra de vistas). Esto las mide todas
     de golpe para que no haya una tercera. */
  /* La guarda de RAÍZ, y la única que impide una sexta vez: sobre el propio
     archivo, que ninguna regla de `:root.ipad` mencione `--sidebar-bg`. El
     token cuelga de `--canvas` —el lienzo— pero se llama "sidebar-bg", así
     que quien lo escriba pensando en la barra lateral pinta el gris
     contrario. Ya pasó cinco veces, y las cinco las cazó Iván mirando la app.
     Medir superficie por superficie solo encuentra las que a alguien se le
     ocurra medir; esto encuentra la regla en cuanto se escribe. */
  {
    // Sin comentarios: media docena de ellos NOMBRAN el token justo para
    // explicar por qué no se usa, y contarlos sería castigar la explicación.
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const culpables = [];
    // Recorre bloques `selector { … }` de primer nivel de anidación.
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      const sel = m[1].trim();
      if (sel.includes(":root.ipad") && m[2].includes("--sidebar-bg")) {
        culpables.push(sel.replace(/\s+/g, " ").slice(0, 70));
      }
    }
    chk(culpables.length === 0, `ninguna regla de iPad usa --sidebar-bg (${culpables.join(" · ") || "ninguna"})`);
  }

  const cromoEsperado = g.sidebar;
  await pg.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".ag-barra", { timeout: 10000 });
  await pg.waitForTimeout(400);
  const barra = await pg.evaluate(() => getComputedStyle(document.querySelector(".ag-barra")).backgroundColor);
  chk(barra === cromoEsperado, `la barra de vistas de la Agenda, cromo (${barra})`);

  await pg.goto(`${URL_BASE}/#/reporte-miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".inf-barrita", { timeout: 10000 });
  await pg.waitForTimeout(400);
  const barrita = await pg.evaluate(() => getComputedStyle(document.querySelector(".inf-barrita")).backgroundColor);
  chk(barrita === cromoEsperado, `la barrita de Informes, cromo (${barrita})`);

  await pg.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".settings-nav", { timeout: 10000 });
  await pg.waitForTimeout(400);
  const nav = await pg.evaluate(() => getComputedStyle(document.querySelector(".settings-nav")).backgroundColor);
  chk(nav === cromoEsperado, `el índice de zonas de Ajustes, cromo (${nav})`);

  /* La excepción: la columna del día de la Agenda SÍ es cromo en el handoff
     (ese div sí declara `background:var(--sb)`). */
  await pg.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-agenda .md-detalle", { timeout: 10000 });
  await pg.waitForTimeout(400);
  const ag = await pg.evaluate(() => ({
    dia: getComputedStyle(document.querySelector(".md-agenda .md-detalle")).backgroundColor,
    sidebar: getComputedStyle(document.querySelector(".sidebar")).backgroundColor,
    calendario: getComputedStyle(document.querySelector(".md-agenda .md-lista")).backgroundColor,
  }));
  chk(ag.dia === ag.sidebar, `la columna del día de la Agenda sí es cromo (${ag.dia})`);
  chk(ag.calendario !== ag.dia, `y su calendario, lienzo (${ag.calendario})`);
  await ctxGr.close();
}

/* ---------- 22. Lo dibujado sin motor: apagado, nunca encendido ----------
   Iván pidió construir lo que el handoff dibuja aunque no tenga función
   ("y luego se le pone motor"), y el trato acordado para los CONTROLES es
   que se pinten DESHABILITADOS y con su explicación. Esta sección es la
   guarda de ese trato: si alguien le quita el `disabled` a uno de estos sin
   ponerle motor, el arnés lo canta — y con él se iría a revisión del App
   Store un control muerto (guideline 2.1). El registro está en
   docs/cascaras-1-2.md. */
console.log("\n== Lo dibujado sin motor va apagado ==");
{
  const ctxSm = await nuevoContexto("ipad");
  const pg = await ctxSm.newPage();
  const DIR = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });

  const apagado = async (sel, nombre) => {
    const r = await pg.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      return { off: e.disabled === true, titulo: (e.getAttribute("title") || "").length, texto: e.textContent.trim() };
    }, sel);
    chk(!!r, `${nombre}: está dibujado`);
    if (r) {
      chk(r.off, `${nombre}: y APAGADO (${r.texto})`);
      chk(r.titulo > 20, `${nombre}: con su explicación (${r.titulo} car.)`);
    }
  };

  /* **Esta comprobación cambió el 24 ago.** "Marcar depositado" era la
     cáscara de esta pantalla: un botón apagado en el detalle de un depósito
     ya hecho. El handoff 3 lo mueve a Pendientes, donde SÍ tiene motor —abre
     el formulario con el total del corte— y lo comprueba la sección 28. Lo
     que queda sin motor aquí es "Compartir", que necesita una hoja de
     compartir que la app no tiene. */
  /* **"Compartir" salió de esta lista el 24 ago 2026.** El botón se apagaba
     diciendo que la app no tenía hoja de compartir; la tenía —`openForPrint`
     entrega por la hoja nativa desde que existen los reportes—, lo que
     faltaba era el DOCUMENTO, y ahora está (`printDeposito.ts`). Aquí queda
     la vuelta del guante: que no vuelva a apagarse. */
  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos .md-fila", { timeout: 10000 });
  await pg.click(".md-depositos .md-fila");
  await pg.waitForTimeout(400);
  const comp = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".dep-det-acciones button")]
      .find((x) => /Compartir|Share/i.test(x.textContent ?? ""));
    return b ? { off: b.disabled } : null;
  });
  chk(!!comp && !comp.off, `Compartir: dibujado y VIVO, ya tiene documento (${comp?.off})`);
  /* Y "Reabrir el corte", dentro del menú de "⋯": el mismo trato, apagado y
     con su explicación, en vez de esconder la opción y que el menú mienta. */
  await pg.click(".dep-det-acciones .ios-bar-button");
  await pg.waitForTimeout(400);
  await apagado(".ios-menu-item[disabled]", "Reabrir el corte");
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);

  /* **Servicios salió de esta lista el 24 ago 2026.** "Asignar encargado" era
     la cáscara de la pantalla: cuatro botones apagados, uno por cada puesto
     que la tabla no sabía guardar. La migración 43 les dio `servicio_puestos`
     y ahora los cuatro están VIVOS —lo comprueba la sección 36—. Lo que se
     queda aquí es la vuelta del guante: que ninguno haya quedado apagado por
     el camino. Si alguien vuelve a poner un `disabled` sin quitarle el motor,
     esto sale en rojo. */
  await pg.goto(`${URL_BASE}/#/servicios`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-servicios .md-fila", { timeout: 10000 });
  await pg.click(".md-servicios .md-fila");
  await pg.waitForTimeout(400);
  const puestos = await pg.evaluate(() => {
    const bs = [...document.querySelectorAll(".sv-puesto-asignar")];
    return { total: bs.length, apagados: bs.filter((b) => b.disabled).length };
  });
  chk(puestos.total === 4, `Asignar encargado: uno por cada puesto de tabla (${puestos.total})`);
  chk(puestos.apagados === 0, `y NINGUNO apagado: ya tienen motor (${puestos.apagados})`);

  /* **"Recopilar firmas" salió de esta lista el 24 ago 2026** (migración 44).
     Sigue pudiendo apagarse, pero por un motivo distinto y verdadero: un acta
     sin ningún firmante con nombre no tiene firmas que recoger. Lo que aquí
     se comprueba es que en un acta CON firmantes está vivo; el flujo entero
     va en la sección 38. */
  await pg.goto(`${URL_BASE}/#/actas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });
  await pg.click(".md-actas .md-fila");
  await pg.waitForTimeout(400);
  const firmasBtn = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".ac-barra .chip")]
      .find((x) => /firma|Sign/i.test(x.textContent ?? ""));
    return b ? { off: b.disabled, texto: b.textContent.trim() } : null;
  });
  chk(!!firmasBtn && !firmasBtn.off,
    `Recopilar firmas: dibujado y VIVO (${firmasBtn?.texto})`);

  /* Configuración: los tres de Presentación y los cuatro de permisos. */
  await pg.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".settings-nav-item", { timeout: 10000 });
  const zonas = await pg.$$eval(".settings-nav-item", (ns) => ns.map((n) => n.textContent.trim()));
  const irA = async (re) => {
    const i = zonas.findIndex((z) => re.test(z));
    await pg.locator(".settings-nav-item").nth(i).click();
    await pg.waitForTimeout(400);
  };

  await irA(/Preferenc|Preferences/i);
  const pres = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    const filas = [...z.querySelectorAll(".ios-field--apagado")];
    return {
      filas: filas.length,
      conTitulo: filas.filter((f) => (f.getAttribute("title") || "").length > 20).length,
      mandosVivos: filas.filter((f) => [...f.querySelectorAll("button")].some((b) => !b.disabled)).length,
      opacidad: filas[0] ? Number(getComputedStyle(filas[0]).opacity) : 1,
      seg: z.querySelectorAll(".pf-seg button").length,
    };
  });
  /* **Bajó de tres a dos el 24 ago 2026**: "Ocultar montos al bloquear" ya
     tiene motor (sección 31) y por tanto ya no puede estar apagada. Las que
     siguen esperando son "Tamaño de texto" y "Barra lateral siempre visible".
     La comprobación no se borra, se ajusta: lo que vigila —que lo dibujado
     sin motor esté apagado y explicado— sigue valiendo para las dos. */
  /* **Bajó otra vez el 24 ago**: "Barra lateral siempre visible" se QUITÓ —no
     se cableó—, porque fijar la barra en vertical se come 318px y deja el
     contenido por debajo de los 700 que el maestro-detalle necesita; y porque
     Notas, Archivos y Correo hacen lo que Tamio ya hace. Queda una sola fila
     apagada: "Tamaño de texto". */
  chk(pres.filas === 1, `Presentación: la única que sigue sin motor, apagada (${pres.filas})`);
  chk(pres.conTitulo === pres.filas, "con su explicación");
  /* Y la que se quitó no puede volver por la puerta de atrás. */
  const sinFijo = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    return ![...z.querySelectorAll(".ios-field-label")]
      .some((l) => /siempre visible|always show/i.test(l.textContent ?? ""));
  });
  chk(sinFijo, "y \"Barra lateral siempre visible\" ya no está");
  chk(pres.mandosVivos === 0, `y ningún mando vivo dentro (${pres.mandosVivos})`);
  chk(pres.opacidad < 0.7, `la fila entera a media tinta (${pres.opacidad})`);
  chk(pres.seg === 3, `el segmentado de tamaño de texto (${pres.seg})`);
  /* Y la que SÍ tiene motor está viva y se puede tocar. */
  const om = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    const fila = [...z.querySelectorAll(".ios-field")]
      .find((f) => /ocultar/i.test(f.querySelector(".ios-field-label")?.textContent ?? ""));
    if (!fila) return null;
    return {
      apagada: fila.classList.contains("ios-field--apagado"),
      mando: !!fila.querySelector("button:not([disabled]), .ios-switch"),
    };
  });
  chk(!!om && !om.apagada, `"Ocultar montos" ya no está apagada (${om?.apagada})`);
  if (DIR) await pg.screenshot({ path: `${DIR}/config-presentacion-1366x1024.png` });

  /* **Los cuatro de "Iglesia" se partieron en dos el 24 ago 2026** (migración
     45). Los DOS AVISOS —comprobante y duplicados— tienen motor: se
     encienden, se apagan y el umbral se escribe, y lo que se cambia llega a
     Por revisar. Los otros dos siguen apagados, y no por deuda sino por
     decisión: la doble firma es la opción que no se eligió (constancia, no
     acuse) y el mes se cierra por calendario.

     Lo que esta comprobación vigila cambió con ellos: antes exigía cuatro
     filas apagadas y "ninguna pulsable"; ahora exige DOS apagadas y que las
     otras dos sí se puedan tocar. El flujo entero va en la sección 39. */
  await irA(/Iglesia|Church/i);
  const igl = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    const apagadas = [...z.querySelectorAll(".ios-field--apagado")];
    const interruptores = [...z.querySelectorAll('[role="switch"]')];
    return {
      apagadas: apagadas.length,
      // Los dos avisos: interruptores vivos, no adornos.
      vivos: interruptores.filter((b) => !b.disabled).length,
      subs: [...z.querySelectorAll(".ios-field-sub")].length,
      opacidad: apagadas[0] ? Number(getComputedStyle(apagadas[0]).opacity) : 1,
      // El importe ya NO va en la etiqueta: tiene su propio campo, porque
      // ahora se escribe. En el pie sigue saliendo el valor de siempre.
      pie: [...z.querySelectorAll(".ios-section-footer")].some((p) => /\d/.test(p.textContent ?? "")),
    };
  });
  chk(igl.apagadas === 2, `Controles de tesorería: solo las dos que son DECISIÓN siguen apagadas (${igl.apagadas})`);
  chk(igl.vivos === 2, `y los dos avisos son interruptores vivos (${igl.vivos})`);
  chk(igl.subs >= 4, `las filas siguen explicando qué hacen (${igl.subs})`);
  chk(igl.opacidad < 0.7, `las apagadas van a media tinta (${igl.opacidad})`);
  chk(igl.pie, "y el pie dice cuál es el umbral de siempre, con su cifra");
  /* Y que ninguna etiqueta se recorte: con la columna fija de 190 de las
     demás filas, "Avisar de gastos sin comprobante desde $1,000.00 USD"
     salía cortado en la primera palabra. Fue justo lo que llevó a sacar el
     importe de la etiqueta y darle campo propio. */
  const recorte = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    const ls = [...z.querySelectorAll(".ios-field-label")];
    return ls.filter((l) => l.scrollWidth > l.clientWidth + 1).length;
  });
  chk(recorte === 0, `ninguna etiqueta recortada (${recorte})`);
  // El grupo va al final de la zona; sin bajar, la captura no lo enseña.
  await pg.evaluate(() => { document.querySelector(".settings-detail").scrollTop = 99999; });
  await pg.waitForTimeout(300);
  if (DIR) await pg.screenshot({ path: `${DIR}/config-tesoreria-1366x1024.png` });

  await irA(/Acceso|Access/i);
  const perm = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    const filas = [...z.querySelectorAll(".ios-field--apagado")];
    return {
      filas: filas.length,
      vivos: filas.filter((f) => [...f.querySelectorAll("button")].some((b) => !b.disabled)).length,
    };
  });
  chk(perm.filas === 4, `los cuatro permisos del rol (${perm.filas})`);
  chk(perm.vivos === 0, "ninguno pulsable");
  if (DIR) await pg.screenshot({ path: `${DIR}/config-permisos-1366x1024.png` });
  await ctxSm.close();
}

/* ---------- 23. Ningún disparador de menú se sale de su caja ----------
   `MenuAnchor` envuelve su disparador en `.ios-bar-button`, que medía 44×44
   FIJOS con `justify-content: center`. Cuando el disparador no es un glifo
   sino un chip con texto, se desborda Y se centra: asoma (ancho−44)/2 por
   cada lado. En la barra de Reportes eran 38px a la izquierda, encima de la
   columna maestra — es lo que vio Iván. Pasó tres veces y se parcheó dos, en
   sitio distinto cada una; ahora el 44 es un mínimo y esto lo vigila donde
   quiera que aparezca un menú. */
console.log("\n== Los disparadores de menú caben en su caja ==");
{
  const ctxMb = await nuevoContexto("ipad");
  const pg = await ctxMb.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });

  const revisar = async (ruta, esperar, abrir, nombre) => {
    await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
    await pg.waitForSelector(esperar, { timeout: 10000 });
    if (abrir) { await pg.click(abrir); await pg.waitForTimeout(450); }
    await pg.waitForTimeout(250);
    const fuera = await pg.evaluate(() => {
      const malos = [];
      for (const b of document.querySelectorAll(".ios-bar-button")) {
        if (b.getBoundingClientRect().width === 0) continue;
        /* La invariante es del BOTÓN, no de su sitio en la página: su
           contenido tiene que caber dentro de él. Comparar contra el padre no
           sirve —`.ios-menu-anchor` se encoge al contenido, así que el
           desbordado se lleva al padre consigo— y comprobado: con el bug
           puesto de vuelta, esa versión salía en verde. */
        if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) {
          malos.push(`${b.className}: contenido ${b.scrollWidth}×${b.scrollHeight} en caja ${b.clientWidth}×${b.clientHeight}`);
        }
      }
      return malos;
    });
    chk(fuera.length === 0, `${nombre}: el contenido cabe en el disparador (${fuera.join(" · ") || "todos"})`);
  };

  await revisar("reportes", ".md-reportes .md-indice-item", ".md-reportes .md-indice-item", "Reportes");
  await revisar("ingresos", ".md-movimientos .md-fila", null, "Ingresos");
  await revisar("membresia", ".mb-fila", null, "Membresía");

  /* Y lo que Iván vio: el chip del mes tiene que empezar donde empieza el
     informe, no 38px más a la izquierda. */
  await pg.goto(`${URL_BASE}/#/reportes`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-reportes .md-indice-item", { timeout: 10000 });
  await pg.click(".md-reportes .md-indice-item");
  await pg.waitForTimeout(500);
  const a = await pg.evaluate(() => {
    const x = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().left) : null; };
    return { chip: x(".rep-barra .chip-mes"), cifras: x(".md-reportes .summary-4"), panel: x(".md-reportes .md-detalle") };
  });
  chk(a.chip === a.cifras, `el chip del mes arranca donde el informe (${a.chip} vs ${a.cifras})`);
  chk(a.chip > a.panel, `y dentro del panel, no encima de la lista (${a.chip} > ${a.panel})`);
  await ctxMb.close();
}

/* ---------- 24. Los menús anclados no los recorta nadie ----------
   `MenuAnchor` era un `position: absolute` dentro de su propio anclaje, así
   que cualquier ancestro con `overflow` lo recortaba. Medido en el chip del
   mes de Reportes: el menú ocupaba 546–796 y el panel empieza en 648 — 102px
   se los comía el `overflow-y: auto`, y el menú se veía cortado "detrás" de
   la columna maestra. Ahora cuelga de <body> en `fixed`, como RowMenu y los
   otros menús de la casa. Esto lo vigila en las cuatro pantallas que usan
   menús anclados. */
console.log("\n== Los menús anclados no se recortan ==");
{
  const ctxMn = await nuevoContexto("ipad");
  const pg = await ctxMn.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });

  const abrir = async (ruta, esperar, previo, disparador, nombre) => {
    await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
    await pg.waitForSelector(esperar, { timeout: 10000 });
    if (previo) { await pg.click(previo); await pg.waitForTimeout(400); }
    await pg.click(disparador);
    await pg.waitForTimeout(400);
    const m = await pg.evaluate(() => {
      const menu = document.querySelector(".ios-menu");
      if (!menu) return null;
      const r = menu.getBoundingClientRect();
      // ¿lo recorta algún ancestro con overflow? Con el menú colgado de
      // <body> no puede haber ninguno, y esto lo comprueba en vez de
      // suponerlo.
      let recorta = null;
      for (let e = menu.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const ov = getComputedStyle(e).overflow;
        if (ov !== "visible") { recorta = e.className || e.tagName; break; }
      }
      // Y que se pueda pulsar de verdad: quién está en el centro del menú.
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 40);
      const encima = document.elementFromPoint(cx, cy);
      return {
        enBody: menu.parentElement === document.body,
        recorta,
        dentro: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
        caja: `${Math.round(r.left)}..${Math.round(r.right)} × ${Math.round(r.top)}..${Math.round(r.bottom)}`,
        pulsable: !!encima && menu.contains(encima),
        items: menu.querySelectorAll(".ios-menu-item").length,
      };
    });
    chk(!!m, `${nombre}: el menú se abre`);
    if (m) {
      chk(m.enBody, `${nombre}: cuelga de <body> (${m.enBody})`);
      chk(m.recorta === null, `${nombre}: ningún ancestro lo recorta (${m.recorta ?? "ninguno"})`);
      chk(m.dentro, `${nombre}: entero dentro de la pantalla (${m.caja})`);
      chk(m.pulsable, `${nombre}: y se puede pulsar`);
      chk(m.items > 0, `${nombre}: con sus opciones (${m.items})`);
    }
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
  };

  await abrir("reportes", ".md-reportes .md-indice-item", ".md-reportes .md-indice-item",
    ".rep-barra .ios-bar-button", "Reportes · mes");
  await abrir("ingresos", ".md-movimientos .md-fila", null,
    ".md-chips .ios-bar-button", "Ingresos · mes");

  /* El del chip del mes de Reportes, además, tiene que quedar DENTRO del
     panel: es el que Iván vio salirse por la izquierda. */
  await pg.goto(`${URL_BASE}/#/reportes`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-reportes .md-indice-item", { timeout: 10000 });
  await pg.click(".md-reportes .md-indice-item");
  await pg.waitForTimeout(400);
  await pg.click(".rep-barra .ios-bar-button");
  await pg.waitForTimeout(400);
  const d = await pg.evaluate(() => {
    const m = document.querySelector(".ios-menu").getBoundingClientRect();
    const p = document.querySelector(".md-reportes .md-detalle").getBoundingClientRect();
    const b = document.querySelector(".rep-barra .ios-bar-button").getBoundingClientRect();
    return { menuL: Math.round(m.left), panelL: Math.round(p.left), botonL: Math.round(b.left) };
  });
  chk(d.menuL >= d.panelL, `y no invade la columna maestra (${d.menuL} >= ${d.panelL})`);
  chk(d.menuL === d.botonL, `arranca en el borde del chip, no a su izquierda (${d.menuL} = ${d.botonL})`);
  await ctxMn.close();
}

/* ---------- 25. Ninguna barra de gráfica sale negra ----------
   Con el acento de fábrica ("neutro") `--ink` vale #0f0f0f, así que todo lo
   que se pintara con él como MARCA DE DATO salía negro. La regla de la casa
   —escrita en styles.css sobre `--brand`— es que el estado activo y el tinte
   de los controles no usan negro puro. Iván lo cazó dos veces: primero el día
   de hoy de la Agenda, después las barras de Informes de membresía. Esto las
   vigila juntas, y de paso la barra de Informes, que flotaba sobre el lienzo
   en vez de ser la barra del panel. */
console.log("\n== Las barras van con el acento, no en negro ==");
{
  const ctxG = await nuevoContexto("ipad");
  const pg = await ctxG.newPage();
  await pg.setViewportSize({ width: 1366, height: 1024 });
  const negro = "rgb(15, 15, 15)";

  await pg.goto(`${URL_BASE}/#/reporte-miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".inf-barrita", { timeout: 10000 });
  /* Las distribuciones viven en "Información general", que no es la vista de
     arranque. */
  await pg.locator(".inf-item").first().click();
  await pg.waitForTimeout(500);
  const inf = await pg.evaluate(() => {
    const relleno = (el) => getComputedStyle(el).backgroundColor;
    // Las barras de "Miembros por estado / ministerio / expediente" y las de
    // "Nuevos por mes": divs sin clase, se buscan por su forma.
    const barras = [...document.querySelectorAll(".inf-cuerpo .card div")]
      .filter((d) => {
        const cs = getComputedStyle(d);
        return d.children.length === 0 && cs.borderRadius !== "0px" &&
               cs.backgroundColor !== "rgba(0, 0, 0, 0)" && d.getBoundingClientRect().height > 2;
      })
      .map(relleno);
    const b = document.querySelector(".inf-barrita").getBoundingClientRect();
    const p = document.querySelector(".inf-detalle").getBoundingClientRect();
    return {
      colores: [...new Set(barras)],
      barritaX: Math.round(b.left), panelX: Math.round(p.left),
      barritaY: Math.round(b.top), panelY: Math.round(p.top),
      barritaW: Math.round(b.width), panelW: Math.round(p.width),
    };
  });
  const negras = inf.colores.filter((c) => c === negro);
  chk(inf.colores.length > 0, `las gráficas de Informes tienen barras (${inf.colores.length} colores)`);
  chk(negras.length === 0, `y ninguna sale negra (${inf.colores.join(" · ")})`);
  chk(inf.barritaX === inf.panelX, `la barrita arranca en el filo del panel (${inf.barritaX} = ${inf.panelX})`);
  chk(inf.barritaY === inf.panelY, `y pegada a la cabecera (${inf.barritaY} = ${inf.panelY})`);
  chk(inf.barritaW === inf.panelW, `y de filo a filo (${inf.barritaW} = ${inf.panelW})`);

  /* Y el barrido general: ninguna barra de gráfica de las pantallas del iPad
     puede quedarse en el negro de "neutro". */
  for (const [ruta, esperar, sel, nombre] of [
    ["", ".dash-barras", ".dash-barra", "Inicio"],
  ]) {
    await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
    await pg.waitForSelector(esperar, { timeout: 10000 });
    await pg.waitForTimeout(400);
    const cols = await pg.$$eval(sel, (ns) => [...new Set(ns.map((n) => getComputedStyle(n).backgroundColor))]);
    chk(!cols.includes(negro), `${nombre}: sus barras tampoco (${cols.join(" · ")})`);
  }
  await ctxG.close();
}

/* ---------- 26. Editar un miembro en el iPad va a la hoja, no al modal ----
   Lo último del diseño viejo que seguía saliendo sobre el maestro-detalle de
   Membresía: al crear salía la hoja de iOS y al editar salía el modal de
   escritorio —la misma ficha en dos lenguajes según se estuviera creando o
   corrigiendo—. Iván mandó las dos fotos juntas el 23 ago.

   Lo que se vigila, y por qué cada cosa:

    - que sale la hoja y NO queda ningún `.modal-card`;
    - que "Guardar" está ENCENDIDO. Es la trampa real de este cambio: la hoja
      apagaba el botón mientras el nombre estuviera vacío, y al editar el
      nombre no se carga a propósito (`updateMemberFicha` no lo escribe), así
      que la condición de siempre habría dejado "Guardar" muerto para siempre;
    - que "Guardar y agregar otro" NO está —es del alta— y "Generar informe"
      SÍ —es la acción del pie del modal, que no se puede perder por el
      camino—;
    - que la pantalla de solo lectura se abre y trae las cartas y traslados,
      que es lo único del modal viejo que el panel de detrás no enseña. */
console.log("\n== Editar miembro en el iPad: hoja, no modal ==");
{
  const ctxE = await nuevoContexto("ipad");
  const pg = await ctxE.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".mb-fila", { timeout: 10000 });
  await pg.locator(".mb-fila").first().click();
  await pg.waitForTimeout(400);
  await pg.locator(".mb-cab-acciones .btn.primary").click();
  await pg.waitForTimeout(600);

  const e = await pg.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet.nm-hoja");
    if (!hoja) return { hoja: false, modal: !!document.querySelector(".modal-card") };
    const txt = (sel) => [...hoja.querySelectorAll(sel)].map((n) => n.textContent.trim());
    const guardar = hoja.querySelector(".ios-nav-action");
    return {
      hoja: true,
      modal: !!document.querySelector(".modal-card"),
      titulo: hoja.querySelector(".ios-nav-title")?.textContent.trim(),
      guardarApagado: guardar ? guardar.disabled : null,
      cabeceras: txt(".ios-section-header"),
      acciones: txt(".ios-field--action"),
      etiquetas: txt(".ios-field-label"),
    };
  });
  chk(e.hoja, "editar abre la hoja de iOS");
  chk(!e.modal, "y no queda ningún modal de escritorio detrás");
  if (e.hoja) {
    chk(e.guardarApagado === false, `"Guardar" queda encendido al editar (disabled=${e.guardarApagado})`);
    chk(e.titulo && e.titulo.length > 0 && e.titulo !== "Nuevo miembro",
      `el título es el miembro, no "Nuevo miembro" (${e.titulo})`);
    chk(!e.cabeceras.includes("Quién es"),
      `sin "Quién es": esos campos no se guardan al editar (${e.cabeceras.join(" · ")})`);
    chk(e.cabeceras.includes("Expediente"), "y con la sección Expediente");
    chk(!e.acciones.some((a) => a.includes("agregar otro")),
      `sin "Guardar y agregar otro" (${e.acciones.join(" · ")})`);
    chk(e.acciones.some((a) => a.includes("Generar informe")), "y con \"Generar informe\"");
    /* Los dos campos de membresía que en el alta viven dentro de "Más datos
       personales": esa pantalla no existe al editar, así que si no subieran
       aquí se perderían sin hacer ruido. */
    chk(e.etiquetas.includes("Recibido como miembro") && e.etiquetas.includes("Iglesia anterior"),
      `con ingreso e iglesia anterior en Membresía (${e.etiquetas.join(" · ")})`);

    await pg.locator(".ios-sheet .ios-field--link", { hasText: "Asistencia, historial" }).first().click();
    await pg.waitForTimeout(500);
    const lect = await pg.evaluate(() => {
      const p = [...document.querySelectorAll(".ios-sheet")].pop();
      return {
        n: document.querySelectorAll(".ios-sheet").length,
        cabeceras: [...p.querySelectorAll(".ios-section-header")].map((n) => n.textContent.trim()),
      };
    });
    chk(lect.n === 2, `la pantalla de lectura se apila (${lect.n} hojas)`);
    chk(lect.cabeceras.includes("Cartas y traslados"),
      `y trae lo que el panel de detrás no enseña (${lect.cabeceras.join(" · ")})`);
    const DIR = process.env.CAPTURAS || "";
    if (DIR) {
      await pg.screenshot({ path: `${DIR}/editar-miembro-lectura.png` });
      await pg.locator(".ios-sheet").last().locator(".ios-back").click();
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: `${DIR}/editar-miembro-hoja.png` });
    }
  }
  await ctxE.close();
}

/* ---------- 27. La línea de la barra no toca los botones --------------
   Iván lo vio en Ingresos: la raya de abajo de la barra pasaba pegada al
   "Imprimir" y al "Nuevo ingreso", sin un pelo de aire.

   Por qué el arnés no lo había cazado nunca: la barra se apoyaba en
   `min-height: 56px` con `padding: env(safe-area-inset-top) 20px 0`, y en
   Chromium **env() vale 0**, así que aquí la barra medía 56 con 40 de
   contenido —8px de aire arriba y abajo— y todo se veía bien. En un iPad de
   verdad el inset son ~24px, que salen del MISMO 56: la caja de contenido se
   quedaba en 32, el contenido la desbordaba, la barra crecía justo hasta el
   alto del contenido y la raya acababa lamiendo los botones.

   Para poder medirlo, el inset dejó de escribirse a pelo y pasa por
   `--barra-inset`, que aquí se fija a 24px —lo que mide en el aparato— y
   deja el fallo a la vista en un navegador que no tiene muesca. */
console.log("\n== La raya de la barra deja aire bajo los botones ==");
{
  const ctxB = await nuevoContexto("ipad");
  const pg = await ctxB.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  /* Los dos tamaños de las fotos de Iván: el 13" apaisado (ancho) y el 11"
     vertical, que es el que además lleva el ☰ y la barra en dos líneas. */
  for (const [w, h] of [[1366, 1024], [834, 1194]]) {
    await pg.setViewportSize({ width: w, height: h });
    /* Todas las pantallas con barra, que es lo que pidió Iván: "y hacer lo
       mismo en todas las páginas". La regla es una sola (`:root.ipad
       .header`), pero eso hay que comprobarlo, no suponerlo: cada página
       mete cosas distintas en la barra —un buscador, dos botones, un menú,
       el saldo del mes— y cualquiera de ellas puede ser la más baja. */
    for (const ruta of [
      "", "ingresos", "gastos", "miembros", "reportes", "depositos", "membresia",
      "actas", "servicios", "cartas", "reporte-miembros", "agenda", "inbox",
      "bandeja", "ayuda", "configuracion",
    ]) {
      await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
      await pg.waitForSelector(".header", { timeout: 10000 });
      await pg.evaluate(() => document.documentElement.style.setProperty("--barra-inset", "24px"));
      await pg.waitForTimeout(300);
      const m = await pg.evaluate(() => {
        const bar = document.querySelector(".header");
        const r = bar.getBoundingClientRect();
        const cs = getComputedStyle(bar);
        /* Lo que se mide es el hueco entre lo MÁS BAJO que pinta la barra y
           su raya de abajo: da igual que sea un botón, el subtítulo o un
           chip, ninguno puede tocarla. */
        let bajo = -Infinity, quien = null;
        for (const el of bar.querySelectorAll("*")) {
          const q = el.getBoundingClientRect();
          if (q.height === 0 || q.width === 0) continue;
          if (q.bottom > bajo) { bajo = q.bottom; quien = el.className || el.tagName; }
        }
        return {
          hueco: Math.round(r.bottom - bajo),
          alto: Math.round(r.height),
          padTop: cs.paddingTop,
          quien: String(quien).slice(0, 40),
        };
      });
      const nombre = `${ruta || "inicio"} ${w}×${h}`;
      chk(m.padTop === "24px", `${nombre}: la barra respeta el inset (${m.padTop})`);
      chk(m.hueco >= 6, `${nombre}: ${m.hueco}px entre "${m.quien}" y la raya (alto ${m.alto})`);
      const DIR = process.env.CAPTURAS || "";
      if (DIR && ruta === "ingresos") {
        await pg.screenshot({ path: `${DIR}/barra-inset-${w}x${h}.png`, clip: { x: 0, y: 0, width: w, height: 240 } });
      }
    }
  }
  await ctxB.close();
}

/* ---------- 28. Depósitos › Pendientes, la revisión previa (handoff 3) ----
   La pestaña era un bloque que explicaba que le faltaba motor; el handoff 3
   la convierte en la pantalla donde se revisa el dinero ANTES de ir al banco.
   Lo que se comprueba es lo que la hace útil: que las tres cifras salen de la
   MISMA selección que la lista —marcar y desmarcar no las puede descuadrar—,
   que los avisos que sí tienen dato aparecen, y que "Marcar depositado" abre
   el formulario con el total ya puesto, que es lo único que evita teclear dos
   veces la misma cifra. */
console.log("\n== Depósitos › Pendientes: el corte se revisa antes del banco ==");
{
  const ctxD = await nuevoContexto("ipad");
  const pg = await ctxD.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos", { timeout: 10000 });
  await pg.locator(".md-seg-tipo button", { hasText: "Pendientes" }).click();
  await pg.waitForTimeout(600);

  /** Las tres cifras del panel y el total del pie de la lista de movimientos. */
  const leer = () => pg.evaluate(() => {
    const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ""));
    const cifras = [...document.querySelectorAll(".dep-cifra")].map((c) => ({
      et: c.querySelector(".dep-cifra-et").textContent.trim(),
      val: num(c.querySelector(".dep-cifra-val").textContent),
    }));
    const movs = [...document.querySelectorAll(".dep-mov")];
    return {
      cifras,
      pie: num(document.querySelector(".dep-carta-pie-total")?.textContent ?? "0"),
      movs: movs.length,
      marcados: movs.filter((m) => m.classList.contains("sel")).length,
      // El monto de cada fila y si es cheque, para poder rehacer la suma aquí.
      filas: movs.map((m) => ({
        sel: m.classList.contains("sel"),
        ch: m.querySelector(".dep-mov-metodo").textContent.trim(),
        monto: num(m.querySelector(".dep-mov-monto").textContent),
      })),
      avisos: [...document.querySelectorAll(".dep-aviso-titulo")].map((a) => a.textContent.trim()),
      registrado: num(document.querySelector(".dep-par--fuerte span:last-child")?.textContent ?? "0"),
    };
  });

  const cortes = await pg.locator(".md-fila").count();
  chk(cortes > 0, `hay cortes en la lista (${cortes})`);

  const a = await leer();
  chk(a.movs > 0, `el corte abierto trae sus movimientos (${a.movs})`);
  chk(a.marcados === a.movs, `arrancan todos marcados (${a.marcados}/${a.movs})`);
  chk(a.cifras.length === 3, `las tres cifras del diseño (${a.cifras.map((c) => c.et).join(" · ")})`);

  /* La comprobación que importa: efectivo + cheques = total, y el total del
     panel = el del pie de la lista = el de "Se registrará así". Si alguna
     saliera de otro sitio, marcar una fila las descuadraría. */
  const cuadra = (m, nombre) => {
    const ef = m.cifras[0].val, ch = m.cifras[1].val, tot = m.cifras[2].val;
    chk(Math.abs(ef + ch - tot) < 0.01, `${nombre}: efectivo + cheques = total (${ef} + ${ch} = ${tot})`);
    chk(Math.abs(tot - m.pie) < 0.01, `${nombre}: el pie de la lista da lo mismo (${m.pie})`);
    chk(Math.abs(tot - m.registrado) < 0.01, `${nombre}: y "Se registrará así" también (${m.registrado})`);
    const suma = m.filas.filter((f) => f.sel).reduce((x, f) => x + f.monto, 0);
    chk(Math.abs(tot - suma) < 0.01, `${nombre}: y es la suma de lo marcado (${suma})`);
    const chSuma = m.filas.filter((f) => f.sel && f.ch === "CH").reduce((x, f) => x + f.monto, 0);
    chk(Math.abs(ch - chSuma) < 0.01, `${nombre}: los cheques son los CH marcados (${chSuma})`);
  };
  cuadra(a, "con todo marcado");
  chk(a.filas.some((f) => f.ch === "CH"), "y hay al menos un cheque que desglosar");

  // Desmarcar la primera fila tiene que bajar las tres cifras a la vez.
  await pg.locator(".dep-mov").first().click();
  await pg.waitForTimeout(300);
  const b = await leer();
  chk(b.marcados === a.marcados - 1, `desmarcar una baja el conteo (${b.marcados})`);
  chk(b.cifras[2].val < a.cifras[2].val, `y el total (${a.cifras[2].val} → ${b.cifras[2].val})`);
  cuadra(b, "con una desmarcada");

  /* El cuarto aviso cambió de sentido con el motor del corte: antes decía
     "Tamio todavía no marca qué movimientos ya fueron al banco" y era
     permanente; ahora solo sale mientras queden depósitos SIN corte detrás
     —los tres que siembra el arnés— y desaparece cuando todos lo tengan. */
  const avisosEsperados = ["por revisar", "efectivo", "Periodo contable", "sin corte"];
  for (const frag of avisosEsperados) {
    chk(b.avisos.some((x) => x.toLowerCase().includes(frag.toLowerCase())),
      `aviso "${frag}" presente (${b.avisos.length} avisos)`);
  }

  const DIR = process.env.CAPTURAS || "";
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-pendientes.png` });

  /* "Marcar depositado" —el atajo: fue directo al banco, sin entrega— abre el
     formulario con el total puesto. Es lo único que impide que lo revisado y
     lo registrado se separen. Es el SECUNDARIO de la tarjeta desde que el
     primario pasó a ser "Entregar el corte". */
  await pg.locator(".dep-carta-accion .btn.secondary").click();
  await pg.waitForTimeout(700);
  const pre = await pg.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet");
    if (!hoja) return null;
    const campo = hoja.querySelector(".nm-monto-campo");
    return { hoja: true, monto: Number(String(campo?.value ?? "").replace(/[^0-9.-]/g, "")) };
  });
  chk(!!pre, "\"Marcar depositado\" abre el formulario de depósito");
  if (pre) chk(Math.abs(pre.monto - b.cifras[2].val) < 0.01,
    `y llega con el total del corte puesto (${pre.monto} = ${b.cifras[2].val})`);
  await pg.locator(".ios-sheet .ios-sheet-cancelar").click();
  await pg.waitForTimeout(400);

  /* La hoja del corte. Desde la migración 38 "Crear" está ENCENDIDO: hasta la
     1.2.9 salía apagado porque no había tabla donde guardarlo. */
  await pg.locator(".dep-carta-accion .btn.primary").click();
  await pg.waitForTimeout(700);
  const corte = await pg.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet");
    if (!hoja) return null;
    const accion = hoja.querySelector(".ios-nav-action");
    return {
      ancho: Math.round(hoja.getBoundingClientRect().width),
      crearApagado: accion ? accion.disabled : null,
      secciones: [...hoja.querySelectorAll(".ios-section-header")].map((h) => h.textContent.trim()),
      marcables: hoja.querySelectorAll(".ios-field--marcar").length,
    };
  });
  chk(!!corte, "\"Nuevo corte\" abre su hoja");
  if (corte) {
    chk(corte.ancho === 600, `hoja de 600 (${corte.ancho})`);
    chk(corte.crearApagado === false, `"Crear" está encendido: ya hay dónde guardar un corte (${corte.crearApagado})`);
    chk(corte.marcables === b.movs, `con los mismos movimientos que el panel (${corte.marcables} = ${b.movs})`);
    chk(corte.secciones.length === 3, `y sus tres secciones (${corte.secciones.join(" · ")})`);
  }
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-nuevo-corte.png` });

  /* ---- El ciclo completo del corte (migración 38) ----
     Crear → sale como "entregado" → cerrarlo con su depósito → aparece en
     Depositados con SUS movimientos. Es el recorrido que enciende las ocho
     cáscaras de una vez, así que se comprueba entero y no por piezas: cada
     paso solo significa algo si el anterior dejó bien la base. */
  await pg.locator(".ios-sheet .ios-nav-action").click();
  await pg.waitForTimeout(900);
  const tras = await pg.evaluate(() => {
    const fila = (sel) => [...document.querySelectorAll(sel)];
    return {
      hoja: !!document.querySelector(".ios-sheet"),
      grupos: fila(".md-depositos .md-grupo").map((g) => g.textContent.trim()),
      entregados: fila(".md-depositos .dep-estado--pendiente").length,
      enCaja: fila(".md-depositos .dep-estado--caja").length,
    };
  });
  chk(!tras.hoja, "creado el corte, la hoja se cierra sola");
  chk(tras.entregados === 1, `y aparece un corte entregado (${tras.entregados})`);
  chk(tras.grupos.some((g) => /Entregado/i.test(g)),
    `bajo su propio grupo (${tras.grupos.join(" · ")})`);

  // El corte entregado: su composición es FIJA y ofrece cerrar o deshacer.
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(500);
  const ent = await pg.evaluate(() => {
    const movs = [...document.querySelectorAll(".dep-mov")];
    return {
      sub: document.querySelector(".dep-pen .dm-sub")?.textContent.trim(),
      movs: movs.length,
      bloqueados: movs.filter((m) => m.disabled).length,
      acciones: [...document.querySelectorAll(".dep-carta-accion .btn")].map((b) => b.textContent.trim()),
    };
  });
  chk(ent.movs > 0, `el corte entregado enseña sus movimientos (${ent.movs})`);
  chk(ent.bloqueados === ent.movs,
    `y no se pueden re-marcar: el dinero ya salió (${ent.bloqueados}/${ent.movs})`);
  chk(/entregad|salió/i.test(ent.sub ?? ""), `dice a quién y cuándo (${ent.sub})`);
  chk(ent.acciones.some((a) => /Deshacer/i.test(a)), `y ofrece deshacerlo (${ent.acciones.join(" · ")})`);

  /* Cerrarlo: "Marcar depositado" → guardar el depósito → el corte pasa a
     Depositados y el depósito enseña de qué se compone. */
  await pg.locator(".dep-carta-accion .btn.primary").click();
  await pg.waitForTimeout(700);
  /* Guardar puede pedir DOS pulsaciones: el aviso de "el monto supera el
     efectivo estimado en caja" no bloquea, avisa y espera confirmación —con
     los datos que siembra el arnés, la caja sale en negativo y siempre
     salta—. Es el comportamiento correcto y el usuario hace justo esto: lee
     y vuelve a pulsar. */
  await pg.locator(".ios-sheet .ios-nav-action").click();
  await pg.waitForTimeout(700);
  if (await pg.locator(".ios-sheet").count() > 0) {
    await pg.locator(".ios-sheet .ios-nav-action").click();
    await pg.waitForTimeout(1200);
  }
  const cerrado = await pg.evaluate(() => ({
    entregados: document.querySelectorAll(".md-depositos .dep-estado--pendiente").length,
    hoja: document.querySelectorAll(".ios-sheet").length,
  }));
  chk(cerrado.hoja === 0, `el formulario se cierra al guardar (${cerrado.hoja} hojas)`);
  chk(cerrado.entregados === 0, `cerrado el depósito, no queda ningún corte abierto (${cerrado.entregados})`);

  await pg.locator(".md-seg-tipo button", { hasText: "Depositados" }).click();
  await pg.waitForTimeout(600);
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(600);
  const det2 = await pg.evaluate(() => {
    const num = (t) => Number(String(t).replace(/[^0-9.-]/g, ""));
    const cifras = [...document.querySelectorAll(".dep-cifra")].map((c) => ({
      et: c.querySelector(".dep-cifra-et").textContent.trim(),
      val: c.querySelector(".dep-cifra-val").textContent.trim(),
    }));
    return {
      cifras,
      sinMotor: document.querySelectorAll(".dep-cifra--sinmotor").length,
      movs: document.querySelectorAll(".dep-carta .dep-mov, .dep-carta .dep-dep-mov").length,
      efectivo: num(cifras[0]?.val ?? "0"),
      total: num(cifras[2]?.val ?? "0"),
    };
  });
  chk(det2.sinMotor === 0,
    `el detalle del depósito ya no tiene cifras sin motor (${det2.sinMotor})`);
  chk(det2.movs > 0, `y enseña los movimientos que lo componen (${det2.movs})`);
  chk(det2.efectivo > 0, `con el desglose de efectivo real (${det2.cifras[0]?.val})`);
  if (DIR) await pg.screenshot({ path: `${DIR}/depositos-corte-cerrado.png` });

  /* El chip "Sin depositar" de Ingresos: la cuarta cáscara que enciende esta
     misma pieza. Cuenta los ingresos en efectivo o cheque que no están en
     ningún corte — y como acabamos de meter uno en un corte, el chip tiene
     que contar UNO MENOS que antes. Eso es lo que demuestra que el chip mira
     el vínculo de verdad y no un cálculo aparte. */
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-movimientos", { timeout: 10000 });
  await pg.waitForTimeout(500);
  const chip = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".md-chips .chip, .md-filtros .chip")]
      .find((x) => /sin depositar/i.test(x.textContent));
    if (!b) return null;
    return { n: Number(b.querySelector(".count")?.textContent ?? "0"), ayuda: (b.getAttribute("title") || "").length };
  });
  chk(!!chip, "Ingresos: el chip \"Sin depositar\" está");
  /* Y deshacer un corte devuelve su dinero a la caja. Es la prueba de que el
     borrado en BLANDO de los enganches (migración 40) no deja el dinero
     atrapado: el índice único es parcial, solo sobre los vivos. */
  const antesDeDeshacer = chip?.n ?? 0;
  if (chip) {
    chk(chip.n > 0, `y cuenta lo que sigue en caja (${chip.n})`);
    chk(chip.ayuda > 40, `con su explicación de qué cuenta (${chip.ayuda} car.)`);
    // Filtra de verdad: al pulsarlo, la lista se queda en esos.
    await pg.locator(".md-chips .chip, .md-filtros .chip").filter({ hasText: /Sin depositar/i }).first().click();
    await pg.waitForTimeout(500);
    const filas = await pg.locator(".md-movimientos .md-fila").count();
    chk(filas === chip.n, `y filtra la lista a esos mismos (${filas} = ${chip.n})`);
  }

  /* Deshacer el corte: el movimiento vuelve a la caja y el chip vuelve a
     contarlo. Si el enganche borrado siguiera bloqueando —el índice único no
     fuera parcial—, ese dinero se quedaría fuera de la caja para siempre. */
  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos", { timeout: 10000 });
  await pg.locator(".md-seg-tipo button", { hasText: "Depositados" }).click();
  await pg.waitForTimeout(500);
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(500);
  await pg.locator(".dep-det-acciones .ios-bar-button").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-menu-item", { hasText: "Reabrir" }).click();
  await pg.waitForTimeout(900);
  await pg.locator(".md-seg-tipo button", { hasText: "Pendientes" }).click();
  await pg.waitForTimeout(500);
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(500);
  await pg.locator(".dep-carta-accion .btn.secondary", { hasText: "Deshacer" }).click();
  await pg.waitForTimeout(900);

  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-movimientos .md-fila", { timeout: 10000 });
  await pg.waitForTimeout(500);
  const despues = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".md-chips .chip, .md-filtros .chip")]
      .find((x) => /sin depositar/i.test(x.textContent));
    return b ? Number(b.querySelector(".count")?.textContent ?? "0") : 0;
  });
  chk(despues === antesDeDeshacer + 1,
    `deshecho el corte, su movimiento vuelve a la caja (${antesDeDeshacer} → ${despues})`);
  await ctxD.close();
}

/* ---------- 29. Dos textos que respiraban mal (24 ago 2026) ----------
   Los dos vienen de fotos de Iván en el iPad:

    - **Agenda**, panel sin día abierto: "Elige un día" nacía pegado al filo
      izquierdo de la columna. La columna del día lleva `padding: 0` a
      propósito —su contenido (`.ag-dia`) pone el suyo—, pero el estado VACÍO
      no ponía ninguno, así que se quedaba sin aire.
    - **Informes de membresía**: la fila de chips ("Ausencias consecutivas",
      "Información incompleta") caía encima de la fila de selectores.

   Los dos se miden contra su contenedor, no contra un literal: lo que hay que
   garantizar es que hay hueco, no que el hueco valga 20. */
console.log("\n== Los textos con su aire ==");
{
  const ctxA = await nuevoContexto("ipad");
  const pg = await ctxA.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });

  await pg.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-agenda .md-detalle", { timeout: 10000 });
  const ag = await pg.evaluate(() => {
    const panel = document.querySelector(".md-agenda .md-detalle");
    const h3 = panel?.querySelector(".md-vacio-hint h3");
    const p = panel?.querySelector(".md-vacio-hint p");
    if (!panel || !h3 || !p) return null;
    const rp = panel.getBoundingClientRect();
    return {
      izq: Math.round(h3.getBoundingClientRect().left - rp.left),
      arriba: Math.round(h3.getBoundingClientRect().top - rp.top),
      der: Math.round(rp.right - p.getBoundingClientRect().right),
    };
  });
  chk(!!ag, "Agenda: el panel enseña \"Elige un día\"");
  if (ag) {
    chk(ag.izq >= 16, `Agenda: el texto despega del filo izquierdo (${ag.izq}px)`);
    chk(ag.der >= 16, `Agenda: y del derecho (${ag.der}px)`);
    chk(ag.arriba >= 16, `Agenda: y de la cabecera (${ag.arriba}px)`);
  }

  await pg.goto(`${URL_BASE}/#/reporte-miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".inf-item", { timeout: 10000 });
  await pg.locator(".inf-item", { hasText: "Registro de miembros" }).first().click();
  await pg.waitForTimeout(600);
  const inf = await pg.evaluate(() => {
    const fila = document.querySelector(".inf-cuerpo .tx-head");
    if (!fila) return null;
    const selects = [...fila.querySelectorAll("select")];
    const chips = [...fila.querySelectorAll(".chip")];
    if (!selects.length || !chips.length) return null;
    const abajoSelects = Math.max(...selects.map((e) => e.getBoundingClientRect().bottom));
    const arribaChips = Math.min(...chips.map((e) => e.getBoundingClientRect().top));
    /* Cuántos RENGLONES hay de verdad y a qué distancia quedan. Medir "los
       chips contra los selectores" no valía: con este ancho el último
       selector se va abajo CON los chips, así que la fila no se parte en
       "selectores arriba, chips abajo" y la resta salía negativa sin que
       nada estuviera mal. Lo que sí es cierto pase lo que pase: dos piezas de
       renglones distintos no pueden quedar a menos de 10px. */
    const piezas = [...fila.children].map((e) => e.getBoundingClientRect());
    const renglones = [];
    for (const r of piezas) {
      const y = Math.round(r.top);
      const g = renglones.find((x) => Math.abs(x.top - y) <= 6);
      if (g) g.bottom = Math.max(g.bottom, r.bottom);
      else renglones.push({ top: y, bottom: r.bottom });
    }
    renglones.sort((a, b) => a.top - b.top);
    let peor = Infinity;
    for (let i = 1; i < renglones.length; i++) {
      peor = Math.min(peor, Math.round(renglones[i].top - renglones[i - 1].bottom));
    }
    return {
      alto: Math.round(chips[0].getBoundingClientRect().height),
      rowGap: parseFloat(getComputedStyle(fila).rowGap) || 0,
      renglones: renglones.length,
      peor: renglones.length > 1 ? peor : null,
      n: chips.length,
      _sinUsar: [abajoSelects, arribaChips],
    };
  });
  chk(!!inf, "Informes: la fila de filtros tiene selectores y chips");
  if (inf) {
    chk(inf.rowGap >= 12, `Informes: la fila de filtros separa sus renglones (row-gap ${inf.rowGap}px)`);
    if (inf.renglones > 1) {
      chk(inf.peor >= 10, `Informes: y ninguno se pega al de arriba (${inf.peor}px en ${inf.renglones} renglones)`);
    }
    /* Un chip de 29px es un objetivo táctil fallado, y era la mitad de por
       qué la fila se leía apretada: no era solo el hueco. */
    chk(inf.alto >= 32, `Informes: y con alto de dedo (${inf.alto}px, ${inf.n} chips)`);
  }
  const DIR = process.env.CAPTURAS || "";
  if (DIR) await pg.screenshot({ path: `${DIR}/informes-filtros.png` });
  await ctxA.close();
}

/* ---------- 30. "Registrado por": quién tecleó la cifra (migración 39) ----
   Decidido con Iván el 24 ago: la administradora invita a la tesorera, cada
   una entra con SU cuenta, y lo pone la app sola con quien tiene la sesión
   abierta. Si un día cubre el administrador porque la tesorera está enferma,
   el registro dice su nombre — que es justo lo que lo hace valer.

   Se comprueban las DOS ramas, porque la mitad del valor está en la segunda:
   con sesión, el nombre y el rol salen; sin sesión, **no se pinta nada**. Un
   hueco con nombre de nadie sería un rastro de auditoría falso, y eso es peor
   que no tener ninguno. */
console.log("\n== Registrado por: con sesión y sin ella ==");
{
  const ctxR = await nuevoContexto("ipad");
  const pg = await ctxR.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-movimientos .md-fila", { timeout: 10000 });

  /** Abre la fila que dice `texto` y devuelve la línea de "Registrado por". */
  const abrir = async (texto) => {
    await pg.locator(".md-movimientos .md-fila", { hasText: texto }).first().click();
    await pg.waitForTimeout(400);
    return pg.evaluate(() => {
      const el = document.querySelector(".dm-registrado");
      return el ? el.textContent.trim() : null;
    });
  };

  const conSesion = await abrir("Ofrenda con firma");
  chk(!!conSesion, `con sesión, el movimiento dice quién lo registró (${conSesion})`);
  if (conSesion) {
    chk(/Rosa Elena Vega/.test(conSesion), `con su nombre (${conSesion})`);
    /* Y con su ROL, que es la otra mitad: "Rosa Elena Vega · tesorera". El rol
       se guarda como instantánea, así que sigue diciendo la verdad aunque esa
       persona cambie de puesto después. */
    chk(/Tesorero|tesorer/i.test(conSesion), `y con su rol (${conSesion})`);
  }

  const sinSesion = await abrir("Diezmo");
  chk(sinSesion === null,
    `sin sesión no se pinta nada, ni un hueco (${sinSesion ?? "nada"})`);

  const DIR = process.env.CAPTURAS || "";
  if (DIR) await pg.screenshot({ path: `${DIR}/registrado-por.png` });
  await ctxR.close();
}

/* ---------- 31. "Ocultar montos al bloquear", con motor (24 ago 2026) ----
   Era uno de los controles que se pintaron apagados. Ahora tapa el contenido
   cuando la app se va a segundo plano, para que la instantánea que iOS pone
   en el selector de aplicaciones no enseñe la contabilidad.

   Lo que se comprueba es lo que puede fallar de verdad: que **ninguna cifra
   se salga**. Se buscan todos los textos que parecen dinero y se exige que
   cada uno esté dentro de algo difuminado. Una lista de selectores de "clases
   de monto" se habría quedado corta —hay más de veinte repartidas por la
   app— y quedarse corto aquí es enseñar justo lo que se prometió tapar. */
console.log("\n== Ocultar montos al bloquear ==");
{
  const ctxP = await nuevoContexto("ipad");
  const pg = await ctxP.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-movimientos .md-fila", { timeout: 10000 });

  /** ¿Cuántos textos con pinta de dinero hay, y cuántos quedan sin tapar? */
  const medir = () => pg.evaluate(() => {
    const tapado = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const f = getComputedStyle(e).filter;
        if (f && f !== "none" && /blur/.test(f)) return true;
      }
      return false;
    };
    const dinero = [...document.querySelectorAll("body *")].filter((e) => {
      if (e.children.length > 0) return false;              // solo hojas
      const t = (e.textContent || "").trim();
      return /^[-−+]?\$[\d,]+\.\d{2}$/.test(t);          // "$1,200.00"
    });
    return {
      total: dinero.length,
      sueltos: dinero.filter((e) => !tapado(e)).length,
      privado: document.documentElement.getAttribute("data-privado"),
    };
  });

  const antes = await medir();
  chk(antes.total > 0, `hay cifras que tapar (${antes.total})`);
  chk(antes.sueltos === antes.total, "con la app delante se ven todas, como debe ser");

  // Encender la preferencia y mandar la app a segundo plano.
  await pg.evaluate(async () => {
    const p = await import("/src/privacidad.ts");
    p.setOcultarMontos(true);
  });
  await pg.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pg.waitForTimeout(300);

  const durante = await medir();
  chk(durante.privado === "1", `la app se marca como tapada (${durante.privado})`);
  chk(durante.sueltos === 0,
    `y NINGUNA cifra se queda a la vista (${durante.sueltos} de ${durante.total} sueltas)`);

  // Volver al frente destapa.
  await pg.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pg.waitForTimeout(300);
  const despues = await medir();
  chk(despues.privado === null, "y al volver al frente se destapa");
  chk(despues.sueltos === despues.total, `con sus cifras otra vez (${despues.total})`);

  /* Y con la preferencia APAGADA no tapa nada: es un ajuste, no una imposición. */
  await pg.evaluate(async () => {
    const p = await import("/src/privacidad.ts");
    p.setOcultarMontos(false);
  });
  await pg.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pg.waitForTimeout(300);
  const apagada = await medir();
  chk(apagada.privado === null, "con la preferencia apagada no tapa nada");
  await ctxP.close();
}

/* ---------- 32. El ☰ abre y cierra la barra lateral ----------
   Lo preguntó Iván el 24 ago mientras decidíamos qué hacer con "Barra lateral
   siempre visible", y merecía una respuesta medida y no leída del código: en
   vertical la barra es un CAJÓN y el ☰ es su única entrada, así que si el
   botón se rompiera no habría forma de navegar. Apaisado y ancho, la barra
   está fija y el ☰ ni se pinta. */
console.log("\n== El ☰ abre la barra en vertical ==");
{
  const ctxH = await nuevoContexto("ipad");
  const pg = await ctxH.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });

  const estado = () => pg.evaluate(() => {
    const sb = document.querySelector(".sidebar");
    const ham = document.querySelector(".menu-hamburguesa");
    const r = sb.getBoundingClientRect();
    return {
      // Dentro de la pantalla = visible; empujada a la izquierda = escondida.
      visible: r.right > 1,
      x: Math.round(r.left),
      ancho: Math.round(r.width),
      hamVisible: ham ? getComputedStyle(ham).display !== "none" : false,
      telon: !!document.querySelector(".menu-telon"),
    };
  });

  // --- 13" en VERTICAL: cajón ---
  await pg.setViewportSize({ width: 1024, height: 1366 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const cerrado = await estado();
  chk(cerrado.hamVisible, "vertical: el ☰ está a la vista");
  chk(!cerrado.visible, `y la barra empieza escondida (x=${cerrado.x})`);

  await pg.click(".menu-hamburguesa");
  await pg.waitForTimeout(500);
  const abierto = await estado();
  chk(abierto.visible, `el ☰ la abre (x=${abierto.x}, ancho ${abierto.ancho})`);
  chk(abierto.telon, "y pone el telón para cerrarla tocando fuera");

  await pg.click(".menu-telon");
  await pg.waitForTimeout(500);
  const recerrado = await estado();
  chk(!recerrado.visible, `tocar fuera la vuelve a cerrar (x=${recerrado.x})`);

  // --- 13" APAISADO: fija, sin ☰ ---
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.waitForTimeout(500);
  const ancho = await estado();
  chk(ancho.visible && ancho.x === 0, `apaisado: la barra está fija (x=${ancho.x})`);
  chk(ancho.ancho === 318, `con sus 318 (${ancho.ancho})`);
  chk(!ancho.hamVisible, "y el ☰ ni se pinta, porque no hace falta");
  await ctxH.close();
}

/* ---------- 33. El testigo del acta, con motor (migración 41) ----------
   Era el renglón de firma que se imprimía en blanco porque `actas` solo
   conocía a quien preside y a quien redacta. Ahora tiene columna, campo en
   las dos formas de alta y sitio en el PDF.

   Se comprueban las dos caras, que es donde está el valor: con nombre se
   firma con él; SIN nombre el renglón sigue saliendo —en un acta, una raya
   sin nombre sigue sirviendo para firmar a mano, y hacerlo desaparecer
   habría sido perder algo que ya funcionaba. */
console.log("\n== El testigo del acta ==");
{
  const ctxT = await nuevoContexto("ipad");
  const pg = await ctxT.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/actas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });

  // Guardar un testigo desde el formulario de edición y ver que vuelve.
  await pg.locator(".md-actas .md-fila").first().click();
  await pg.waitForTimeout(500);
  const leer = () => pg.evaluate(() => {
    const f = [...document.querySelectorAll(".da-firma")].find(
      (x) => /testigo|witness/i.test(x.querySelector(".da-firma-cargo")?.textContent ?? ""));
    if (!f) return null;
    return {
      nombre: (f.querySelector(".da-firma-nombre")?.textContent ?? "").trim(),
      enBlanco: f.classList.contains("da-firma--enblanco"),
      raya: getComputedStyle(f.querySelector(".da-firma-raya")).borderTopStyle,
    };
  });

  const vacio = await leer();
  chk(!!vacio, "el acta trae su renglón de testigo");
  if (vacio) {
    chk(vacio.enBlanco && vacio.nombre === "", "sin nombre, sale en blanco");
    chk(vacio.raya === "dashed", `con la raya discontinua (${vacio.raya})`);
  }

  /* Escribirlo por la vía real: el mismo `updateActa` que usa el formulario,
     para que lo que se comprueba sea el camino que recorre un usuario y no
     un INSERT de laboratorio. */
  await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const actas = await db.listActas(ig.id);
    const a = actas[0];
    await db.updateActa(a.id, ig.id, {
      tipo: a.tipo, titulo: a.titulo, fecha: a.fecha,
      hora_inicio: a.hora_inicio, hora_cierre: a.hora_cierre, lugar: a.lugar,
      preside: a.preside, secretario: a.secretario, testigo: "Jorge Hernández",
      presentes: JSON.parse(a.presentes), ausentes: JSON.parse(a.ausentes),
      invitados: JSON.parse(a.invitados), quorum: a.quorum === 1,
      agenda: a.agenda, resumen: a.resumen,
      mociones: JSON.parse(a.mociones), acuerdos: JSON.parse(a.acuerdos),
      estado: a.estado, confidencial: a.confidencial, fecha_aprobacion: a.fecha_aprobacion,
    });
  });
  await pg.reload({ waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });
  await pg.locator(".md-actas .md-fila").first().click();
  await pg.waitForTimeout(600);

  const conNombre = await leer();
  chk(conNombre?.nombre === "Jorge Hernández",
    `guardado el testigo, se firma con su nombre (${conNombre?.nombre})`);
  chk(conNombre?.enBlanco === false, "y la raya deja de ser la de 'sin firmar'");
  await ctxT.close();
}

/* ---------- 34. ⌃⌘S y el botón de esconder la barra son solo del Mac ----------
   Lo dijo Iván el 24 ago sin rodeos: "eso es solo exclusivo de la Mac". Y es
   la decisión correcta por una razón de forma, no de gusto: en el Mac la barra
   lateral es una COLUMNA fija que se puede plegar para ganar ancho; en el iPad
   en vertical ya es un cajón que el ☰ abre y cierra, y apaisado es la única
   navegación que hay. Un segundo control para esconderla sería o redundante o
   una trampa —dejar al usuario sin forma de volver.

   El código ya lo hacía bien cuando se escribió esta guarda; no se cambió
   nada. Lo que se comprueba es que siga siendo así, porque son TRES sitios
   distintos los que tendrían que fallar a la vez y ninguno se ve desde el
   otro: el botón (`.btn-sidebar`, escondido salvo `:root.mac`), el atajo de
   teclado (`esMac()` en App.tsx) y las reglas de plegado
   (`[data-sidebar-oculta]`, todas bajo `:root.mac`). Quitar el `:root.mac` de
   cualquiera de ellos en un refactor es fácil y no se nota mirando el Mac. */
console.log("\n== Esconder la barra: solo en el Mac ==");
{
  const ctxS = await nuevoContexto("ipad");
  const pg = await ctxS.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const medir = () => pg.evaluate(() => {
    const b = document.querySelector(".btn-sidebar");
    const sb = document.querySelector(".sidebar");
    const r = sb.getBoundingClientRect();
    return {
      hayBoton: !!b,
      botonVisible: b ? getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 0 : false,
      plegada: document.querySelector(".app").hasAttribute("data-sidebar-oculta"),
      barraX: Math.round(r.left),
      barraAncho: Math.round(r.width),
      guardado: localStorage.getItem("tamio-sidebar-oculta"),
    };
  });

  const antes = await medir();
  chk(antes.hayBoton, "el botón existe en el árbol (es el mismo App para las dos cáscaras)");
  chk(!antes.botonVisible, "pero en el iPad no se pinta");
  chk(antes.barraAncho === 318 && antes.barraX === 0,
    `y la barra está entera en su sitio (x=${antes.barraX}, ancho ${antes.barraAncho})`);

  // El atajo, tecleado de verdad: Control+Meta+S es lo que escucha App.tsx.
  await pg.keyboard.down("Control");
  await pg.keyboard.down("Meta");
  await pg.keyboard.press("s");
  await pg.keyboard.up("Meta");
  await pg.keyboard.up("Control");
  await pg.waitForTimeout(400);

  const tras = await medir();
  chk(!tras.plegada, "⌃⌘S no pliega nada en el iPad");
  chk(tras.barraAncho === 318 && tras.barraX === 0,
    `la barra ni se entera (x=${tras.barraX}, ancho ${tras.barraAncho})`);
  chk(tras.guardado !== "1", `y no se guarda la preferencia (${tras.guardado})`);

  /* La tercera cerradura, la estructural: aunque alguien lograra encender el
     atributo —un `localStorage` heredado de una sesión de Mac, un refactor que
     se lleve el `esMac()`—, las reglas de plegado son `:root.mac` y en el iPad
     no aplican. La barra se queda puesta. */
  await pg.evaluate(() => document.querySelector(".app").setAttribute("data-sidebar-oculta", "true"));
  await pg.waitForTimeout(300);
  const forzado = await medir();
  chk(forzado.barraAncho === 318 && forzado.barraX === 0,
    `forzando el atributo a mano, la barra sigue puesta (x=${forzado.barraX}, ancho ${forzado.barraAncho})`);
  chk(!forzado.botonVisible, "y el botón sigue sin pintarse");
  await ctxS.close();

  // El iPhone, de paso: ahí la barra es el cajón del ☰ y menos aún hay que plegar.
  const ctxF = await nuevoContexto("iphone");
  const pf = await ctxF.newPage();
  pf.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pf.setViewportSize({ width: 430, height: 932 });
  await pf.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pf.waitForTimeout(600);
  const enFono = await pf.evaluate(() => {
    const b = document.querySelector(".btn-sidebar");
    return b ? getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 0 : false;
  });
  chk(!enFono, "en el iPhone tampoco se pinta");
  await ctxF.close();
}

/* ---------- 35. Nacimiento, dirección y estado civil, con motor (mig. 42) ----
   Eran las tres filas grises de la ficha —`filaSinMotor`, "Sin capturar
   todavía"— desde que se dibujó el maestro-detalle. Iván las dejó así a
   propósito ("déjalo construida la plantilla y después se le pone motor"), y
   este es el después.

   La comprobación importante NO es que los campos existan: es que se puedan
   llenar DESPUÉS del alta. Es la trampa concreta de esta ficha y ya mordió una
   vez: los datos personales del formulario (nombre, correo, ID fiscal, notas)
   viven en `NewMember`, que solo se escribe al crear, así que un campo puesto
   ahí solo se podría llenar el día del registro —justo el día en que menos se
   sabe de una persona—. Los tres se metieron en `MemberFicha`, que es lo que
   `updateMemberFicha` escribe también al editar, y por eso la pantalla "Datos
   de la persona" sale en los dos modos.

   Así que el recorrido es el de un usuario entero: abrir un miembro que YA
   existe, escribir los tres por la interfaz —fecha, selector y pantalla de
   texto—, guardar, recargar, y encontrarlos en las dos fichas que los pintan
   (Aportantes y Membresía). Si alguno se cayera del `UPDATE`, se vería aquí. */
console.log("\n== Los tres datos personales del miembro ==");
{
  const ctxD = await nuevoContexto("ipad");
  const pg = await ctxD.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".mb-fila", { timeout: 10000 });
  await pg.locator(".mb-fila").first().click();
  await pg.waitForTimeout(400);
  const quien = await pg.locator(".mb-cab-nombre").first().textContent().catch(() => null);
  await pg.locator(".mb-cab-acciones .btn.primary").click();
  await pg.waitForTimeout(600);

  const enHoja = await pg.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet.nm-hoja");
    return hoja ? [...hoja.querySelectorAll(".ios-field-label")].map((n) => n.textContent.trim()) : [];
  });
  chk(enHoja.includes("Datos de la persona"),
    "editando un miembro que ya existe, la pantalla de datos personales está ahí");

  await pg.locator(".ios-sheet .ios-field--link", { hasText: "Datos de la persona" }).first().click();
  await pg.waitForTimeout(500);

  const dentro = await pg.evaluate(() => {
    const p = [...document.querySelectorAll(".ios-sheet")].pop();
    return {
      etiquetas: [...p.querySelectorAll(".ios-field-label")].map((n) => n.textContent.trim()),
      // Sin valor, el estado civil dice "Sin especificar" y no "Soltero(a)":
      // una ficha vacía no debe inventar el dato más común.
      civil: [...p.querySelectorAll(".ios-field")]
        .find((f) => f.querySelector(".ios-field-label")?.textContent.includes("Estado civil"))
        ?.querySelector(".ios-field-value")?.textContent.trim(),
    };
  });
  chk(dentro.etiquetas.includes("Nacimiento") && dentro.etiquetas.includes("Dirección")
    && dentro.etiquetas.includes("Estado civil"),
    `con los tres campos dentro (${dentro.etiquetas.join(" · ")})`);
  chk(dentro.civil === "Sin especificar",
    `y el estado civil arranca sin inventarse nada (${dentro.civil})`);

  // --- Escribirlos por la interfaz, los tres de la forma que le toca ---
  await pg.locator(".ios-sheet").last().locator('input[type="date"]').fill("1985-03-14");

  await pg.locator(".ios-sheet").last().locator(".ios-field--link", { hasText: "Estado civil" }).click();
  await pg.waitForTimeout(400);
  await pg.locator(".action-sheet-opcion", { hasText: "Casado" }).first().click();
  await pg.waitForTimeout(400);

  await pg.locator(".ios-sheet").last().locator(".ios-field", { hasText: "Dirección" }).first().click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-texto-campo").fill("Av. Juárez 120, Centro, Puebla");
  await pg.locator(".ios-sheet").last().locator(".ios-nav-action").click();
  await pg.waitForTimeout(400);

  const escrito = await pg.evaluate(() => {
    const p = [...document.querySelectorAll(".ios-sheet")].pop();
    const val = (et) => [...p.querySelectorAll(".ios-field")]
      .find((f) => f.querySelector(".ios-field-label")?.textContent.includes(et))
      ?.querySelector(".ios-field-value, input")?.value
      ?? [...p.querySelectorAll(".ios-field")]
        .find((f) => f.querySelector(".ios-field-label")?.textContent.includes(et))
        ?.querySelector(".ios-field-value")?.textContent.trim();
    return { civil: val("Estado civil"), dir: val("Dirección") };
  });
  chk(escrito.civil === "Casado(a)", `el selector deja el estado civil puesto (${escrito.civil})`);
  chk((escrito.dir ?? "").includes("Juárez"), `y la pantalla de texto la dirección (${escrito.dir})`);

  // Volver a la hoja y guardar.
  await pg.locator(".ios-sheet").last().locator(".ios-back").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(800);

  /* Recargar de verdad, no releer el estado de React: lo que se comprueba es
     que los tres llegaron a `members`, no que el formulario los recuerda. */
  await pg.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-miembros .md-fila", { timeout: 10000 });
  await pg.locator(".md-miembros .md-fila", { hasText: quien ?? "" }).first().click();
  await pg.waitForTimeout(600);

  const ficha = await pg.evaluate(() => {
    const campos = [...document.querySelectorAll(".dm-ficha .dm-campo")].map((c) => ({
      et: c.querySelector(".dm-campo-etiqueta")?.textContent.trim(),
      v: c.querySelector(".dm-campo-valor")?.textContent.trim(),
      gris: c.classList.contains("dm-campo--sinmotor"),
    }));
    return {
      campos,
      grises: campos.filter((c) => c.gris).length,
      sinCapturar: campos.filter((c) => /Sin capturar/i.test(c.v ?? "")).length,
    };
  });
  const dato = (et) => ficha.campos.find((c) => c.et === et)?.v;
  chk(dato("Dirección") === "Av. Juárez 120, Centro, Puebla",
    `la ficha de Aportantes trae la dirección (${dato("Dirección")})`);
  chk(dato("Estado civil") === "Casado(a)", `y el estado civil traducido (${dato("Estado civil")})`);
  chk(!!dato("Nacimiento") && /1985/.test(dato("Nacimiento")),
    `y la fecha de nacimiento (${dato("Nacimiento")})`);
  /* La otra mitad del cambio: `filaSinMotor` se retiró. Que no quede ninguna
     fila gris es lo que prueba que estos tres dejaron de ser una plantilla —y
     que no se coló una cuarta por el camino. */
  chk(ficha.grises === 0 && ficha.sinCapturar === 0,
    `y no queda ninguna fila "sin capturar" en la ficha (${ficha.grises} grises)`);

  // Y en Membresía, que es la otra ficha que los pinta.
  await pg.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".mb-fila", { timeout: 10000 });
  await pg.locator(".mb-fila", { hasText: quien ?? "" }).first().click();
  await pg.waitForTimeout(600);
  const mb = await pg.evaluate(() => {
    const out = {};
    for (const d of document.querySelectorAll(".mb-dato")) {
      out[d.querySelector(".mb-dato-k")?.textContent.trim()] = d.querySelector(".mb-dato-v")?.textContent.trim();
    }
    return out;
  });
  chk(mb["Dirección"] === "Av. Juárez 120, Centro, Puebla",
    `Membresía también los pinta (${mb["Dirección"]})`);
  chk(mb["Estado civil"] === "Casado(a)" && /1985/.test(mb["Nacimiento"] ?? ""),
    `con los otros dos (${mb["Estado civil"]} · ${mb["Nacimiento"]})`);

  /* El expediente NO se toca: `camposFaltantes` marca lo OBLIGATORIO, y meter
     la dirección ahí habría dejado el padrón entero en rojo por un campo que
     nadie pudo llenar nunca hasta hoy. */
  const exp = await pg.evaluate(() =>
    [...document.querySelectorAll(".mb-exp-campo")].map((n) => n.textContent.trim()));
  chk(!exp.some((e) => /Direcci/i.test(e)),
    `y el expediente sigue con sus cuatro requisitos, sin la dirección (${exp.length} renglones)`);
  await ctxD.close();
}

/* ---------- 36. El roster por puestos y el orden del culto ----------
   Los dos huecos grandes que quedaban del handoff, cableados con la
   migración 43. Lo que se comprueba no es que los botones existan —eso ya lo
   hacía la sección 22— sino que lo que se asigna LLEGA A LA BASE: se escribe
   por la interfaz, se recarga la página de verdad y se busca allí. Un estado
   de React que recuerda lo que acabas de teclear no prueba nada.

   La guarda se probó al revés antes de darla por buena: con `asignarPuesto`
   devolviendo sin escribir, las tres comprobaciones de después de recargar
   salen en rojo. */
console.log("\n== El roster por puestos y el orden del culto ==");
{
  const ctxR = await nuevoContexto("ipad");
  const pg = await ctxR.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/servicios`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-servicios .md-fila", { timeout: 10000 });
  await pg.locator(".md-servicios .md-fila").first().click();
  await pg.waitForTimeout(500);

  /* Los seis renglones del handoff, en su orden. Predicación y Dirección
     salen de las columnas del servicio y NO llevan botón: se escriben en el
     formulario del culto, que es de donde salen impresas. */
  const filas = await pg.evaluate(() => [...document.querySelectorAll(".sv-roster .sv-puesto")]
    .map((f) => ({
      rol: f.querySelector(".sv-puesto-rol")?.textContent.trim(),
      boton: !!f.querySelector(".sv-puesto-asignar"),
    })));
  const roles = filas.map((f) => f.rol);
  chk(roles.slice(0, 6).join("·") === "Predicación·Dirección·Alabanza·Ujieres·Ofrenda·Sonido",
    `los seis puestos, en el orden del handoff (${roles.slice(0, 6).join(" · ")})`);
  chk(filas.filter((f) => f.boton).length === 4,
    "y solo los cuatro de tabla llevan botón: los otros dos se escriben en el formulario");

  // --- Asignar Alabanza eligiendo a alguien del padrón ---
  await pg.locator(".sv-puesto", { hasText: "Alabanza" }).locator(".sv-puesto-asignar").click();
  await pg.waitForTimeout(400);
  const hoja = await pg.evaluate(() => {
    const h = document.querySelector(".ios-sheet");
    return h ? { titulo: h.getAttribute("aria-label"), opciones: h.querySelectorAll(".ios-buscador-fila").length } : null;
  });
  chk(!!hoja && /Alabanza/.test(hoja.titulo ?? ""),
    `la hoja se abre diciendo qué puesto se asigna (${hoja?.titulo})`);
  await pg.locator(".ios-sheet").getByText("Ana Martínez").first().click();
  await pg.waitForTimeout(600);
  const puesto = await pg.evaluate(() => {
    const f = [...document.querySelectorAll(".sv-puesto")]
      .find((x) => /Alabanza/.test(x.querySelector(".sv-puesto-rol")?.textContent ?? ""));
    return {
      nombre: f?.querySelector(".sv-puesto-nombre")?.textContent.trim(),
      iniciales: f?.querySelector(".sv-puesto-avatar")?.textContent.trim(),
      boton: f?.querySelector(".sv-puesto-asignar")?.textContent.trim(),
    };
  });
  chk(puesto.nombre === "Ana Martínez", `queda puesta en el renglón (${puesto.nombre})`);
  chk(puesto.iniciales === "AM", `con su círculo de iniciales (${puesto.iniciales})`);
  chk(puesto.boton === "Cambiar", `y el botón pasa a "Cambiar" (${puesto.boton})`);

  // --- Y a alguien que NO está en el padrón, escribiendo el nombre ---
  await pg.locator(".sv-puesto", { hasText: "Sonido" }).locator(".sv-puesto-asignar").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet input").first().fill("Beto el del sonido");
  await pg.waitForTimeout(300);
  await pg.locator(".ios-sheet").getByText(/Anotar a/).first().click();
  await pg.waitForTimeout(600);

  // --- Un paso del orden del culto ---
  const vacio = await pg.locator(".sv-orden .fm-vacio-titulo").count();
  chk(vacio === 1, "el orden del culto arranca vacío, con su invitación y no con un cartel de 'falta motor'");
  await pg.locator(".sv-orden-anadir").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet.nm-hoja input").first().fill("Bienvenida");
  await pg.locator('.ios-sheet.nm-hoja input[type="time"]').fill("10:00");
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(700);
  await pg.locator(".sv-orden-anadir").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet.nm-hoja input").first().fill("Ofrenda");
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(700);

  const pasos = await pg.evaluate(() => [...document.querySelectorAll(".sv-paso")].map((x) => ({
    hora: x.querySelector(".sv-paso-hora")?.textContent.trim(),
    titulo: x.querySelector(".sv-paso-titulo")?.textContent.trim(),
    sinHora: !!x.querySelector(".sv-paso-hora--sin"),
  })));
  chk(pasos.length === 2, `los dos pasos entran en la lista (${pasos.length})`);
  chk(pasos[0]?.hora === "10:00" && pasos[0]?.titulo === "Bienvenida",
    `el primero con su hora (${pasos[0]?.hora} · ${pasos[0]?.titulo})`);
  /* Un paso SIN hora no se cuela al principio ni desaparece: manda la
     posición, no el reloj. Es justo lo que rompería ordenar por `hora`. */
  chk(pasos[1]?.sinHora && pasos[1]?.titulo === "Ofrenda",
    `y el segundo sin hora se queda en su sitio (${pasos[1]?.titulo})`);

  // Subir el segundo: el orden lo manda la posición, y tiene que aguantar.
  await pg.locator(".sv-paso").nth(1).locator("button", { hasText: "↑" }).click();
  await pg.waitForTimeout(600);

  /* Recargar de verdad: lo que se comprueba es que todo llegó a la base. */
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(300);
  await pg.goto(`${URL_BASE}/#/servicios`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-servicios .md-fila", { timeout: 10000 });
  await pg.locator(".md-servicios .md-fila").first().click();
  await pg.waitForTimeout(600);

  const tras = await pg.evaluate(() => {
    const fila = (re) => [...document.querySelectorAll(".sv-puesto")]
      .find((x) => re.test(x.querySelector(".sv-puesto-rol")?.textContent ?? ""));
    const rol = (re) => fila(re)?.querySelector(".sv-puesto-nombre")?.textContent.trim();
    return {
      alabanza: rol(/Alabanza/),
      sonido: rol(/Sonido/),
      // Un puesto sin cubrir no lleva nombre NI "Sin asignar": lo dice su
      // propio botón, "Asignar encargado". Repetirlo al lado sería decir dos
      // veces lo mismo en un renglón de 58px.
      ujieres: fila(/Ujieres/)?.querySelector(".sv-puesto-asignar")?.textContent.trim(),
      ujieresNombre: rol(/Ujieres/) ?? null,
      pasos: [...document.querySelectorAll(".sv-paso-titulo")].map((x) => x.textContent.trim()),
    };
  });
  chk(tras.alabanza === "Ana Martínez", `tras recargar, Alabanza sigue asignada (${tras.alabanza})`);
  chk(tras.sonido === "Beto el del sonido",
    `y el nombre escrito a mano también (${tras.sonido})`);
  chk(tras.ujieres === "Asignar encargado" && tras.ujieresNombre === null,
    `los que nadie tocó siguen ofreciendo asignarlos (${tras.ujieres})`);
  chk(tras.pasos.join(" · ") === "Ofrenda · Bienvenida",
    `y el orden del culto conserva el que se le dio (${tras.pasos.join(" · ")})`);

  // --- Soltar un puesto: vuelve a "Sin asignar", no se queda pegado ---
  await pg.locator(".sv-puesto", { hasText: "Alabanza" }).locator(".sv-puesto-asignar").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet .ios-buscador-grupo").first().locator(".ios-field--link").click();
  await pg.waitForTimeout(700);
  const suelto = await pg.evaluate(() => {
    const f = [...document.querySelectorAll(".sv-puesto")]
      .find((x) => /Alabanza/.test(x.querySelector(".sv-puesto-rol")?.textContent ?? ""));
    return {
      nombre: f?.querySelector(".sv-puesto-nombre")?.textContent.trim() ?? null,
      boton: f?.querySelector(".sv-puesto-asignar")?.textContent.trim(),
    };
  });
  chk(suelto.nombre === null && suelto.boton === "Asignar encargado",
    `soltarlo vacía el renglón y el botón vuelve a ofrecerlo (${suelto.boton})`);

  /* Y se puede volver a asignar: el índice único es PARCIAL, solo sobre las
     filas vivas. Con un índice completo, la lápida del puesto soltado
     bloquearía la reasignación y esto fallaría con un error de la base — que
     fue exactamente la lección de la migración 40. */
  await pg.locator(".sv-puesto", { hasText: "Alabanza" }).locator(".sv-puesto-asignar").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet").getByText("Juan Pérez").first().click();
  await pg.waitForTimeout(700);
  const rey = await pg.evaluate(() => [...document.querySelectorAll(".sv-puesto")]
    .find((x) => /Alabanza/.test(x.querySelector(".sv-puesto-rol")?.textContent ?? ""))
    ?.querySelector(".sv-puesto-nombre")?.textContent.trim());
  chk(rey === "Juan Pérez", `y se puede reasignar sin chocar con la lápida (${rey})`);

  // --- Quitar un paso ---
  await pg.locator(".sv-paso").first().locator(".sv-paso-borrar").click();
  await pg.waitForTimeout(700);
  const quedan = await pg.locator(".sv-paso").count();
  chk(quedan === 1, `quitar un paso deja el otro (${quedan})`);
  if (process.env.CAPTURAS) {
    await pg.screenshot({ path: `${process.env.CAPTURAS}/servicios-roster-1366x1024.png` });
  }
  await ctxR.close();
}

/* ---------- 37. "Compartir" un depósito entrega un PDF de verdad ----------
   El botón estuvo apagado dos días con la explicación de que la app no tenía
   hoja de compartir. La tenía desde siempre (`openForPrint` → `entregarArchivo`
   → Web Share API); lo que faltaba era el documento. Esto comprueba las dos
   mitades a la vez: que el botón está vivo y que lo que sale por la hoja es un
   PDF con nombre de comprobante y peso de PDF de verdad.

   La hoja nativa no existe en un Chromium de escritorio, así que se suplanta
   `navigator.share` ANTES de cargar la página y se mira qué se le pasa. Es la
   única forma de ver el archivo sin un iPad delante.

   Probada al revés: quitando el `onClick` del botón, la espera del `share`
   agota su tiempo y las tres salen en rojo. */
console.log("\n== Compartir un depósito entrega un PDF ==");
{
  const ctxC = await nuevoContexto("ipad");
  const pg = await ctxC.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.addInitScript(() => {
    window.__compartido = null;
    /* Con `navigator.share = …` a secas NO basta, y costó un rato: este
       Chromium YA trae `share` en el prototipo, así que la asignación se
       pierde en silencio (script clásico, sin modo estricto) y lo que se
       llama es el nativo, que en un navegador sin escritorio no hace nada.
       `defineProperty` sobre la instancia sí lo tapa. */
    const propiedad = (nombre, valor) =>
      Object.defineProperty(navigator, nombre, { value: valor, configurable: true, writable: true });
    propiedad("canShare", () => true);
    propiedad("share", async (data) => {
      const f = data.files?.[0];
      window.__compartido = f
        ? { nombre: f.name, tipo: f.type, bytes: f.size }
        : { nombre: null, tipo: null, bytes: 0 };
    });
  });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos .md-fila", { timeout: 10000 });
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(500);
  await pg.locator(".dep-det-acciones button", { hasText: /Compartir|Share/ }).click();

  /* En un iPad, "Compartir" un PDF **abre primero el visor de la app** y la
     hoja nativa sale de su propio botón: iOS no tiene Vista Previa, así que
     `entregarArchivo` enseña el documento antes de repartirlo. Es lo que hace
     cada reporte desde siempre, y este comprobante no iba a ser la excepción.
     La guarda sigue ese camino entero en vez de fingir que hay un atajo. */
  await pg.waitForSelector(".visor-pdf-overlay", { timeout: 15000 })
    .catch(() => { /* lo dicen las comprobaciones de abajo */ });
  const visor = await pg.evaluate(() => {
    const v = document.querySelector(".visor-pdf-overlay");
    return v ? { nombre: v.querySelector(".visor-pdf-nombre")?.textContent?.trim() } : null;
  });
  chk(!!visor, "el comprobante se abre en el visor de la app, como cualquier otro PDF");
  chk(/^comprobante-|^deposito-/.test(visor?.nombre ?? ""),
    `con nombre de comprobante de depósito (${visor?.nombre})`);
  chk(/\.pdf$/.test(visor?.nombre ?? ""), `y extensión .pdf (${visor?.nombre})`);

  // Y de ahí, la hoja nativa.
  await pg.locator(".visor-pdf-barra .btn.primary").click();
  await pg.waitForFunction(() => window.__compartido !== null, null, { timeout: 15000 })
    .catch(() => { /* idem */ });
  const salida = await pg.evaluate(() => window.__compartido);
  chk(!!salida, "y su botón entrega el archivo a la hoja del sistema");
  chk(salida?.tipo === "application/pdf", `con su tipo MIME (${salida?.tipo})`);
  /* Un PDF con membrete, tabla y bloque de firmas no baja de unos pocos KB.
     El umbral es flojo a propósito: lo que caza es el archivo vacío. */
  chk((salida?.bytes ?? 0) > 1500, `y peso de documento, no de archivo vacío (${salida?.bytes} bytes)`);
  await ctxC.close();
}

/* ---------- 38. Recopilar las firmas del acta ----------
   El botón llevaba desde el handoff 1 apagado: el acta sabía QUIÉNES firman
   pero no si habían firmado. Con la migración 44 (`actas.firmas`) recoge la
   constancia —firmó y en qué fecha—, y eso es lo que se comprueba aquí de
   punta a punta: se marca por la interfaz, se RECARGA y se busca en la ficha.

   Probada al revés: con `guardarFirmasActa` devolviendo sin escribir, las
   dos comprobaciones de después de recargar salen en rojo. */
console.log("\n== Recopilar las firmas del acta ==");
{
  const ctxF = await nuevoContexto("ipad");
  const pg = await ctxF.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/actas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });
  await pg.locator(".md-actas .md-fila").first().click();
  await pg.waitForTimeout(500);

  /* Antes de firmar: los renglones existen y ninguno lleva pie de fecha. */
  const antes = await pg.evaluate(() => ({
    renglones: document.querySelectorAll(".da-firmas .da-firma").length,
    fechas: document.querySelectorAll(".da-firma-fecha").length,
  }));
  chk(antes.renglones >= 2, `el acta trae sus renglones de firma (${antes.renglones})`);
  chk(antes.fechas === 0, `y ninguno dice todavía que se firmó (${antes.fechas})`);

  await pg.locator(".ac-barra .chip", { hasText: /firma|Sign/i }).first().click();
  await pg.waitForTimeout(500);
  const hoja = await pg.evaluate(() => {
    const h = document.querySelector(".ios-sheet.nm-hoja");
    return h ? {
      secciones: h.querySelectorAll(".ios-section").length,
      insignias: h.querySelectorAll(".ios-insignia").length,
      // La hoja dice con todas las letras que esto NO es una firma digital.
      aviso: (h.querySelector(".nm-aviso")?.textContent ?? "").length,
    } : null;
  });
  chk(!!hoja && hoja.secciones >= 2,
    `la hoja lista un firmante por renglón con nombre (${hoja?.secciones})`);
  chk((hoja?.aviso ?? 0) > 40, "y explica que recoge una constancia, no una firma digital");

  // Marcar la primera como firmada y confirmar con "Listo".
  await pg.locator(".ios-sheet.nm-hoja .ios-field--action").first().click();
  await pg.waitForTimeout(300);
  const conFecha = await pg.locator('.ios-sheet.nm-hoja input[type="date"]').count();
  chk(conFecha === 1, `al marcarla aparece su fecha, ya propuesta (${conFecha})`);
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(800);

  /* Recargar de verdad: lo que se comprueba es que llegó a `actas.firmas`. */
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(300);
  await pg.goto(`${URL_BASE}/#/actas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-actas .md-fila", { timeout: 10000 });
  await pg.locator(".md-actas .md-fila").first().click();
  await pg.waitForTimeout(600);

  const tras = await pg.evaluate(() => ({
    fechas: [...document.querySelectorAll(".da-firma-fecha")].map((x) => x.textContent.trim()),
    boton: [...document.querySelectorAll(".ac-barra .chip")]
      .find((x) => /firma|Sign|1 de|1 of/i.test(x.textContent ?? ""))?.textContent.trim(),
  }));
  chk(tras.fechas.length === 1, `tras recargar, un renglón dice que se firmó (${tras.fechas.length})`);
  chk(/Firmó el|Signed on/.test(tras.fechas[0] ?? ""),
    `con su fecha bajo el cargo (${tras.fechas[0]})`);
  /* Y el botón deja de invitar a recoger para decir cuántas van: la barra
     del acta enseña el avance sin abrir nada. */
  chk(/\d+ de \d+|\d+ of \d+/.test(tras.boton ?? ""),
    `y el botón lleva la cuenta (${tras.boton})`);
  await ctxF.close();
}

/* ---------- 39. Los dos avisos de tesorería, ajustables de verdad ----------
   La trampa de un interruptor con motor es que se mueva y no cambie nada.
   Esto no comprueba que el interruptor se pinte —eso ya lo hace la sección
   22— sino que apagarlo APAGA la alerta en Por revisar, que es lo único que
   el control promete.

   Probada al revés: dejando `calcularAlertas` sin mirar `avisarDuplicados`,
   la comprobación de después de apagarlo sale en rojo. */
console.log("\n== Los dos avisos de tesorería cambian lo que sale en Por revisar ==");
{
  const ctxT = await nuevoContexto("ipad");
  const pg = await ctxT.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });

  /** Cuántas alertas de ese tipo enseña Por revisar ahora mismo. */
  const cuantas = async (tipo) => {
    await pg.goto(`${URL_BASE}/#/bandeja`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".md-bandeja", { timeout: 10000 });
    await pg.waitForTimeout(500);
    return pg.evaluate((t) => {
      const chip = [...document.querySelectorAll(".al-chips .chip")]
        .find((c) => new RegExp(t, "i").test(c.textContent ?? ""));
      if (!chip) return 0;
      const n = (chip.textContent ?? "").match(/\d+/);
      return n ? Number(n[0]) : 0;
    }, tipo);
  };

  const dupAntes = await cuantas("duplicad");
  const compAntes = await cuantas("comprobante|receipt");
  chk(dupAntes > 0, `los datos de prueba traen duplicados que avisar (${dupAntes})`);
  chk(compAntes > 0, `y gastos sin comprobante por encima del umbral (${compAntes})`);

  /** Ir a Configuración → Iglesia y devolver el grupo de tesorería. */
  const irAIglesia = async () => {
    await pg.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".settings-nav-item", { timeout: 10000 });
    const zonas = await pg.$$eval(".settings-nav-item", (ns) => ns.map((n) => n.textContent.trim()));
    const i = zonas.findIndex((z) => /Iglesia|Church/i.test(z));
    await pg.locator(".settings-nav-item").nth(i).click();
    await pg.waitForTimeout(500);
  };

  // --- Apagar el aviso de duplicados ---
  await irAIglesia();
  await pg.locator(".ios-field", { hasText: /duplicad/i }).locator('[role="switch"]').click();
  // El guardado es automático y con retardo: hay que dejarlo escribir.
  await pg.waitForTimeout(1800);
  const dupDespues = await cuantas("duplicad");
  chk(dupDespues === 0, `apagarlo quita las alertas de duplicado (${dupAntes} → ${dupDespues})`);

  /* --- Subir el umbral por encima del gasto más caro de la siembra ---
     El campo solo existe con el aviso encendido, que es lo que hace que un
     umbral no pueda quedarse describiendo un aviso apagado. */
  await irAIglesia();
  const hayCampo = await pg.locator(".ios-field", { hasText: /^Desde|^Over/ }).count();
  chk(hayCampo === 1, `el umbral tiene campo propio mientras el aviso está encendido (${hayCampo})`);
  await pg.locator(".ios-field", { hasText: /^Desde|^Over/ }).locator("input").fill("99999");
  await pg.waitForTimeout(1800);
  const compDespues = await cuantas("comprobante|receipt");
  chk(compDespues === 0,
    `subir el umbral a 99.999 deja de señalar los gastos de siempre (${compAntes} → ${compDespues})`);

  /* Y al revés: bajarlo los devuelve. Un ajuste que solo sabe apagar cosas
     no es un ajuste, es un interruptor de un solo sentido. */
  await irAIglesia();
  await pg.locator(".ios-field", { hasText: /^Desde|^Over/ }).locator("input").fill("1");
  await pg.waitForTimeout(1800);
  const compVuelta = await cuantas("comprobante|receipt");
  chk(compVuelta > 0, `y bajarlo a 1 los devuelve (${compVuelta})`);

  // Con el aviso apagado, el campo del umbral desaparece: no describe nada.
  await irAIglesia();
  await pg.locator(".ios-field", { hasText: /comprobante|receipt/i }).first().locator('[role="switch"]').click();
  await pg.waitForTimeout(800);
  const sinCampo = await pg.locator(".ios-field", { hasText: /^Desde|^Over/ }).count();
  chk(sinCampo === 0, `apagado el aviso, su umbral deja de pedirse (${sinCampo})`);
  await ctxT.close();
}

await browser.close();
vite.kill();
console.log(fallos === 0 ? "\nTODO EN VERDE" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
