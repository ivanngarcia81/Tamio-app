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
/**
 * @param plataforma  "ipad" | "iphone"
 * @param opciones.tactil  Emular pantalla táctil, o sea `pointer: coarse`.
 *
 * Lo táctil va apagado por omisión y NO por descuido: encenderlo en todas las
 * secciones cambiaría las medidas de medio arnés de golpe (`@media (pointer:
 * coarse)` sube a 44 el alto mínimo de cada `.btn`, `.chip` y `.icon-btn`), y
 * esa es una revisión que se hace pantalla por pantalla, no de un tirón.
 *
 * Pero tenerlo es necesario: sin él, ninguna regla de `pointer: coarse` se
 * había probado NUNCA, y ahí vive el mínimo de 44 px de todos los botones.
 * Es el mismo punto ciego que `env()` —verde durante diez versiones sobre una
 * barra que en el iPad tenía la raya pegada a los botones (§33)—, y salió a la
 * luz midiendo el header: el diseño pide botones de 38 y en el aparato de
 * verdad la regla de 44 los estaba estirando sin que nadie lo viera.
 */
async function nuevoContexto(plataforma, opciones = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    hasTouch: opciones.tactil === true,
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

    /* Solicitudes y los dos traslados. Sin ellos, las tres tablas del handoff
       no se pintan nunca —sale el estado vacío— y no hay nada que medir: las
       columnas de solicitudes, salida y entrada llevaban meses sin que ninguna
       comprobación las mirara. */
    await db.insertSolicitud(id, {
      member_id: miembros[0].id, solicitante_externo: null, tipo_carta: "recomendacion",
      motivo: "Ingreso al instituto bíblico", fecha_solicitud: hace(6), fecha_requerida: hace(-8),
      medio_entrega: "impresa", responsable: "Abel Ramos", prioridad: "urgente",
      estado: "nueva", observaciones: null,
    });
    await db.insertSolicitud(id, {
      member_id: null, solicitante_externo: "Hna. Lupita Sáenz", tipo_carta: "presentacion",
      motivo: null, fecha_solicitud: hace(11), fecha_requerida: null,
      medio_entrega: null, responsable: null, prioridad: "normal",
      estado: "preparacion", observaciones: null,
    });
    await db.insertTrasladoSalida(id, {
      member_id: miembros[1].id, fecha_solicitud: hace(5), motivo: "Cambio de ciudad",
      iglesia_destino: "Iglesia El Buen Pastor", pastor_receptor: "Ptr. Elías Núñez",
      direccion: null, ciudad: "Apodaca", region: "N.L.", pais: "México",
      telefono: null, email: null, fecha_aprobacion: null, aprobado_por: null,
      carta_id: null, fecha_entrega: null, metodo_entrega: null,
      confirmacion_recibida: 0, fecha_confirmacion: null, observaciones: null,
      estado: "cartaPreparacion", member_id_destino: undefined,
    });
    await db.insertTrasladoEntrada(id, {
      nombre: "Nohemí Cárdenas Ibarra", fecha_nacimiento: null, telefono: null, correo: null,
      direccion: null, iglesia_procedencia: "Iglesia Cristo Vive", pastor_anterior: null,
      direccion_anterior: null, fecha_emision_carta: null, fecha_recepcion: hace(4),
      referencia_carta: null, adjunto_path: null, adjunto_nombre: "carta-nohemi.pdf",
      adjunto_fecha: null, fecha_congregacion: null, fecha_entrevista: null,
      entrevistador: null, decision: null, fecha_aprobacion: null, observaciones: null,
      estado: "revision", member_id: null,
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

/* Cartas: solicitud y los dos traslados. El camino cambió el 24 ago y esta
   guarda con él —no se borra, se pone al día—: ya no hay un menú de "+" en la
   cabecera del que salgan las tres, sino UN botón por sección que dice qué
   crea. Así que ahora se entra a la sección y se pulsa su botón, que es lo que
   hace quien usa la app. Lo que se comprueba de la hoja es lo mismo. */
await page.goto(`${URL_BASE}/#/cartas`);
await page.waitForTimeout(700);
for (const [seccion, nombre] of [
  ["Solicitudes", "solicitud"],
  ["Traslado de salida", "traslado salida"],
  ["Traslado de entrada", "traslado entrada"],
]) {
  await page.locator(".md-indice-item", { hasText: seccion }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".header .btn.primary").first().click();
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

  /* Redactar NO está en el índice: desde la 1.2.2 crear vive solo en la
     cabecera (había dos entradas para lo mismo). El camino se acortó otra vez
     el 24 ago: aquel "+" desplegaba un menú y ahora el botón de la barra ya
     dice qué crea según la sección —en Resumen, "Nueva carta"—, así que abre
     el editor de un toque en vez de dos. */
  await pg.locator(".header .btn.primary").first().click();
  await pg.waitForTimeout(500);
  const abierto = await pg.locator(".ce-split").count();
  chk(abierto > 0, `el botón de la barra abre el editor de un toque (${abierto})`);
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
  /* **Y bajó a CERO el 24 ago por la noche.** "Barra lateral siempre visible"
     se QUITÓ —no se cableó—, porque fijar la barra en vertical se come 318px
     y deja el contenido por debajo de los 700 que el maestro-detalle
     necesita. Y "Tamaño de texto", la última que quedaba, recibió motor
     (`tipografia.ts`): con eso esta zona **deja de tener cáscaras**.

     La comprobación cambia de signo, como pasó con los permisos: antes exigía
     UNA fila apagada, ahora exige NINGUNA. Y sigue sirviendo, porque es la
     que vigila que no vuelva a colarse un control muerto aquí. */
  chk(pres.filas === 0, `Presentación: ni una fila sin motor (${pres.filas})`);
  /* Y la que se quitó no puede volver por la puerta de atrás. */
  const sinFijo = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    return ![...z.querySelectorAll(".ios-field-label")]
      .some((l) => /siempre visible|always show/i.test(l.textContent ?? ""));
  });
  chk(sinFijo, "y \"Barra lateral siempre visible\" ya no está");
  /* Las dos de la fila apagada —"ningún mando vivo dentro" y "a media tinta"—
     se van con ella: medían la CÁSCARA, y ya no hay ninguna. Lo que las
     sustituye es lo contrario, que es lo que ahora hay que vigilar: que el
     segmentado siga siendo de tres y esté VIVO. El flujo entero —que mueve
     de verdad la app, incluidas las cifras— va en la sección 45. */
  chk(pres.seg === 3, `el segmentado de tamaño de texto sigue siendo de tres (${pres.seg})`);
  const segVivo = await pg.evaluate(() => {
    const b = [...document.querySelectorAll(".pf-seg button")];
    return { total: b.length, apagados: b.filter((x) => x.disabled).length };
  });
  chk(segVivo.total > 0 && segVivo.apagados === 0,
    `y sus botones están vivos, no apagados (${segVivo.apagados}/${segVivo.total} apagados)`);
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
  /* **Bajó de dos a una el 24 ago por la tarde**: "Doble firma en el corte"
     dejó de ser una decisión y pasó a ser una función (migración 47). Queda
     UNA fila apagada, y no espera motor: "Cierre de mes" no es un interruptor
     sino una fila de valor — la app cierra por mes natural y "último domingo"
     no es un ajuste, es otra forma de contar. */
  chk(igl.apagadas === 1, `Controles de tesorería: solo queda apagado el cierre de mes (${igl.apagadas})`);
  chk(igl.vivos === 3, `y los tres interruptores están vivos (${igl.vivos})`);
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

  /* **Los cuatro permisos salieron de esta lista el 24 ago 2026** (migración
     49), y no bajando a dos como los de arriba: **desaparecieron de esta
     pantalla**. Dos de los cuatro no eran permisos sino la definición del rol
     —un tesorero que no registra no es un tesorero con un permiso menos— y los
     otros dos, ya con motor, **solo se enseñan con login**: sin él el rol se
     elige en un desplegable de ESTA MISMA zona, así que el permiso se quitaría
     cambiando el desplegable. Este arnés corre sin Supabase, o sea sin login,
     y por eso aquí no tiene que quedar ninguno.

     La comprobación no se borra: cambia de signo. Antes exigía cuatro filas
     apagadas; ahora exige CERO filas apagadas en la zona —lo que también
     vigila que no vuelva a colarse una cáscara aquí— y que el selector de rol
     —"Vista de este dispositivo", que es la razón de esconderlos— siga en su
     sitio. El flujo entero de los dos permisos va en la sección 44. */
  await irA(/Acceso|Access/i);
  const perm = await pg.evaluate(() => {
    const z = document.querySelector(".settings-zona:not(.settings-zona-inactiva)");
    return {
      apagadas: z.querySelectorAll(".ios-field--apagado").length,
      hayGrupoPermisos: [...z.querySelectorAll(".ios-section-header")]
        .some((h) => /Permisos del rol|role permissions/i.test(h.textContent ?? "")),
      /* El selector de rol se llama "Vista de este dispositivo" —no "Rol"—,
         y ese nombre es de por sí el argumento: es una VISTA que se elige en
         el aparato, no una identidad que dé permisos. */
      hayVista: /Vista de este dispositivo|view/i.test(z.textContent ?? ""),
    };
  });
  chk(perm.apagadas === 0, `Acceso y áreas: ni una fila apagada (${perm.apagadas})`);
  chk(perm.hayGrupoPermisos === false, "y sin login el grupo de permisos no se enseña");
  chk(perm.hayVista, "mientras \"Vista de este dispositivo\" —la razón de esconderlos— sigue ahí");
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
  /* **Se espera la SEÑAL, no un plazo** (arreglado el 24 ago 2026 tras verlo
     fallar). Antes esto era un `waitForSelector` de 15 s a secas, y con el
     servidor de desarrollo FRÍO no llegaba: la primera vez que se pide un PDF,
     vite tiene que transformar `pdfjs-dist` entero, y eso se come el plazo. La
     misma tanda pasaba en verde a la segunda sin tocar una línea de la app —
     que es la firma de un fallo de tiempo, no de código.

     La señal de verdad la da el propio botón: mientras genera se queda
     `disabled` diciendo "Preparando…". Cuando sale de ahí, el trabajo terminó
     —con visor o sin él—, y entonces la comprobación mide lo que quiere medir
     en vez de medir la velocidad del portátil. Se espera cualquiera de las dos
     cosas, la que llegue antes, porque el orden entre reactivar el botón y
     pintar el visor no está garantizado.

     **Comprobado el 24 ago 2026 borrando `node_modules/.vite`** —la condición
     exacta del fallo— y corriendo la tanda entera: 892 ✓ / 0 ✗, con las seis
     de esta sección en verde. Lo que eso prueba y lo que no, dicho con
     precisión: prueba que la versión arreglada aguanta el arranque en frío.
     NO prueba que la vieja falle en esta máquina — el rojo lo vio Iván en la
     suya, y un fallo de tiempo depende del equipo, así que reproducirlo aquí
     no estaba garantizado. Y una pasada verde no demuestra que no pueda haber
     otra causa distinta algún día; demuestra que ESTA se atacó donde estaba. */
  await pg.waitForFunction(() => {
    const b = [...document.querySelectorAll(".dep-det-acciones button")]
      .find((x) => /Compartir|Share|Preparando|Preparing/i.test(x.textContent ?? ""));
    return !!document.querySelector(".visor-pdf-overlay") || (!!b && !b.disabled);
  }, null, { timeout: 60000 }).catch(() => { /* lo dicen las comprobaciones de abajo */ });
  // Y un respiro corto para que React pinte el visor si el botón se soltó antes.
  await pg.waitForSelector(".visor-pdf-overlay", { timeout: 10000 })
    .catch(() => { /* idem */ });
  const visor = await pg.evaluate(() => {
    const v = document.querySelector(".visor-pdf-overlay");
    return v ? { nombre: v.querySelector(".visor-pdf-nombre")?.textContent?.trim() } : null;
  });
  chk(!!visor, "el comprobante se abre en el visor de la app, como cualquier otro PDF");
  chk(/^comprobante-|^deposito-/.test(visor?.nombre ?? ""),
    `con nombre de comprobante de depósito (${visor?.nombre})`);
  chk(/\.pdf$/.test(visor?.nombre ?? ""), `y extensión .pdf (${visor?.nombre})`);

  /* Y de ahí, la hoja nativa. Con `.catch()`, como los demás clics de riesgo
     del archivo (líneas 518, 754…): si el visor no llegó a abrirse, este clic
     lanzaba y **reventaba el proceso entero**. Eso ya pasó: un fallo de tiempo
     aquí se llevó por delante las CATORCE secciones siguientes, que ni
     llegaron a correr. Un fallo tiene que costar sus tres comprobaciones, no
     media tanda. */
  await pg.locator(".visor-pdf-barra .btn.primary").click({ timeout: 10000 })
    .catch(() => { /* lo dicen las comprobaciones de abajo */ });
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

/* ---------- 40. La pestaña Familia ----------
   Llevaba desde el handoff construida y vacía, con su explicación. Con la
   migración 46 (`parentescos`) se llena, y lo que aquí se comprueba es lo que
   hace especial a esta tabla: **una sola fila por relación**, leída al revés
   desde la otra ficha. Si alguien la cambiara por dos filas, o se olvidara de
   invertir el tipo, esto lo caza.

   Probada al revés dos veces: sin invertir el tipo, la ficha del hijo dice
   "Hijo o hija" de su padre y sale en rojo; y quitando la comprobación de
   pareja repetida, el aviso de "ya están relacionadas" no aparece. */
console.log("\n== La pestaña Familia ==");
{
  const ctxFa = await nuevoContexto("ipad");
  const pg = await ctxFa.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });

  /** Abre la ficha de Aportantes de esa persona y su pestaña Familia. */
  const abrirFamilia = async (nombre) => {
    await pg.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".md-miembros .md-fila", { timeout: 10000 });
    await pg.locator(".md-miembros .md-fila", { hasText: nombre }).first().click();
    await pg.waitForTimeout(500);
    await pg.locator(".fm-tabs button, .fm-seg button", { hasText: /Familia|Family/ }).first().click();
    await pg.waitForTimeout(500);
  };

  await abrirFamilia("Ana Martínez");
  const vacia = await pg.evaluate(() => ({
    vacio: !!document.querySelector(".fm-vacio--pendiente"),
    anadir: !!document.querySelector(".fm-anadir"),
  }));
  chk(vacia.vacio, "sin parientes, la pestaña sigue explicando qué es");
  chk(vacia.anadir, "y ofrece añadir uno, que es lo que le faltaba");

  // --- Ana es madre de Juan ---
  await pg.locator(".fm-anadir").click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet").getByText("Juan Pérez").first().click();
  await pg.waitForTimeout(500);
  const opciones = await pg.locator(".action-sheet .action-sheet-opcion").count();
  chk(opciones >= 10, `el catálogo de parentescos se ofrece entero (${opciones})`);
  await pg.locator(".action-sheet").getByText(/^Hijo o hija$/).first().click();
  await pg.waitForTimeout(800);

  const enAna = await pg.evaluate(() => [...document.querySelectorAll(".fm-pariente")].map((f) => ({
    tipo: f.querySelector(".dm-campo-etiqueta")?.textContent.trim(),
    nombre: f.querySelector(".dm-campo-valor")?.textContent.trim(),
  })));
  chk(enAna.length === 1 && enAna[0].nombre === "Juan Pérez",
    `queda en la ficha de Ana (${enAna[0]?.nombre})`);
  chk(enAna[0]?.tipo === "Hijo o hija", `con el parentesco que se eligió (${enAna[0]?.tipo})`);

  /* --- Y AL REVÉS, que es lo que prueba la fila única --- */
  await abrirFamilia("Juan Pérez");
  const enJuan = await pg.evaluate(() => [...document.querySelectorAll(".fm-pariente")].map((f) => ({
    tipo: f.querySelector(".dm-campo-etiqueta")?.textContent.trim(),
    nombre: f.querySelector(".dm-campo-valor")?.textContent.trim(),
  })));
  chk(enJuan.length === 1 && enJuan[0].nombre === "Ana Martínez",
    `y sale también en la de Juan, sin haberla escrito dos veces (${enJuan[0]?.nombre})`);
  chk(enJuan[0]?.tipo === "Padre o madre",
    `leída con el tipo INVERTIDO, que es lo que la hace verdad (${enJuan[0]?.tipo})`);

  /* Ana ya no puede volver a aparecer en la hoja: relacionarlas dos veces
     sería la misma relación contada dos veces. */
  await pg.locator(".fm-anadir").click();
  await pg.waitForTimeout(400);
  const ofrecidos = await pg.evaluate(() =>
    [...document.querySelectorAll(".ios-sheet .ios-buscador-fila")].map((b) => b.textContent.trim()));
  chk(!ofrecidos.some((x) => /Ana Mart/.test(x)),
    `quien ya es pariente deja de ofrecerse (${ofrecidos.length} en la lista)`);
  chk(!ofrecidos.some((x) => /Juan P/.test(x)), "y uno mismo tampoco: nadie es pariente de sí mismo");
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(300);

  // --- Soltarla la quita de las DOS fichas ---
  await pg.locator(".fm-pariente-quitar").first().click();
  await pg.waitForTimeout(800);
  const trasQuitar = await pg.locator(".fm-pariente").count();
  chk(trasQuitar === 0, `soltarla la quita de la ficha de Juan (${trasQuitar})`);
  await abrirFamilia("Ana Martínez");
  const enAnaTras = await pg.locator(".fm-pariente").count();
  chk(enAnaTras === 0, `y de la de Ana, porque era la misma fila (${enAnaTras})`);
  await ctxFa.close();
}

