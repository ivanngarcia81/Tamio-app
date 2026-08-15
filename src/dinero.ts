/**
 * Dinero en centavos enteros.
 *
 * Todo importe dentro de Tamio es un ENTERO de centavos: $125.50 es `12550`.
 * Los enteros no derivan; la coma flotante sí (`0.1 + 0.2` da
 * `0.30000000000000004`), y en cientos de movimientos sumados con `SUM()` esa
 * deriva se convierte en un estado financiero cuyo total no cuadra con la suma
 * de sus líneas. Ver `docs/plan-centavos.md`.
 *
 * La división entre 100 ocurre en UN solo sitio —`aDecimal()`— y solo para
 * mostrar o imprimir. Si aparece un `/ 100` en cualquier otro archivo, es un
 * error.
 */

/**
 * Un importe en centavos.
 *
 * Es un `number` marcado: en tiempo de ejecución no es nada, pero TypeScript
 * no deja pasar un decimal suelto donde se espera `Centavos`. Ese es el
 * mecanismo que convierte al compilador en la lista de tareas de la migración:
 * al cambiar las funciones de formato para que reciban `Centavos`, cada sitio
 * que todavía pase un decimal se señala solo.
 */
export type Centavos = number & { readonly __centavos: unique symbol };

/** Cero, con el tipo puesto. */
export const CERO = 0 as Centavos;

/**
 * Texto tecleado por el usuario → centavos. `null` si no es un importe.
 *
 * Se parsea por TEXTO, sin multiplicar por 100 en coma flotante: partir la
 * cadena por el punto y componer el entero es exacto por construcción, y
 * `Math.round(n * 100)` no lo es en los bordes.
 *
 * Acepta lo mismo que aceptaba `parseMonto` antes de esta migración —símbolo
 * de moneda, comas de millares y espacios— para no cambiar lo que el tesorero
 * ya tiene aprendido. **Ojo:** la coma se trata como separador de MILLARES,
 * así que "125,50" son ciento veinticinco mil cincuenta, no $125.50. Es el
 * comportamiento de siempre y este trabajo no lo toca (`docs/plan-centavos.md`
 * §6), pero está anotado en `docs/ideas-futuras.md` por si algún día conviene.
 */
export function deTexto(s: string): Centavos | null {
  const limpio = s.replace(/[$,\s]/g, "");
  if (!limpio) return null;
  if (!/^-?\d*\.?\d*$/.test(limpio)) return null;

  const negativo = limpio.startsWith("-");
  const cuerpo = negativo ? limpio.slice(1) : limpio;
  const [entera = "", decimal = ""] = cuerpo.split(".");
  if (entera === "" && decimal === "") return null;

  // Los dos primeros decimales son los centavos; el tercero solo decide el
  // redondeo. "1.005" → 101, "1.004" → 100.
  const centavos = Number((decimal + "00").slice(0, 2));
  const tercerDecimal = decimal.length > 2 ? Number(decimal[2]) : 0;

  let total = Number(entera || "0") * 100 + centavos;
  if (tercerDecimal >= 5) total += 1;
  if (!Number.isSafeInteger(total)) return null;

  return (negativo ? -total : total) as Centavos;
}

/**
 * Centavos → número decimal. **Solo para formatear.**
 *
 * El resultado es coma flotante otra vez, así que no se guarda, no se suma y
 * no se compara: se pasa a `toLocaleString`/`toFixed` y se olvida.
 */
export function aDecimal(c: Centavos): number {
  return c / 100;
}

/** Centavos → el texto que se pone en un `<input>` al editar ("125.50"). */
export function aTextoEditable(c: Centavos): string {
  return (c / 100).toFixed(2);
}

/** Suma de importes. Existe para que el resultado conserve el tipo. */
export function sumar(...importes: Centavos[]): Centavos {
  let total = 0;
  for (const c of importes) total += c;
  return total as Centavos;
}

/** El mismo importe con el signo cambiado. El estado financiero lista los
 *  egresos en negativo bajo el saldo anterior, y `-c` perdería el tipo. */
export function negar(c: Centavos): Centavos {
  return -c as Centavos;
}

/** El mayor de dos importes, conservando el tipo. Se usa para no enseñar
 *  disponibles negativos. */
export function maximo(a: Centavos, b: Centavos): Centavos {
  return (a > b ? a : b) as Centavos;
}

/** Resta, con el tipo puesto. */
export function restar(a: Centavos, b: Centavos): Centavos {
  return (a - b) as Centavos;
}

/**
 * Un importe repetido N veces: la renta mensual por los meses que quedan, por
 * ejemplo. `veces` es una cuenta, no dinero.
 *
 * Lleva `Math.round` porque `veces` podría no ser entero en el futuro y medio
 * centavo no existe; con enteros el redondeo no cambia nada.
 */
export function multiplicar(c: Centavos, veces: number): Centavos {
  return Math.round(c * veces) as Centavos;
}

/**
 * Qué porcentaje de `total` representa `parte`. Devuelve un número corriente
 * (no es dinero), y 0 cuando el total es 0 en vez de `NaN`.
 */
export function porcentaje(parte: Centavos, total: Centavos): number {
  if (total === 0) return 0;
  return (parte / total) * 100;
}

/**
 * Lo que llega de la base de datos ya es un entero de centavos: esto solo le
 * pone el tipo. Es un punto de confianza a propósito y por eso está aislado:
 * si la columna no fuera entera, el error se vería aquí y en ningún otro sitio.
 */
export function deBD(n: number): Centavos {
  return Math.round(n) as Centavos;
}

/**
 * Decimal heredado → centavos. **Solo para datos que vienen del formato viejo**:
 * un CSV exportado por una versión anterior, o la propia migración leyendo la
 * columna antigua.
 *
 * Usa `Math.round` porque aquí el dato YA es coma flotante y no hay texto que
 * partir: `1.15 * 100` da `114.99999999999999`, así que truncar perdería un
 * centavo por fila. Es el mismo motivo por el que la migración de SQLite lleva
 * `ROUND()` antes del `CAST`.
 */
export function deDecimalHeredado(n: number): Centavos {
  return Math.round(n * 100) as Centavos;
}

/**
 * Centavos → decimal para escribir en un CSV ("125.50").
 *
 * El CSV lo abre Excel y lo lee gente: sigue llevando decimales, no centavos.
 * Es la única salida de la app donde el formato viejo se conserve a propósito.
 */
export function aTextoCsv(c: Centavos): string {
  return (c / 100).toFixed(2);
}
