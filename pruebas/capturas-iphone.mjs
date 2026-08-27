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

const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
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

/** Un contexto de iPhone. `tema` = "light" | "dark". */
async function contextoIPhone(tema) {
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
  await ctx.addInitScript(({ tema }) => {
    try {
      localStorage.setItem("tesoreria-welcomed", "1");
      localStorage.setItem("tesoreria-lang", "es");
      localStorage.setItem("tesoreria-theme", tema);
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
  }, { tema });
  return ctx;
}

// ---------- 5. Semilla, con las funciones reales de db.ts ----------
const ctxSemilla = await contextoIPhone("light");
{
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
    for (const nombre of nombres) await db.insertMember(id, { nombre, fecha_ingreso: hace(400) });
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
await ctxSemilla.close();

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

  // La hoja del miembro: tocar un nombre la asoma; el asa la sube a media.
  await page.locator(".ios-txrow--clickable").first().click();
  await toma("hoja-asomada");
  {
    const asa = page.locator(".hd-asa");
    const caja = await asa.boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2, caja.y - 300, { steps: 12 });
    await page.mouse.up();
  }
  await toma("hoja-media");

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
