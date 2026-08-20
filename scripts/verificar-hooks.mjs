/**
 * verificar-hooks.mjs — ningún hook después de una puerta que devuelve pronto.
 *
 * POR QUÉ EXISTE. `App.tsx` tenía cuatro `useState` arriba, la puerta de
 * autenticación en medio (cuatro `return` tempranos: cargando, sin sesión, sin
 * rol, suscripción vencida) y un quinto `useState` DEBAJO. Mientras la sesión
 * cargaba, ese hook no se ejecutaba; al resolverse, sí. React cuenta los hooks
 * de cada render y aborta la app entera cuando el número cambia:
 *
 *   Rendered more hooks than during the previous render.   (error #310)
 *
 * La pantalla se quedaba en blanco justo al terminar de cargar la sesión. Lo
 * verificó una reproducción con la misma forma antes de escribir esto.
 *
 * `tsc` no lo ve —es válido a nivel de tipos— y el proyecto no usa ESLint, así
 * que `react-hooks/rules-of-hooks`, que sí lo cazaría, no estaba. Esto cubre
 * exactamente ese caso, que es el que se nos escapó: un hook en el cuerpo
 * PRINCIPAL de la función, después de una sentencia que puede devolver.
 *
 * NO pretende ser rules-of-hooks entero (hooks dentro de bucles, de callbacks,
 * de condicionales sueltas…). Cubre una forma concreta y frecuente, y falla
 * con código de salida 1 para que sirva en la lista de antes de publicar.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RAIZ = path.join(import.meta.dirname, "..", "src");

/** ¿Este identificador nombra un hook? La regla de React: `use` seguido de
 *  mayúscula (`useState`, `useBarraEstado`), no `used` ni `user`. */
const esNombreDeHook = (n) => /^use[A-Z]/.test(n);

/** ¿Esta función puede contener hooks? Componentes (Mayúscula) y hooks
 *  personalizados (useAlgo). Una función auxiliar en minúscula no. */
const admiteHooks = (n) => !!n && (/^[A-Z]/.test(n) || esNombreDeHook(n));

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const esFuncion = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
  || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

/** ¿Hay algún `return` dentro de este nodo, sin entrar en funciones anidadas?
 *  Un `return` de un callback no sale del componente.
 *
 *  La sentencia PROPIA también cuenta: los componentes de este proyecto
 *  declaran sus manejadores como `async function confirmDelete() { … return; }`
 *  en medio del cuerpo, y sin esta comprobación cada uno de ellos se leía como
 *  una puerta de salida. Con 63 avisos falsos el verificador no sirve para
 *  nada — se aprende a ignorarlo. */
function contieneReturn(nodo) {
  if (esFuncion(nodo)) return false;
  let hay = false;
  const ver = (n) => {
    if (hay || esFuncion(n)) return;
    if (ts.isReturnStatement(n)) { hay = true; return; }
    ts.forEachChild(n, ver);
  };
  ts.forEachChild(nodo, ver);
  return hay;
}

/** Los hooks llamados dentro de este nodo, sin entrar en funciones anidadas.
 *  El `useState` de un componente definido dentro de otro es suyo, no del
 *  padre. */
function hooksEn(nodo, sf) {
  const encontrados = [];
  const ver = (n) => {
    if (esFuncion(n)) return;
    if (ts.isCallExpression(n)) {
      const f = n.expression;
      const nombre = ts.isIdentifier(f) ? f.text
        : ts.isPropertyAccessExpression(f) && ts.isIdentifier(f.name) ? f.name.text : null;
      if (nombre && esNombreDeHook(nombre)) {
        encontrados.push({ nombre, linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(n, ver);
  };
  ts.forEachChild(nodo, ver);
  return encontrados;
}

const fallos = [];
let revisadas = 0;

for (const archivo of archivos(RAIZ)) {
  const texto = fs.readFileSync(archivo, "utf8");
  const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const revisar = (cuerpo, nombre) => {
    if (!cuerpo || !ts.isBlock(cuerpo) || !admiteHooks(nombre)) return;
    revisadas++;
    /* Se recorren las sentencias del cuerpo PRINCIPAL en orden. En cuanto una
       puede devolver, todo hook posterior es condicional. */
    let puerta = null;
    for (const sent of cuerpo.statements) {
      if (puerta) {
        for (const h of hooksEn(sent, sf)) {
          fallos.push({ archivo, nombre, hook: h.nombre, linea: h.linea, puerta });
        }
        continue;
      }
      if (ts.isReturnStatement(sent) || contieneReturn(sent)) {
        puerta = sf.getLineAndCharacterOfPosition(sent.getStart(sf)).line + 1;
      }
    }
  };

  const ver = (n) => {
    if (ts.isFunctionDeclaration(n)) revisar(n.body, n.name?.text);
    else if (ts.isVariableDeclaration(n) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
      && ts.isIdentifier(n.name)) {
      const cuerpo = n.initializer.body;
      if (ts.isBlock(cuerpo)) revisar(cuerpo, n.name.text);
    }
    ts.forEachChild(n, ver);
  };
  ts.forEachChild(sf, ver);
}

const rel = (p) => path.relative(path.join(import.meta.dirname, ".."), p);

if (fallos.length) {
  console.error(`\n✘ ${fallos.length} hook(s) después de un return temprano:\n`);
  for (const f of fallos) {
    console.error(`  ${rel(f.archivo)}:${f.linea}  ${f.hook}() en ${f.nombre}()`);
    console.error(`      la función ya puede devolver desde la línea ${f.puerta}, así que este hook`);
    console.error(`      no se ejecuta en todos los renders → React #310 y pantalla en blanco.`);
    console.error(`      Súbelo con los demás hooks, antes de esa línea.\n`);
  }
  process.exitCode = 1;
} else {
  console.log(`✔ ${revisadas} componentes/hooks revisados: ningún hook después de un return temprano.`);
}
