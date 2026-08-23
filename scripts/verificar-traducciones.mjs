// Comprueba que los dos idiomas dicen lo mismo.
//
// Una clave que falta no rompe nada: i18next devuelve la propia clave, así que
// al usuario le aparece `recordModal.guardarGasto` en mitad de un botón. No hay
// error, no hay aviso, y solo se descubre si alguien abre esa pantalla en ese
// idioma. Con dos idiomas y semanas de cambios rápidos, se desincroniza solo.
//
// Se comprueban dos cosas:
//   1. Toda clave de es.ts existe en en.ts y al revés.
//   2. Toda clave usada con t("…") en el código existe en los dos archivos.
//
// Uso:  node scripts/verificar-traducciones.mjs
//
// **Los archivos se EVALÚAN, no se analizan con expresiones regulares.** El
// primer intento leía el texto con una regex y daba falsos positivos en cuanto
// aparecía un array, un objeto de una sola línea o una comilla dentro de un
// comentario — y un informe con ruido no lo usa nadie. esbuild ya está aquí
// (lo trae Vite), así que se transpila el módulo y se recorre el objeto real:
// cero interpretación, cero falsos positivos.
//
// Informa y NO falla el build: las claves armadas al vuelo
// (`t(\`plan.nombre.${p}\`)`) no se pueden resolver sin ejecutar la app, así que
// el punto 2 puede quedarse corto. Es un informe para leer, no un candado.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "esbuild";

/** Carga un archivo de traducciones y devuelve el objeto de verdad. */
async function cargar(ruta) {
  const ts = readFileSync(ruta, "utf8");
  const { code } = transformSync(ts, { loader: "ts", format: "esm" });
  const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  const mod = await import(url);
  return mod.default ?? Object.values(mod)[0];
}

/** Rutas de todas las hojas: "miembros.statTotal". Un array cuenta como hoja
 *  (los días de la semana, por ejemplo, se piden enteros con returnObjects). */
function hojas(obj, prefijo = "", acc = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) hojas(v, ruta, acc);
    else acc.add(ruta);
  }
  return acc;
}

/** Claves usadas con t("…") en el código. Solo las literales: las armadas con
 *  plantilla no se pueden resolver sin ejecutar. */
function clavesUsadas(dir, acc = new Map()) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "i18n") clavesUsadas(p, acc);
      continue;
    }
    if (!/\.tsx?$/.test(p)) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
      if (!acc.has(m[1])) acc.set(m[1], p);
    }
  }
  return acc;
}

/**
 * Prefijos de claves armadas con plantilla: t(`dashboard.saludo.${franja}`).
 *
 * El sufijo no se puede resolver sin ejecutar la app —eso sigue siendo
 * verdad—, pero el PREFIJO sí es estático, y comprobar que existe al menos
 * una clave debajo caza el fallo que de verdad ocurre: que la rama entera no
 * exista. Pasó con `dashboard.saludo.*`, que no estaba en ningún idioma; el
 * Inicio del iPad enseñó el literal "dashboard.saludo.manana" como saludo de
 * 34px durante semanas, en TestFlight incluido, y este script pasaba en verde
 * porque miraba solo las comillas dobles.
 *
 * Se recogen las plantillas cuya parte fija acaba en punto o en guion bajo
 * —`raiz.rama.${x}` y `raiz.clave_${x}`, las dos formas que usa esta app—;
 * una como `plan.${p}Nombre` no tiene prefijo comprobable y se deja pasar,
 * igual que antes.
 */
function prefijosUsados(dir, acc = new Map()) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "i18n") prefijosUsados(p, acc);
      continue;
    }
    if (!/\.tsx?$/.test(p)) continue;
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]*[._])\$\{/g)) {
      if (!acc.has(m[1])) acc.set(m[1], p);
    }
  }
  return acc;
}

/** Los plurales viven como `clave_one` / `clave_other`; en el código se usa
 *  `clave` a secas y i18next elige según el número. */
const base = (k) => k.replace(/_(one|other|zero|two|few|many)$/, "");
const normalizar = (set) => new Set([...set].map(base));

const esN = normalizar(hojas(await cargar("src/i18n/es.ts")));
const enN = normalizar(hojas(await cargar("src/i18n/en.ts")));

const soloEs = [...esN].filter((k) => !enN.has(k)).sort();
const soloEn = [...enN].filter((k) => !esN.has(k)).sort();

const usadas = clavesUsadas("src");
const sinTraducir = [...usadas.entries()]
  .filter(([k]) => !esN.has(base(k)) || !enN.has(base(k)))
  .sort();

const prefijos = prefijosUsados("src");
const existePrefijo = (set, pre) => [...set].some((k) => k.startsWith(pre));
const prefijosHuerfanos = [...prefijos.entries()]
  .filter(([pre]) => !existePrefijo(esN, pre) || !existePrefijo(enN, pre))
  .sort();

console.log(`Claves: ${esN.size} en español, ${enN.size} en inglés`);
console.log(`Prefijos de claves con plantilla comprobados: ${prefijos.size}\n`);

if (soloEs.length) {
  console.log(`✗ ${soloEs.length} clave(s) solo en ESPAÑOL (en inglés saldría el código crudo):`);
  for (const k of soloEs) console.log(`    ${k}`);
  console.log();
}
if (soloEn.length) {
  console.log(`✗ ${soloEn.length} clave(s) solo en INGLÉS:`);
  for (const k of soloEn) console.log(`    ${k}`);
  console.log();
}
if (sinTraducir.length) {
  console.log(`✗ ${sinTraducir.length} clave(s) usadas en el código y sin traducción:`);
  for (const [k, archivo] of sinTraducir) console.log(`    ${k}   ${archivo}`);
  console.log();
}
if (prefijosHuerfanos.length) {
  console.log(`✗ ${prefijosHuerfanos.length} clave(s) con plantilla cuya rama no existe en ningún idioma:`);
  for (const [pre, archivo] of prefijosHuerfanos) console.log(`    ${pre}\${…}   ${archivo}`);
  console.log();
}
if (!soloEs.length && !soloEn.length && !sinTraducir.length && !prefijosHuerfanos.length) {
  console.log("✔ Los dos idiomas están sincronizados y todas las claves usadas existen.");
} else {
  // Salir con 1, no con 0. Antes este script IMPRIMÍA los problemas y se iba
  // en verde, así que cualquier comprobación que mirase el código de salida
  // —la mía incluida— lo daba por bueno. Una clave sin traducir se ve como
  // "agenda.repetir" en pantalla; eso no puede pasar por un aviso.
  process.exitCode = 1;
}
