// Comprueba que NINGUNA tabla puede romper la sincronización en silencio.
//
//   npm run verificar-sync
//
// Sustituye a `verificar-sync-cortes`, que solo miraba una tabla — y esa fue
// justo su limitación: el 24 de agosto de 2026 se añadió `firmas` a `actas`
// (una tabla que SÍ sincroniza) sin añadir la columna remota ni la entrada en
// `ACTA_DATA_COLS`, y la guarda de los cortes no podía verlo. Durante unas
// horas, quien firmaba un acta en un iPad no lo veía nadie más.
//
// Lo que vigila, para cada tabla que sincroniza:
//
//   1. **Paridad hacia arriba.** Cada columna que el cliente SUBE existe en la
//      tabla remota. Si no, el upsert manda una columna que Supabase no conoce
//      y **se corta la sincronización de TODAS las tablas**, no solo la suya.
//      Es el fallo más caro del archivo y el más fácil de cometer.
//   2. **Paridad hacia abajo.** Cada columna que se sube existe en la tabla
//      local. Una mal escrita sube `null` para siempre sin que nada falle.
//   3. **Nada se queda en tierra.** Una columna que existe a los DOS lados y
//      no está en la lista es un dato que nadie envía y que nadie echa de
//      menos hasta que hace falta. Es exactamente lo que pasó con
//      `actas.firmas`.
//   4. **Ningún id local viaja.** Un `*_id` en una lista de datos es el fallo
//      clásico: allá no significa nada. Los vínculos van por uid.
//   5. **El orden de los pasos.** Cada hija va después de su padre; si alguien
//      reordena la lista, la hija baja sin poder traducir su vínculo y se
//      queda esperando indefinidamente.
//
// Las columnas remotas se leen de los `supabase/sync-*.sql` del repo, no de
// Supabase: esto tiene que correr sin credenciales y sin red. Por eso los
// scripts tienen que reflejar lo que hay allá — si alguien añade una columna a
// mano en el panel y no la escribe aquí, esta guarda no puede saberlo.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sync = readFileSync(`${REPO}/src/sync.ts`, "utf8");
const libRs = readFileSync(`${REPO}/src-tauri/src/lib.rs`, "utf8");
const sqlTodo = readdirSync(`${REPO}/supabase`)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`${REPO}/supabase/${f}`, "utf8"))
  .join("\n");

let fallos = 0;
const chk = (ok, msg) => {
  if (ok) console.log(`  ✓ ${msg}`);
  else { fallos++; console.error(`  ✗ ${msg}`); }
};

/** Qué lista de columnas alimenta a qué tabla, y de quién es hija. */
const TABLAS = [
  { lista: "DATA_COLS", tabla: "members" },
  { lista: "TX_DATA_COLS", tabla: "transactions", padre: "members" },
  { lista: "DEP_DATA_COLS", tabla: "depositos_bancarios" },
  { lista: "CORTE_DATA_COLS", tabla: "cortes", padre: "depositos_bancarios" },
  { lista: "ACTA_DATA_COLS", tabla: "actas" },
  { lista: "CARTA_DATA_COLS", tabla: "cartas", padre: "members" },
  { lista: "SOLICITUD_DATA_COLS", tabla: "solicitudes", padre: "members" },
  { lista: "SERVICIO_DATA_COLS", tabla: "servicios" },
  { lista: "TRASLADO_SALIDA_DATA_COLS", tabla: "traslados_salida", padre: "members" },
  { lista: "TRASLADO_ENTRADA_DATA_COLS", tabla: "traslados_entrada", padre: "members" },
  { lista: "AGENDA_DATA_COLS", tabla: "agenda" },
  { lista: "MENSAJE_DATA_COLS", tabla: "mensajes" },
  { lista: "PLANTILLA_DATA_COLS", tabla: "plantillas" },
  { lista: "CATEGORIA_DATA_COLS", tabla: "categorias_custom" },
  { lista: "PUESTO_DATA_COLS", tabla: "servicio_puestos", padre: "servicios" },
  { lista: "ORDEN_DATA_COLS", tabla: "servicio_orden", padre: "servicios" },
];