/* ---------- 41. "N movimientos" por categoría ----------
   La entrada más pequeña de la lista del balance: "Nada nuevo, es pintarlo".
   Lo que puede salir mal no es la consulta sino la CLAVE — `transactions`
   guarda el id del catálogo para las de sistema y `customCatRef(uid)` para
   las personalizadas—, así que esto comprueba que los números no son todos
   cero, que es lo que pasaría si se buscara por la clave equivocada. */
console.log("\n== N movimientos por categoría ==");
{
  const ctxN = await nuevoContexto("ipad");
  const pg = await ctxN.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".settings-nav-item", { timeout: 10000 });
  const zonas = await pg.$$eval(".settings-nav-item", (ns) => ns.map((n) => n.textContent.trim()));
  const i = zonas.findIndex((z) => /Categor/i.test(z));
  await pg.locator(".settings-nav-item").nth(i).click();
  await pg.waitForTimeout(700);

  const conteos = await pg.evaluate(() =>
    [...document.querySelectorAll(".cat-conteo")].map((c) => c.textContent.trim()));
  chk(conteos.length > 0, `cada categoría lleva su conteo (${conteos.length})`);
  chk(conteos.every((c) => /^\d+ /.test(c)),
    `y todos son un número con su palabra, no una clave sin traducir (${conteos[0]})`);
  /* El que importa: la siembra registra diezmos y gastos de servicios, así
     que al menos uno tiene que pasar de cero. Todos a cero es exactamente el
     síntoma de buscar por la clave equivocada. */
  const algunoConDatos = conteos.some((c) => !/^0 /.test(c));
  chk(algunoConDatos, `y alguno cuenta de verdad (${conteos.filter((c) => !/^0 /.test(c)).join(" · ")})`);
  await ctxN.close();
}

/* ---------- 42. La doble firma del corte ----------
   El interruptor "Pedir doble firma" estuvo apagado dos veces y por motivos
   distintos: primero por falta de columna, y después un día entero por
   decisión. La conversación del 24 de agosto la cambió al aclarar qué es la
   segunda firma en esta iglesia — no que el que recibe acuse, sino que otra
   persona vuelva a CONTAR el dinero antes de que salga.

   Lo que se comprueba aquí es lo único que hace que esto valga algo:

     · que el total del corte **NO se enseña** en la hoja de firmar. Si se
       viera, "contar dos veces" sería copiar un número de la línea de arriba,
       y todo el control se caería sin que nada fallara;
     · que una cifra equivocada NO deja firmar, y aun así **se guarda** — es la
       mitad que más se cae de las implementaciones: si el descuadre borrara el
       número, contar dos veces no habría servido de nada;
     · que la cifra correcta sí firma, y que la firma **llega a la base**
       (se recarga de verdad y se busca allí);
     · y que un corte sin firmar aparece en Por revisar.

   Probada al revés cuatro veces: enseñando el total en la hoja, dejando
   firmar con la cifra mal, sin guardar el descuadre, y con `firmarCorte`
   devolviendo sin escribir. */
