// Capturas del rediseño de iPhone (iOS 26), sobre la app REAL.
//
// Mismo montaje que `arnes-ipad.mjs` —vite dev + un stub de SQL (sql.js con
// las migraciones reales de src-tauri/src/lib.rs) detrás de `invoke`, y datos
// sembrados con las funciones reales de `db.ts`—, pero en vez de medir,
// fotografía. Sirve para mirar el rediseño sin un iPhone delante.
//
//   npm i --no-save playwright sql.js
//   node pruebas/capturas-iphone.mjs
//
// Las imágenes salen en `pruebas/capturas/`, que NO entra en git.
//
// Por qué 393×852: es el iPhone 15/16 Pro, el mismo lienzo sobre el que está
// dibujada la maqueta del handoff, así que las capturas y las maquetas se
// pueden poner una al lado de la otra sin escalar ninguna.
import { chromium } from "playwright";
import initSqlJs from "sql.js";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = `${REPO}/pruebas/capturas`;
const URL_BASE = "http://localhost:1420";
mkdirSync(SALIDA, { recursive: true });

// ---------- 1. Migraciones reales desde lib.rs ----------
function extraerMigraciones() {
  const src = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");
  const out = [];
  const re = /version:\s*(\d+),[\s\S]*?sql:\s*r#"([\s\S]*?)"#/g;
  let m;
  while ((m = re.exec(src))) out.push({ version: Number(m[1]), sql: m[2] });
  return out.sort((a, b) => a.version - b.version);
}

// ---------- 2. Base en memoria ----------
const SQL = await initSqlJs();
const db = new SQL.Database();
const migs = extraerMigraciones();
if (migs.length < 30) { console.error(`solo ${migs.length} migraciones`); process.exit(1); }
for (const mig of migs) {
  try { db.exec(mig.sql); }
  catch (e) { console.error(`migración ${mig.version}: ${e.message}`); process.exit(1); }
}
console.log(`base lista: ${migs.length} migraciones`);

const bind = (ps) => Object.fromEntries(ps.map((p, i) => [`$${i + 1}`, p === undefined ? null : p]));
function sqlSelect(q, ps) {
  const st = db.prepare(q);
  try { if (ps?.length) st.bind(bind(ps)); const r = []; while (st.step()) r.push(st.getAsObject()); return r; }
  finally { st.free(); }
}
function sqlExecute(q, ps) {
  if (!ps?.length) db.exec(q);
  else { const st = db.prepare(q); try { st.bind(bind(ps)); st.step(); } finally { st.free(); } }
  return { rowsAffected: db.getRowsModified(), lastInsertId: sqlSelect("SELECT last_insert_rowid() AS id", [])[0]?.id ?? 0 };
}

// ---------- 3. Vite ----------
/* Si una pasada anterior murió a medias, su `vite` se queda vivo con el 1420
   tomado y ESTA falla con "vite no arrancó" — un error que no dice nada de lo
   que pasó de verdad y que cuesta un rato entender. Se limpia antes de
   arrancar. `--strictPort` está puesto a propósito: sin él vite se mudaría al
   1421 en silencio y las capturas saldrían de un servidor que no es el que
   creemos. */
try { spawn("pkill", ["-f", "vite --port 1420"]).unref(); } catch { /* no había ninguno */ }
await new Promise((r) => setTimeout(r, 1500));

/* `--login` fotografía la PUERTA (maquetas B1–B4) y nada más.
   Va en pasada aparte por una razón y no por comodidad: la pantalla de acceso
   solo existe cuando hay credenciales de Supabase configuradas, y en cuanto
   las hay la app entera se queda detrás del login — sin sesión no se puede
   fotografiar ninguna otra pantalla. Las credenciales son de mentira: aquí no
   se pulsa «Entrar», solo se recorren los cuatro estados. */
const SOLO_LOGIN = process.argv.includes("--login");
const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], {
  cwd: REPO,
  stdio: ["ignore", "pipe", "pipe"],
  env: SOLO_LOGIN
    ? { ...process.env, VITE_SUPABASE_URL: "https://ejemplo.supabase.co", VITE_SUPABASE_ANON_KEY: "clave-de-mentira" }
    : process.env,
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite no arrancó (¿puerto 1420 ocupado?)")), 60000);
  vite.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
  vite.stderr.on("data", (d) => process.stderr.write(d));
});
console.log("vite arriba");
process.on("exit", () => vite.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { vite.kill(); process.exit(1); });

// ---------- 4. Navegador ----------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/** Un contexto de iPhone. `tema` = "light" | "dark"; `rol` = el de `role.ts`
 *  ("administrador" por omisión, que es con el que arranca la app). */
