// Prueba nº 1 del paso 5 de docs/plan-centavos.md:
// un respaldo hecho ANTES de la migración, restaurado DESPUÉS, tiene que dar
// exactamente los mismos totales.
//
// `npm run verificar-respaldo`.
//
// Por qué esta prueba y no solo la de la migración: el respaldo de Tamio es un
// ZIP que lleva dentro el archivo `tamio.db` TAL CUAL, sin migrar (ver
// `backupDatabase` en src/services/backup.ts y `db_backup_paquete` en lib.rs).
// O sea que restaurar un respaldo viejo mete en la carpeta de datos una base de
// esquema 35 — y la migración 36 vuelve a correr sobre ella en el arranque
// siguiente. Eso abre dos formas de perder dinero que la prueba de la migración
// sola no ve:
//
//   1. Que migrar la copia restaurada dé un total distinto que migrar el
//      original. Serían dos Macs de la misma iglesia con cifras distintas.
//   2. Que la 36 se aplique DOS VECES sobre la misma base. No haría saltar
//      ningún error: multiplicaría todo el libro por 100. Un movimiento de
//      $125.50 pasaría a $12,550.00 y el tesorero lo descubriría al cuadrar.
//
// Se hace con archivos de verdad en disco, no en memoria, porque el paso que
// se está probando es literalmente una copia de archivo (`std::fs::copy` en
// `aplicar_restauracion_pendiente`, lib.rs).

