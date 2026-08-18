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

/* ============================================================================
   Lo que TECLEA una persona, que no es lo mismo que un CSV
   ============================================================================

   `deTexto` de arriba es el parser CANÓNICO y se queda como está: punto
   decimal, coma de millares. Es el formato de los CSV —el que escribe
   `aTextoCsv` y vuelve a leer `importCsv.ts`—, así que hacerlo regional
   rompería el viaje redondo de exportar e importar, y todos los archivos que
   las iglesias ya tienen guardados.

   Lo de aquí abajo es el otro caso: el campo de importe de una pantalla. Ahí
   el separador NO es una convención de Tamio, es la del teclado que la
   persona tiene delante.

   ## El fallo que arregla

   Con `deTexto`, teclear "1,50" daba **$150.00**: la coma se borraba como
   separador de millares. Cien veces el importe, sin ningún aviso, y no era
   cosa del teléfono — el campo es texto libre también en Mac, así que
   cualquiera que escriba a la europea o a la latinoamericana llevaba
   guardando cifras infladas.

   ## Por qué el idioma del DISPOSITIVO y no el de la moneda

   La instrucción original era deducir el separador del `locale` de la moneda
   (`currencies.ts`). No se hizo, y el motivo es físico: en iOS el teclado
   decimal enseña el separador de la REGIÓN DEL APARATO. Una iglesia con
   cuentas en euros y un iPhone configurado en Estados Unidos tendría el punto
   en el teclado y ninguna tecla de coma — si exigiéramos la coma porque el
   euro es europeo, esa persona **no podría escribir centavos en absoluto**.

   Y hay un segundo motivo: `fmtMoney` ya formatea con el idioma del aparato,
   con esa misma razón escrita al lado. Atar la entrada a la moneda y la
   salida al dispositivo dejaría a la app pidiendo una cosa y enseñando otra
   en la misma pantalla.

   De la MONEDA sí sale una cosa: cuántos decimales admite. Eso no es una
   convención de quien lee, es una propiedad del dinero. */

/** Configuración regional con la que se leen y escriben los números.
 *
 *  Se toma del DISPOSITIVO, no del idioma de la app, porque cómo se separan
 *  los miles y los decimales es una convención del país y no del idioma: en
 *  México, Puerto Rico y Estados Unidos se escribe `1,250.50`, y en España y
 *  Argentina `1.250,50` — y los tres hablan español.
 *
 *  Vivía en `db.ts` sirviendo solo a `fmtMoney`; se mudó aquí cuando la
 *  ENTRADA de importes necesitó la misma respuesta, para que no hubiera dos
 *  respuestas distintas a la misma pregunta. */
let localeNumeros: string | null = null;
export function localeDeNumeros(): string {
  if (localeNumeros === null) {
    let l = "";
    try { l = navigator.language ?? ""; } catch { /* entorno sin navigator */ }
    localeNumeros = l || "en-US";
  }
  return localeNumeros;
}

/** Solo para las verificaciones: fija el locale sin depender del navegador. */
export function fijarLocaleDeNumeros(locale: string | null): void {
  localeNumeros = locale;
}

/** Moneda de la iglesia. La app usa UNA por iglesia, así que basta un valor
 *  global que se fija al cargar (o cambiar) la iglesia — mismo patrón que el
 *  símbolo de `fmtMoney`, y por eso lo fija la misma llamada. */
let monedaDeEntrada = "USD";
export function fijarMonedaDeEntrada(code: string): void {
  monedaDeEntrada = code;
}

/**
 * Separadores de esta configuración regional.
 *
 * El de millares se deduce formateando un número GRANDE a propósito: varios
 * idiomas (`es-ES` entre ellos) no agrupan por debajo de 10.000, así que con
 * `1234` la parte "group" no existe y saldría `undefined`.
 */
export function separadoresDeNumeros(locale: string): { decimal: string; miles: string } {
  const partes = new Intl.NumberFormat(locale).formatToParts(1234567.89);
  return {
    decimal: partes.find((p) => p.type === "decimal")?.value ?? ".",
    miles: partes.find((p) => p.type === "group")?.value ?? ",",
  };
}

/**
 * Decimales que admite una moneda: 2 para casi todas, **0** para las que no
 * usan fracción.
 *
 * Sale de `Intl`, no de una tabla escrita a mano, para que no envejezca. Hoy
 * da 0 para tres de las del catálogo: **CLP** (peso chileno), **PYG**
 * (guaraní) y **COP** (peso colombiano). Las dos primeras estaban previstas;
 * la tercera la añade `Intl` porque Colombia, en la práctica, no usa centavos
 * aunque la norma ISO se los reconozca.
 */