console.log("\n== La doble firma del corte ==");
{
  const ctxDF = await nuevoContexto("ipad");
  const pg = await ctxDF.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });

  /* Un usuario en el directorio para poder firmar: el buscador de la hoja se
     nutre de `usuarios`, y la siembra no crea ninguno. */
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar, .app", { timeout: 30000 });
  await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const ya = await db.listUsuarios(ig.id);
    if (!ya.some((u) => u.rol === "asistente")) {
      await db.insertUsuario(ig.id, { nombre: "Rosa Elena Vega", rol: "asistente" });
    }
  });

  await pg.goto(`${URL_BASE}/#/depositos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-depositos", { timeout: 10000 });
  await pg.locator(".md-seg-tipo button", { hasText: "Pendientes" }).click();
  await pg.waitForTimeout(700);

  // --- Entregar un corte PIDIENDO la segunda firma ---
  await pg.locator(".dep-carta-accion .btn.primary", { hasText: /Entregar/ }).first().click();
  await pg.waitForTimeout(600);
  const interruptor = await pg.evaluate(() => {
    const f = [...document.querySelectorAll(".ios-sheet .ios-field")]
      .find((x) => /Doble firma|Two signatures/i.test(x.textContent ?? ""));
    const sw = f?.querySelector('[role="switch"]');
    return f ? { apagada: f.classList.contains("ios-field--apagado"), viva: sw && !sw.disabled } : null;
  });
  chk(!!interruptor && !interruptor.apagada && !!interruptor.viva,
    `"Pedir doble firma" está VIVO en la hoja del corte (apagada=${interruptor?.apagada})`);
  /* El total del corte SÍ se ve aquí: quien lo arma tiene que verlo. Lo que
     no puede verse es en la hoja de firmar, que es lo de más abajo. */
  const totalCorte = await pg.evaluate(() =>
    document.querySelector(".nm-monto-cifra")?.textContent.trim());
  chk(!!totalCorte, `el corte tiene su total (${totalCorte})`);

  await pg.locator(".ios-sheet .ios-field", { hasText: /Doble firma|Two signatures/i })
    .locator('[role="switch"]').click();
  await pg.waitForTimeout(300);
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(1200);

  /* Crear el corte cierra el panel y vuelve a la lista —el dinero cambió de
     sitio, así que la vista de antes ya no describe nada—. El corte entregado
     es ahora una fila propia: se abre para firmarlo. */
  await pg.locator(".md-depositos .md-fila").first().click();
  await pg.waitForTimeout(700);

  // --- La tarjeta de la segunda firma aparece, y pide firma ---
  const tarjeta = await pg.evaluate(() => {
    const c = [...document.querySelectorAll(".dep-carta")]
      .find((x) => /Segunda firma|Second signature/i.test(x.querySelector(".dep-carta-cab")?.textContent ?? ""));
    return c ? { texto: c.textContent, boton: !!c.querySelector(".btn") } : null;
  });
  chk(!!tarjeta, "el corte entregado enseña su tarjeta de segunda firma");
  chk(!!tarjeta?.boton, "con el botón para darla");

  // --- Abrir la hoja: el total NO puede estar a la vista ---
  await pg.locator(".dep-carta", { hasText: /Segunda firma|Second signature/i })
    .locator(".btn").click();
  await pg.waitForTimeout(600);
  const cifras = (totalCorte ?? "").replace(/[^0-9]/g, "");
  const hoja = await pg.evaluate(() => {
    const h = document.querySelector(".ios-sheet.nm-hoja");
    return h ? { texto: h.textContent ?? "" } : null;
  });
  chk(!!hoja, "la hoja de firmar se abre");
  chk(!!hoja && !hoja.texto.replace(/[^0-9]/g, "").includes(cifras),
    "y el total del corte NO aparece en ninguna parte de ella");

  // --- Elegir quién firma ---
  await pg.locator(".ios-sheet.nm-hoja .ios-field--link", { hasText: /Firma|Signed by/ }).first().click();
  await pg.waitForTimeout(400);
  await pg.locator(".ios-sheet").getByText("Rosa Elena Vega").first().click();
  await pg.waitForTimeout(500);

  // --- Una cifra equivocada: no cuadra y NO deja firmar ---
  await pg.locator('.ios-sheet.nm-hoja input[inputmode="decimal"]').fill("1");
  await pg.locator(".ios-sheet.nm-hoja .ios-field--action", { hasText: /Comprobar|Check/ }).click();
  await pg.waitForTimeout(500);
  const mal = await pg.evaluate(() => ({
    aviso: document.querySelector(".ios-sheet .dep-aviso-titulo")?.textContent.trim(),
    firmarApagado: document.querySelector(".ios-sheet.nm-hoja .ios-nav-action")?.disabled,
    hayDescuadre: !!document.querySelector(".ios-sheet .ios-field--destructive"),
  }));
  chk(/No cuadra|does not add up/i.test(mal.aviso ?? ""), `una cifra mal dice que no cuadra (${mal.aviso})`);
  chk(mal.firmarApagado === true, `y "Firmar" sigue apagado (${mal.firmarApagado})`);
  chk(mal.hayDescuadre, "pero se ofrece dejar constancia del descuadre");

  // --- La cifra correcta: cuadra y firma ---
  await pg.locator(".ios-sheet.nm-hoja .ios-field--action", { hasText: /Contar otra vez|Count again/ }).click();
  await pg.waitForTimeout(300);
  await pg.locator('.ios-sheet.nm-hoja input[inputmode="decimal"]').fill(totalCorte.replace(/[^0-9.,]/g, ""));
  await pg.locator(".ios-sheet.nm-hoja .ios-field--action", { hasText: /Comprobar|Check/ }).click();
  await pg.waitForTimeout(500);
  const bien = await pg.evaluate(() => ({
    aviso: document.querySelector(".ios-sheet .dep-aviso-titulo")?.textContent.trim(),
    firmarApagado: document.querySelector(".ios-sheet.nm-hoja .ios-nav-action")?.disabled,
  }));
  chk(/Cuadra|adds up/i.test(bien.aviso ?? ""), `la cifra buena cuadra (${bien.aviso})`);
  chk(bien.firmarApagado === false, `y ahora sí se puede firmar (${bien.firmarApagado})`);
  await pg.locator(".ios-sheet.nm-hoja .ios-nav-action").click();
  await pg.waitForTimeout(1000);

  /* Recargar de verdad: lo que se comprueba es que llegó a `cortes`. */
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(300);
  const enBase = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const cortes = await db.listCortes(ig.id);
    const c = cortes.find((x) => x.segunda_firma);
    return c ? {
      firma: c.segunda_firma, rol: c.segunda_firma_rol,
      modo: c.segunda_firma_modo, conteo: c.segunda_conteo,
      pedida: c.doble_firma_pedida, cuando: c.segunda_firma_en,
    } : null;
  });
  chk(enBase?.firma === "Rosa Elena Vega", `la firma llegó a la base (${enBase?.firma})`);
  chk(enBase?.rol === "asistente", `con su rol del directorio (${enBase?.rol})`);
  chk(enBase?.modo === "conteo", `y marcada como CONTEO, no como revisión (${enBase?.modo})`);
  chk((enBase?.conteo ?? 0) > 0, `con la cifra que contó guardada (${enBase?.conteo})`);
  chk(enBase?.pedida === 1, `y el corte quedó marcado como que la pedía (${enBase?.pedida})`);
  chk(!!enBase?.cuando, `con la hora de la firma (${enBase?.cuando})`);

  /* Y la regla de Por revisar: un corte que pidió firma y no la tiene sale
     en la bandeja. Se comprueba con uno nuevo, porque el de arriba ya firmó. */
  const antes = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    return (await db.cortesSinSegundaFirma(ig.id)).length;
  });
  await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    await db.insertCorte(ig.id, {
      fecha: "2026-08-20", nombre: "Corte de prueba sin firmar", dobleFirma: true,
    }, []);
  });
  await pg.goto(`${URL_BASE}/#/bandeja`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-bandeja", { timeout: 10000 });
  await pg.waitForTimeout(700);
  const enBandeja = await pg.evaluate(() =>
    [...document.querySelectorAll(".md-bandeja .al-fila .md-fila-titular")]
      .map((x) => x.textContent.trim())
      .filter((x) => /segunda firma|second signature/i.test(x)).length);
  chk(enBandeja > antes, `el corte sin firmar sale en Por revisar (${antes} → ${enBandeja})`);
  await ctxDF.close();
}

/* ---------- 43. El folio del movimiento ----------
   "Folio 1042" es lo último que quedaba del handoff sin pintar, y llevaba ahí
   desde el primer día por una razón buena: un folio inventado se lee como un
   dato de contabilidad. Con la migración 48 es real, y tiene la forma del
   resto de la app: `2026-0042`.

   Lo que se comprueba es lo que hace que un folio sirva de algo:

     · que NO se repita —es lo único imperdonable en un libro contable—;
     · que se pueda buscar, que es para lo que existe ("revisa el 0042");
     · que el pasado siga SIN numerar, porque numerarlo hacia atrás obligaría
       a inventar un orden dentro de cada día;
     · y que los huecos no rompan la serie: borrar un movimiento no puede hacer
       que el siguiente repita número.

   **Qué prueba esto y qué no**, porque al probarlo al revés salió que dos de
   las tres capas no son las que sostienen la garantía:

     · Cambiar MAX+1 por COUNT —el fallo clásico— NO pone nada en rojo, y no
       es que la prueba sea mala: el BUCLE DE COLISIÓN avanza hasta el primer
       número libre y arregla el resultado aunque el cálculo esté mal. Quien
       impide los duplicados es el bucle. MAX+1 sirve para otra cosa: que la
       serie no retroceda a un número purgado que quizá está en un recibo.
     · El primer intento de "hueco" tampoco probaba nada, porque `deleteTx` es
       un borrado SUAVE: la fila sigue ahí y COUNT no baja. Ahora se purga de
       verdad, como hace la compactación.
     · Lo que SÍ sale en rojo al romperlo es la reparación de duplicados, que
       es el fallo real de un correlativo con sincronización — y por eso es la
       comprobación más larga de esta sección. */
