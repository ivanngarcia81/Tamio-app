// Que "borrar los datos de la iglesia" no se deje ninguna tabla detrás.
//
// `npm run verificar-borrado`.
//
// Por qué existe. El 26 de agosto de 2026, al cerrar el reemplazo de Mensajes,
// salió que la tabla `registro` —creada dos días antes por la migración 50—
// nunca entró en `TABLAS_DATOS`. Consecuencia: un administrador pulsaba
// "borrar los datos de la iglesia", la app decía que sí, y el registro de todo
// lo que había pasado en esa iglesia se quedaba entero. Nadie lo habría notado
// hasta que alguien fuera a mirar.
//
// Y no fue un descuido aislado: es lo que pasa SIEMPRE que se añade una tabla.
// El autor de la migración piensa en crear, en sincronizar y en pintar; la
// lista del borrado vive en otro archivo, a mil líneas, y no la ve nadie. Un
// olvido que no avisa se repite.
//
// Lo que se comprueba, sobre el esquema REAL —las migraciones de lib.rs
// corridas de verdad sobre un sqlite en memoria, no una lista copiada a mano—:
//
//   1. Toda tabla de datos de una iglesia (`church_id` + `deleted`) está en
//      `TABLAS_DATOS`, o figura por su nombre en la lista de excepciones de
//      abajo. Añadir una tabla y olvidarla rompe esto.
//   2. Todo lo que la pantalla de borrar CUENTA antes de preguntar
//      (`TABLA_DE_INVENTARIO`) existe y además se borra. Contar algo que no
//      se borra es prometerle al usuario un borrado que no ocurre. Se añadió
//      el 28 de agosto de 2026, cuando esa lista nació: es una segunda lista
//      de nombres de tabla, o sea la misma trampa otra vez.
//   3. Todo nombre de `TABLAS_DATOS` existe de verdad en el esquema. Soltar
//      una tabla y dejar su nombre en la lista rompe esto — es lo que habría
//      pasado con `mensajes` en la migración 51 si no se hubiera quitado.
//
// Las excepciones se escriben CON su motivo. Una excepción sin motivo es una
// tabla olvidada con permiso.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const LIB = "src-tauri/src/lib.rs";
const DB_TS = "src/db.ts";

/** Tablas con `church_id` que a propósito NO se borran con los datos.
 *  El motivo va al lado y es parte de la prueba: si algún día una de estas
 *  deja de ser configuración, el motivo escrito es lo que hace evidente que
 *  hay que moverla. */
const EXCEPCIONES = {
  categorias_custom: "es CONFIGURACIÓN: las categorías propias de la iglesia sobreviven al borrado de datos (opción A)",
  plantillas: "es CONFIGURACIÓN: las plantillas de cartas sobreviven al borrado de datos (opción A)",
  servicio_asistencia: "se limpia POR SERVICIO, no por iglesia — su padre `servicios` sí está en la lista",
};

let fallos = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const mal = (m) => { console.error(`  ✗ ${m}`); fallos++; };

/* ---------- El esquema real, corriendo las migraciones ---------- */

/** Todas las migraciones de lib.rs, en orden, con su SQL. No se copia el SQL
 *  aquí: una copia se desviaría en silencio el día que alguien edite lib.rs. */
function migraciones() {
  const rust = readFileSync(LIB, "utf8");
  const migs = [];
  let i = 0;
  while ((i = rust.indexOf("version: ", i)) >= 0) {
    const version = Number(rust.slice(i + 9, rust.indexOf(",", i)));
    const ini = rust.indexOf('sql: r#"', i);
    if (ini < 0) break;
    const fin = rust.indexOf('"#', ini);
    migs.push({ version, sql: rust.slice(ini + 8, fin) });
    i = fin;
  }
  return migs.sort((a, b) => a.version - b.version);
}

const migs = migraciones();
const db = new DatabaseSync(":memory:");

console.log("\n== Las migraciones corren enteras, en orden ==");
for (const m of migs) {
  try {
    db.exec(m.sql);
  } catch (e) {
    mal(`migración ${m.version}: ${e.message}`);
    console.error("\n✗ el esquema no se puede construir; lo demás no se puede comprobar.\n");
    process.exit(1);
  }
}
ok(`las ${migs.length} migraciones, de la 1 a la ${migs.at(-1).version}`);