export function decimalesDeMoneda(code: string): number {
  try {
    // `maximumFractionDigits` va como opcional en los tipos de TypeScript
    // aunque `style: "currency"` siempre lo resuelva; el `?? 2` es para el
    // compilador, no para un caso real.
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2; // código fuera del catálogo: se trata como moneda normal
  }
}

/** ¿Los grupos de millares están bien formados? "1.234.567" sí; "1.50" no
 *  —dos cifras detrás de un separador de millares no es un millar—. Es lo que
 *  convierte el "$150.00" silencioso de antes en un aviso. */
function millaresValidos(grupos: string[]): boolean {
  if (grupos[0].length < 1 || grupos[0].length > 3) return false;
  return grupos.slice(1).every((g) => g.length === 3);
}

/**
 * Texto tecleado en un campo de importe → centavos. `null` si no es un
 * importe **o si no se puede saber con certeza qué quiso escribir**.
 *
 * Rechazar es deliberado: entre guardar una cifra que la persona no escribió
 * y pedirle que la repita, lo segundo es lo barato. El aviso lo pone la
 * pantalla; aquí solo se decide que no hay respuesta buena.
 */
export function deTextoTecleado(s: string): Centavos | null {
  const { decimal, miles } = separadoresDeNumeros(localeDeNumeros());
  const sinDecimales = decimalesDeMoneda(monedaDeEntrada) === 0;

  // Fuera todo lo que no sea cifra, signo o separador: símbolos de moneda
  // ("RD$", "₡", "B/."), espacios de cualquier clase y lo que se haya pegado.
  const negativo = s.trim().startsWith("-");
  const permitidos = new Set([...decimal, ...miles]);
  let cuerpo = "";
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") cuerpo += ch;
    else if (permitidos.has(ch)) cuerpo += ch;
  }
  if (!cuerpo) return null;

  let entera: string;
  let frac = "";

  if (sinDecimales) {
    // Moneda sin fracción: NINGÚN separador puede ser decimal, así que todos
    // son de millares y tienen que estar bien agrupados. Teclear "1.234" en
    // pesos chilenos son mil doscientos treinta y cuatro pesos, no $1.23.
    const grupos = cuerpo.split(new RegExp(`[${escapar(decimal)}${escapar(miles)}]`));
    if (grupos.length > 1 && !millaresValidos(grupos)) return null;
    entera = grupos.join("");
  } else {
    const partes = cuerpo.split(decimal);
    if (partes.length > 2) return null; // dos separadores decimales
    entera = partes[0];
    frac = partes[1] ?? "";
    if (frac.includes(miles)) return null; // millares detrás del decimal
    if (entera.includes(miles)) {
      const grupos = entera.split(miles);
      if (!millaresValidos(grupos)) return null;
      entera = grupos.join("");
    }
  }

  if (!/^\d*$/.test(entera) || !/^\d*$/.test(frac)) return null;
  if (entera === "" && frac === "") return null;

  // Mismo redondeo que `deTexto`: los dos primeros decimales son los
  // centavos y el tercero solo decide hacia dónde.
  const centavos = Number((frac + "00").slice(0, 2));
  const tercerDecimal = frac.length > 2 ? Number(frac[2]) : 0;
  let total = Number(entera || "0") * 100 + centavos;
  if (tercerDecimal >= 5) total += 1;
  if (!Number.isSafeInteger(total)) return null;

  return (negativo ? -total : total) as Centavos;
}

function escapar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/**
 * Centavos → el texto que se pone en un campo de importe al editar.
 *
 * Pareja obligada de `deTextoTecleado`: si uno escribiera "125.50" donde el
 * otro espera coma, abrir un movimiento para cambiarle una letra al concepto
 * y guardarlo le movería el importe. **Sin separador de millares**: en un
 * campo que se edita estorba más de lo que ayuda.
 *
 * En las monedas sin fracción se redondea a unidades. Un importe antiguo con
 * centavos —que en esas monedas solo puede venir de datos de antes de este
 * arreglo— pierde la fracción al reeditarlo.
 */
export function aTextoTecleado(c: Centavos): string {
  if (decimalesDeMoneda(monedaDeEntrada) === 0) return String(Math.round(c / 100));
  const { decimal } = separadoresDeNumeros(localeDeNumeros());
  return (c / 100).toFixed(2).replace(".", decimal);
}