console.log("\n== El folio del movimiento ==");
{
  const ctxF = await nuevoContexto("ipad");
  const pg = await ctxF.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar, .app", { timeout: 30000 });

  /* La siembra creó sus movimientos ANTES de que la migración 48 existiera en
     esa base, así que no tienen folio — igual que los de una iglesia real que
     actualiza. Eso es justo lo que hay que comprobar. */
  const antes = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const txs = await db.listTx(ig.id, { limit: 400 });
    return { total: txs.length, conFolio: txs.filter((t) => t.folio).length };
  });
  chk(antes.total > 0, `hay movimientos sembrados (${antes.total})`);

  // --- Registrar tres y mirar sus folios ---
  const nuevos = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const hechos = [];
    for (let i = 0; i < 3; i++) {
      await db.insertTx(ig.id, ig.moneda, {
        tipo: "ingreso", categoria: "ofrenda", concepto: `Folio de prueba ${i}`,
        fecha: "2026-03-1" + i, monto: 1000 + i, metodo_pago: "efectivo",
      });
    }
    const txs = await db.listTx(ig.id, { limit: 400 });
    for (const t of txs) if (/^Folio de prueba/.test(t.concepto)) hechos.push(t.folio);
    return hechos.sort();
  });
  chk(nuevos.length === 3, `se registran tres movimientos (${nuevos.length})`);
  chk(nuevos.every((f) => /^2026-\d{4}$/.test(f ?? "")),
    `y los tres llevan folio con la forma AAAA-NNNN (${nuevos.join(", ")})`);
  chk(new Set(nuevos).size === 3, `sin repetirse (${nuevos.join(", ")})`);
  /* El año sale de la FECHA del movimiento, no de hoy: un ingreso de 2026
     capturado en otro año pertenece al libro de 2026 y su folio lo dice. */
  chk(nuevos.every((f) => f.startsWith("2026-")),
    "y el año es el de la fecha del movimiento, no el de hoy");

  /* --- El pasado sigue sin numerar ---
     La siembra usa `insertTx`, así que sus movimientos YA nacen con folio y no
     sirven para probar esto. Hay que fabricar la fila como la tiene una
     iglesia que actualiza: registrada antes de la migración 48, con `folio` en
     NULL. Lo que se comprueba es que nadie se la numera por detrás y que la
     pantalla no le inventa una. */
  const despues = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    await db.insertTx(ig.id, ig.moneda, {
      tipo: "gasto", categoria: "servicios", concepto: "Movimiento de antes del folio",
      fecha: "2025-06-01", monto: 7700, metodo_pago: "efectivo",
    });
    let txs = await db.listTx(ig.id, { limit: 400 });
    const viejo = txs.find((t) => t.concepto === "Movimiento de antes del folio");
    // Se le quita el folio a mano: así queda igual que una fila anterior a la
    // migración, que es lo que hay en la base de una iglesia real.
    const d = await db.getDb();
    await d.execute("UPDATE transactions SET folio = NULL, folio_seq = NULL WHERE id = $1", [viejo.id]);
    // Y se registra otro DESPUÉS, para ver que la serie no lo cuenta.
    await db.insertTx(ig.id, ig.moneda, {
      tipo: "ingreso", categoria: "ofrenda", concepto: "Folio despues del viejo",
      fecha: "2026-04-01", monto: 2200, metodo_pago: "efectivo",
    });
    txs = await db.listTx(ig.id, { limit: 400 });
    return {
      sinFolio: txs.find((t) => t.concepto === "Movimiento de antes del folio")?.folio ?? null,
      siguiente: txs.find((t) => t.concepto === "Folio despues del viejo")?.folio ?? null,
    };
  });
  chk(despues.sinFolio === null,
    `un movimiento anterior a la migración se queda SIN folio, nadie lo numera por detrás (${despues.sinFolio})`);
  chk(/^2026-\d{4}$/.test(despues.siguiente ?? ""),
    `y el siguiente se emite igual, sin tropezar con él (${despues.siguiente})`);

  /* --- Los huecos no rompen la serie ---
     La fila se PURGA de verdad (`DELETE`), no se borra en blando: el borrado
     suave deja la fila en su sitio y entonces hasta un COUNT mal hecho acierta.
     Purgada —que es lo que hace la compactación— el hueco es real, y numerar
     con COUNT reutilizaría el número del muerto. */
  const trasHueco = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const txs = await db.listTx(ig.id, { limit: 400 });
    const ultimo = txs.filter((t) => /^Folio de prueba/.test(t.concepto))
      .sort((a, b) => (a.folio < b.folio ? 1 : -1))[0];
    const folioBorrado = ultimo.folio;
    const d = await db.getDb();
    await d.execute("DELETE FROM transactions WHERE id = $1", [ultimo.id]);
    /* Fechado HOY, no en marzo: la lista de Ingresos filtra por mes y un
       movimiento de otro mes no saldría por mucho que la búsqueda funcione.
       Los de arriba sí van en marzo, que es lo que prueba que el año del folio
       sale de la fecha del movimiento y no de hoy. */
    await db.insertTx(ig.id, ig.moneda, {
      tipo: "ingreso", categoria: "ofrenda", concepto: "Folio tras el hueco",
      fecha: db.hoyISO(), monto: 5000, metodo_pago: "efectivo",
    });
    const otra = await db.listTx(ig.id, { limit: 400 });
    const nuevo = otra.find((t) => t.concepto === "Folio tras el hueco");
    return { folioBorrado, folioNuevo: nuevo?.folio };
  });
  chk(trasHueco.folioNuevo !== trasHueco.folioBorrado,
    `borrar uno no hace que el siguiente repita su número (${trasHueco.folioBorrado} → ${trasHueco.folioNuevo})`);

  // --- Se puede buscar por folio, que es para lo que existe ---
  const cuatro = (trasHueco.folioNuevo ?? "").slice(-4);
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-ingresos, .md-movimientos, .md-filas", { timeout: 10000 });
  await pg.waitForTimeout(500);
  await pg.locator(".md-buscar input").first().fill(cuatro);
  await pg.waitForTimeout(600);
  const encontrados = await pg.evaluate(() =>
    [...document.querySelectorAll(".md-fila .md-fila-titular")].map((x) => x.textContent.trim()));
  chk(encontrados.some((x) => /Folio tras el hueco/.test(x)),
    `tecleando las cuatro cifras del folio se encuentra el movimiento (${cuatro} → ${encontrados.length} fila(s))`);

  /* --- Dos aparatos, el mismo folio ---
     El fallo de verdad de un numerador correlativo con sincronización: dos
     iPads sin conexión calculan el mismo MAX+1 y al juntarse hay dos
     movimientos con el mismo folio. Se fabrica esa situación y se comprueba
     que `repararFoliosMovimiento` la deshace — conservando el del MÁS ANTIGUO,
     porque ese número ya puede estar escrito en un recibo de papel. */
  const reparado = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const d = await db.getDb();
    const txs = await db.listTx(ig.id, { limit: 400 });
    const dos = txs.filter((t) => t.folio).sort((a, b) => a.id - b.id).slice(-2);
    const repetido = dos[0].folio;
    // El segundo se queda con el folio del primero: el choque exacto.
    await d.execute(
      "UPDATE transactions SET folio = $1, folio_seq = $2 WHERE id = $3",
      [repetido, dos[0].folio_seq, dos[1].id],
    );
    const antesDeReparar = (await db.listTx(ig.id, { limit: 400 }))
      .filter((t) => t.folio === repetido).length;
    const cuantos = await db.repararFoliosMovimiento(ig.id);
    const despuesDeReparar = await db.listTx(ig.id, { limit: 400 });
    return {
      antesDeReparar,
      cuantos,
      viejo: despuesDeReparar.find((t) => t.id === dos[0].id)?.folio,
      nuevo: despuesDeReparar.find((t) => t.id === dos[1].id)?.folio,
      repetido,
      repetidosQueQuedan: despuesDeReparar.filter((t) => t.folio === repetido).length,
    };
  });
  chk(reparado.antesDeReparar === 2, `se fabrica el choque de dos aparatos (${reparado.antesDeReparar} con el mismo folio)`);
  chk(reparado.cuantos === 1, `la reparación renumera uno solo (${reparado.cuantos})`);
  chk(reparado.viejo === reparado.repetido,
    `el MÁS ANTIGUO conserva su folio, que puede estar en un recibo (${reparado.viejo})`);
  chk(reparado.nuevo !== reparado.repetido && /^2026-\d{4}$/.test(reparado.nuevo ?? ""),
    `y el otro recibe uno libre (${reparado.repetido} → ${reparado.nuevo})`);
  chk(reparado.repetidosQueQuedan === 1, `no queda ningún folio repetido (${reparado.repetidosQueQuedan})`);

  // --- Y en el panel sale con su rótulo ---
  await pg.locator(".md-fila", { hasText: "Folio tras el hueco" }).first().click();
  await pg.waitForTimeout(600);
  const enPanel = await pg.evaluate(() =>
    document.querySelector(".dm-folio")?.textContent.trim());
  chk(/^Folio 2026-\d{4}$/.test(enPanel ?? ""), `el panel lo enseña con su rótulo (${enPanel})`);
  await ctxF.close();
}

/* ---------- 44. Los dos permisos del rol Tesorería ----------
   El grupo "Permisos del rol Tesorería" del rediseño llevaba CUATRO
   interruptores apagados y sin motor. Con la migración 49 quedan dos y
   funcionan, porque los otros dos nunca fueron permisos: registrar ingresos y
   cerrar cortes SON el rol de tesorería, y apagarlos no le habría quitado un
   permiso a nadie —habría dejado a la tesorera dentro de Tesorería sin poder
   hacer nada, que es otro rol y no un permiso—.

   Los dos que quedan tiran para lados opuestos y por eso se prueban distinto:
   ver el padrón ABRE una pantalla que hoy está cerrada; eliminar movimientos
   CIERRA algo que hoy está abierto.

   **Qué sostiene qué**, que es lo que hay que decir en voz alta:

     · Lo de aquí es la INTERFAZ. Que el botón Eliminar desaparezca no impide
       borrar: el aparato podría escribir la fila igual. Quien lo impide de
       verdad es el disparador `frenar_borrado_tesorero` de Supabase, que
       deshace la baja y devuelve el movimiento vivo — y eso vive en el
       servidor, así que este arnés NO puede probarlo. Lo que sí prueba es que
       la interfaz no ofrece un botón que el servidor va a rechazar.
     · El del padrón NO es una barrera de datos y no puede serlo: los miembros
       ya se sincronizan enteros a todos los aparatos porque el tesorero los
       necesita en Aportantes. Abre una PANTALLA. Por eso se comprueba con
       especial cuidado que abra UNA y no el área entera: un permiso que de
       regalo abriera Actas y Cartas sería un cambio de rol disfrazado.
     · El espejo local NO es la verdad. La comprobación de `updateChurch` es la
       que impide el fallo más fácil de cometer aquí: que un día alguien meta
       estas dos columnas en el formulario de la iglesia y el permiso se
       convierta en una preferencia que se quita sin conexión. */
console.log("\n== Los dos permisos del rol Tesorería ==");
{
  const ctxP = await nuevoContexto("ipad");
  // El rol se fija ANTES de montar: `initialRole()` lee localStorage al nacer.
  await ctxP.addInitScript(() => {
    try { localStorage.setItem("tamio-rol", "tesorero"); } catch { /* noop */ }
  });
  const pg = await ctxP.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar, .app", { timeout: 30000 });

  // --- Las dos puertas, en su lógica pura ---
  const puertas = await pg.evaluate(async () => {
    const r = await import("/src/role.ts");
    return {
      tesoreroSinPermiso: r.puedeEliminarMovimientos("tesorero", { tesorero_puede_eliminar: 0 }),
      tesoreroConPermiso: r.puedeEliminarMovimientos("tesorero", { tesorero_puede_eliminar: 1 }),
      adminAunqueEsteApagado: r.puedeEliminarMovimientos("administrador", { tesorero_puede_eliminar: 0 }),
      porOmisionPuede: r.puedeEliminarMovimientos("tesorero", {}),
      padronCerrado: r.puedeVer("tesorero", "/membresia"),
      padronAbierto: r.puedeVer("tesorero", "/membresia", { vePadron: true }),
      actasFuera: r.puedeVer("tesorero", "/actas", { vePadron: true }),
      cartasFuera: r.puedeVer("tesorero", "/cartas", { vePadron: true }),
      serviciosFuera: r.puedeVer("tesorero", "/servicios", { vePadron: true }),
      secretariaIgual: r.puedeVer("secretaria", "/ingresos", { vePadron: true }),
    };
  });
  chk(puertas.tesoreroSinPermiso === false, "con el permiso apagado, el tesorero no puede eliminar");
  chk(puertas.tesoreroConPermiso === true, "encendido, sí");
  /* El límite es del ROL Tesorería: el administrador es quien lo pone, y
     quitárselo a sí mismo lo dejaría sin poder deshacerlo. */
  chk(puertas.adminAunqueEsteApagado === true, "y al administrador no le afecta: es quien pone el límite");
  /* Por omisión SÍ puede, que es lo que la app ha hecho siempre. Una
     migración no le retira en silencio a nadie algo que venía usando. */
  chk(puertas.porOmisionPuede === true, "sin columna —una base vieja— se conserva lo de hoy: sí puede");
  chk(puertas.padronCerrado === false, "sin permiso, Membresía sigue cerrada al tesorero");
  chk(puertas.padronAbierto === true, "con permiso, se le abre");
  chk(puertas.actasFuera === false && puertas.cartasFuera === false && puertas.serviciosFuera === false,
    "y solo esa pantalla: Actas, Cartas y Servicios siguen fuera");
  chk(puertas.secretariaIgual === false, "el permiso no toca a la secretaria: Ingresos le sigue cerrado");

  /* --- El espejo no lo escribe el aparato ---
     `updateChurch` es lo que guarda el formulario de la iglesia. Si un día
     estas dos columnas se colaran ahí, el permiso dejaría de ser un permiso:
     se quitaría desde Ajustes, sin conexión y sin ser administrador. */
  const espejo = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const d = await db.getDb();
    await d.execute(
      "UPDATE churches SET tesorero_puede_eliminar = 0, tesorero_ve_padron = 1 WHERE id = $1",
      [ig.id],
    );
    const tras = await db.updateChurch(ig.id, { nombre: ig.nombre, moneda: ig.moneda });
    return { puedeEliminar: tras.tesorero_puede_eliminar, vePadron: tras.tesorero_ve_padron };
  });
  chk(espejo.puedeEliminar === 0 && espejo.vePadron === 1,
    `guardar la iglesia desde Ajustes NO toca los permisos (eliminar=${espejo.puedeEliminar}, padrón=${espejo.vePadron})`);

  /* --- Y la interfaz obedece ---
     Con el permiso apagado (lo dejó así el bloque de arriba) el panel de
     detalle no puede pintar Eliminar. Se prueba en las dos direcciones para
     que no pase por buena una pantalla que simplemente no cargó. */
  /* RECARGA, no `goto` con otro hash: la iglesia se lee al ARRANCAR y vive en
     el estado de React. Cambiar la columna por debajo y navegar dentro de la
     misma sesión dejaba el permiso viejo en memoria — que es exactamente el
     fallo que esta prueba encontró y que se arregló en `App.tsx`, releyendo la
     iglesia cuando termina una sincronización. Aquí no hay sincronización que
     esperar, así que se recarga. */
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.reload({ waitUntil: "networkidle" });
  await pg.waitForSelector(".md-fila", { timeout: 10000 });
  await pg.locator(".md-fila").first().click();
  await pg.waitForTimeout(500);
  const sinBoton = await pg.evaluate(() => ({
    hayPanel: !!document.querySelector(".dm"),
    hayEliminar: !!document.querySelector(".dm-eliminar"),
    hayEditar: !!document.querySelector(".dm .btn.primary"),
  }));
  chk(sinBoton.hayPanel && sinBoton.hayEditar, "el panel de detalle abre y conserva Editar");
  chk(sinBoton.hayEliminar === false, "y sin el permiso NO pinta Eliminar");

  // El mismo botón, con el permiso encendido: si no vuelve, lo de arriba
  // estaba pasando por otro motivo.
  await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const d = await db.getDb();
    await d.execute("UPDATE churches SET tesorero_puede_eliminar = 1 WHERE id = $1", [ig.id]);
  });
  await pg.reload({ waitUntil: "networkidle" });
  await pg.waitForSelector(".md-fila", { timeout: 10000 });
  await pg.locator(".md-fila").first().click();
  await pg.waitForTimeout(500);
  const conBoton = await pg.evaluate(() => !!document.querySelector(".dm-eliminar"));
  chk(conBoton === true, "y encendido vuelve a aparecer");

  // Se deja como estaba para no ensuciar lo que venga detrás.
  await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const d = await db.getDb();
    await d.execute("UPDATE churches SET tesorero_ve_padron = 0 WHERE id = $1", [ig.id]);
  });
  await ctxP.close();

  /* --- Sin login, el grupo de permisos no se enseña ---
     Es la decisión de Iván y tiene motivo: sin login el rol se elige en un
     desplegable de ESTA MISMA zona, así que un permiso ahí se quitaría
     cambiando el desplegable. Enseñar un candado que cualquiera abre es peor
     que no enseñarlo.

     **Va en su propio contexto, con el rol de ADMINISTRADOR**, y eso es lo que
     hace que la comprobación valga. La condición real es `esAdmin &&
     authActivo`: mirándolo como tesorero el grupo faltaría por las DOS
     razones, y la prueba pasaría igual aunque la mitad del login no
     existiera. Como administrador solo queda una razón en pie, que es la que
     se quiere probar.

     Se comprueba además que la zona SÍ está: sin eso, esto pasaría también si
     Ajustes no hubiera cargado. La otra mitad —que CON login sí aparece— no la
     puede probar este arnés, que corre sin Supabase. */
  const ctxA = await nuevoContexto("ipad");
  await ctxA.addInitScript(() => {
    try { localStorage.setItem("tamio-rol", "administrador"); } catch { /* noop */ }
  });
  const pgA = await ctxA.newPage();
  pgA.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pgA.setViewportSize({ width: 1366, height: 1024 });
  await pgA.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
  await pgA.waitForSelector(".settings-nav-item", { timeout: 10000 });
  const zonasP = await pgA.$$eval(".settings-nav-item", (ns) => ns.map((n) => n.textContent.trim()));
  const iAcceso = zonasP.findIndex((z) => /Acceso/i.test(z));
  chk(iAcceso >= 0, `la zona "Acceso y áreas" existe (${zonasP.length} zonas)`);
  await pgA.locator(".settings-nav-item").nth(iAcceso).click();
  await pgA.waitForTimeout(700);
  const enAcceso = await pgA.evaluate(() => document.body.innerText);
  /* El desplegable de rol es la prueba de que la zona cargó Y de que el
     argumento es cierto: está ahí, en la misma pantalla, y cualquiera lo
     cambia. */
  chk(/Acceso y áreas/.test(enAcceso), "y su contenido cargó");
  chk(/Permisos del rol/.test(enAcceso) === false,
    "siendo ADMINISTRADOR y sin login, el grupo de permisos no se enseña");
  await ctxA.close();
}

