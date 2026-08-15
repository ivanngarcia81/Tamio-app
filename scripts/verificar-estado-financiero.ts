// Pruebas nº 3, 4 y 5 del paso 5 de docs/plan-centavos.md.
//
// `npm run verificar-estado-financiero`.
//
//   3. Los tres importes trampa (0.01, 1.15 y 999999.99) se guardan, se leen y
//      se suman sin cambiar.
//   4. El total del estado financiero coincide con la suma de sus líneas al
//      centavo, con cientos de movimientos. Esta es LA prueba: es el número que
//      el concilio revisa, y en coma flotante era exactamente el que derivaba.
//   5. Pantalla y PDF muestran la misma cifra.
//
// La nº 5 tiene una parte que solo se puede ver con los ojos, en la Mac. Lo que
// se comprueba aquí es lo que la haría fallar: que haya UNA sola conversión de
// centavos a decimales en toda la app, la de `aDecimal()`, y que las tres
// funciones de formato pasen por ella. Si alguien vuelve a escribir un `/ 100`
// suelto en cualquier archivo, esta prueba se pone roja.
//
// El SQL del estado financiero NO se copia: se extrae de src/db.ts, por el
// mismo motivo que la prueba de la migración extrae el suyo de lib.rs.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deTexto, sumar, aDecimal, CERO, type Centavos } from "../src/dinero.ts";

let fallos = 0;
const chk = (a: unknown, b: unknown, q: string) => {
  if (Object.is(a, b)) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}: esperado ${String(b)}, obtenido ${String(a)}`); }
};

// ---------------------------------------------------------------------------
// Prueba 3 — los tres importes que el plan nombra por su nombre
// ---------------------------------------------------------------------------
console.log("\nPrueba 3 — los tres importes trampa, de la casilla a la base y de vuelta");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE transactions (
           id INTEGER PRIMARY KEY, church_id INTEGER NOT NULL, fecha TEXT NOT NULL,
           tipo TEXT NOT NULL, categoria TEXT NOT NULL,
           estado TEXT NOT NULL DEFAULT 'aprobado',
           monto INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`);

const ins = db.prepare(
  "INSERT INTO transactions (church_id,fecha,tipo,categoria,monto) VALUES (1,?,?,?,?)");

for (const [texto, esperado] of [["0.01", 1], ["1.15", 115], ["999999.99", 99999999]] as const) {
  const c = deTexto(texto);
  chk(c, esperado, `el tesorero teclea "${texto}" → ${esperado} centavos`);
  ins.run("2026-07-01", "ingreso", "diezmo", c as number);
  const leido = db.prepare("SELECT monto m, typeof(monto) t FROM transactions ORDER BY id DESC LIMIT 1")
    .get() as { m: number; t: string };
  chk(leido.m, esperado, `vuelve de la base igual`);
  chk(leido.t, "integer", `y guardado como entero, no como real`);
}
db.exec("DELETE FROM transactions");

// ---------------------------------------------------------------------------
// Prueba 4 — el total cuadra con la suma de sus líneas
// ---------------------------------------------------------------------------
console.log("\nPrueba 4 — estado financiero de un mes con cientos de movimientos");

/** Extrae la consulta del estado financiero de db.ts. Si alguien la cambia,
 *  esta prueba prueba la consulta NUEVA, no una copia vieja.
 *
 *  Se ancla en el backtick que abre un SELECT, no en "el primer backtick":
 *  el comentario que hay justo encima de la consulta lleva `total` entre
 *  backticks, y anclarse en el primero extraía esa palabra suelta. */