import { DatabaseSync } from "node:sqlite";
import { readFileSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LIB = "src-tauri/src/lib.rs";
const VERSION = 36;

/** Saca el `sql: r#"…"#` del bloque `version: N` de lib.rs. No se copia el SQL
 *  aquí: una copia se desviaría en silencio el día que alguien edite lib.rs. */
function sqlDeLaMigracion(version) {
  const rust = readFileSync(LIB, "utf8");
  const i = rust.indexOf(`version: ${version},`);
  if (i < 0) throw new Error(`no encuentro la migración ${version} en ${LIB}`);
  const ini = rust.indexOf('sql: r#"', i);
  const fin = rust.indexOf('"#', ini);
  if (ini < 0 || fin < 0) throw new Error(`la migración ${version} no tiene bloque sql`);
  return rust.slice(ini + 'sql: r#"'.length, fin);
}

let fallos = 0;
const chk = (a, b, q) => {
  if (Object.is(a, b)) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}: esperado ${String(b)}, obtenido ${String(a)}`); }
};

// ---------------------------------------------------------------------------
// El corredor de migraciones, igual que motordb.rs:128-141
// ---------------------------------------------------------------------------
// Se replica el GUARD, que es lo que esta prueba interroga: se lee el máximo de
// `_migraciones`, y toda migración con version <= esa se salta. Si ese guard
// fallara, la 36 correría dos veces.
function aplicarMigraciones(ruta, migraciones) {
  const db = new DatabaseSync(ruta);
  db.exec(`CREATE TABLE IF NOT EXISTS _migraciones (
             version INTEGER PRIMARY KEY,
             descripcion TEXT NOT NULL,
             aplicada_en TEXT NOT NULL DEFAULT (datetime('now')))`);
  const aplicada = db.prepare("SELECT coalesce(max(version),0) v FROM _migraciones").get().v;
  let corridas = 0;
  for (const m of migraciones) {
    if (m.version <= aplicada) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO _migraciones (version,descripcion) VALUES (?,?)")
        .run(m.version, m.descripcion);
      db.exec("COMMIT");
      corridas++;
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  db.close();
  return corridas;
}

// ---------------------------------------------------------------------------
// Un libro de verdad, en el esquema ANTERIOR (monto REAL)
// ---------------------------------------------------------------------------
const CATS = ["diezmo", "ofrenda", "donacion", "otros"];
const GASTOS = ["pastores", "servicios", "misiones", "ayudas", "mantenimiento"];

/** Importes con decimales de los que duelen, no redondos: los que revientan
 *  la coma flotante. Determinista a propósito — una prueba que falla una vez
 *  de cada cien es una prueba que se acaba ignorando. */
function libro() {
  const filas = [];
  let semilla = 20260811;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) {
    // Céntimos de los feos: .01, .15, .07, .33… nunca .00 ni .50
    const centavos = 1 + Math.floor(azar() * 99);
    const enteros = Math.floor(azar() * 3000);
    filas.push({
      tipo: azar() < 0.65 ? "ingreso" : "gasto",
      cat: azar() < 0.65
        ? CATS[Math.floor(azar() * CATS.length)]
        : GASTOS[Math.floor(azar() * GASTOS.length)],
      monto: Number(`${enteros}.${String(centavos).padStart(2, "0")}`),
    });
  }
  // Los tres importes que el plan nombra por su nombre (prueba nº 3).
  filas.push({ tipo: "ingreso", cat: "diezmo", monto: 0.01 });
  filas.push({ tipo: "ingreso", cat: "ofrenda", monto: 1.15 });
  filas.push({ tipo: "ingreso", cat: "donacion", monto: 999999.99 });
  return filas;
}

function crearBaseV35(ruta, filas) {
  const db = new DatabaseSync(ruta);
  db.exec(`
    CREATE TABLE churches (
      id INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
      saldo_inicial REAL NOT NULL DEFAULT 0);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, fecha TEXT NOT NULL,
      tipo TEXT NOT NULL, categoria TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'aprobado',
      monto REAL NOT NULL, moneda TEXT, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE depositos_bancarios (
      id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, fecha TEXT NOT NULL,
      periodo TEXT NOT NULL, monto REAL NOT NULL);
    CREATE TABLE gastos_recurrentes (
      id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, concepto TEXT NOT NULL,
      monto REAL NOT NULL);
    CREATE INDEX idx_tx_church_fecha ON transactions(church_id, fecha);
    CREATE TABLE _migraciones (
      version INTEGER PRIMARY KEY, descripcion TEXT NOT NULL,
      aplicada_en TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  db.prepare("INSERT INTO churches (nombre,saldo_inicial) VALUES ('Iglesia de prueba',?)").run(1.15);
  const ins = db.prepare(
    "INSERT INTO transactions (church_id,fecha,tipo,categoria,monto,moneda) VALUES (1,'2026-07-15',?,?,?,'USD')");
  for (const f of filas) ins.run(f.tipo, f.cat, f.monto);
  db.prepare("INSERT INTO depositos_bancarios (church_id,fecha,periodo,monto) VALUES (1,'2026-07-20','2026-07',?)").run(2340.55);
  db.prepare("INSERT INTO gastos_recurrentes (church_id,concepto,monto) VALUES (1,'Renta',?)").run(1250.15);
  // La base "viene" de una instalación con las 35 migraciones ya aplicadas.
  const marca = db.prepare("INSERT INTO _migraciones (version,descripcion) VALUES (?,'previa')");
  for (let v = 1; v <= 35; v++) marca.run(v);
  db.close();
}

/** Totales tal y como los lee la app YA migrada: centavos enteros. */
function totales(ruta) {
  const db = new DatabaseSync(ruta);
  const r = db.prepare(`
    SELECT
      (SELECT coalesce(SUM(monto),0) FROM transactions WHERE tipo='ingreso' AND deleted=0) ingresos,
      (SELECT coalesce(SUM(monto),0) FROM transactions WHERE tipo='gasto'   AND deleted=0) gastos,
      (SELECT coalesce(SUM(monto),0) FROM depositos_bancarios) depositos,
      (SELECT saldo_inicial FROM churches WHERE id=1) saldo,
      (SELECT COUNT(*) FROM transactions) filas`).get();
  db.close();
  return r;
}

// ---------------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "tamio-respaldo-"));
const MIGRACIONES = [{ version: VERSION, descripcion: "dinero a centavos", sql: sqlDeLaMigracion(VERSION) }];

try {
  const filas = libro();
  const base = join(dir, "tamio.db");
  crearBaseV35(base, filas);

  // Lo que DEBE dar cada total: se redondea fila a fila, que es lo que hace la
  // migración (ROUND por fila, luego SUM). Sumar primero y redondear después
  // no es lo mismo, y confundirlos es cómo se cuela un centavo de diferencia.
  const cent = (x) => Math.round(x * 100);
  const espIngresos = filas.filter((f) => f.tipo === "ingreso").reduce((a, f) => a + cent(f.monto), 0);
  const espGastos = filas.filter((f) => f.tipo === "gasto").reduce((a, f) => a + cent(f.monto), 0);

  console.log(`\nLibro de prueba: ${filas.length} movimientos, todos con céntimos de los feos`);

  // --- El respaldo se hace AQUÍ, antes de migrar: es una copia del archivo ---
  const respaldoAntes = join(dir, "respaldo-antes.db");
  copyFileSync(base, respaldoAntes);

  console.log("\nLa Mac que actualiza: la migración corre sobre la base de siempre");
  chk(aplicarMigraciones(base, MIGRACIONES), 1, "la 36 se aplica una vez");
  const tras = totales(base);
  chk(tras.ingresos, espIngresos, `ingresos = ${espIngresos} centavos`);
  chk(tras.gastos, espGastos, `gastos = ${espGastos} centavos`);
  chk(tras.saldo, 115, "saldo_inicial de 1.15 → 115");
  chk(tras.depositos, 234055, "depósito de 2340.55 → 234055");

  console.log("\nSe restaura el respaldo VIEJO sobre la app ya migrada");
  // Es lo que hace aplicar_restauracion_pendiente: copiar el archivo del
  // paquete encima y dejar que el arranque migre.
  const restaurada = join(dir, "restaurada.db");
  copyFileSync(respaldoAntes, restaurada);
  chk(new DatabaseSync(restaurada).prepare("SELECT max(version) v FROM _migraciones").get().v, 35,
      "el respaldo llega con esquema 35, sin migrar");
  chk(aplicarMigraciones(restaurada, MIGRACIONES), 1, "el arranque siguiente aplica la 36");
  const rest = totales(restaurada);
  chk(rest.ingresos, tras.ingresos, "mismos ingresos que la base que nunca se restauró");
  chk(rest.gastos, tras.gastos, "mismos gastos");
  chk(rest.depositos, tras.depositos, "mismos depósitos");
  chk(rest.saldo, tras.saldo, "mismo saldo inicial");
  chk(rest.filas, tras.filas, "mismo número de movimientos");

  console.log("\nEl guard: la 36 no puede correr dos veces (multiplicaría por 100)");
  chk(aplicarMigraciones(base, MIGRACIONES), 0, "segundo arranque: no se aplica nada");
  chk(aplicarMigraciones(base, MIGRACIONES), 0, "tercer arranque: tampoco");
  const trasTres = totales(base);
  chk(trasTres.ingresos, tras.ingresos, "los ingresos no se movieron ni un centavo");
  chk(trasTres.gastos, tras.gastos, "los gastos tampoco");

  console.log("\nUn respaldo hecho DESPUÉS de migrar se restaura sin tocar nada");
  const respaldoNuevo = join(dir, "respaldo-despues.db");
  copyFileSync(base, respaldoNuevo);
  chk(aplicarMigraciones(respaldoNuevo, MIGRACIONES), 0, "ya viene en 36: no hay nada que aplicar");
  chk(totales(respaldoNuevo).ingresos, tras.ingresos, "mismos ingresos");

  console.log("\nUn respaldo de una versión MÁS NUEVA se rechaza (lib.rs:1174-1183)");
  // La comprobación real compara version_del_paquete() con la mayor de la
  // lista de migraciones. Aquí se comprueba que la lectura de la versión es la
  // que esa condición usa.
  const futuro = join(dir, "respaldo-futuro.db");
  copyFileSync(base, futuro);
  const dbF = new DatabaseSync(futuro);
  dbF.prepare("INSERT INTO _migraciones (version,descripcion) VALUES (?,'del futuro')").run(37);
  const delPaquete = dbF.prepare("SELECT coalesce(max(version),0) v FROM _migraciones").get().v;
  dbF.close();
  chk(delPaquete > VERSION, true, `esquema ${delPaquete} > ${VERSION}: la app lo rechazaría`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(fallos === 0
  ? `\n✔ el respaldo va y vuelve sin perder un centavo.\n`
  : `\n✗ ${fallos} fallo(s) en el viaje del respaldo.\n`);
process.exit(fallos ? 1 : 0);