/* ---------- 45. El tamaño de texto mueve la app ENTERA ----------
   La última cáscara del rediseño, encendida el 24 ago 2026. Lo que estuvo
   apagado no era el control: era que la tipografía no se podía mover entera.
   La app tenía 248 `font-size` colgando de los tokens `--fs-*` y **395 con
   píxeles a pelo**, más 136 tamaños en línea en el JSX que ni siquiera pasan
   por el CSS.

   **Por eso esta sección mide dos cosas y no una.** Comprobar que crece una
   etiqueta sería quedarse justo con el tercio que ya habría funcionado con un
   multiplicador ingenuo sobre los tokens. Lo que había que arreglar —y lo que
   se comprueba aquí— es que crezca también **la cifra de dinero**, que iba
   con píxeles a pelo (`.md-fila-monto`, `.ios-stat-num`, `.tx-amount`). Si
   alguien sube el tamaño porque no ve bien los importes y los importes son lo
   único que no se mueve, el control es peor que no tenerlo.

   Se miden tamaños CALCULADOS del navegador sobre la app de verdad, no la
   hoja de estilos: es la única forma de saber que el factor llegó al píxel
   pintado y no se quedó en una variable que nadie lee.

   **Medido el 24 ago 2026 en la tanda entera (899 ✓ / 0 ✗):** etiqueta
   15.5 → 17.36px y cifra 16 → 17.92px en "Grande", las dos por 1.120
   exacto. Que los dos factores coincidan es la prueba de que la escala llegó
   por igual a los `font-size` con token y a los que iban con píxeles a pelo,
   que eran mundos separados hasta esa mañana. */
