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
await ctxSemilla.close();

// ---------- 6. Las capturas ----------

/* ---- Las hojas de formulario, y su ritmo vertical ---- */
const HOJAS = [
  ["Nueva solicitud", async (p) => {
    await p.goto(`${URL_BASE}/#/cartas`, { waitUntil: "networkidle" });
    await p.getByRole("tab", { name: "Solicitudes", exact: true }).click();
    await p.waitForTimeout(900);
    await p.locator(".btn-crear").click();
    await p.waitForTimeout(700);
    await p.getByText("Nueva solicitud", { exact: true }).first().click();
    await p.waitForTimeout(1100);
  }],
  ["Nuevo ingreso", async (p) => {
    await p.goto(`${URL_BASE}/#/ingresos`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    await p.locator(".btn-crear").click();
    await p.waitForTimeout(1100);
  }],
  ["Nuevo miembro", async (p) => {
    await p.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    await p.locator(".btn-crear").click();
    await p.waitForTimeout(1100);
  }],
  ["Nueva actividad", async (p) => {
    await p.goto(`${URL_BASE}/#/agenda`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    await p.locator(".btn-crear").click();
    await p.waitForTimeout(1100);
  }],
  ["Editar servicio", async (p) => {
    await p.goto(`${URL_BASE}/#/servicios`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    await p.locator(".ios-txrow--clickable").first().click();
    await p.waitForTimeout(900);
  }],
];

const ctx = await contextoIPhone("light");
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

for (const [nombre, abrir] of HOJAS) {
  /* `reload` y no `goto`: navegar al mismo hash no vuelve a montar la app, y
     la hoja de la vuelta anterior se quedaba abierta tapando el botón. */
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "networkidle" });
  try { await abrir(page); } catch (e) { console.log(`\n${nombre}: no abrió (${e.message.split("\n")[0]})`); continue; }

  const r = await page.evaluate(() => {
    const hoja = document.querySelector(".ios-sheet");
    if (!hoja) return null;
    const cuerpo = hoja.querySelector(".ios-sheet-body");
    const nav = hoja.querySelector(".ios-nav");
    const out = { nav: nav ? Math.round(nav.getBoundingClientRect().bottom) : null, secciones: [], filas: [] };
    let anterior = null;
    for (const sec of hoja.querySelectorAll(".ios-section")) {
      const rs = sec.getBoundingClientRect();
      const h2 = sec.querySelector(".ios-section-header");
      const grupo = sec.querySelector(".ios-group, .ios-listcard");
      const pie = sec.querySelector(".ios-section-footer");
      /* El hueco que el ojo ve, no el que dice el rect: los encabezados y
         pies llevan su padding DENTRO de la caja, así que hay que medir de
         texto pintado a texto pintado. `Range` da la caja de la línea. */
      const linea = (el) => {
        if (!el) return null;
        const r = document.createRange();
        r.selectNodeContents(el);
        const c = r.getBoundingClientRect();
        return c.height ? c : el.getBoundingClientRect();
      };
      const arriba = linea(h2) ?? (grupo && grupo.getBoundingClientRect());
      out.secciones.push({
        titulo: h2 ? h2.textContent.trim().slice(0, 26) : "(sin título)",
        antes: arriba
          ? Math.round(arriba.top - (anterior === null ? (nav ? nav.getBoundingClientRect().bottom : rs.top) : anterior))
          : null,
        h2aGrupo: h2 && grupo ? Math.round(grupo.getBoundingClientRect().top - linea(h2).bottom) : null,
        grupoAPie: grupo && pie ? Math.round(linea(pie).top - grupo.getBoundingClientRect().bottom) : null,
      });
      anterior = grupo ? grupo.getBoundingClientRect().bottom : rs.bottom;
      if (pie) anterior = linea(pie).bottom;
    }
    for (const f of hoja.querySelectorAll(".ios-field, .ios-row")) {
      const et = f.querySelector(".ios-field-label, .ios-row-label");
      out.filas.push({
        et: et ? et.textContent.trim().slice(0, 22) : f.className.split(" ")[0],
        alto: Math.round(f.getBoundingClientRect().height),
      });
    }
    const previo = cuerpo && cuerpo.firstElementChild && !cuerpo.firstElementChild.classList.contains("ios-section")
      ? cuerpo.firstElementChild : null;
    out.previo = previo ? { clase: previo.className, alto: Math.round(previo.getBoundingClientRect().height) } : null;
    const ultima = [...hoja.querySelectorAll(".ios-section")].pop();
    out.colaFinal = ultima && cuerpo
      ? Math.round(cuerpo.scrollHeight - (ultima.getBoundingClientRect().bottom - cuerpo.getBoundingClientRect().top + cuerpo.scrollTop))
      : null;
    out.finCuerpo = cuerpo ? Math.round(cuerpo.scrollHeight) : null;
    return out;
  });

  await page.screenshot({ path: `${SALIDA}/40-ritmo-${nombre.split(" ")[0].toLowerCase()}.png` });
  if (!r) { console.log(`\n${nombre}: no hay .ios-sheet`); continue; }
  console.log(`\n${nombre}  (barra termina en ${r.nav}px, cuerpo ${r.finCuerpo}px, cola final ${r.colaFinal}px)`);
  if (r.previo) console.log(`  antes de la 1.ª sección: <${r.previo.clase}> de ${r.previo.alto}px`);
  console.log("  secciones:");
  for (const s of r.secciones) {
    console.log(`    ${String(s.antes).padStart(4)}px antes  ·  h2→grupo ${String(s.h2aGrupo).padStart(3)}  ·  grupo→pie ${String(s.grupoAPie).padStart(3)}   ${s.titulo}`);
  }
  const alturas = {};
  for (const f of r.filas) (alturas[f.alto] ??= []).push(f.et);
  console.log("  altos de fila:");
  for (const [alto, ets] of Object.entries(alturas).sort((a, b) => a[0] - b[0])) {
    console.log(`    ${String(alto).padStart(4)}px  ×${ets.length}  ${ets.slice(0, 5).join(", ")}`);
  }
}

await browser.close();
vite.kill();
process.exit(0);
