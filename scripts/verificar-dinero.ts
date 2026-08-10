// Verificación de src/dinero.ts — el módulo donde vive TODO el redondeo.
//
// Se ejecuta con `npm run verificar-dinero`. No hay framework de pruebas en el
// proyecto: sigue el patrón de verificar-csp / verificar-traducciones.
//
// Los casos no son de adorno. `1.15` y `deDecimalHeredado` son exactamente el
// fallo que describe docs/plan-centavos.md §4 paso 3: en coma flotante
// `1.15 * 100` da 114.99999999999999, así que truncar pierde un centavo por
// fila. Si alguien "simplifica" dinero.ts y quita un redondeo, esto lo caza.

import {
  aDecimal, aTextoCsv, aTextoEditable, deBD, deDecimalHeredado, deTexto,
  porcentaje, restar, sumar, type Centavos,
} from "../src/dinero.ts";

let fallos = 0;
let pasadas = 0;

function igual(actual: unknown, esperado: unknown, que: string): void {
  if (Object.is(actual, esperado)) {
    pasadas++;
  } else {
    fallos++;
    console.error(`  ✗ ${que}\n      esperado: ${String(esperado)}\n      obtenido: ${String(actual)}`);
  }
}

console.log("\ndeTexto — lo que teclea el tesorero");
igual(deTexto("125.50"), 12550, '"125.50" → 12550');
igual(deTexto("125.5"), 12550, '"125.5" → 12550 (un solo decimal)');
igual(deTexto("125"), 12500, '"125" → 12500 (sin decimales)');
igual(deTexto("0.01"), 1, '"0.01" → 1 (el importe más pequeño)');
igual(deTexto("999999.99"), 99999999, '"999999.99" → 99999999 (importe grande)');
igual(deTexto("$1,234.56"), 123456, '"$1,234.56" → 123456 (símbolo y millares)');
igual(deTexto(" 42.00 "), 4200, '" 42.00 " → 4200 (espacios)');
igual(deTexto("-15.75"), -1575, '"-15.75" → -1575 (negativo)');
igual(deTexto(".5"), 50, '".5" → 50 (sin parte entera)');

console.log("\ndeTexto — el caso del que va todo este trabajo");
// Si esto se hiciera con Math.round(Number("1.15") * 100) daría 115 por los
// pelos; con truncado daría 114. Se parsea por texto: es exacto por diseño.
igual(deTexto("1.15"), 115, '"1.15" → 115 (NO 114)');
igual(deTexto("2.675"), 268, '"2.675" → 268 (tercer decimal redondea arriba)');
igual(deTexto("1.004"), 100, '"1.004" → 100 (tercer decimal redondea abajo)');
igual(deTexto("1.005"), 101, '"1.005" → 101');

console.log("\ndeTexto — lo que NO es un importe");
igual(deTexto(""), null, '"" → null');
igual(deTexto("   "), null, '"   " → null (solo espacios)');
igual(deTexto("abc"), null, '"abc" → null');
igual(deTexto("12.34.56"), null, '"12.34.56" → null (dos puntos)');
igual(deTexto("1e5"), null, '"1e5" → null (notación científica)');

console.log("\ndeDecimalHeredado — CSV viejo y migración");
igual(deDecimalHeredado(1.15), 115, "1.15 → 115 (el CAST sin ROUND daría 114)");
igual(deDecimalHeredado(0.07), 7, "0.07 → 7");
igual(deDecimalHeredado(125.5), 12550, "125.5 → 12550");
igual(deDecimalHeredado(0), 0, "0 → 0");

console.log("\nsumar / restar — que no derive");
// El caso de manual: 0.1 + 0.2 en decimales da 0.30000000000000004.
const diez = deTexto("0.10") as Centavos;
const veinte = deTexto("0.20") as Centavos;
igual(sumar(diez, veinte), 30, "0.10 + 0.20 → 30 centavos exactos");
igual(aDecimal(sumar(diez, veinte)), 0.3, "…y al mostrarlo, 0.3 exacto");
igual(restar(deBD(10000), deBD(2550)), 7450, "100.00 − 25.50 → 7450");

// Mil sumas de un centavo tienen que dar exactamente diez dólares.
let acumulado = 0 as Centavos;
for (let i = 0; i < 1000; i++) acumulado = sumar(acumulado, 1 as Centavos);
igual(acumulado, 1000, "1000 × $0.01 → 1000 centavos exactos");

console.log("\nSalidas — pantalla, formulario y CSV");
igual(aDecimal(12550 as Centavos), 125.5, "12550 → 125.5 para formatear");
igual(aTextoEditable(12550 as Centavos), "125.50", "12550 → '125.50' en el input");
igual(aTextoEditable(1 as Centavos), "0.01", "1 → '0.01'");
igual(aTextoCsv(99999999 as Centavos), "999999.99", "99999999 → '999999.99' en CSV");
igual(aTextoCsv(0 as Centavos), "0.00", "0 → '0.00' en CSV");

console.log("\nIda y vuelta");
for (const s of ["0.01", "1.15", "125.50", "999999.99", "0.00"]) {
  const c = deTexto(s);
  igual(c === null ? null : aTextoEditable(c), s.replace(/^(\d+)$/, "$1.00"), `"${s}" → centavos → "${s}"`);
}

console.log("\nporcentaje");
igual(porcentaje(2500 as Centavos, 10000 as Centavos), 25, "2500 de 10000 → 25 %");
igual(porcentaje(0 as Centavos, 0 as Centavos), 0, "0 de 0 → 0 (no NaN)");

console.log(
  fallos === 0
    ? `\n✔ ${pasadas} comprobaciones, todas correctas.\n`
    : `\n✗ ${fallos} fallo(s) de ${pasadas + fallos} comprobaciones.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