/** Nombre → columnas, del esquema recién construido. */
const esquema = new Map();
for (const { name } of db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all()) {
  esquema.set(name, new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name)));
}

/* ---------- La lista del borrado, leída de db.ts ---------- */

const ts = readFileSync(DB_TS, "utf8");
const bloque = ts.slice(ts.indexOf("const TABLAS_DATOS = ["));
const lista = bloque.slice(bloque.indexOf("[") + 1, bloque.indexOf("]"));
const TABLAS_DATOS = [...lista.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

if (TABLAS_DATOS.length === 0) {
  console.error(`\n✗ no pude leer TABLAS_DATOS de ${DB_TS}.\n`);
  process.exit(1);
}

/* ---------- 1. Ninguna tabla de datos se queda fuera ---------- */

console.log("\n== Ninguna tabla de datos se queda sin borrar ==");
for (const [tabla, cols] of [...esquema].sort()) {
  if (!cols.has("church_id") || !cols.has("deleted")) continue;
  if (TABLAS_DATOS.includes(tabla)) { ok(`${tabla}: se borra`); continue; }
  if (EXCEPCIONES[tabla]) { ok(`${tabla}: fuera a propósito — ${EXCEPCIONES[tabla]}`); continue; }
  mal(
    `${tabla} guarda datos de una iglesia (church_id + deleted) y NO está en ` +
    `TABLAS_DATOS.\n      Borrar los datos de la iglesia la dejaría entera. ` +
    `Añádela a la lista de ${DB_TS},\n      o a EXCEPCIONES de este archivo CON su motivo.`
  );
}

/* ---------- 2. El inventario que se le ENSEÑA a quien va a borrar ---------- */

/* `TABLA_DE_INVENTARIO` (db.ts) es lo que la pantalla de "zona sensible"
   cuenta antes de borrar: "vas a borrar 104 miembros, 812 movimientos…". Es un
   SUBCONJUNTO a propósito —los titulares, no las diecisiete tablas—, así que
   aquí no se exige que estén todas. Lo que sí se exige son dos cosas:

     · que cada tabla que nombra EXISTA. Si alguien suelta una tabla y deja su
       nombre aquí, `contarDatosIglesia` no falla al compilar: falla en el
       aparato, con un `no such table`, en la pantalla de borrar. Mal sitio.
     · y que esté en `TABLAS_DATOS`. Contar algo que después no se borra sería
       prometer un borrado que no ocurre, que es peor que no contarlo. */

const inv = ts.slice(ts.indexOf("const TABLA_DE_INVENTARIO"));
const cuerpoInv = inv.slice(inv.indexOf("{") + 1, inv.indexOf("}"));
const INVENTARIO = [...cuerpoInv.matchAll(/:\s*"([a-z_]+)"/g)].map((m) => m[1]);

console.log("\n== Lo que se cuenta antes de borrar, existe y se borra ==");
if (INVENTARIO.length === 0) {
  mal(`no pude leer TABLA_DE_INVENTARIO de ${DB_TS}.`);
} else {
  for (const tabla of INVENTARIO) {
    if (!esquema.has(tabla)) {
      mal(`${tabla} se cuenta en TABLA_DE_INVENTARIO pero NO existe: la pantalla de borrar reventaría con "no such table".`);
    } else if (!TABLAS_DATOS.includes(tabla)) {
      mal(`${tabla} se CUENTA antes de borrar pero no está en TABLAS_DATOS: se le promete al usuario un borrado que no ocurre.`);
    } else {
      ok(`${tabla}: se cuenta y se borra`);
    }
  }
}

/* ---------- 3. Ningún nombre fantasma en la lista ---------- */

console.log("\n== Ningún nombre de la lista sobra ==");
for (const tabla of TABLAS_DATOS) {
  if (esquema.has(tabla)) ok(`${tabla}: existe en el esquema`);
  else mal(`${tabla} está en TABLAS_DATOS pero NO existe: el borrado fallaría al llegar a ella.`);
}

console.log(
  fallos === 0
    ? `\n✔ el borrado alcanza a las ${TABLAS_DATOS.length} tablas de datos, y a ninguna de más.\n`
    : `\n✗ ${fallos} fallo(s) en el borrado.\n`
);
process.exit(fallos === 0 ? 0 : 1);
