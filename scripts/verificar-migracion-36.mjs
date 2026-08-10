// Verificación de la migración 36 — dinero a centavos enteros.
//
// `npm run verificar-migracion-36`. Es la migración de la que NO hay vuelta
// atrás, así que se prueba contra un SQLite de verdad antes de que toque la
// base de nadie.
//
// El SQL NO se copia aquí: se EXTRAE de src-tauri/src/lib.rs. Si alguien edita
// la migración y rompe algo, esta prueba lo ve; una copia se habría desviado
// en silencio, que es la peor forma de tener una prueba.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const LIB = "src-tauri/src/lib.rs";

/** Saca el `sql: r#"…"#` del bloque `version: 36` de lib.rs. */
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
  else { fallos++; console.error(`  ✗ ${q}: esperado ${b}, obtenido ${a}`); }
};

const db = new DatabaseSync(":memory:");

// Esquema anterior a la 36: lo que importa es que las cuatro columnas de
// dinero sean REAL NOT NULL y que haya un índice que NO las toque, como en
// la app real.
db.exec(`
  CREATE TABLE churches (
    id INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
    saldo_inicial REAL NOT NULL DEFAULT 0);
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, fecha TEXT NOT NULL,
    tipo TEXT NOT NULL, monto REAL NOT NULL, moneda TEXT);
  CREATE TABLE depositos_bancarios (
    id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, fecha TEXT NOT NULL,
    periodo TEXT NOT NULL, monto REAL NOT NULL);
  CREATE TABLE gastos_recurrentes (
    id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, concepto TEXT NOT NULL,
    monto REAL NOT NULL);
  CREATE INDEX idx_tx_church_fecha ON transactions(church_id, fecha);
`);

// Importes trampa del plan + corrientes. 1.15 es el que delata un CAST sin ROUND.
const casos = [0.01, 1.15, 2.675, 125.50, 999999.99, 0.07, 10.10, 20.20, 33.33, 0];
const esperados = [1, 115, 268, 12550, 99999999, 7, 1010, 2020, 3333, 0];

const insTx = db.prepare(
  "INSERT INTO transactions (church_id,fecha,tipo,monto,moneda) VALUES (1,'2026-08-01','ingreso',?,'USD')");
for (const m of casos) insTx.run(m);
db.prepare("INSERT INTO churches (nombre,saldo_inicial) VALUES ('Prueba',?)").run(1.15);
db.prepare("INSERT INTO depositos_bancarios (church_id,fecha,periodo,monto) VALUES (1,'2026-08-01','2026-08',?)").run(1.15);
db.prepare("INSERT INTO gastos_recurrentes (church_id,concepto,monto) VALUES (1,'Renta',?)").run(1.15);

const sumaAntes = db.prepare("SELECT SUM(monto) s FROM transactions").get().s;

console.log(`\nSQLite ${db.prepare("select sqlite_version() v").get().v} — migración extraída de ${LIB}`);

console.log("\nLa trampa que esta migración evita");
const sinRound = db.prepare("SELECT CAST(1.15 * 100 AS INTEGER) v").get().v;
chk(sinRound, 114, `CAST(1.15*100 AS INTEGER) da ${sinRound} — por eso va ROUND`);

// ---- se ejecuta la migración real ----
db.exec(sqlDeLaMigracion(36));

console.log("\nConversión de cada importe");
const filas = db.prepare("SELECT id, monto FROM transactions ORDER BY id").all();
filas.forEach((f, i) => chk(f.monto, esperados[i], `${casos[i]} → ${esperados[i]}`));

console.log("\nLas otras tres columnas de dinero");
chk(db.prepare("SELECT saldo_inicial s FROM churches").get().s, 115, "churches.saldo_inicial");
chk(db.prepare("SELECT monto m FROM depositos_bancarios").get().m, 115, "depositos_bancarios.monto");
chk(db.prepare("SELECT monto m FROM gastos_recurrentes").get().m, 115, "gastos_recurrentes.monto");

console.log("\nIntegridad");
chk(db.prepare("SELECT SUM(monto) s FROM transactions").get().s,
    Math.round(sumaAntes * 100), "la suma total se conserva");
chk(filas.length, casos.length, "no se perdió ninguna fila");
chk(db.prepare("SELECT COUNT(*) c FROM pragma_index_list('transactions')").get().c, 1,
    "el índice sobrevive al cambio de columna");
for (const t of ["transactions", "depositos_bancarios", "gastos_recurrentes"]) {
  chk(db.prepare(`SELECT type FROM pragma_table_info('${t}') WHERE name='monto'`).get().type,
      "INTEGER", `${t}.monto quedó INTEGER`);
  chk(db.prepare(`SELECT COUNT(*) c FROM pragma_table_info('${t}') WHERE name='monto_centavos'`).get().c,
      0, `${t}: la columna temporal ya no existe`);
}
chk(db.prepare("SELECT typeof(monto) t FROM transactions WHERE id=1").get().t, "integer",
    "el valor se almacena como entero, no como real");

console.log(fallos === 0
  ? `\n✔ migración 36 correcta.\n`
  : `\n✗ ${fallos} fallo(s) en la migración 36.\n`);
process.exit(fallos ? 1 : 0);
