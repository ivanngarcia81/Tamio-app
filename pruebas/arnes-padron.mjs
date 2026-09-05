// Arnés de Playwright para la regla "el padrón lo mueve Secretaría": monta la
// app REAL (vite dev, sin Supabase, o sea sin login y con el rol manual) sobre
// el mismo stub de SQL que `arnes-ipad.mjs`, siembra una iglesia en plan
// completo con el padrón abierto al tesorero, y comprueba en Miembros y en
// Membresía que el tesorero ve el padrón y no puede mover a nadie, y que el
// administrador sí.
//
//   npm i --no-save playwright sql.js
//   node pruebas/arnes-padron.mjs
//
import { chromium } from "playwright";
import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const URL_BASE = "http://localhost:1420";
const CAPTURAS = process.env.CAPTURAS ?? "";
let fallos = 0;
function chk(ok, msg) { if (ok) console.log(`  ✓ ${msg}`); else { fallos++; console.log(`  ✗ ${msg}`); } }

// ---------- migraciones reales ----------
function extraerMigraciones() {
  const src = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");
  const out = []; const re = /version:\s*(\d+),[\s\S]*?sql:\s*r#"([\s\S]*?)"#/g; let m;
  while ((m = re.exec(src))) out.push({ version: Number(m[1]), sql: m[2] });
  return out.sort((a, b) => a.version - b.version);
}
const SQL = await initSqlJs();
const db = new SQL.Database();
for (const mig of extraerMigraciones()) db.exec(mig.sql);
function bindParams(params) { const o = {}; params.forEach((p, i) => { o[`$${i + 1}`] = p === undefined ? null : p; }); return o; }
function sqlSelect(q, params) {
  const st = db.prepare(q); try { if (params?.length) st.bind(bindParams(params)); const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); }
}
function sqlExecute(q, params) {
  if (!params?.length) db.exec(q); else { const st = db.prepare(q); try { st.bind(bindParams(params)); st.step(); } finally { st.free(); } }
  const last = sqlSelect("SELECT last_insert_rowid() AS id", []);
  return { rowsAffected: db.getRowsModified(), lastInsertId: last[0]?.id ?? 0 };
}

// ---------- vite, sin Supabase ----------
const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], {
  cwd: REPO, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" },
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("vite no arrancó")), 30000);
  vite.stdout.on("data", (d) => { if (String(d).includes("Local:")) { clearTimeout(t); res(); } });
});
process.on("exit", () => vite.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { vite.kill(); process.exit(1); });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function contexto(rol) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 1024 } });
  await ctx.exposeFunction("__sqlStub", (esSelect, q, p) => (esSelect ? sqlSelect(q, p) : sqlExecute(q, p)));
  await ctx.addInitScript(({ rol }) => {
    try {
      localStorage.setItem("tesoreria-welcomed", "1");
      localStorage.setItem("tesoreria-lang", "es");
      localStorage.setItem("tesoreria-theme", "light");
      localStorage.setItem("tamio-rol", rol);
    } catch { /* noop */ }
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
  }, { rol });
  return ctx;
}

// ---------- sembrar ----------
{
  const ctx = await contexto("administrador");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${URL_BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sidebar, .app", { timeout: 30000 });
  const n = await page.evaluate(async () => {
    const db = await import("/src/db.ts");
    const ig = await db.getOrCreateChurch();
    for (const nombre of ["Ana Martínez", "Juan Pérez", "María López"]) {
      await db.insertMember(ig.id, { nombre, fecha_ingreso: "2024-03-01" });
    }
    return (await db.listMembers(ig.id)).length;
  });
  // Plan completo (el de fábrica) y el padrón ABIERTO al tesorero: es el caso
  // que importa, porque es donde puede llegar a Membresía.
  sqlExecute("UPDATE churches SET plan = 'completo', tesorero_ve_padron = 1", []);
  console.log(`sembrados ${n} miembros · plan completo · tesorero_ve_padron = 1`);
  await ctx.close();
}

async function abrirMenuDeLaPrimeraFila(page) {
  const puntos = page.locator(".more:not(.sin-puntos)").first();
  if (await puntos.count() === 0) return null;
  await puntos.click();
  await page.waitForTimeout(300);
  return puntos;
}

// ---------- como tesorero ----------
console.log("\nComo TESORERO (plan completo):");
{
  const ctx = await contexto("tesorero");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));

  await page.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sidebar, .app", { timeout: 30000 });
  await page.waitForTimeout(800);
  chk(await page.locator(".btn-nuevo-cabecera").count() === 0, "Miembros: sin botón de nuevo");
  chk((await page.locator(".form-hint", { hasText: "Secretaría" }).count()) > 0, "Miembros: dice que el padrón lo administra Secretaría");
  chk(await page.getByText("Importar CSV").count() === 0, "Miembros: sin importar CSV");
  // En escritorio los "···" se pintan siempre; lo que cambia es lo de dentro.
  await abrirMenuDeLaPrimeraFila(page);
  chk(await page.getByText("Editar").count() > 0, "Miembros: el menú ofrece Editar");
  chk(await page.getByText("Eliminar").count() === 0, "Miembros: el menú NO ofrece Eliminar");
  chk(await page.getByText("Archivar").count() === 0, "Miembros: ni Archivar");
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/web-tesorero-miembros.png` });

  await page.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const enMembresia = !page.url().endsWith("/#/") && (await page.getByText("Ana Martínez").count()) > 0;
  chk(enMembresia, "Membresía: el tesorero entra (tesorero_ve_padron)");
  const menu = await abrirMenuDeLaPrimeraFila(page);
  chk(menu !== null, "Membresía: la fila tiene menú (Editar, Fusionar)");
  chk(await page.getByText("Dar de baja").count() === 0, "Membresía: el menú NO ofrece Dar de baja");
  chk(await page.getByText("Reactivar").count() === 0, "Membresía: ni Reactivar");
  chk(await page.getByText("Fusionar duplicado").count() === 0, "Membresía: ni Fusionar");
  chk(await page.locator(".btn-nuevo-cabecera").count() === 0, "Membresía: sin botón de nuevo miembro");
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/web-tesorero-membresia.png` });
  await ctx.close();
}

// ---------- como administrador ----------
console.log("\nComo ADMINISTRADOR:");
{
  const ctx = await contexto("administrador");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));

  await page.goto(`${URL_BASE}/#/miembros`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sidebar, .app", { timeout: 30000 });
  await page.waitForTimeout(800);
  chk(await page.locator(".btn-nuevo-cabecera").count() > 0, "Miembros: con botón de nuevo");
  chk(await page.locator(".more:not(.sin-puntos)").count() > 0, "Miembros: las filas tienen menú");
  await abrirMenuDeLaPrimeraFila(page);
  chk(await page.getByText("Eliminar").count() > 0, "Miembros: el menú ofrece Eliminar");
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/web-admin-miembros.png` });

  await page.goto(`${URL_BASE}/#/membresia`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await abrirMenuDeLaPrimeraFila(page);
  chk(await page.getByText("Dar de baja").count() > 0, "Membresía: el menú ofrece Dar de baja");
  chk(await page.getByText("Fusionar duplicado").count() > 0, "Membresía: y Fusionar");
  chk(await page.locator(".btn-nuevo-cabecera").count() > 0, "Membresía: con botón de nuevo miembro");
  await ctx.close();
}

await browser.close();
console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