async function contextoIPhone(tema, rol = "administrador") {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    colorScheme: tema,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.exposeFunction("__sqlStub", (esSelect, q, ps) => {
    try { return esSelect ? sqlSelect(q, ps) : sqlExecute(q, ps); }
    catch (e) { console.error(`SQL: ${e.message}\n  ${q.slice(0, 120)}`); throw e; }
  });
  await ctx.addInitScript(({ tema, rol }) => {
    try {
      localStorage.setItem("tesoreria-welcomed", "1");
      localStorage.setItem("tesoreria-lang", "es");
      localStorage.setItem("tesoreria-theme", tema);
      localStorage.setItem("tamio-rol", rol);
    } catch { /* noop */ }
    const noop = async () => null;
    /* `listen()` de Tauri registra el listener por `invoke` pero lo SUELTA
       llamando a este objeto. Sin él, cada desmontaje de la app lanzaba
       «Cannot read properties of undefined (reading 'unregisterListener')»,
       y con React lanzando dentro de un efecto de limpieza el árbol se
       quedaba a medio desmontar: el `.app` desaparecía y la siguiente
       navegación del arnés se colgaba esperándolo. */
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
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
  }, { tema, rol });
  return ctx;
}

// ---------- 5. Semilla, con las funciones reales de db.ts ----------
/* Con `--login` no se siembra: la app entera está detrás de la puerta, así
   que `.app` no llega a montarse nunca y sembrar sería esperar sesenta
   segundos a un elemento que no va a existir. */