console.log("\n== El tamaño de texto mueve la app entera ==");
{
  const ctxT = await nuevoContexto("ipad");
  const pg = await ctxT.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-fila", { timeout: 10000 });

  /** Tamaños calculados de una ETIQUETA y de una CIFRA, más el factor vivo. */
  const medir = () => pg.evaluate(() => {
    const px = (sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    };
    return {
      etiqueta: px(".md-fila-titular"),
      dinero: px(".md-fila-monto"),
      factor: getComputedStyle(document.documentElement).getPropertyValue("--fs-escala").trim(),
    };
  });

  const normal = await medir();
  chk(normal.etiqueta > 0 && normal.dinero > 0,
    `de partida se mide etiqueta y cifra (${normal.etiqueta}px / ${normal.dinero}px)`);

  /* --- "Normal" no toca nada ---
     Se comprueba ANTES que el crecimiento, porque es la mitad que más fácil
     se rompe sin que nadie lo note: un refactor de 560 tamaños que deje la
     app un punto más grande "en Normal" habría cambiado el aspecto de Tamio
     para todo el que nunca abra este ajuste. */
  await pg.evaluate(async () => {
    const m = await import("/src/tipografia.ts");
    m.setTamanoTexto("normal");
  });
  const otraVezNormal = await medir();
  chk(otraVezNormal.etiqueta === normal.etiqueta && otraVezNormal.dinero === normal.dinero,
    `en "Normal" no se mueve un píxel (${otraVezNormal.etiqueta}px / ${otraVezNormal.dinero}px)`);
  /* Y el factor no se escribe EN LÍNEA: en "Normal" manda styles.css, como
     hace el acento "neutro". Un `--fs-escala: 1` inline daría el mismo
     resultado hoy y pisaría el valor de la hoja el día que cambie.

     Se mira `style.getPropertyValue` y NO `getComputedStyle`, y esto lo
     enseñó la propia prueba al salir en rojo: el calculado devuelve "1"
     igualmente, porque es el valor que `:root` trae de la hoja. Medía la
     cascada entera cuando lo que se quiere saber es si el atributo `style`
     del elemento quedó limpio. La prueba estaba mal, no el código. */
  const inline = await pg.evaluate(() =>
    document.documentElement.style.getPropertyValue("--fs-escala"));
  chk(inline === "", `y en "Normal" no deja nada escrito en línea ("${inline}")`);

  // --- Grande ---
  await pg.evaluate(async () => {
    const m = await import("/src/tipografia.ts");
    m.setTamanoTexto("grande");
  });
  const grande = await medir();
  chk(grande.etiqueta > normal.etiqueta,
    `en "Grande" crece la etiqueta (${normal.etiqueta} → ${grande.etiqueta}px)`);
  /* LA COMPROBACIÓN DE LA SECCIÓN. Rompiendo el arreglo —dejando
     `.md-fila-monto` con su px a pelo— esta sale en rojo y la de arriba sigue
     en verde, que es justo el fallo del que protege. */
  chk(grande.dinero > normal.dinero,
    `y crece TAMBIÉN la cifra de dinero, que era la que se quedaba (${normal.dinero} → ${grande.dinero}px)`);
  chk(Math.abs(grande.dinero / normal.dinero - grande.etiqueta / normal.etiqueta) < 0.02,
    `las dos crecen lo MISMO, no cada una por su cuenta (${(grande.dinero / normal.dinero).toFixed(3)} vs ${(grande.etiqueta / normal.etiqueta).toFixed(3)})`);

  // --- Chico ---
  await pg.evaluate(async () => {
    const m = await import("/src/tipografia.ts");
    m.setTamanoTexto("chico");
  });
  const chico = await medir();
  chk(chico.etiqueta < normal.etiqueta && chico.dinero < normal.dinero,
    `en "Chico" encogen las dos (${chico.etiqueta}px / ${chico.dinero}px)`);

  /* --- El maestro-detalle sobrevive a "Grande" ---
     El motivo de que los saltos sean de ±12% y no de ±25%: el panel del iPad
     necesita ancho de verdad, y una letra que crece empuja. Con la retícula
     rota, "Grande" sería inusable justo en la pantalla donde más se usa. */
  await pg.evaluate(async () => {
    const m = await import("/src/tipografia.ts");
    m.setTamanoTexto("grande");
  });
  await pg.waitForTimeout(400);
  const reticula = await pg.evaluate(() => ({
    dosColumnas: !!document.querySelector(".md-split"),
    desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  chk(reticula.dosColumnas, "con la letra grande el maestro-detalle sigue en dos columnas");
  chk(!reticula.desborde, "y la página no se desborda en horizontal");

  // Se deja como estaba, que esta sección va antes del cierre.
  await pg.evaluate(async () => {
    const m = await import("/src/tipografia.ts");
    m.setTamanoTexto("normal");
  });
  if (process.env.CAPTURAS) {
    await pg.screenshot({ path: `${process.env.CAPTURAS}/tamano-texto-1366x1024.png` });
  }
  await ctxT.close();
}

/* ---------- 36. El header, con las medidas del handoff ----------------
   Iván mandó el handoff del header el 24 ago con dos instrucciones: cambiar
   el ☰ por el icono de menú del mockup, y NO pintar los iconos fantasma
   (Aspecto y Rotar) que el diseño dibuja a la derecha.

   Lo que se comprueba, y por qué cada cosa:

    - **Las medidas con PANTALLA TÁCTIL.** Es la comprobación que da sentido a
      todas las demás. El diseño pide botones de 38 y `@media (pointer:
      coarse)` le pone 44 de mínimo a todo `.btn` — una regla que en el
      navegador del arnés no entraba y en el iPad sí. Sin `tactil: true` esta
      guarda mediría 38 y el aparato pintaría 44, que es exactamente el
      engaño que ya costó diez versiones con `env()` (§33).

    - **La zona tocable, tocándola.** Los 38 px de alto quedan por debajo de
      los 44 del sistema, y el handoff lo resuelve diciendo que la fila entera
      es sensible. Eso no se comprueba leyendo el CSS: se comprueba pidiéndole
      al navegador qué hay en el píxel de arriba de la barra.

    - **El recorte del título, con un título que de verdad no cabe.** Poner
      `text-overflow: ellipsis` no basta —hace falta además que el bloque
      pueda encoger— y las dos mitades se rompen por separado.

    - **El iPhone, que no se tocó.** El glifo nuevo es solo del iPad. */
console.log("\n== El header con las medidas del handoff ==");
{
  const ctxH = await nuevoContexto("ipad", { tactil: true });
  const pg = await ctxH.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });

  const leer = () => pg.evaluate(() => {
    const cs = (e) => getComputedStyle(e), rc = (e) => e.getBoundingClientRect();
    const hd = document.querySelector(".header");
    const ham = document.querySelector(".menu-hamburguesa");
    const acc = document.querySelector(".header-actions");
    const prim = document.querySelector(".header .btn.primary");
    const svg = prim ? prim.querySelector("svg") : null;
    const visible = (e) => e && cs(e).display !== "none" && rc(e).width > 0;
    return {
      padIzq: cs(hd).paddingLeft,
      menuVisible: visible(ham),
      menu: visible(ham) ? {
        w: Math.round(rc(ham).width), h: Math.round(rc(ham).height),
        x: Math.round(rc(ham).left), y: Math.round(rc(ham).top),
        radio: cs(ham).borderRadius,
        relleno: cs(ham).backgroundColor,
        color: cs(ham).color,
        // El icono de barra lateral son DOS trazos (rectángulo + la columna
        // marcada); las tres rayas de antes eran tres `<line>`.
        glifo: (() => {
          const svg = ham.querySelector("svg");
          if (!svg) return "sin glifo";
          const rect = svg.querySelectorAll("rect").length;
          const lineas = svg.querySelectorAll("line").length;
          return rect === 1 && lineas === 0 ? "barra lateral" : `${lineas} rayas`;
        })(),
      } : null,
      gap: acc ? cs(acc).columnGap : null,
      primario: prim ? {
        h: Math.round(rc(prim).height), pad: cs(prim).padding,
        gap: cs(prim).columnGap, fs: cs(prim).fontSize, borde: cs(prim).borderTopWidth,
        fondo: cs(prim).backgroundColor,
      } : null,
      glifo: svg ? { px: Math.round(svg.getBoundingClientRect().width), trazo: cs(svg).strokeWidth } : null,
      // Todos los botones de la barra a la misma altura: es lo que los alinea.
      altos: [...document.querySelectorAll(".header .btn")]
        .filter((b) => rc(b).width > 0).map((b) => Math.round(rc(b).height)),
    };
  });

  // --- APAISADO: sin ☰, la barra arranca en su margen de 20 ---
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".header .btn.primary", { timeout: 10000 });
  await pg.waitForTimeout(400);

  const a = await leer();
  chk(!a.menuVisible, "apaisado: sin ☰, que la barra lateral está puesta");
  chk(a.padIzq === "20px", `y el margen de la barra son sus 20 (${a.padIzq})`);
  chk(a.gap === "6px", `6 px entre acciones (${a.gap})`);
  chk(a.altos.length > 0 && a.altos.every((h) => h === 38),
    `todos los botones a 38, con pantalla táctil (${a.altos.join(" · ")})`);
  chk(a.primario.pad === "0px 15px 0px 12px", `el primario con su relleno 12/15 (${a.primario.pad})`);
  chk(a.primario.gap === "6px" && a.primario.fs === "14.5px",
    `y su etiqueta a 14.5 con 6 hasta el signo (${a.primario.fs}, ${a.primario.gap})`);
  chk(a.primario.borde === "0px", `sin el borde que le robaba el píxel 38 (${a.primario.borde})`);
  chk(a.glifo.px === 17 && a.glifo.trazo === "2px",
    `el "+" a 17 con trazo 2 (${a.glifo.px}px / ${a.glifo.trazo})`);

  /* Los iconos fantasma del handoff —Aspecto y Rotar— NO se pintan: es la
     otra instrucción de Iván, y el propio handoff la respalda ("ni un tercer
     icono fantasma"). Se vigila que nadie los añada de buena fe: en la barra
     no puede haber ningún botón sin texto que no sea el ☰. */
  const mudos = await pg.evaluate(() =>
    [...document.querySelectorAll(".header button")]
      .filter((b) => b.getBoundingClientRect().width > 0 && !b.textContent.trim())
      .map((b) => b.className || b.getAttribute("aria-label") || "?"));
  chk(mudos.length === 0, `ningún icono fantasma en la barra (${mudos.join(" · ") || "ninguno"})`);

  // --- VERTICAL: entra el ☰, con las medidas del handoff ---
  await pg.setViewportSize({ width: 1024, height: 1366 });
  await pg.waitForTimeout(500);
  const v = await leer();
  chk(v.menuVisible, "vertical: entra el botón de menú");
  chk(v.menu.w === 38 && v.menu.h === 38, `de 38 × 38 (${v.menu.w}×${v.menu.h})`);
  chk(v.menu.x === 20, `en el margen de 20 de la barra (x=${v.menu.x})`);
  /* 9 = (56 − 38) / 2. En el arnés el inset vale 0, así que aquí y=9; en el
     aparato la regla lo suma y el botón baja con la barra. */
  chk(v.menu.y === 9, `centrado en la fila de 56 (y=${v.menu.y})`);
  chk(v.menu.radio === "10px", `radio 10 (${v.menu.radio})`);
  chk(v.padIzq === "70px", `y la barra le reserva 20 + 38 + 12 (${v.padIzq})`);

  /* El glifo: el rectángulo con la columna marcada, no las tres rayas. En
     iPadOS ese botón abre una COLUMNA, no un menú. */
  chk(v.menu.glifo === "barra lateral",
    `con el icono de barra lateral del mockup y no las tres rayas (${v.menu.glifo})`);

  /* Tiene relleno en reposo —al revés que los botones de la derecha— y va del
     color de acento. El acento se compara contra el fondo del botón primario
     en vez de contra un literal: si algún día se cambia la marca, esta guarda
     sigue diciendo la verdad en vez de quedarse clavada en un verde. */
  chk(v.menu.relleno !== "rgba(0, 0, 0, 0)", `con relleno en reposo (${v.menu.relleno})`);
  chk(v.menu.color === v.primario.fondo,
    `y del mismo acento que "Nuevo ingreso" (${v.menu.color} vs ${v.primario.fondo})`);

  /* La zona tocable, tocándola de verdad: el píxel de arriba de la barra,
     sobre el botón, tiene que devolver el botón. Con los 38 px pelados
     devolvería la barra, y el control quedaría por debajo del mínimo del
     sistema aunque se viera igual. */
  const enElFilo = await pg.evaluate(() => {
    const b = document.querySelector(".menu-hamburguesa").getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, 2);
    return el ? (el.closest(".menu-hamburguesa") ? "el botón" : (el.className || el.tagName)) : "nada";
  });
  chk(enElFilo === "el botón", `y la fila entera es tocable, no solo los 38 (${enElFilo})`);

  // --- El título: peso, recorte y que el recorte SIRVA ---
  const t = await pg.evaluate(() => {
    const el = document.querySelector(".page-title");
    const cs = getComputedStyle(el);
    return { peso: cs.fontWeight, ls: cs.letterSpacing, ov: cs.textOverflow, ws: cs.whiteSpace };
  });
  chk(t.peso === "600", `el título al 600 de las barras de iOS (${t.peso})`);
  chk(t.ls === "-0.2px", `con el interletraje del diseño (${t.ls})`);
  chk(t.ov === "ellipsis" && t.ws === "nowrap", `y con puntos suspensivos (${t.ov} / ${t.ws})`);

  /* Y que de verdad recorte, que es la mitad que se rompe sola.
     `text-overflow: ellipsis` NO basta: el bloque del título es hijo de un
     flex y sin `min-width: 0` se niega a encoger, así que empuja y se sale de
     la barra en vez de recortarse. Son dos reglas en dos sitios distintos.

     El título largo se INYECTA, y hay que decir por qué: hoy ninguno de los
     dieciséis lo es —el más largo, "Información de Membresía", cabe de sobra
     a 744—, así que medir los títulos de verdad daba verde con la regla
     puesta y verde también sin ella. Una guarda que no puede fallar no está
     guardando nada; se comprobó quitando el `min-width` y no se enteró. Lo
     que se prueba aquí es el mecanismo, para el día en que una pantalla
     nueva traiga un título que no quepa. */
  await pg.setViewportSize({ width: 744, height: 1133 });
  await pg.goto(`${URL_BASE}/#/reporte-miembros`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".header .page-title", { timeout: 10000 });
  await pg.waitForTimeout(400);
  const largo = await pg.evaluate(() => {
    const el = document.querySelector(".page-title");
    el.textContent = "Informes de membresía y asistencia del trimestre de septiembre a noviembre, con el detalle por ministerio y por grupo de edad";
    const bar = document.querySelector(".header");
    const r = el.getBoundingClientRect(), rb = bar.getBoundingClientRect();
    return {
      recortado: el.scrollWidth > el.clientWidth,
      desborde: Math.round(r.right - (rb.right - parseFloat(getComputedStyle(bar).paddingRight))),
    };
  });
  chk(largo.recortado, "un título que no cabe se recorta con puntos suspensivos");
  chk(largo.desborde <= 0, `y no empuja la barra ni un píxel (desborda ${largo.desborde})`);

  /* La otra mitad de la misma regla: el ALTO tampoco cambia. `.header` es
     `flex-wrap: wrap` en la base —de cuando era una cabecera de página—, y
     envolver es lo contrario de recortar: si las acciones crecen, el título
     se va a una segunda fila (donde vuelve a caber entero) y la barra pasa de
     56 a ~100. Hoy no le pasa a ninguna de las dieciséis, así que la
     condición se fuerza metiendo una acción ancha, igual que se forzó el
     título largo. Sin esto, `flex-wrap: nowrap` sería una línea de CSS que
     nadie puede demostrar que hace falta. */
  const conAccionAncha = await pg.evaluate(() => {
    const acc = document.querySelector(".header-actions");
    const b = document.createElement("button");
    b.className = "btn secondary";
    b.textContent = "Una acción deliberadamente larguísima para empujar la fila";
    acc.appendChild(b);
    const alto = Math.round(document.querySelector(".header").getBoundingClientRect().height);
    b.remove();
    return alto;
  });
  chk(conAccionAncha === 56, `y la barra sigue midiendo 56 (${conAccionAncha})`);
  await ctxH.close();

  /* El glifo se cambió SIN condicionarlo al iPad, y eso hay que sostenerlo:
     vale porque este botón es solo del iPad. En el iPhone el sidebar no
     existe —su contenido se mudó a Ajustes— y el ☰ está escondido con
     `!important`. Si algún día alguien se lo devuelve al teléfono, esta
     guarda cae y obliga a decidir qué glifo le toca, en vez de heredar el del
     iPad por descuido. */
  const ctxF = await nuevoContexto("iphone");
  const pf = await ctxF.newPage();
  pf.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pf.setViewportSize({ width: 430, height: 932 });
  await pf.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pf.waitForTimeout(600);
  const enFono = await pf.evaluate(() => {
    const ham = document.querySelector(".menu-hamburguesa");
    return !ham || getComputedStyle(ham).display === "none";
  });
  chk(enFono, "en el iPhone no hay ☰ ninguno, que es por lo que hay un solo glifo");
  await ctxF.close();
}

/* ---------- 37. Un solo botón de crear, y con nombre --------------------
   Iván mandó dos fotos de "Cartas y traslados" el 24 ago con los dos botones
   circulados: un "+" pelado en la esquina de la barra y, debajo, un botón
   verde con nombre dentro de la lista. Los dos hacían lo mismo.

   Es la SEGUNDA vez que esta pantalla pone la misma orden en dos sitios: la
   primera fue "Nueva carta" como pestaña del índice, que también circuló (22
   ago). Por eso la guarda no comprueba "que el botón X ya no está" —eso se
   arregla una vez y vuelve—, sino la regla: en cada sección de cada pantalla
   puede haber **como mucho un** control de alta a la vista, y si lo hay tiene
   que decir qué crea. Un "+" sin palabra era el único botón de la app que no
   lo decía.

   Se recorren las seis secciones de Cartas, que es donde vivía el problema, y
   de paso las otras pantallas con alta, para que la regla valga en todas. */
