// Comprueba que el bundle recién construido corresponde al canal que se pidió.
//
// Corre solo, al final de `npm run build`.
//
// Por qué mirar el bundle y no la variable: la variable dice lo que se quería
// construir; el bundle dice lo que se construyó. Entre las dos cosas hay una
// terminal, un script de firma y una persona que puede haber abierto otra
// pestaña. El único hecho que le importa al revisor de Apple es qué hay dentro
// del archivo que recibe, así que es lo que se mira aquí.
//
// Las dos reglas que se vigilan:
//
//   3.1.1  — una app de la App Store no puede mandar al usuario a pagar fuera.
//            Se busca el enlace del checkout.
//   2.5.2  — ni ofrecerle descargar software que no venga de la tienda.
//            Se busca la dirección del manifiesto de versiones.
//
// Y la comprobación al revés, que importa igual: en un build de descarga
// directa el manifiesto TIENE que estar. Si se cuela un `VITE_CANAL` de más,
// los usuarios de .dmg dejarían de enterarse de las versiones nuevas y nadie
// lo notaría — un fallo silencioso, que son los caros.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const CANALES = ["descarga", "appstore"];

// Sin `.trim()`, igual que src/canal.ts: si los dos no leen exactamente lo
// mismo, este verificador puede aprobar un bundle que el código construyó de
// otra manera, que es justo lo que no puede pasar.
const pedido = process.env.VITE_CANAL || "descarga";
if (!CANALES.includes(pedido)) {
  console.error(
    `\n✗ VITE_CANAL="${pedido}" no es un canal válido.\n` +
      `  Valores admitidos: ${CANALES.join(", ")} (o sin poner, que es "descarga").\n` +
      `  Un valor mal escrito caía en "descarga" sin avisar, y ese build llegaba a\n` +
      `  revisión de Apple con el aviso de versión nueva encendido.\n`
  );
  process.exit(1);
}

if (!existsSync(DIST)) {
  console.error(`\n✗ no hay carpeta ${DIST}/ que revisar. ¿Falló la construcción?\n`);
  process.exit(1);
}

/** Todo el JavaScript y HTML generados, concatenado. */
function bundle(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) bundle(p, acc);
    else if (/\.(js|html|css)$/.test(n)) acc.push(readFileSync(p, "utf8"));
  }
  return acc.join("\n");
}

const codigo = bundle(DIST);

// La dirección del manifiesto se saca de src/canal.ts en vez de repetirla: si
// alguien la cambia allí, esta comprobación sigue mirando la de verdad.
const canalTs = readFileSync("src/canal.ts", "utf8");
const manifiesto = /"(https:\/\/[^"]*version\.json)"/.exec(canalTs)?.[1];
if (!manifiesto) {
  console.error("\n✗ no encuentro la dirección del manifiesto en src/canal.ts\n");
  process.exit(1);
}

let fallos = 0;
const chk = (ok, q) => {
  if (ok) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}`); }
};

const traeManifiesto = codigo.includes(manifiesto);
// Cualquier enlace de pago, venga del .env o escrito a mano.
const enlacesPago = [/lemonsqueezy\.com/i, /paddle\.com/i, /checkout\/buy/i]
  .filter((re) => re.test(codigo));

console.log(`\nCanal: ${pedido}`);

if (pedido === "appstore") {
  chk(!traeManifiesto, "el bundle NO lleva el manifiesto de versiones (2.5.2)");
  chk(enlacesPago.length === 0, "el bundle NO lleva ningún enlace de pago (3.1.1)");
  if (enlacesPago.length) console.error(`    encontrado: ${enlacesPago.join(", ")}`);
} else {
  chk(traeManifiesto, "el bundle lleva el manifiesto: los .dmg sí se enteran de las versiones nuevas");
  if (enlacesPago.length === 0) {
    console.log(
      "  · SIN enlace de compra: VITE_URL_COMPRA no está en el .env, así que\n" +
      "    este build no enseña \"Comprar\" ni \"Renovar\". La tienda está encendida\n" +
      "    desde el 18 ago 2026 — si es un .dmg para vender, falta el .env."
    );
  } else {
    console.log("  · con enlace de compra, correcto en este canal");
  }
}

if (fallos) {
  console.error(
    `\n✗ el bundle no corresponde al canal "${pedido}".\n` +
      `  NO subas este build. Revisa VITE_CANAL y vuelve a construir.\n`
  );
  process.exit(1);
}
console.log(`✔ el bundle corresponde al canal "${pedido}".\n`);
