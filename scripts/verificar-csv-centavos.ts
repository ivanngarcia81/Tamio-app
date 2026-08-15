// Viaje redondo del CSV: exportar → importar tiene que devolver los MISMOS
// centavos. Es la prueba nº 2 del paso 5 de docs/plan-centavos.md, y la única
// de las cinco que no necesita la Mac.
//
// Por qué importa: el CSV es la única salida donde el dinero sigue en
// DECIMALES a propósito (lo abre Excel y lo lee gente). O sea que hay dos
// conversiones encadenadas, centavos → texto → centavos, y si alguna se
// desvía el importe cambia sin que nadie vea un error.
//
// Se comprueba también el CSV de una versión ANTERIOR a los centavos: los
// archivos que el tesorero ya tenga guardados tienen que seguir importándose
// con el mismo importe.

import { aTextoCsv, deTexto, type Centavos } from "../src/dinero.ts";

let fallos = 0;
const chk = (a: unknown, b: unknown, q: string) => {
  if (Object.is(a, b)) console.log(`  ✓ ${q}`);
  else { fallos++; console.error(`  ✗ ${q}: esperado ${String(b)}, obtenido ${String(a)}`); }
};

/** La regla del importador: cero o negativo se rechaza (importCsv.ts). */
function importar(celda: string): Centavos | null {
  const c = deTexto(celda);
  return c !== null && c > 0 ? c : null;
}

console.log("\nExportar → importar, importe por importe");
const importes = [1, 115, 268, 12550, 99999999, 7, 1010, 2020, 3333, 5, 99, 100, 101];
for (const c of importes) {
  const celda = aTextoCsv(c as Centavos);
  chk(importar(celda), c, `${c} → "${celda}" → ${c}`);
}

console.log("\nUn CSV de una versión ANTERIOR (decimales tecleados por gente)");
// Formatos que aparecen en archivos reales: con y sin ceros, con símbolo y
// con separador de millares.
const viejos: [string, number][] = [
  ["125.50", 12550],
  ["125.5", 12550],
  ["125", 12500],
  ["0.01", 1],
  ["1.15", 115],
  ["999999.99", 99999999],
  ["$1,234.56", 123456],
  [" 42.00 ", 4200],
];
for (const [celda, esperado] of viejos) {
  chk(importar(celda), esperado, `"${celda}" → ${esperado}`);
}

console.log("\nFilas que el importador debe rechazar");
for (const celda of ["", "0", "0.00", "-5.00", "abc", "12.34.56"]) {
  chk(importar(celda), null, `"${celda}" → rechazada`);
}

console.log("\nUn libro entero: la suma no puede moverse");
// 500 importes pseudoaleatorios pero deterministas.
let semilla = 42;
const aleatorio = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const libro: Centavos[] = [];
for (let i = 0; i < 500; i++) libro.push(Math.floor(aleatorio() * 5_000_00 + 1) as Centavos);

const totalAntes = libro.reduce((a, b) => a + b, 0);
const csv = libro.map((c) => aTextoCsv(c));
const devuelto = csv.map(importar);
chk(devuelto.some((c) => c === null), false, "ninguna fila se rechazó al volver");
chk((devuelto as Centavos[]).reduce((a, b) => a + b, 0), totalAntes,
    `la suma de 500 movimientos se conserva (${totalAntes} centavos)`);

console.log(fallos === 0
  ? `\n✔ el CSV va y vuelve sin perder un centavo.\n`
  : `\n✗ ${fallos} fallo(s) en el viaje redondo del CSV.\n`);
process.exit(fallos ? 1 : 0);