console.log("\n== Un solo botón de crear, y con nombre ==");
{
  const ctxC = await nuevoContexto("ipad", { tactil: true });
  const pg = await ctxC.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });

  /* Un control de alta es cualquier cosa pulsable que abre un formulario de
     alta. Se reconocen por el verbo, que es como los reconoce quien mira la
     pantalla: "Nueva…", "Nuevo…", "Registrar…". Y se cuenta también lo que no
     tiene texto pero lleva un "+": ese es justo el caso que se retiró. */
  const controlesDeAlta = () => pg.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const out = [];
    for (const el of document.querySelectorAll("button, a[role='button']")) {
      if (!visible(el)) continue;
      const txt = el.textContent.trim();
      const etiqueta = el.getAttribute("aria-label") || "";
      const masPelado = !txt && /nuev|crear|registrar|\+/i.test(etiqueta);
      if (/^(Nueva|Nuevo|Registrar)\b/i.test(txt) || masPelado) {
        out.push({
          texto: txt || `(sin texto: ${etiqueta})`,
          conNombre: txt.length > 0,
          enBarra: !!el.closest(".header"),
        });
      }
    }
    return out;
  });

  const SECCIONES = [
    ["resumen", "Resumen"], ["archivo", "Archivo"], ["plantillas", "Plantillas"],
    ["solicitudes", "Solicitudes"], ["salida", "Traslado de salida"], ["entrada", "Traslado de entrada"],
  ];
  await pg.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-indice", { timeout: 10000 });
  await pg.waitForTimeout(500);

  const vistos = new Set();
  for (const [, rotulo] of SECCIONES) {
    await pg.locator(".md-indice-item", { hasText: rotulo }).first().click();
    await pg.waitForTimeout(450);
    const c = await controlesDeAlta();
    chk(c.length <= 1, `Cartas · ${rotulo}: un solo control de alta (${c.map((x) => x.texto).join(" · ") || "ninguno"})`);
    if (c.length === 1) {
      chk(c[0].conNombre, `y dice qué crea: "${c[0].texto}"`);
      chk(c[0].enBarra, "y vive en la barra, no dentro de la lista");
      vistos.add(c[0].texto);
    }
  }
  /* Y el nombre CAMBIA con la sección: si fuera siempre el mismo, el botón
     estaría mintiendo en cinco de las seis. */
  chk(vistos.size >= 4, `el nombre cambia con la sección (${[...vistos].join(" · ")})`);

  /* Que además funcione: en Traslado de salida, el botón de la barra abre el
     formulario que antes abría el botón de dentro de la lista. */
  await pg.locator(".md-indice-item", { hasText: "Traslado de salida" }).first().click();
  await pg.waitForTimeout(400);
  await pg.locator(".header .btn.primary").click();
  await pg.waitForTimeout(600);
  const abrio = await pg.evaluate(() =>
    !!document.querySelector(".modal-card, .ios-sheet, .nm-hoja"));
  chk(abrio, "y el botón de la barra abre el formulario de alta");
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(300);

  /* La misma regla en las otras pantallas con alta. No es de más: si mañana
     alguien vuelve a poner un botón de crear dentro de una lista, aquí se ve
     el día que lo haga y no seis semanas después en una foto. */
  for (const ruta of ["ingresos", "gastos", "membresia", "miembros", "actas", "servicios", "depositos", "agenda"]) {
    await pg.goto(`${URL_BASE}/#/${ruta}`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".header", { timeout: 10000 });
    await pg.waitForTimeout(400);
    const c = await controlesDeAlta();
    chk(c.length <= 1, `${ruta}: un solo control de alta (${c.map((x) => x.texto).join(" · ") || "ninguno"})`);
    if (c.length === 1) chk(c[0].conNombre, `${ruta}: y dice qué crea ("${c[0].texto}")`);
  }
  await ctxC.close();
}

/* ---------- 38. Cartas y traslados, rehecha con su handoff --------------
   Iván: "es la única página que no se diseñó bien". Al medirla salieron tres
   cosas de fondo, y ninguna era de estilo:

    1. El cuerpo entero estaba escrito DOS VECES —625 líneas idénticas byte
       por byte, una para el iPad y otra para el Mac—, así que cada arreglo
       había que hacerlo dos veces y el segundo se olvidaba.
    2. El panel heredaba `max-width: 720px`, que es la medida de un DOCUMENTO
       que se lee. Con cinco tablas dentro, los 224px que faltaban salían
       todos de la única columna elástica: la del nombre.
    3. Una regla de CSS se había quedado sin su bloque de declaraciones y el
       navegador la fundía con la siguiente, dándole `flex-direction: column`
       al botón de alta —el "+" encima de su etiqueta— y perdiendo por el
       camino el `display: none` que escondía los botones duplicados en el
       teléfono.

   Lo que se vigila aquí es el RESULTADO de las tres, medido: que la columna
   del nombre se pueda leer en las cinco tablas, que la fila mida lo que dice
   el handoff, y que el botón de la barra quepa en una línea. */
console.log("\n== Cartas y traslados, con su handoff ==");
{
  const ctxC = await nuevoContexto("ipad", { tactil: true });
  const pg = await ctxC.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".md-indice-item", { timeout: 10000 });
  await pg.waitForTimeout(500);

  /* El índice: la sección abierta va del color de la app, no de gris.
     El acento se compara contra el fondo del botón de alta en vez de contra
     un verde literal, para que la guarda siga diciendo la verdad si algún
     día se cambia la marca. */
  const sel = await pg.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const s = document.querySelector(".md-indice-item.sel");
    const n = s ? s.querySelector(".md-indice-nombre") : null;
    const b = document.querySelector(".header .btn.primary");
    return {
      relleno: s ? cs(s).backgroundColor : "ninguno",
      nombre: n ? cs(n).color : "ninguno",
      acento: b ? cs(b).backgroundColor : "ninguno",
      radio: s ? cs(s).borderRadius : "-",
    };
  });
  chk(sel.nombre === sel.acento,
    `la sección abierta va del acento y no de gris (${sel.nombre} vs ${sel.acento})`);
  chk(sel.relleno !== "rgba(0, 0, 0, 0)", `con su relleno teñido (${sel.relleno})`);
  chk(sel.radio === "11px", `y el radio del handoff (${sel.radio})`);

  /* El botón de la barra, en UNA línea. Es lo que destapó la regla rota: con
     `flex-direction: column` el "+" se apilaba encima de la etiqueta y los
     dos renglones se salían de un botón de 38. Se mide el alto del contenido
     contra el del botón, que es lo que se ve. */
  const boton = await pg.evaluate(() => {
    const b = document.querySelector(".header .btn.primary");
    const cs = getComputedStyle(b);
    return { dir: cs.flexDirection, alto: Math.round(b.getBoundingClientRect().height), desborda: `${b.scrollHeight}>${b.clientHeight}` };
  });
  chk(boton.dir === "row", `el botón de alta pone el "+" al lado, no encima (${boton.dir})`);
  /* Solo el alto de la caja: el `scrollHeight` de este botón vale 47 y no 38
     a propósito —la zona tocable es un `::before` de `inset: -9px`, que
     extiende el desbordamiento sin pintar nada—. Comprobarlo habría sido
     acusar al arreglo de §39 de ser un fallo. */
  chk(boton.alto === 38, `y cabe en sus 38 (${boton.alto})`);

  /* Las cinco tablas. Lo que se mide es la columna que se LEE —la del nombre,
     la única elástica— porque es la que pagaba los 224px del `max-width`:
     con las columnas del handoff y el panel capado se quedaba en 32px.
     El umbral de 200 no es redondo por gusto: por debajo, "Iglesia El Buen
     Pastor" ya no cabe entero. */
  const SECCIONES = [
    ["Archivo", "tabla-cartas"],
    ["Plantillas", "tabla-plantillas"],
    ["Solicitudes", "tabla-solicitudes"],
    ["Traslado de salida", "tabla-salida"],
    ["Traslado de entrada", "tabla-entrada"],
  ];
  /* Se recorren DOS anchos, y el segundo no es de adorno.
     A 1366 el panel mide 710 y entran las columnas reducidas; a 1600 mide 944
     y entran las del handoff completas, que es donde el `max-width: 720px`
     heredado hacía el destrozo: la columna del nombre bajaba a 32px. Con solo
     el ancho chico, quitar ese cap no cambia nada y la guarda no lo notaría —
     se comprobó devolviéndolo. */
  for (const ancho of [1366, 1600]) {
  await pg.setViewportSize({ width: ancho, height: 1024 });
  await pg.waitForTimeout(300);
  for (const [rotulo, clase] of SECCIONES) {
    await pg.locator(".md-indice-item", { hasText: rotulo }).first().click();
    await pg.waitForTimeout(450);
    const m = await pg.evaluate((clase) => {
      const cs = (e) => getComputedStyle(e), rc = (e) => e.getBoundingClientRect();
      const t = document.querySelector(`.data-table.${clase}`);
      if (!t) return null;
      const th = t.querySelector(".thead");
      const tr = t.querySelector(".tr");
      const vivas = tr ? [...tr.children].filter((c) => cs(c).display !== "none") : [];
      /* La columna que se lee es la segunda en cuatro de las cinco —la
         primera es el folio—, pero en Plantillas no hay folio y el nombre es
         la primera. Se dice aquí en vez de suponerlo: la primera versión de
         esta guarda medía siempre la segunda y acusaba a Plantillas de tener
         150px cuando su nombre tenía 240. */
      const iNombre = clase === "tabla-plantillas" ? 0 : 1;
      const nombre = vivas.length > iNombre ? Math.round(rc(vivas[iNombre]).width) : 0;
      return {
        cabecera: th ? Math.round(rc(th).height) : 0,
        fila: tr ? Math.round(rc(tr).height) : 0,
        nombre,
        columnas: vivas.length,
        scroll: t.scrollWidth > t.clientWidth + 1,
      };
    }, clase);
    chk(m !== null, `${ancho} · ${rotulo}: la tabla se pinta`);
    if (!m) continue;
    chk(m.nombre >= 200, `${ancho} · ${rotulo}: la columna que se lee mide ${m.nombre}px`);
    chk(m.cabecera === 40, `${ancho} · ${rotulo}: cabecera de 40 (${m.cabecera})`);
    chk(m.fila <= 62, `${ancho} · ${rotulo}: filas de 58 y no de 75 (${m.fila})`);
    chk(!m.scroll, `${ancho} · ${rotulo}: sin scroll horizontal`);
  }
  }
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.waitForTimeout(300);

  /* El pie del archivo, dentro de la tarjeta: cuántas cartas hay. Sin él la
     tabla terminaba en seco —`Pagination` se esconde con una sola página— y
     no se veía cuántas contiene. */
  await pg.locator(".md-indice-item", { hasText: "Archivo" }).first().click();
  await pg.waitForTimeout(400);
  const pie = await pg.evaluate(() => {
    const p = document.querySelector(".data-table .tabla-pie");
    return p ? p.textContent.trim() : "sin pie";
  });
  chk(/\d+\s+de\s+\d+/.test(pie), `el archivo dice cuántas cartas tiene ("${pie}")`);
  await ctxC.close();

  /* ---- El editor de la carta (handoff "Tamio Nueva Carta") ----
     El mismo fallo que las tablas, en su versión más cara. `.ce-split` repartía
     `minmax(0,1fr) 298px`: el PAPEL elástico y el FORMULARIO clavado en 298.
     Medido, el papel salía a 332 y el formulario a 298, y dentro de esos 298 la
     rejilla de dos columnas dejaba campos de ~50px — "Se" por "Se asigna al
     guardar", la fecha cortada, "Lugar de emisión" en tres renglones. El
     formulario, que es donde se trabaja, era inservible para que la miniatura
     se viera un poco más grande.

     Se mide el ANCHO DE UN CAMPO, que es lo que se usa, y no la rejilla: un
     campo por debajo de 150 no admite una fecha ni un nombre. */
  const ctxEd = await nuevoContexto("ipad", { tactil: true });
  const ped = await ctxEd.newPage();
  ped.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await ped.setViewportSize({ width: 1366, height: 1024 });
  await ped.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await ped.waitForSelector(".header .btn.primary", { timeout: 10000 });
  await ped.locator(".header .btn.primary").first().click();
  await ped.waitForTimeout(1800);

  const ed = await ped.evaluate(() => {
    const cs = (e) => getComputedStyle(e), rc = (e) => e.getBoundingClientRect();
    const sp = document.querySelector(".ce-split");
    const papel = document.querySelector(".ce-papel");
    const form = document.querySelector(".ce-split .card");
    const campos = [...document.querySelectorAll(".ce-split .card .form-group")]
      .filter((g) => rc(g).width > 0).map((g) => Math.round(rc(g).width));
    return {
      hay: !!sp,
      papel: papel ? Math.round(rc(papel).width) : 0,
      form: form ? Math.round(rc(form).width) : 0,
      papelPrimero: papel && form ? rc(papel).left < rc(form).left : false,
      campoMin: campos.length ? Math.min(...campos) : 0,
      campos: campos.length,
      volver: !!document.querySelector(".ce-barra-volver"),
      pie: !!document.querySelector(".ce-papel-pie"),
      barra: document.querySelector(".ce-barra") ? Math.round(rc(document.querySelector(".ce-barra")).height) : 0,
    };
  });
  chk(ed.hay, "el editor abre con la hoja al lado del formulario");
  chk(ed.papel === 250, `el riel del papel mide sus 250 (${ed.papel})`);
  chk(ed.papelPrimero, "y va a la izquierda, como en el handoff");
  chk(ed.form > ed.papel, `el formulario se queda con el resto (${ed.form} contra ${ed.papel})`);
  chk(ed.campoMin >= 150, `y ningún campo baja de 150 (el más chico, ${ed.campoMin})`);
  chk(ed.barra === 50, `la barra del editor mide 50 (${ed.barra})`);
  chk(ed.volver, "con su \"‹ Cartas y traslados\": apaisado no había forma de salir del editor");
  chk(ed.pie, "y la miniatura dice que es la misma hoja que sale por la impresora");
  await ctxEd.close();

  /* Y la regla reparada, por su otra mitad: en el teléfono el botón de alta
     de la cabecera tiene que estar ESCONDIDO —ahí lo cubre el "+" flotante—,
     que es lo que el `display: none` perdido debía hacer y no hacía. */
  const ctxF = await nuevoContexto("iphone");
  const pf = await ctxF.newPage();
  pf.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pf.setViewportSize({ width: 430, height: 932 });
  await pf.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await pf.waitForTimeout(600);
  const enFono = await pf.evaluate(() => {
    const b = document.querySelector(".btn-nuevo-cabecera");
    if (!b) return "no existe";
    return getComputedStyle(b).display === "none" ? "escondido" : "VISIBLE";
  });
  chk(enFono !== "VISIBLE",
    `en el teléfono el botón de cabecera no duplica al "+" flotante (${enFono})`);
  await ctxF.close();
}

