// Comprueba que la sincronización de los cortes no puede romperse en silencio.
//
//   node scripts/verificar-sync-cortes.mjs
//
// Aquí no se simula Supabase. Lo que se vigila son las cuatro cosas que, si se
// tuercen, no dan un error visible hasta que ya hay datos de por medio — y una
// de ellas se lleva por delante la sincronización de TODAS las tablas, no solo
// la de esta.
//
//   1. **Paridad de columnas.** Cada columna que el cliente SUBE tiene que
//      existir en la tabla remota. El propio código lo deja escrito en
//      `ACTA_DATA_COLS`: «la columna remota se creó antes que esta línea; al
//      revés, el upsert manda una columna que Supabase no conoce y se corta la
//      sincronización entera». Esto lo convierte en una comprobación en vez de
//      un comentario: se leen las columnas de `supabase/sync-co1-cortes.sql` y
//      se cruzan con las que el cliente manda.
//   2. **Y que existan también en LOCAL**, extrayendo el `CREATE TABLE` de
//      `src-tauri/src/lib.rs`. Una columna mal escrita en la lista sube `null`
//      para siempre sin que nada falle.
//   3. **Ningún id local viaja.** Un `id` o un `deposito_id` en la lista de
//      datos es el fallo clásico de este patrón: allá no significan nada.
//   4. **El orden de los pasos.** Los cortes van después de transacciones y
//      depósitos; si alguien reordena la lista, un corte baja sin poder
//      traducir su `deposito_uid` y se queda esperando indefinidamente.
//
// Se prueba al revés como todas: quitar `deposito_uid` del .sql, colar un
// `deposito_id` en la lista, o mover el paso de cortes por encima del de
// depósitos tienen que salir en rojo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sync = readFileSync(`${REPO}/src/sync.ts`, "utf8");
const sql = readFileSync(`${REPO}/supabase/sync-co1-cortes.sql`, "utf8");
const libRs = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");

let fallos = 0;
const chk = (ok, msg) => {
  if (ok) console.log(`  ✓ ${msg}`);
  else { fallos++; console.error(`  ✗ ${msg}`); }
};