const ctxSemilla = SOLO_LOGIN ? null : await contextoIPhone("light");
if (ctxSemilla) {
  const page = await ctxSemilla.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app", { timeout: 60000 });
  const ok = await page.evaluate(async () => {
    const db = await import("/src/db.ts");
    const iglesia = await db.getOrCreateChurch();
    const id = iglesia.id;
    const p = (x) => String(x).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const hace = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    const en = (n) => hace(-n);

    // Nombres repartidos por inicial: es lo que hace que el índice alfabético
    // de Miembros tenga de verdad varias letras que ofrecer.
    const nombres = [
      "Ana Aguilar", "Abel Cortés", "Andrés López", "Beatriz Rangel",
      "Carlos Medina", "Daniela Ruiz", "Elena Morales", "Fernando Ibarra",
      "Gabriela Ponce", "Héctor Salas", "Irene Vargas", "Javier Ortega",
      "Karla Domínguez", "Luis Navarro", "María Delgado", "Nadia Fuentes",
      "Óscar Reyes", "Patricia Lara", "Raúl Estrada", "Sofía Cabrera",
    ];
    /* Cinco altas del año en curso, repartidas y con meses vacíos por medio:
       es lo que hace falta para que las barras de la portada de Secretaría
       dibujen algo. Con todo el padrón entrando "hace 400 días" —el año
       pasado— la serie salía en cero de enero a diciembre y la franja de la
       tarjeta era una raya gris de doce tramos. */
    const antiguedades = [200, 150, 90, 45, 10];
    for (const [i, nombre] of nombres.entries()) {
      const dias = i >= nombres.length - antiguedades.length
        ? antiguedades[i - (nombres.length - antiguedades.length)]
        : 400;
      await db.insertMember(id, { nombre, fecha_ingreso: hace(dias) });
    }
    const miembros = await db.listMembers(id);

    // Ingresos y gastos repartidos en los últimos días, para que las secciones
    // por fecha ("Hoy", "Ayer", …) tengan más de una fila cada una.
    const catsIngreso = ["diezmo", "ofrenda", "donacion"];
    const catsGasto = ["servicios", "pastores", "limpieza", "administracion"];
    let n = 0;
    for (const dia of [0, 0, 0, 1, 1, 2, 4, 4, 6, 9, 12, 15, 18, 21, 25, 30, 36, 44]) {
      await db.insertTx(id, iglesia.moneda, {
        tipo: "ingreso", categoria: catsIngreso[n % catsIngreso.length],
        concepto: n % 3 === 1 ? "Ofrenda dominical" : "Diezmo",
        fecha: hace(dia), monto: 82000 + n * 13500, metodo_pago: n % 2 ? "transferencia" : "efectivo",
        member_id: miembros[n % miembros.length].id,
      });
      n++;
    }
    n = 0;
    for (const dia of [0, 1, 3, 3, 5, 8, 11, 14, 17, 20, 26, 33, 40]) {
      await db.insertTx(id, iglesia.moneda, {
        tipo: "gasto", categoria: catsGasto[n % catsGasto.length],
        concepto: ["Luz y agua", "Compensación pastoral", "Aseo del templo", "Papelería"][n % 4],
        fecha: hace(dia), monto: 31000 + n * 9000, metodo_pago: "transferencia",
        beneficiario: ["CFE", "Pastor Elías", "Servicios Nova", "Papelería Delta"][n % 4],
      });
      n++;
    }

    // Depósitos repartidos en varios meses: el historial se agrupa por mes.
    for (const [dia, cuenta] of [[2, "BBVA ····4471"], [12, "BBVA ····4471"], [26, "Banorte ····8802"],
                                 [38, "BBVA ····4471"], [55, "Banorte ····8802"], [70, "BBVA ····4471"]]) {
      await db.insertDeposito(id, iglesia.moneda, {
        fecha: hace(dia), monto: 410000 + dia * 3000, cuenta_banco: cuenta,
        referencia: `REF-${1000 + dia}`, periodo: hace(dia).slice(0, 7), notas: null,
      });
    }
    /* Un depósito nacido de un CORTE, con su doble firma pedida. Los seis de
       arriba se registran sueltos, y un depósito suelto no tiene desglose ni
       segunda firma que enseñar: la pantalla del corte —la mitad de la que
       existe— quedaba sin fotografiar. Este lleva movimientos dentro, así que
       sale su efectivo, sus cheques y a quién le toca firmar. */
    {
      const delDia = await db.listTx(id, { limit: 500 });
      const paraElCorte = delDia.filter((x) => x.tipo === "ingreso").slice(0, 4);
      const total = paraElCorte.reduce((a, x) => a + x.monto, 0);
      const depId = await db.insertDeposito(id, iglesia.moneda, {
        fecha: hace(1), monto: total, cuenta_banco: "BBVA ····4471",
        referencia: "REF-2001", periodo: hace(1).slice(0, 7), notas: null,
      });
      const corteId = await db.insertCorte(id, {
        fecha: hace(1),
        nombre: "Corte del culto dominical",
        cuenta_banco: "BBVA ····4471",
        responsable: "Rosa Elena Vega",
        dobleFirma: true,
      }, paraElCorte.map((x) => x.id));
      if (corteId != null && depId != null) await db.cerrarCorte(corteId, id, depId);
    }

    // Cartas repartidas por estado, para que el Archivo y las colas del
    // Resumen tengan algo que enseñar y se vea la insignia de cada estado.
    const tiposCarta = ["traslado", "recomendacion", "certificacion", "constanciaActivo", "buenaConducta"];
    const estados = ["borrador", "preparacion", "firma", "aprobada", "lista", "entregada"];
    for (let i = 0; i < 9; i++) {
      const m = miembros[i % miembros.length];
      await db.insertCarta(id, {
        tipo: tiposCarta[i % tiposCarta.length],
        fecha_emision: hace(i * 4),
        lugar_emision: iglesia.ciudad || null,
        destinatario_tipo: i % 2 ? "iglesia" : "miembro",
        member_id: m.id,
        destinatario_nombre: i % 2 ? "Iglesia Monte Sion, Monterrey" : m.nombre,
        destinatario_direccion: null,
        asunto: null, saludo: null,
        cuerpo_html: "<p>Por medio de la presente hacemos constar…</p>",
        despedida: null, firmas: [], observaciones: null,
        estado: estados[i % estados.length],
        entregada_a: null, fecha_entrega: null,
      });
    }

    // Servicios con asistencia, para que la lista y las tres cifras del mes
    // tengan algo que enseñar.
    // Las claves REALES de `servicios.tipo` (es.ts ~1934). Con nombres
    // inventados la fila salía enseñando la clave cruda —"servicios.tipo.
    // cultoDominical"— porque `t()` devuelve la clave cuando no la encuentra.
    const tiposServicio = ["dominical", "estudio", "oracion", "dominical"];
    const predicadores = ["Pastor Iván García", "Diác. Abel Cortés", "Beatriz Mena", "Pastor Iván García"];
    for (let i = 0; i < 8; i++) {
      const presentes = miembros.slice(0, 18 - i).map((m) => ({
        member_id: m.id, presente: i % 4 !== 2 || m.id % 2 === 0,
        razon: null, razon_otra: null, seguimiento: false,
        // `nombre_snapshot` es NOT NULL: el roster se congela con el nombre que
        // el miembro tenía ese día, para que renombrarlo después no reescriba
        // la asistencia de un servicio ya cerrado.
        nombre_snapshot: m.nombre,
      }));
      await db.insertServicio(id, {
        fecha: hace(i * 3 + 1),
        tipo: tiposServicio[i % tiposServicio.length],
        dirige: null, predica: predicadores[i % predicadores.length],
        titulo_mensaje: null, texto_biblico: null, resumen_mensaje: null,
        participaciones: [], tema_escuela: null, maestro_escuela: null,
        asistencia: presentes, visitantes: [],
        ninos: 4 + (i % 3), jovenes: 6, adultos: 20, eventos: null,
      });
    }

    // Actividades repartidas: hoy, esta semana y pasadas, para que las cuatro
    // vistas de Agenda (mes, semana, lista, historial) tengan qué enseñar.
    // Claves REALES de `agenda.tipos` (es.ts). "ensayo" y "visita" no existen y
    // la fila enseñaba la clave cruda —"agenda.tipos.vi…"—, el mismo tropiezo
    // que con los tipos de servicio: `t()` devuelve la clave si no la encuentra.
    const tiposAct = ["cultoRegular", "reunionAdministrativa", "escuelaBiblica", "vigilia"];
    for (const [dia, nombre, estado] of [
      [0, "Culto de oración", "programada"], [0, "Ensayo de alabanza", "programada"],
      [1, "Reunión de diáconos", "programada"], [3, "Visita a hospital", "programada"],
      [6, "Culto especial de aniversario", "programada"], [12, "Escuela dominical", "programada"],
      [-4, "Junta administrativa", "completada"], [-11, "Vigilia de oración", "completada"],
      [-18, "Retiro de jóvenes", "cancelada"],
    ]) {
      const n = Number(dia);
      await db.insertActividad(id, {
        nombre: String(nombre),
        tipo: tiposAct[Math.abs(n) % tiposAct.length], tipo_personalizado: null,
        fecha: n >= 0 ? en(n) : hace(-n),
        hora_inicio: "19:00", hora_fin: null, dia_completo: false,
        lugar: "Templo", descripcion: null, responsable_member_id: null,
        responsable_persona: null, responsable_ministerio: null,
        invitado: null, contacto: null, estado: String(estado), es_fecha_importante: n === 6,
      });
    }

    return "ok";
  });
  console.log(ok === "ok" ? "datos sembrados" : `semilla devolvió ${ok}`);
  await page.close();
}
await ctxSemilla?.close();

