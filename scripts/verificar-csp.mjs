// Comprueba que el hash del script en línea de index.html sigue coincidiendo
// con el que autoriza el CSP de tauri.conf.json.
//
// Por qué existe: ese script fija el tema ANTES del primer pintado (si no, hay
// un destello blanco al abrir en modo oscuro), así que tiene que ir en línea, y
// el CSP lo autoriza por el hash de su contenido. Si alguien toca una letra —un
// espacio, una coma— el hash deja de cuadrar y el navegador lo bloquea EN
// SILENCIO. Y no se nota en desarrollo, porque el `devCsp` es permisivo: el
// fallo aparece solo en el build firmado, que es el que va a Apple.
//
// Corre en `npm run build`, antes de compilar. Si no cuadra, falla el build y
// dice exactamente qué hash hay que poner.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const HTML = "index.html";
const CONF = "src-tauri/tauri.conf.json";

const html = readFileSync(HTML, "utf8");
const conf = JSON.parse(readFileSync(CONF, "utf8"));

const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
const scriptSrc = conf?.app?.security?.csp?.["script-src"] ?? "";

// Sin CSP configurado no hay nada que comprobar (y sería otro problema).
if (!scriptSrc) {
  console.log("verificar-csp: no hay script-src en tauri.conf.json — nada que comprobar");
  process.exit(0);
}

const problemas = [];
for (const [, cuerpo] of enLinea) {
  const hash = "sha256-" + createHash("sha256").update(cuerpo, "utf8").digest("base64");
  if (!scriptSrc.includes(hash)) {
    problemas.push({ hash, cuerpo: cuerpo.trim().slice(0, 70) });
  }
}

// Al revés también: un hash que sobra en el CSP significa que alguien borró un
// script y dejó basura, o que se cambió el script y se añadió el nuevo sin
// quitar el viejo — lo segundo deja la puerta abierta a ejecutar el antiguo.
const hashesDeclarados = [...scriptSrc.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map((m) => m[0].slice(1, -1));
const hashesReales = enLinea.map(([, c]) => "sha256-" + createHash("sha256").update(c, "utf8").digest("base64"));
const sobrantes = hashesDeclarados.filter((h) => !hashesReales.includes(h));

if (problemas.length === 0 && sobrantes.length === 0) {
  console.log(`verificar-csp: ${enLinea.length} script(s) en línea, hashes correctos`);
  process.exit(0);
}

console.error("\n  ✗ El CSP y los scripts en línea de index.html no coinciden.\n");
for (const p of problemas) {
  console.error(`    Script sin autorizar: "${p.cuerpo}…"`);
  console.error(`    Añade este hash a script-src en ${CONF}:\n      '${p.hash}'\n`);
}
for (const h of sobrantes) {
  console.error(`    Hash de más en script-src (ya no corresponde a ningún script): '${h}'`);
  console.error("    Quítalo: si no, autoriza a ejecutar una versión antigua del script.\n");
}
console.error("  Si no se arregla, el script queda bloqueado SOLO en el build de");
console.error("  producción (en desarrollo el devCsp es permisivo y no se nota).\n");
process.exit(1);