function sqlDeMonthTotals(): string {
  const ts = readFileSync("src/db.ts", "utf8");
  const i = ts.indexOf("export async function monthTotals");
  if (i < 0) throw new Error("no encuentro monthTotals en src/db.ts");
  const ini = ts.slice(i).search(/`\s*SELECT/);
  if (ini < 0) throw new Error("monthTotals no tiene consulta en plantilla");
  const desde = i + ini + 1;
  const fin = ts.indexOf("`", desde);
  return ts.slice(desde, fin).replace("$1", "1").replace("$2", "'2026-07'");
}

const CATS_ING = ["diezmo", "ofrenda", "donacion", "otros"];
const CATS_GAS = ["pastores", "servicios", "misiones", "ayudas", "mantenimiento", "eventos"];

// Libro determinista de céntimos feos: nunca .00 ni .50, que son los únicos
// que la coma flotante representa exacto y por eso no prueban nada.
let semilla = 20260811;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;

const movimientos: { tipo: string; cat: string; monto: Centavos }[] = [];
for (let i = 0; i < 600; i++) {
  const esIngreso = azar() < 0.6;
  const centavos = 1 + Math.floor(azar() * 99);
  const enteros = Math.floor(azar() * 4000);
  const monto = deTexto(`${enteros}.${String(centavos).padStart(2, "0")}`);
  if (monto === null) throw new Error("importe inválido en el libro de prueba");
  movimientos.push({
    tipo: esIngreso ? "ingreso" : "gasto",
    cat: esIngreso ? CATS_ING[Math.floor(azar() * CATS_ING.length)]!
                   : CATS_GAS[Math.floor(azar() * CATS_GAS.length)]!,
    monto,
  });
}
// Un movimiento del mes de al lado y uno borrado: la consulta tiene que
// dejarlos fuera, y si los colara el total dejaría de cuadrar con las líneas.
const otroMes = db.prepare(
  "INSERT INTO transactions (church_id,fecha,tipo,categoria,monto) VALUES (1,'2026-06-30','ingreso','diezmo',999999)");
otroMes.run();
const borrado = db.prepare(
  "INSERT INTO transactions (church_id,fecha,tipo,categoria,monto,deleted) VALUES (1,'2026-07-10','ingreso','diezmo',777777,1)");
borrado.run();
const pendiente = db.prepare(
  "INSERT INTO transactions (church_id,fecha,tipo,categoria,monto,estado) VALUES (1,'2026-07-11','ingreso','diezmo',555555,'pendiente')");
pendiente.run();

for (const m of movimientos) ins.run("2026-07-15 10:30", m.tipo, m.cat, m.monto as number);

// La app agrupa por (tipo, categoria) y suma las líneas en JavaScript con
// sumar(); se reproduce ese mismo bucle, que es el de monthTotals.
const filas = db.prepare(sqlDeMonthTotals()).all() as
  { tipo: string; categoria: string; total: number; cnt: number }[];

let ingresos = CERO, gastos = CERO;
const porCatIngreso: Record<string, Centavos> = {};
const porCatGasto: Record<string, Centavos> = {};
for (const r of filas) {
  const t = r.total as Centavos;
  if (r.tipo === "ingreso") {
    ingresos = sumar(ingresos, t);
    porCatIngreso[r.categoria] = sumar(porCatIngreso[r.categoria] ?? CERO, t);
  } else {
    gastos = sumar(gastos, t);
    porCatGasto[r.categoria] = sumar(porCatGasto[r.categoria] ?? CERO, t);
  }
}

// Referencia independiente: la suma del libro, sin pasar por SQLite.
const espIngresos = movimientos.filter((m) => m.tipo === "ingreso")
  .reduce((a, m) => a + (m.monto as number), 0);
const espGastos = movimientos.filter((m) => m.tipo === "gasto")
  .reduce((a, m) => a + (m.monto as number), 0);

chk(filas.length > 0, true, `la consulta devuelve ${filas.length} líneas de categoría`);
chk(ingresos as number, espIngresos, `total de ingresos = ${espIngresos} centavos, exacto`);
chk(gastos as number, espGastos, `total de gastos = ${espGastos} centavos, exacto`);
chk(Object.values(porCatIngreso).reduce((a, b) => a + (b as number), 0), ingresos as number,
    "la suma de las líneas de ingreso da el total de ingresos");
chk(Object.values(porCatGasto).reduce((a, b) => a + (b as number), 0), gastos as number,
    "la suma de las líneas de gasto da el total de gastos");
chk(Number.isInteger(ingresos as number) && Number.isInteger(gastos as number), true,
    "los totales son enteros: ningún .00000000001");
chk(filas.reduce((a, r) => a + r.cnt, 0), movimientos.length,
    "el mes de al lado, el borrado y el pendiente quedan fuera");

// El balance, que es la última línea del estado financiero.
const balance = (ingresos as number) - (gastos as number);
chk(balance, espIngresos - espGastos, `balance = ${balance} centavos`);

// Los porcentajes de las tartas: con centavos enteros tienen que sumar 100.
const pcts = Object.values(porCatGasto).map((v) => ((v as number) / (gastos as number)) * 100);
chk(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) < 1e-9, true,
    "los porcentajes por categoría suman 100 %");