/* Lo que NUNCA viaja como columna de datos, y por qué:
   - metadatos de la fila (id, uid, church_id, updated_at, deleted);
   - vínculos por id local, que se traducen a uid o son locales a propósito
     (el puente entre carta y solicitud, el servicio que creó una actividad).
   Si una de estas apareciera en una lista de datos, la comprobación 4 la caza. */
const NUNCA_VIAJAN = new Set([
  "id", "uid", "church_id", "updated_at", "deleted",
  "member_id", "deposito_id", "servicio_id", "tx_id", "corte_id", "pariente_id",
  "recurrente_id", "solicitud_id", "carta_id", "responsable_member_id",
]);

/** Columnas de una tabla local, siguiendo sus ALTER posteriores. */
function columnasLocales(tabla) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla} \\(([\\s\\S]*?)\\n\\s*\\);`);
  const m = re.exec(libRs);
  if (!m) return null;
  const base = m[1].split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l && !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0].replace(/[",]/g, ""))
    .filter(Boolean);
  const add = [...libRs.matchAll(new RegExp(`ALTER TABLE ${tabla} ADD COLUMN (\\w+)`, "g"))].map((x) => x[1]);
  const drop = [...libRs.matchAll(new RegExp(`ALTER TABLE ${tabla} DROP COLUMN (\\w+)`, "g"))].map((x) => x[1]);
  const ren = [...libRs.matchAll(new RegExp(`ALTER TABLE ${tabla} RENAME COLUMN (\\w+) TO (\\w+)`, "g"))];
  let cols = [...new Set([...base, ...add])].filter((c) => !drop.includes(c));
  for (const r of ren) cols = cols.map((c) => (c === r[1] ? r[2] : c));
  return [...new Set(cols)];
}

/** Columnas de una tabla remota según los scripts del repo: las del `create
 *  table` más las que añadan los `alter table ... add column` sueltos. */
function columnasRemotas(tabla) {
  const re = new RegExp(`create table if not exists public\\.${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
  const m = re.exec(sqlTodo);
  if (!m) return null;
  const base = m[1].split("\n")
    .map((l) => l.replace(/--.*$/, "").trim())
    .filter((l) => l && !/^(primary|unique|foreign|constraint|check)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0].replace(/[",]/g, ""))
    .filter(Boolean);
  const add = [...sqlTodo.matchAll(
    new RegExp(`alter table public\\.${tabla} add column if not exists\\s+(\\w+)`, "gi"),
  )].map((x) => x[1]);
  return [...new Set([...base, ...add])];
}

/** El contenido de un `const X = [...] as const;`, sin comentarios. */
function listaDeSync(nombre) {
  const limpio = sync.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const m = new RegExp(`const ${nombre} = \\[([\\s\\S]*?)\\] as const;`).exec(limpio);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
}

console.log("\n== Paridad de columnas de todas las tablas que sincronizan ==");

for (const { lista, tabla } of TABLAS) {
  const cols = listaDeSync(lista);
  const rem = columnasRemotas(tabla);
  const loc = columnasLocales(tabla);
  if (!cols || !rem || !loc) {
    chk(false, `${tabla}: no se pudo leer (${!cols ? "la lista" : !rem ? "el .sql" : "lib.rs"})`);
    continue;
  }

  // 1. Lo que se sube existe allá. El fallo que corta la sync de todo.
  const faltanRemoto = cols.filter((c) => !rem.includes(c));
  chk(faltanRemoto.length === 0,
    `${tabla}: todo lo que se sube existe en Supabase${faltanRemoto.length ? ` — FALTAN: ${faltanRemoto.join(", ")}` : ""}`);

  // 2. Y existe aquí.
  const faltanLocal = cols.filter((c) => !loc.includes(c));
  chk(faltanLocal.length === 0,
    `${tabla}: y en la tabla local${faltanLocal.length ? ` — faltan: ${faltanLocal.join(", ")}` : ""}`);

  // 3. Nada se queda en tierra.
  const enTierra = loc.filter((c) => !NUNCA_VIAJAN.has(c) && !cols.includes(c) && rem.includes(c));
  chk(enTierra.length === 0,
    `${tabla}: nada se queda sin viajar${enTierra.length ? ` — NO SE ENVÍAN: ${enTierra.join(", ")}` : ""}`);

  // 4. Ningún id local en los datos.
  const ids = cols.filter((c) => c === "id" || c.endsWith("_id"));
  chk(ids.length === 0,
    `${tabla}: ningún id local viaja${ids.length ? ` — se cuela: ${ids.join(", ")}` : ""}`);
}

console.log("\n== El orden de los pasos ==");
/* `members` no aparece en el array de pasos: se sincroniza ANTES, porque casi
   todas las demás traducen `member_id` a uid y necesitan su mapa. Se le da la
   posición -1 explícitamente en vez de dejar que `indexOf` devuelva -1 por
   casualidad y las comprobaciones salgan bien sin querer. */
const pasos = [...sync.matchAll(/\["([a-z_]+)", await sincronizar/g)].map((m) => m[1]);
chk(/const m = await sincronizarMiembros\(churchIdLocal\);/.test(sync),
  "members se sincroniza antes que todo lo demás, fuera de la lista de pasos");
const posicion = (t) => (t === "members" ? -1 : pasos.indexOf(t));
for (const { tabla, padre } of TABLAS) {
  if (!padre) continue;
  const i = posicion(tabla);
  const j = posicion(padre);
  if (i === -1) { chk(false, `${tabla}: no tiene paso en sincronizarTodo`); continue; }
  chk(i > j, `${tabla} va después de ${padre} (${j} → ${i})`);
}
/* Las hijas que no llevan lista propia de columnas pero sí paso y padre. */
for (const [hija, padre] of [["servicio_asistencia", "servicios"], ["corte_movimientos", "cortes"],
  ["parentescos", "members"]]) {
  const i = posicion(hija);
  const j = posicion(padre);
  if (i === -1) { chk(false, `${hija}: no tiene paso en sincronizarTodo`); continue; }
  chk(i > j, `${hija} va después de ${padre} (${j} → ${i})`);
}

/* ---- Lo que solo le pasa a la tabla puente de los cortes ----
   Viene de `verificar-sync-cortes`, que esta guarda sustituye. La tabla remota
   lleva un índice único PARCIAL sobre `tx_uid`: dos aparatos que enganchen el
   mismo movimiento en cortes distintos no producen un conflicto de uid que el
   upsert sepa resolver — rompen el índice y devuelven error, y un error ahí
   corta la sincronización de todas las tablas. Por eso el choque se resuelve
   antes de subir, y el perdedor se entierra en su PROPIA llamada: en la misma
   sentencia, Postgres comprueba el índice mientras aplica las filas y el
   enganche nuevo chocaría con el viejo aunque el viejo se estuviera borrando
   en esa misma tanda. */
console.log("\n== El choque del índice único de los cortes ==");
{
  const cuerpo = sync.slice(sync.indexOf("export async function sincronizarCorteMovimientos"));
  const iEntierro = cuerpo.indexOf("perdedores.length > 0");
  const iUpsert = cuerpo.indexOf('.from("corte_movimientos").upsert');
  chk(iEntierro !== -1 && iUpsert !== -1 && iEntierro < iUpsert,
    "el enganche que pierde el pulso se entierra ANTES del upsert, no en la misma tanda");
  chk(/idx_corte_movs_tx_vivo[\s\S]{0,400}where \(deleted = false\)/.test(sqlTodo),
    "y el índice remoto que lo obliga es PARCIAL, solo sobre las filas vivas");
  chk(/idx_sv_puestos_vivo[\s\S]{0,300}where \(deleted = false\)/.test(sqlTodo),
    "el de los puestos del culto también");
  chk(/idx_parentescos_par_vivo[\s\S]{0,300}where \(deleted = false\)/.test(sqlTodo),
    "y el de los parentescos");
}

console.log(fallos === 0
  ? `\n✔ las ${TABLAS.length} tablas pueden viajar sin romper nada.\n`
  : `\n✗ ${fallos} fallo(s) en la sincronización.\n`);
process.exit(fallos ? 1 : 0);
