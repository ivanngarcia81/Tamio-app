#!/usr/bin/env node
/**
 * verificar-tipografia.mjs — que TODO el texto de la app siga la escala.
 *
 * "Tamaño de texto" (Config → Preferencias) multiplica la tipografía con
 * `--fs-escala`. Para que eso signifique algo, **ni un solo tamaño puede
 * quedarse fuera**: si la mitad escala y la otra mitad no, el control es peor
 * que no tenerlo. Ya pasó una vez, y es el motivo de que esto exista.
 *
 * El 24 de agosto de 2026, al encenderlo, la cuenta era: 248 `font-size`
 * colgando de los tokens `--fs-*` y **395 con píxeles a pelo**, más 136
 * `fontSize` en línea en el JSX. Los píxeles a pelo estaban justo en
 * `.md-fila-monto`, `.ios-stat-num` y `.tx-amount` — o sea, **las cifras de
 * dinero**. Encenderlo sin arreglar eso habría agrandado las etiquetas y
 * dejado los importes chicos, que es lo contrario de lo que busca quien sube
 * el tamaño porque no ve bien las cifras.
 *
 * **Por qué una guarda y no la regla escrita.** Porque el fallo no se ve. Una
 * regla nueva con `font-size: 38px` se fusiona sin conflicto, compila sin
 * avisos y se ve perfecta en "Normal" — solo se rompe en el aparato de quien
 * eligió la letra grande, que es justo quien menos va a saber explicarlo. Hay
 * una rama de diseño (`charming-sagan`) escrita ANTES de que `--fs-escala`
 * existiera y que entrará por fusión: esto es lo que la va a cazar.
 *
 * Lo que NO se revisa, a propósito:
 *   · `src/services/print/` — las plantillas de impresión arman su propio
 *     documento. Un estado financiero en papel no cambia de tamaño porque
 *     alguien ajuste su iPad, y tiene que caber donde siempre.
 *   · `em`, `%`, `inherit` — son relativos: ya heredan la escala de su padre.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fallos = [];

/** Archivos .tsx bajo src/, sin las plantillas de impresión. */
function tsx(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (p.includes(join("services", "print"))) continue;
      tsx(p, out);
    } else if (n.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// ---------- 1. La hoja de estilos ----------
const css = readFileSync(join(raiz, "src/styles.css"), "utf8");
css.split("\n").forEach((linea, i) => {
  // `font-size: 13px` suelto. El que va dentro de calc(... * var(--fs-escala))
  // no cuenta, porque ahí el px es el operando y no el valor final.
  const m = linea.match(/font-size:\s*[0-9.]+px/);
  if (m && !/var\(--fs-escala\)/.test(linea)) {
    fallos.push(`src/styles.css:${i + 1}  ${linea.trim()}`);
  }
  // Y las definiciones de los tokens, que es de donde beben las otras 248.
  const t = linea.match(/--fs-[a-z0-9-]+:\s*[0-9.]+px/);
  if (t && !/var\(--fs-escala\)/.test(linea) && !/--fs-escala:/.test(linea)) {
    fallos.push(`src/styles.css:${i + 1}  ${linea.trim()}`);
  }
});

// ---------- 2. Los tamaños en línea del JSX ----------
for (const f of tsx(join(raiz, "src"))) {
  readFileSync(f, "utf8").split("\n").forEach((linea, i) => {
    // `fontSize: 12.5` o `fontSize: "13px"`. Con calc(--fs-escala) o con un
    // token `var(--fs-*)` está bien: los tokens ya escalan.
    const m = linea.match(/fontSize:\s*(?:"[^"]*"|[0-9.]+)/g);
    if (!m) return;
    for (const uso of m) {
      if (/var\(--fs-/.test(uso)) continue;           // token: escala solo
      if (/var\(--fs-escala\)/.test(uso)) continue;   // calc explícito
      if (/fontSize:\s*[0-9.]+/.test(uso) || /px/.test(uso)) {
        fallos.push(`${relative(raiz, f)}:${i + 1}  ${uso}`);
      }
    }
  });
}

// ---------- Veredicto ----------
const escalados = (css.match(/var\(--fs-escala\)/g) ?? []).length;
console.log(`\nTamaños atados a la escala en styles.css: ${escalados}`);

if (fallos.length) {
  console.log(`\n✗ ${fallos.length} tamaño(s) se quedan FUERA de "Tamaño de texto":\n`);
  for (const f of fallos.slice(0, 40)) console.log(`   ${f}`);
  if (fallos.length > 40) console.log(`   … y ${fallos.length - 40} más`);
  console.log(`
   Arréglalo envolviendo el valor:
     CSS   font-size: 13px            →  font-size: calc(13px * var(--fs-escala))
     JSX   fontSize: 13               →  fontSize: "calc(13px * var(--fs-escala))"
   O mejor, usa un token: font-size: var(--fs-body).

   Si de verdad NO debe escalar —un documento impreso, algo que no es
   texto— sácalo de src/ o justifícalo aquí, pero no lo dejes suelto: en
   "Grande" ese texto se quedaría quieto mientras el resto crece.
`);
  process.exit(1);
}

console.log("\n✔ ni un tamaño de texto se queda fuera de la escala.\n");