// ---------------------------------------------------------------------------
// Prueba 5 — una sola conversión en toda la app
// ---------------------------------------------------------------------------
console.log("\nPrueba 5 — pantalla y PDF salen del mismo sitio");

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivosFuente(p, acc);
    else if (/\.(ts|tsx)$/.test(n) && p !== join("src", "dinero.ts")) acc.push(p);
  }
  return acc;
}

/** Líneas de código (sin comentarios) con una división entre 100: la
 *  conversión de centavos a decimales. Fuera de dinero.ts no puede haber
 *  ninguna — si la hay, hay dos verdades sobre cuánto vale un importe. */
const sueltos: string[] = [];
for (const f of archivosFuente("src")) {
  readFileSync(f, "utf8").split("\n").forEach((linea, i) => {
    const codigo = linea.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    if (/\/\s*100\b/.test(codigo)) sueltos.push(`${f}:${i + 1}`);
  });
}
chk(sueltos.length, 0,
    sueltos.length ? `hay un "/ 100" fuera de dinero.ts: ${sueltos.join(", ")}`
                   : "ningún \"/ 100\" fuera de dinero.ts");

// Las tres funciones de formato tienen que convertir con aDecimal().
const dbTs = readFileSync("src/db.ts", "utf8");
const pdfTs = readFileSync("src/services/print/printUtils.ts", "utf8");
const cuerpo = (src: string, nombre: string) => {
  const i = src.indexOf(`export function ${nombre}(`);
  if (i < 0) throw new Error(`no encuentro ${nombre}`);
  return src.slice(i, src.indexOf("\n}", i));
};
chk(/aDecimal\(/.test(cuerpo(dbTs, "fmtMoney")), true, "fmtMoney (pantalla) convierte con aDecimal");
chk(/aDecimal\(/.test(cuerpo(pdfTs, "fmtMoneyPdf")), true, "fmtMoneyPdf convierte con aDecimal");
chk(/aDecimal\(/.test(cuerpo(pdfTs, "fmtMoneyPlain")), true, "fmtMoneyPlain convierte con aDecimal");

// Y el resultado de esa conversión, para los importes del estado financiero de
// arriba, tiene que tener exactamente dos decimales: es lo que las tres
// funciones formatean después con minimumFractionDigits: 2.
for (const c of [ingresos, gastos, balance as Centavos, deTexto("1.15")!, deTexto("0.01")!]) {
  const d = aDecimal(c);
  chk(Number(d.toFixed(2)), d, `${c} centavos → ${d.toFixed(2)} sin decimales de más`);
}

db.close();
console.log(fallos === 0
  ? `\n✔ el estado financiero cuadra al centavo.\n`
  : `\n✗ ${fallos} fallo(s) en el estado financiero.\n`);
process.exit(fallos ? 1 : 0);
