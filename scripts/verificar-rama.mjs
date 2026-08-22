// Dice EN VOZ ALTA qué versión está a punto de compilarse, y desde qué rama.
//
// Corre al principio de `npm run ios:appstore` y de `npm run dist:appstore`,
// antes de que Tauri toque nada.
//
// Por qué existe. El 22 de agosto de 2026 esto falló DOS VECES seguidas, y
// las dos con el mismo síntoma: se subía la versión en el repo, se compilaba
// en la Mac, y salía la versión vieja. Ninguna de las dos era un fallo del
// bump.
//
//   1ª — había dos ramas haciendo el mismo trabajo a la vez, cada una con su
//        propia 1.1.9. El bump a 1.2.0 estaba en una y la Mac compilaba desde
//        la otra. Un `git pull` no trae lo que vive en otra rama.
//   2ª — ya fusionado todo, la Mac compiló desde `main`. Y `main` es la 1.1.9
//        a propósito: la 1.2.0 espera en su rama hasta que se pruebe. El
//        build hizo exactamente lo que se le pidió.
//
// La lección no es "acuérdate de mirar la rama". Eso ya estaba escrito en
// docs/testflight.md y aun así pasó otra vez, porque el número de versión no
// aparece por ninguna parte hasta el FINAL del log de Xcode —después de
// compilar Rust, enlazar, firmar y exportar—, cuando ya no lo lee nadie.
// Aquí se dice antes, cuando todavía sirve de algo.
//
// Qué aborta y qué solo avisa. Abortar de más, en la orden con la que se
// publica, es peor que no estar: aborta solo cuando el build saldría con
// código que NO es el que hay en el repositorio (árbol sucio, o rama por
// detrás de su remoto). Que estés en `main` compilando la 1.1.9 es
// perfectamente legítimo y aquí solo se canta, no se frena.
//
// Escotilla: SALTAR_VERIFICAR_RAMA=1 npm run ios:appstore

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (process.env.SALTAR_VERIFICAR_RAMA === "1") {
  console.log("verificar-rama: saltado a propósito (SALTAR_VERIFICAR_RAMA=1).\n");
  process.exit(0);
}

/** git que no revienta el build si algo no está: devuelve null y sigue. */
function git(orden) {
  try {
    return execSync(`git ${orden}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

const rama = git("rev-parse --abbrev-ref HEAD");
if (rama === null) {
  // Sin git no hay nada que comprobar, y no es motivo para no compilar.
  console.log("verificar-rama: esto no parece un repositorio git; sigo.\n");
  process.exit(0);
}

const version = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;

const raya = "─".repeat(64);
console.log(`\n${raya}`);
console.log(`  Vas a compilar la versión  ${version}`);
console.log(`  desde la rama              ${rama === "HEAD" ? "(HEAD suelto)" : rama}`);
console.log(raya);

const fallos = [];

/* 1. El árbol sucio. Lo que se compila sale del disco, no del último commit:
      un cambio sin guardar entra en el .ipa y después no hay forma de saber
      qué se subió. Y al revés — el `Cargo.lock` a medio tocar es justo lo que
      docs/testflight.md manda evitar antes de archivar. */
const sucio = git("status --porcelain");
if (sucio) {
  const n = sucio.split("\n").length;
  fallos.push(
    `el árbol tiene ${n} archivo(s) sin confirmar. Lo que entre en el .ipa no\n` +
    `    estará en ningún commit, así que no habrá forma de reconstruirlo:\n` +
    sucio.split("\n").slice(0, 8).map((l) => `      ${l}`).join("\n") +
    (n > 8 ? `\n      … y ${n - 8} más` : "")
  );
}

/* 2. La rama, por detrás de su remoto. Es el caso de la primera vez: el bump
      estaba empujado y la copia local no lo tenía. Se consulta el remoto, con
      Se consulta el remoto en plan "si se puede": `git()` se traga el fallo,
      así que sin red esto no frena un build, solo deja de comprobarlo. */
git("fetch --quiet origin");
const arriba = git(`rev-parse --abbrev-ref ${rama}@{upstream}`);
if (arriba) {
  const detras = git(`rev-list --count HEAD..${arriba}`);
  if (detras && Number(detras) > 0) {
    fallos.push(
      // La orden se arma con el UPSTREAM real, no con el nombre de la rama
      // local: se puede seguir a `origin/main` desde una rama que se llame
      // otra cosa, y `git pull origin <nombre-local>` fallaría ahí.
      `esta rama va ${detras} commit(s) por detrás de ${arriba}.\n` +
      `    Compilarías código viejo. Trae lo que falta:\n` +
      `      git pull ${arriba.replace("/", " ")}`
    );
  }
}

/* 3. ¿Hay otra rama con una versión MAYOR? Esto NO aborta: compilar `main`
      para probar lo que ya está en TestFlight es legítimo. Pero si el número
      que sale arriba no es el que tenías en la cabeza, aquí se ve por qué. */
const otras = [];
// Las comillas del formato NO son de adorno: `git()` pasa por un shell y
// `%(refname:short)` sin comillas es un error de sintaxis por los paréntesis
// —que este helper se traga en silencio, dejando la lista vacía y el aviso
// mudo justo el día que hace falta—.
for (const ref of (git(`for-each-ref --format='%(refname:short)' refs/remotes/origin`) || "").split("\n")) {
  if (!ref || ref.endsWith("/HEAD")) continue;
  const conf = git(`show ${ref}:src-tauri/tauri.conf.json`);
  if (!conf) continue;
  try {
    const v = JSON.parse(conf).version;
    if (v !== version) otras.push({ ref: ref.replace(/^origin\//, ""), v });
  } catch { /* una rama sin config legible no es asunto de este script */ }
}
const mayores = otras.filter((o) => cmp(o.v, version) > 0);

/** Compara "1.2.0" con "1.1.9" por números, no por texto: "1.1.10" > "1.1.9". */
function cmp(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

if (mayores.length) {
  console.log(`\n  ⚠️  Hay ${mayores.length === 1 ? "otra rama" : "otras ramas"} con una versión más alta que la tuya:`);
  for (const o of mayores) console.log(`        ${o.v.padEnd(10)} ${o.ref}`);
  console.log(
    `\n      Si lo que querías era compilar una de esas, cámbiate antes:\n` +
    `        git checkout ${mayores[0].ref} && git pull origin ${mayores[0].ref}\n` +
    `      Si no, sigue: compilar una versión ya probada es normal.`
  );
}

if (fallos.length) {
  console.error(`\n✗ no compilo todavía:\n`);
  for (const f of fallos) console.error(`  · ${f}\n`);
  console.error(
    `  Arregla eso y repite. Si sabes lo que haces:\n` +
    `    SALTAR_VERIFICAR_RAMA=1 npm run ios:appstore\n`
  );
  process.exit(1);
}

console.log(`\n✔ rama y versión comprobadas; sigo.\n`);