/** Las columnas de un `create table ... ( ... );` del script de Supabase. */
function columnasRemotas(tabla) {
  const re = new RegExp(`create table if not exists public\\.${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
  const m = sync && re.exec(sql);
  if (!m) return null;
  return m[1]
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l && !/^(primary|unique|foreign|constraint|check)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0].replace(/[",]/g, ""))
    .filter(Boolean);
}

/** Las columnas de un `CREATE TABLE IF NOT EXISTS x (...)` de lib.rs, más las
 *  que le añadan los `ALTER TABLE x ADD COLUMN` posteriores. */
function columnasLocales(tabla) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla} \\(([\\s\\S]*?)\\n\\s*\\);`);
  const m = re.exec(libRs);
  if (!m) return null;
  const base = m[1]
    .split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l && !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0].replace(/[",]/g, ""))
    .filter(Boolean);
  const alters = [...libRs.matchAll(new RegExp(`ALTER TABLE ${tabla} ADD COLUMN (\\w+)`, "g"))]
    .map((x) => x[1]);
  return [...new Set([...base, ...alters])];
}

/** El contenido de un `const X = [ ... ]` de sync.ts, como lista de cadenas. */
function listaDeSync(nombre) {
  const re = new RegExp(`const ${nombre} = \\[([\\s\\S]*?)\\] as const;`);
  const m = re.exec(sync);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

console.log("\n== La sincronización de los cortes ==");

const datos = listaDeSync("CORTE_DATA_COLS");
chk(Array.isArray(datos) && datos.length > 0, `CORTE_DATA_COLS se lee de sync.ts (${datos?.length})`);

const remCortes = columnasRemotas("cortes");
const remMovs = columnasRemotas("corte_movimientos");
chk(Array.isArray(remCortes) && remCortes.includes("uid"),
  `el script de Supabase declara la tabla cortes (${remCortes?.length} columnas)`);
chk(Array.isArray(remMovs) && remMovs.includes("tx_uid"),
  `y la tabla puente (${remMovs?.length} columnas)`);

const locCortes = columnasLocales("cortes");
const locMovs = columnasLocales("corte_movimientos");
chk(Array.isArray(locCortes) && locCortes.includes("deposito_id"),
  `la tabla local se lee de lib.rs (${locCortes?.length} columnas)`);
chk(Array.isArray(locMovs) && locMovs.includes("tx_id"),
  `y la puente local (${locMovs?.length} columnas)`);

// --- 1 y 2. Paridad: todo lo que se sube existe a los dos lados ------------
if (datos && remCortes && locCortes) {
  const faltanRemoto = datos.filter((c) => !remCortes.includes(c));
  chk(faltanRemoto.length === 0,
    `todas las columnas que se suben existen en Supabase${faltanRemoto.length ? ` (faltan: ${faltanRemoto.join(", ")})` : ""}`);
  const faltanLocal = datos.filter((c) => !locCortes.includes(c));
  chk(faltanLocal.length === 0,
    `y todas existen en la tabla local${faltanLocal.length ? ` (faltan: ${faltanLocal.join(", ")})` : ""}`);
}

// El vínculo traducido va aparte de la lista de datos, y tiene que estar a los
// dos lados con su nombre de cada uno.
chk(!!remCortes?.includes("deposito_uid"), "el depósito viaja como deposito_uid, no como id");
chk(!!locCortes?.includes("deposito_id"), "y localmente sigue siendo deposito_id");
chk(!!remMovs?.includes("corte_uid") && !!remMovs?.includes("tx_uid"),
  "la puente enlaza por corte_uid y tx_uid");

// --- 3. Ningún id local se cuela en lo que se sube -------------------------
if (datos) {
  const ids = datos.filter((c) => c === "id" || c.endsWith("_id"));
  chk(ids.length === 0,
    `ningún id local viaja en CORTE_DATA_COLS${ids.length ? ` (se cuela: ${ids.join(", ")})` : ""}`);
}

// --- 4. El orden de los pasos en sincronizarTodo ---------------------------
const pasos = [...sync.matchAll(/\["([a-z_]+)", await sincronizar/g)].map((m) => m[1]);
const pos = (t) => pasos.indexOf(t);
chk(pos("cortes") !== -1 && pos("corte_movimientos") !== -1,
  `los dos pasos están en sincronizarTodo (${pasos.length} pasos en total)`);
chk(pos("cortes") > pos("depositos_bancarios"),
  `cortes va DESPUÉS de depósitos (${pos("depositos_bancarios")} → ${pos("cortes")})`);
chk(pos("corte_movimientos") > pos("cortes"),
  `la puente va después de los cortes (${pos("cortes")} → ${pos("corte_movimientos")})`);
chk(pos("corte_movimientos") > pos("transactions"),
  `y después de las transacciones (${pos("transactions")} → ${pos("corte_movimientos")})`);

// --- 5. El choque del índice único se resuelve ANTES del upsert ------------
// En la misma sentencia no valdría: Postgres comprueba el índice mientras
// aplica las filas y el enganche nuevo chocaría con el viejo aunque el viejo se
// estuviera borrando en esa misma tanda.
const cuerpoMovs = sync.slice(sync.indexOf("export async function sincronizarCorteMovimientos"));
const iEntierro = cuerpoMovs.indexOf("perdedores.length > 0");
const iUpsert = cuerpoMovs.indexOf('.from("corte_movimientos").upsert');
chk(iEntierro !== -1 && iUpsert !== -1 && iEntierro < iUpsert,
  "el enganche que pierde el pulso se entierra antes del upsert, no en la misma tanda");
chk(/idx_corte_movs_tx_vivo[\s\S]{0,400}where \(deleted = false\)/.test(sql),
  "y el índice remoto que lo obliga es PARCIAL, solo sobre las filas vivas");

console.log(fallos === 0
  ? "\n✔ los cortes pueden viajar sin romper nada.\n"
  : `\n✗ ${fallos} fallo(s) en la sincronización de cortes.\n`);
process.exit(fallos ? 1 : 0);