// B1, B2, B3 y B4 · La puerta. Solo con `--login` (ver arriba): con Supabase
// configurado no hay nada más que fotografiar, y sin él esta pantalla no
// existe.
if (SOLO_LOGIN) {
  for (const tema of ["light", "dark"]) {
    const ctx = await contextoIPhone(tema);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
    const toma = async (nombre) => {
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SALIDA}/24-acceso-${nombre}-${tema}.png` });
      console.log(`  ✓ pruebas/capturas/24-acceso-${nombre}-${tema}.png`);
    };
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".login-ios", { timeout: 30000 });
    await toma("entrar");

    // Con los dos campos escritos el botón pasa de translúcido a blanco.
    await page.locator('.login-ios input[type="email"]').fill("tesoreria@iglesia.mx");
    await page.locator('.login-ios input[type="password"]').fill("secreto123");
    await toma("entrar-listo");

    await page.getByRole("button", { name: /Olvidaste|forgot/i }).click();
    await toma("recuperar");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: /Crear una cuenta|Create a new/i }).click();
    await toma("crear-cuenta");
    await ctx.close();
  }
  await browser.close();
  vite.kill();
  console.log("\nlisto");
  process.exit(0);
}

// ---------- 6. Las capturas ----------
const PANTALLAS = [
  { nombre: "1-inicio", ruta: "/" },
  { nombre: "2-ingresos", ruta: "/ingresos" },
  { nombre: "3-gastos", ruta: "/gastos" },
  { nombre: "4-miembros", ruta: "/miembros" },
  { nombre: "5-depositos", ruta: "/depositos" },
  { nombre: "6-por-revisar", ruta: "/bandeja" },
  { nombre: "7-ajustes", ruta: "/configuracion" },
  { nombre: "8-informes", ruta: "/reportes" },
  { nombre: "10-cartas-indice", ruta: "/cartas" },
  { nombre: "13-reporte-miembros", ruta: "/reporte-miembros" },
  /* Actas faltaba en la lista: es una de las seis secciones de Secretaria y
     la unica sin foto, asi que sus cambios se comprobaban a ciegas. */
  { nombre: "16-actas", ruta: "/actas" },
  { nombre: "14-servicios", ruta: "/servicios" },
  { nombre: "15-membresia", ruta: "/membresia" },
  { nombre: "17-agenda", ruta: "/agenda" },
];

for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const { nombre, ruta } of PANTALLAS) {
    await page.goto(`${URL_BASE}/#${ruta}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    // Las cifras suben con CountUp y las gráficas de recharts se animan 600ms:
    // sin esperar, media captura sale con números a medio contar.
    await page.waitForTimeout(1600);
    const archivo = `${SALIDA}/${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// Inicio con el segmentado en «Trimestre». Es la captura que faltaba: las
// cifras de la tarjeta siempre siguieron al periodo, pero la gráfica de
// recharts que había debajo no —pintaba las mismas semanas dijera lo que
// dijera el mando—. Ahora las barras viven dentro de la tarjeta y cambian de
// semanas a meses con ella; sin esta foto, esa promesa no está comprobada.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const periodo of ["Trimestre", "Año"]) {
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    await page.getByRole("button", { name: periodo, exact: true }).click();
    await page.waitForTimeout(1600);
    const archivo = `${SALIDA}/1-inicio-${periodo === "Año" ? "anio" : "trimestre"}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

/* ---- Las hojas y los modales ----
   Ninguna de estas siete tenía captura: no son rutas, se abren tocando algo.
   Son justo donde el rediseño puede haberse quedado a medias sin que se note,
   porque no salen ni en la hoja de contactos ni en una revisión por URL. */
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  async function toma(nombre) {
    await page.waitForTimeout(1100);
    const archivo = `${SALIDA}/30-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  async function ir(ruta) {
    /* Recarga de verdad, no cambio de hash: estas pantallas dejan un modal
       abierto detrás, y un `goto` al mismo documento solo enruta —el modal
       de la vuelta anterior seguiría encima de la siguiente captura—. */
    await page.goto(`${URL_BASE}${ruta}`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    await page.waitForTimeout(900);
  }
  const mas = () => page.locator(".btn-crear").click();

  // T2 · Nuevo ingreso, y T4 · el movimiento abierto.
  await ir("/#/ingresos");  await mas();                             await toma("t2-nuevo-ingreso");
  /* El movimiento abierto. Hay que tocar una fila de la LISTA, no del
     resumen de arriba: las del resumen filtran, y el primer `.ios-txrow` de
     la pantalla es una de ésas. */
  await ir("/#/ingresos");
  await page.locator(".ios-txrow[data-fila]").first().click();
  await toma("t4-movimiento");

  // T6 · el corte y su depósito.
  await ir("/#/depositos"); await mas();                             await toma("t6-nuevo-deposito");
  await ir("/#/depositos");
  await page.locator(".ios-txrow[data-fila]").first().click();
  await toma("t6-corte");
  /* Y el pie del corte, que es donde está lo que hace falta ver: la
     conciliación y la doble firma. En una captura de la primera pantalla no
     salen, y son el motivo de que esta pantalla exista. */
  await page.evaluate(() => document.querySelector(".pi-cuerpo--dm")?.scrollTo({ top: 2000 }));
  await toma("t6-corte-pie");

  // A6 · nueva actividad, A5 · la actividad abierta.
  await ir("/#/agenda");    await mas();                             await toma("a6-nueva-actividad");
  await ir("/#/agenda");
  await page.getByText("Culto de oración", { exact: false }).first().click();
  await toma("a5-actividad");

  // N4 · nuevo miembro, y N3 · la ficha en sus tres pasos.
  await ir("/#/membresia"); await mas();                             await toma("n4-nuevo-miembro");
  /* La ficha se abre desde la hoja del miembro, y sus acciones solo salen a
     media altura: hay que subir la hoja antes de poder tocarlas. */
  await ir("/#/membresia");
  await page.locator(".ios-txrow--clickable").first().click();
  await page.waitForTimeout(700);
  {
    const asa = page.locator(".hd-asa");
    const caja = await asa.boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2, caja.y - 300, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: "Completar el expediente" }).click();
  await toma("n3-ficha-datos");
  for (const [nombre, paso] of [["membresia", "Membresía"], ["servicio", "Servicio"]]) {
    await page.getByRole("tab", { name: paso, exact: true }).click();
    await toma(`n3-ficha-${nombre}`);
  }
  await ctx.close();
}

// Inicio desplazado. El Large Title de esta pantalla es el saludo del día, y
// la copia compacta que se queda en la barra NO puede decir «Buenas tardes»:
// esa barra existe para responder dónde estás. Sin esta foto, el
// `data-titulo-fijo` que lo arregla no está comprobado.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector(".main")?.scrollTo({ top: 260 }));
  await page.waitForTimeout(700);
  const archivo = `${SALIDA}/1-inicio-desplazado-${tema}.png`;
  await page.screenshot({ path: archivo });
  console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  await ctx.close();
}

// H2 · Detalle del periodo. No es una ruta —es estado, como el documento
// abierto de Reportes—, así que hay que entrar tocando su fila. Se toma en
// «Mes» y en «Año» para ver que el título, el pie y el desglose siguen al
// segmentado y no se quedan clavados en el mes.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const periodo of [null, "Año"]) {
    /* Por otra ruta primero: el detalle es estado de React, y un `goto` al
       mismo hash no remonta —se quedaría en el detalle de la vuelta anterior,
       donde el segmentado ya no existe—. */
    await page.goto(`${URL_BASE}/#/ajustes`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    if (periodo) await page.getByRole("button", { name: periodo, exact: true }).click();
    await page.getByText(/^Detalle de[l]? /).first().click();
    await page.waitForTimeout(1200);
    const archivo = `${SALIDA}/1-detalle-${periodo ? "anio" : "mes"}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// H3 · La portada de Secretaría. Es la ruta "/" con el rol de secretaria: el
// único modo de verla es arrancar con ese rol puesto.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema, "secretaria");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForTimeout(1600);
  const archivo = `${SALIDA}/20-inicio-secretaria-${tema}.png`;
  await page.screenshot({ path: archivo });
  console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  await ctx.close();
}

// Informes: el índice y DOS documentos abiertos. Hay que tocar la fila para
// llegar: el documento no tiene URL propia (es estado de React, `informe`),
// así que sin el clic solo se fotografiaría el índice.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const [nombre, fila] of [["estado", "Estado financiero mensual"], ["gastos", "Distribución de gastos"], ["anual", "Reporte anual"]]) {
    /* Pasar por Inicio antes: el documento abierto NO tiene URL propia (es el
       estado `informe` de React), así que un `goto` a la misma dirección es una
       navegación del mismo documento y no remonta nada — la segunda vuelta se
       quedaba dentro del informe anterior, cuyas filas de categoría también son
       `.ios-txrow`, y el arnés esperaba una fila que ahí no existe. */
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/reportes`, { waitUntil: "networkidle" });
    await page.getByText(fila, { exact: true }).first().click();
    await page.waitForTimeout(1400);
    const archivo = `${SALIDA}/9-informe-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// Cartas: las cinco pestañas del segmentado. Ya no hay índice que abrir y
// cerrar —el teléfono aterriza en «Cartas» y se mueve por el segmentado—, así
// que lo que hay que ver es que las cinco pintan algo y ninguna se desborda.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  for (const [nombre, pestana] of [
    ["resumen", "Cartas"], ["solicitudes", "Solicitudes"], ["traslados", "Traslados"],
    ["plantillas", "Plantillas"], ["archivo", "Archivo"],
  ]) {
    await page.getByRole("tab", { name: pestana, exact: true }).click();
    await page.waitForTimeout(900);
    const archivo = `${SALIDA}/11-cartas-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// Membresía: el resumen y sus tres destinos.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  // Ya no hay pantalla de resumen que abrir: el teléfono aterriza en el padrón
  // y de ahí sale todo. El recorrido es el de verdad — padrón, hoja del
  // miembro en sus dos alturas, hoja de filtros, y los dos destinos que
  // cuelgan de ella.
  async function toma(nombre) {
    await page.waitForTimeout(1200);
    const archivo = `${SALIDA}/16-membresia-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await toma("padron");

  // La hoja del miembro: tocar un nombre la asoma. Y desde ahí, los dos gestos
  // que en el aparato no funcionaban (29 ago 2026): un TOQUE en la hoja
  // asomada la sube —antes solo el asa, y arrastrando 187 px—, y un arrastre
  // CORTO agarrándola por el nombre la vuelve a bajar.
  await page.locator(".ios-txrow--clickable").first().click();
  await toma("hoja-asomada");
  await page.locator(".hm-cabeza").click();
  await toma("hoja-media");
  {
    const caja = await page.locator(".hm-cabeza").boundingBox();
    const x = caja.x + caja.width / 2;
    await page.mouse.move(x, caja.y + 8);
    await page.mouse.down();
    await page.mouse.move(x, caja.y + 68, { steps: 10 });
    await page.mouse.up();
  }
  await toma("hoja-vuelve-a-asomarse");

  await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await toma("filtros");
  for (const [nombre, fila] of [["asistencia", "Asistencia"], ["seguimiento", "Seguimiento"]]) {
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText(fila, { exact: true }).last().click();
    await toma(nombre);
  }
  await ctx.close();
}

// Informes de membresía: el índice y dos informes.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const [nombre, fila] of [["general", "Información general"], ["registro", "Registro de miembros"], ["seguimiento", "Seguimiento"]]) {
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/reporte-miembros`, { waitUntil: "networkidle" });
    await page.getByText(fila, { exact: true }).first().click();
    await page.waitForTimeout(1300);
    const archivo = `${SALIDA}/19-infmem-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// Agenda: las cuatro vistas del segmentado.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
  for (const vista of ["Semana", "Lista", "Historial"]) {
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: vista, exact: true }).first().click();
    await page.waitForTimeout(1200);
    const archivo = `${SALIDA}/18-agenda-${vista.toLowerCase()}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  await ctx.close();
}

// El editor de la carta, abierto desde el "+". Es el caso que más importa
// comprobar: es la pantalla más larga de Cartas y la que peor se sentiría si
// no tuviera salida.
{
  const ctx = await contextoIPhone("light");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror (editor):", e.message));
  await page.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
  await page.waitForSelector(".btn-crear", { timeout: 30000 });
  await page.locator(".btn-crear").click();
  await page.waitForTimeout(600);
  await page.getByText("Nueva carta de recomendación", { exact: true }).first().click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SALIDA}/12-cartas-editor-light.png` });
  console.log("  ✓ pruebas/capturas/12-cartas-editor-light.png");
  await ctx.close();
}

// El editor de la PLANTILLA de carta (maquetas C8 · C10 · C11 · C12 · C13).
// Es una pila de hojas: la de datos, la de tipos, la del cuerpo con la de
// huecos encima, y la vista previa. Lo que hay que ver es que ninguna se abre
// sobre la anterior sin barra de volver y que las pastillas verdes no rompen
// el renglón.
for (const tema of ["light", "dark"]) {
  const ctx = await contextoIPhone(tema);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error(`pageerror (plantilla ${tema}):`, e.message));
  async function toma(nombre) {
    await page.waitForTimeout(900);
    const archivo = `${SALIDA}/13-plantilla-${nombre}-${tema}.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ✓ ${archivo.replace(REPO + "/", "")}`);
  }
  async function abrirEditor() {
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
    await page.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Plantillas", exact: true }).click();
    await page.waitForTimeout(900);
    await page.locator(".ios-txrow--clickable").first().click();
    await page.waitForTimeout(700);
  }

  await abrirEditor();
  await toma("c8-editor");

  // C10: los catorce tipos.
  await page.getByText("Tipo de carta", { exact: true }).first().click();
  await toma("c10-tipos");
  await page.getByRole("button", { name: "Plantilla", exact: true }).click();
  await page.waitForTimeout(500);

  // C12: el cuerpo en su propia pantalla, y C11 encima.
  await page.getByText("Cuerpo de la carta", { exact: true }).first().click();
  await toma("c12-cuerpo");
  await page.getByRole("button", { name: "Insertar hueco", exact: true }).click();
  await toma("c11-huecos");
  // `.last()`: la hoja de huecos está ENCIMA de la del editor, y las dos
  // tienen su «Cancelar». Con `.first()` Playwright apunta al de abajo, que
  // el telón de la de arriba intercepta.
  await page.getByRole("button", { name: "Cancelar", exact: true }).last().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await page.waitForTimeout(500);

  // C13: la vista previa.
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  await toma("c13-previa");
  await ctx.close();
}

// W1, W2 y W3 · La bienvenida del primer arranque. Solo sale cuando la
// iglesia se llama todavía «Mi Iglesia» y nadie completó el recorrido, así que
// hay que quitar el marcador que el arnés pone para todas las demás fotos.
{
  for (const tema of ["light", "dark"]) {
    const ctx = await contextoIPhone(tema);
    await ctx.addInitScript(() => { try { localStorage.removeItem("tesoreria-welcomed"); } catch { /* noop */ } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
    await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".welcome-overlay", { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SALIDA}/23-bienvenida-paso1-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/23-bienvenida-paso1-${tema}.png`);

    // Un paso del medio: los cuatro comparten rejilla, así que con ver uno
    // basta para juzgarla.
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SALIDA}/23-bienvenida-paso2-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/23-bienvenida-paso2-${tema}.png`);

    // Y el quinto punto: el formulario, que no es otra pantalla.
    await page.getByRole("button", { name: "Omitir", exact: true }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SALIDA}/23-bienvenida-form-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/23-bienvenida-form-${tema}.png`);

    // La moneda, como hoja con buscador.
    await page.getByText("Moneda", { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SALIDA}/23-bienvenida-moneda-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/23-bienvenida-moneda-${tema}.png`);
    await ctx.close();
  }
}

// T9, T10 y T11 · La ficha del aportante. No tiene URL —es la misma página de
// Aportantes un nivel más adentro— así que hay que llegar tocando una fila. Se
// toma la tira completa (la jerarquía: identidad, cifras, meses, constancia),
// la hoja de años y, tocando a alguien sin movimientos, el año vacío.
{
  for (const tema of ["light", "dark"]) {
    const ctx = await contextoIPhone(tema);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
    await page.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    await page.waitForTimeout(900);
    // `--clickable`: la primera `.ios-txrow` de la página es una fila del
    // grupo RESUMEN («Aportantes · 20»), que no lleva a ninguna parte.
    await page.locator(".ios-txrow--clickable").first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SALIDA}/22-ficha-aportante-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/22-ficha-aportante-${tema}.png`);
    if (tema === "light") {
      /* La tira entera, solo en claro: lo que hay que ver aquí es la
         jerarquía —identidad, cifras, meses, constancia— y no cabe en 852 px.
         En `fullPage` la cáscara fija se pinta una sola vez arriba, así que
         esta foto NO sirve para juzgar la barra; para eso está la de arriba. */
      await page.screenshot({ path: `${SALIDA}/22-ficha-larga.png`, fullPage: true });
      console.log("  ✓ pruebas/capturas/22-ficha-larga.png");
    }

    // La hoja de años, con el total de cada ejercicio al lado.
    await page.locator(".ios-nav-btn").first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SALIDA}/22-ficha-anios-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/22-ficha-anios-${tema}.png`);
    // El año sin aportaciones (T11). La semilla pone TODO en el ejercicio en
    // curso, así que cambiar de año en la hoja no llega a un vacío: se llega
    // por una persona que no ha aportado, que en la lista es la que muestra
    // «—» en vez de un importe.
    await page.getByRole("button", { name: "Cancelar", exact: true }).last().click();
    await page.waitForTimeout(400);
    await page.getByText("Aportantes", { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.locator('.ios-txrow--clickable:has(.ios-txrow-trailing span:text-is("—"))').first().click();
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${SALIDA}/22-ficha-vacia-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/22-ficha-vacia-${tema}.png`);
    await ctx.close();
  }
}

