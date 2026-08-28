// Catálogo único de monedas de Tamio.
//
// La app es de UNA sola moneda por iglesia: se guarda el código (p. ej. "USD")
// en `church.moneda` y todos los montos se muestran con su símbolo. Antes solo
// existían USD y MXN hardcodeados en tres pantallas; aquí viven todas en un solo
// lugar para que agregar más sea trivial y consistente.
//
// El nombre va en español e inglés directamente (sin claves i18n) porque son
// solo dos textos por moneda y así no hay que tocar dos archivos de traducción
// por cada divisa nueva.

export interface CurrencyInfo {
  /** Código ISO 4217 (lo que se guarda en la base de datos). */
  code: string;
  /** Símbolo que se antepone al monto en pantalla y PDF. */
  symbol: string;
  es: string;
  en: string;
  /**
   * Locale con el que se agrupan miles y decimales de esta moneda en los
   * documentos (`1,250.50` vs `1.250,50`). Va aquí, y no en un catálogo de
   * países aparte, porque la moneda ya se elige en Ajustes con un selector
   * cerrado: el campo "País" es texto libre ("México", "mexico", "MX"…) y no
   * sirve para deducir nada. La moneda identifica el país en la práctica.
   */
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$", es: "Dólar estadounidense", en: "US Dollar", locale: "en-US" },
  { code: "MXN", symbol: "$", es: "Peso mexicano", en: "Mexican Peso", locale: "es-MX" },
  { code: "EUR", symbol: "€", es: "Euro", en: "Euro", locale: "es-ES" },
  { code: "GTQ", symbol: "Q", es: "Quetzal guatemalteco", en: "Guatemalan Quetzal", locale: "es-GT" },
  { code: "HNL", symbol: "L", es: "Lempira hondureño", en: "Honduran Lempira", locale: "es-HN" },
  { code: "NIO", symbol: "C$", es: "Córdoba nicaragüense", en: "Nicaraguan Córdoba", locale: "es-NI" },
  { code: "CRC", symbol: "₡", es: "Colón costarricense", en: "Costa Rican Colón", locale: "es-CR" },
  { code: "PAB", symbol: "B/.", es: "Balboa panameño", en: "Panamanian Balboa", locale: "es-PA" },
  { code: "SVC", symbol: "$", es: "Dólar (El Salvador)", en: "US Dollar (El Salvador)", locale: "es-SV" },
  { code: "DOP", symbol: "RD$", es: "Peso dominicano", en: "Dominican Peso", locale: "es-DO" },
  { code: "COP", symbol: "$", es: "Peso colombiano", en: "Colombian Peso", locale: "es-CO" },
  { code: "PEN", symbol: "S/", es: "Sol peruano", en: "Peruvian Sol", locale: "es-PE" },
  { code: "CLP", symbol: "$", es: "Peso chileno", en: "Chilean Peso", locale: "es-CL" },
  { code: "ARS", symbol: "$", es: "Peso argentino", en: "Argentine Peso", locale: "es-AR" },
  { code: "BOB", symbol: "Bs", es: "Boliviano", en: "Bolivian Boliviano", locale: "es-BO" },
  { code: "PYG", symbol: "₲", es: "Guaraní paraguayo", en: "Paraguayan Guaraní", locale: "es-PY" },
  { code: "UYU", symbol: "$U", es: "Peso uruguayo", en: "Uruguayan Peso", locale: "es-UY" },
  { code: "VES", symbol: "Bs", es: "Bolívar venezolano", en: "Venezuelan Bolívar", locale: "es-VE" },
  { code: "BRL", symbol: "R$", es: "Real brasileño", en: "Brazilian Real", locale: "pt-BR" },
  { code: "GBP", symbol: "£", es: "Libra esterlina", en: "Pound Sterling", locale: "en-GB" },
  { code: "CAD", symbol: "$", es: "Dólar canadiense", en: "Canadian Dollar", locale: "en-CA" },
];

const PORCODE: Record<string, CurrencyInfo> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

/** Símbolo de una moneda; "$" si el código no está en el catálogo. */
export function currencySymbol(code: string): string {
  return PORCODE[code]?.symbol ?? "$";
}

/** Locale de números de una moneda; "en-US" si el código no está en el
 *  catálogo (es lo que Tamio usó siempre en los documentos). */
export function currencyLocale(code: string): string {
  return PORCODE[code]?.locale ?? "en-US";
}

/** Forma CORTA canónica, p. ej. "GTQ Q" o "USD $".
 *
 *  La regla D de la lámina S11 del handoff de Ajustes: un valor que no cabe
 *  en una línea no se abrevia con puntos ni se parte en dos. «USD — Dólar
 *  estadounidense» salía como «USD — Dólar estadounide…» en la fila de
 *  Iglesia, y una elipsis no informa de nada —el código y el símbolo sí, y
 *  son lo que se reconoce de un vistazo—. El nombre completo se lee en el
 *  selector que empuja, donde está la lista entera y hay sitio de sobra. */
export function currencyShort(code: string): string {
  const c = PORCODE[code];
  return c ? `${c.code} ${c.symbol}` : code;
}

/** Etiqueta para los selectores, p. ej. "GTQ — Quetzal guatemalteco". */
export function currencyLabel(code: string, lang: string): string {
  const c = PORCODE[code];
  if (!c) return code;
  return `${c.code} — ${lang.startsWith("en") ? c.en : c.es}`;
}