{
  const ctxE = await nuevoContexto("ipad", { tactil: true });
  const pg = await ctxE.newPage();
  const DIRC = process.env.CAPTURAS || "";
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".header .btn.primary", { timeout: 10000 });
  await pg.locator(".header .btn.primary").first().click();
  await pg.waitForTimeout(1800);
  if (DIRC) await pg.screenshot({ path: `${DIRC}/carta-editor.png` });
  await ctxE.close();
}

/* ---------- 46. El registro de lo que pasa en la iglesia ----------
   Iván, 25 ago 2026: "la página de mensajes debería ser otra función, no
   recibir mensajes como si fuera un chat; las personas ya tienen WhatsApp e
   iMessage". El código le daba más razón todavía: `mensajes` nunca fue un chat
   por dentro —guardaba `de_rol` y `cuerpo`, sin destinatario ni conversación—
   y lo único valioso ahí era un aviso AUTOMÁTICO enterrado entre texto
   tecleado a mano.

   **Lo que esta sección prueba, y por qué cada cosa:**

     · Que un suceso QUEDE ESCRITO al hacer la operación, no al mirarla. Si el
       apunte dependiera de que alguien abra una pantalla, no sería un
       registro.
     · Que el TESORERO NO VEA lo del padrón. Es la decisión de Iván sobre quién
       ve qué, y la única de las tres que puede fallar en silencio: un filtro
       mal escrito enseña de más y nadie se queja nunca de ver cosas.
     · Que el texto se componga AL LEER desde `tipo` + `datos`. Es la
       diferencia con `mensajes`, que guardaba la frase armada y por eso se
       congelaba en el idioma de quien la provocó.
     · Y que una nota a mano se distinga de un suceso automático. Sin eso, las
       notas convertirían esto otra vez en el tablón del que veníamos. */
console.log("\n== El registro de lo que pasa en la iglesia ==");
{
  const ctxRg = await nuevoContexto("ipad");
  const pg = await ctxRg.newPage();
  pg.on("pageerror", (e) => { fallos++; console.error("  ✗ pageerror:", e.message); });
  await pg.setViewportSize({ width: 1366, height: 1024 });
  await pg.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".sidebar, .app", { timeout: 30000 });

  /* --- Un suceso se escribe al HACER la operación --- */
  const trasBorrar = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const antes = (await db.listRegistro(ig.id, "administrador")).length;
    const tx = await db.insertTx(ig.id, ig.moneda, {
      tipo: "gasto", categoria: "servicios", concepto: "Gasto que se va a borrar",
      fecha: db.hoyISO(), monto: 4200, metodo_pago: "efectivo",
    });
    const todas = await db.listTx(ig.id, { limit: 400 });
    const suyo = todas.find((t) => t.concepto === "Gasto que se va a borrar");
    await db.deleteTx(suyo.id, ig.id);
    const reg = await db.listRegistro(ig.id, "administrador");
    const apunte = reg.find((r) => r.tipo === "movEliminado");
    return {
      antes, despues: reg.length, creado: !!tx,
      datos: apunte?.datos ?? null, area: apunte?.area ?? null,
    };
  });
  chk(trasBorrar.despues > trasBorrar.antes,
    `borrar un movimiento deja apunte (${trasBorrar.antes} → ${trasBorrar.despues})`);
  chk(trasBorrar.area === "tesoreria", `y va al área de tesorería (${trasBorrar.area})`);
  /* El apunte guarda QUÉ se borró, no un id. Un registro que dijera "se
     eliminó el movimiento 47" no serviría de nada seis meses después, y menos
     cuando esa fila ya se purgó. */
  chk(/Gasto que se va a borrar/.test(trasBorrar.datos ?? ""),
    "y dice QUÉ se borró, no un id");
  chk(/folio/.test(trasBorrar.datos ?? "") && /monto/.test(trasBorrar.datos ?? ""),
    "con su folio y su importe");

  /* --- El texto se compone AL LEER, no se guarda armado ---
     Es la diferencia con `mensajes`. Se comprueba que en `datos` viajan las
     PIEZAS y que la frase final no está ahí dentro. */
  chk(!/Se eliminó/.test(trasBorrar.datos ?? ""),
    "y la FRASE no está guardada: solo sus piezas, para que siga el idioma de quien mira");

  /* --- Cada quien ve lo suyo ---
     La comprobación que puede fallar en silencio: enseñar de más no se queja
     nadie. Se provoca un suceso de SECRETARÍA y se mira quién lo ve. */
  const porRol = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    const ms = await db.listMembers(ig.id);
    await db.darDeBajaMember(ms[0].id, ig.id, db.hoyISO(), "traslado");
    const ve = async (rol) => {
      const r = await db.listRegistro(ig.id, rol);
      return {
        total: r.length,
        tesoreria: r.filter((x) => x.area === "tesoreria").length,
        secretaria: r.filter((x) => x.area === "secretaria").length,
      };
    };
    return { admin: await ve("administrador"), tesorero: await ve("tesorero"), secre: await ve("secretaria") };
  });
  chk(porRol.admin.secretaria > 0 && porRol.admin.tesoreria > 0,
    `el administrador lo ve todo (${porRol.admin.tesoreria} de dinero, ${porRol.admin.secretaria} del padrón)`);
  chk(porRol.tesorero.secretaria === 0,
    `el TESORERO no ve nada del padrón (${porRol.tesorero.secretaria})`);
  chk(porRol.tesorero.tesoreria > 0, `pero sí lo del dinero (${porRol.tesorero.tesoreria})`);
  chk(porRol.secre.tesoreria === 0, `y la secretaria no ve nada del dinero (${porRol.secre.tesoreria})`);
  chk(porRol.secre.secretaria > 0, `pero sí lo del padrón (${porRol.secre.secretaria})`);

  /* --- La nota a mano, y que se distinga --- */
  const conNota = await pg.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    await db.registrarNota(ig.id, "El diezmo de marzo lo trajo el pastor en efectivo");
    const r = await db.listRegistro(ig.id, "administrador");
    const nota = r.find((x) => x.tipo === "nota");
    return {
      hayNota: !!nota, cuerpo: nota?.cuerpo ?? null, area: nota?.area ?? null,
      // Un suceso automático NUNCA usa `cuerpo`: su texto se compone.
      automaticosConCuerpo: r.filter((x) => x.tipo !== "nota" && x.cuerpo).length,
    };
  });
  chk(conNota.hayNota, "una nota a mano queda anotada");
  chk(/pastor en efectivo/.test(conNota.cuerpo ?? ""), "con su texto");
  chk(conNota.area === "general", `y en el área general, que la ven los tres roles (${conNota.area})`);
  /* La marca que las separa: si un suceso automático llenara `cuerpo`, la
     pantalla no podría distinguir lo que escribió la app de lo que escribió
     una persona, y esto volvería a ser un tablón. */
  chk(conNota.automaticosConCuerpo === 0,
    `y ningún suceso automático usa el cuerpo, que es lo que los separa (${conNota.automaticosConCuerpo})`);

  /* --- Y la pantalla lo enseña --- */
  await pg.goto(`${URL_BASE}/#/inbox`, { waitUntil: "networkidle" });
  await pg.waitForTimeout(700);
  const enPantalla = await pg.evaluate(() => ({
    filas: document.querySelectorAll(".reg-fila").length,
    notas: document.querySelectorAll(".reg-fila--nota").length,
    dias: document.querySelectorAll(".reg-dia").length,
    // Que NO quede rastro del chat: ni burbujas ni compositor pegado abajo.
    burbujas: document.querySelectorAll(".msg-bubble").length,
    texto: document.body.innerText,
  }));
  chk(enPantalla.filas > 0, `la pantalla enseña el registro (${enPantalla.filas} filas)`);
  chk(enPantalla.dias > 0, `agrupado por día (${enPantalla.dias})`);
  chk(enPantalla.notas === 1, `y la nota se marca aparte del resto (${enPantalla.notas})`);
  chk(enPantalla.burbujas === 0, `sin rastro del chat: cero burbujas (${enPantalla.burbujas})`);
  /* El texto compuesto de verdad, en la pantalla: si `datos` no casara con la
     plantilla de i18n saldría la clave en crudo o un hueco. */
  chk(/Se eliminó el movimiento/.test(enPantalla.texto),
    "y el texto se compone con sus piezas, no sale la clave en crudo");
  if (process.env.CAPTURAS) {
    await pg.screenshot({ path: `${process.env.CAPTURAS}/registro-1366x1024.png` });
  }
  await ctxRg.close();
}

await browser.close();
vite.kill();
console.log(fallos === 0 ? "\nTODO EN VERDE" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