// S9 y S10 · Zona sensible y confirmar borrado. Ninguna de las dos tiene URL
// —son la zona `delicada` de Ajustes y una pantalla empujada por encima—, así
// que hay que llegar tocando. Se toma la tira completa: lo que hay que ver es
// la JERARQUÍA (la tarjeta de respaldar arriba, las dos rojas abajo), y eso no
// cabe en una pantalla.
{
  for (const tema of ["light", "dark"]) {
    const ctx = await contextoIPhone(tema);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`pageerror (${tema}):`, e.message));
    await page.goto(`${URL_BASE}/#/configuracion`, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 30000 });
    await page.getByText("Zona sensible", { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SALIDA}/21-zona-sensible-${tema}.png`, fullPage: true });
    console.log(`  ✓ pruebas/capturas/21-zona-sensible-${tema}.png`);

    // S10: el botón nace apagado, así que la primera foto es la del gris.
    await page.getByRole("button", { name: "Continuar…", exact: true }).first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SALIDA}/21-borrado-apagado-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/21-borrado-apagado-${tema}.png`);

    // Y la segunda, con el nombre escrito: el botón encendido en rojo.
    // El nombre de la iglesia sembrada. Escribirlo es lo ÚNICO que hace el
    // arnés aquí: el botón rojo no se toca, que borraría la base de la prueba.
    await page.locator(".ios-field--solo input").fill("Mi Iglesia");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SALIDA}/21-borrado-encendido-${tema}.png` });
    console.log(`  ✓ pruebas/capturas/21-borrado-encendido-${tema}.png`);
    await ctx.close();
  }
}

// Una tira larga de Ingresos (sin recortar a la altura de la pantalla), para
// ver de un vistazo cómo se encadenan las secciones por fecha.
{
  const ctx = await contextoIPhone("light");
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
  await page.waitForSelector(".app", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SALIDA}/2-ingresos-completa.png`, fullPage: true });
  console.log("  ✓ pruebas/capturas/2-ingresos-completa.png");
  await ctx.close();
}

await browser.close();
vite.kill();
console.log("\nlisto");
/* `vite.kill()` manda SIGTERM y sigue: si el hijo tarda en morir —o no
   muere— el bucle de eventos se queda vivo y el proceso cuelga DESPUÉS de
   imprimir "listo", con el 1420 todavía tomado. La siguiente pasada falla
   entonces con "vite no arrancó (¿puerto 1420 ocupado?)", que es justo el
   error que el comentario de arriba llama confuso: parece del arranque y
   viene del cierre anterior. Salir a la fuerza cierra el asunto. */
process.exit(0);
