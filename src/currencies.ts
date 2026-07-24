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
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$", es: "Dólar estadounidense", en: "US Dollar" },
  { code: "MXN", symbol: "$", es: "Peso mexicano", en: "Mexican Peso" },
  { code: "EUR", symbol: "€", es: "Euro", en: "Euro" },
  { code: "GTQ", symbol: "Q", es: "Quetzal guatemalteco", en: "Guatemalan Quetzal" },
  { code: "HNL", symbol: "L", es: "Lempira hondureño", en: "Honduran Lempira" },
  { code: "NIO", symbol: "C$", es: "Córdoba nicaragüense", en: "Nicaraguan Córdoba" },
  { code: "CRC", symbol: "₡", es: "Colón costarricense", en: "Costa Rican Colón" },
  { code: "PAB", symbol: "B/.", es: "Balboa panameño", en: "Panamanian Balboa" },
  { code: "SVC", symbol: "$", es: "Dólar (El Salvador)", en: "US Dollar (El Salvador)" },
  { code: "DOP", symbol: "RD$", es: "Peso dominicano", en: "Dominican Peso" },
  { code: "COP", symbol: "$", es: "Peso colombiano", en: "Colombian Peso" },
  { code: "PEN", symbol: "S/", es: "Sol peruano", en: "Peruvian Sol" },
  { code: "CLP", symbol: "$", es: "Peso chileno", en: "Chilean Peso" },
  { code: "ARS", symbol: "$", es: "Peso argentino", en: "Argentine Peso" },
  { code: "BOB", symbol: "Bs", es: "Boliviano", en: "Bolivian Boliviano" },
  { code: "PYG", symbol: "₲", es: "Guaraní paraguayo", en: "Paraguayan Guaraní" },
  { code: "UYU", symbol: "$U", es: "Peso uruguayo", en: "Uruguayan Peso" },
  { code: "VES", symbol: "Bs", es: "Bolívar venezolano", en: "Venezuelan Bolívar" },
  { code: "BRL", symbol: "R$", es: "Real brasileño", en: "Brazilian Real" },
  { code: "GBP", symbol: "£", es: "Libra esterlina", en: "Pound Sterling" },
  { code: "CAD", symbol: "$", es: "Dólar canadiense", en: "Canadian Dollar" },
];

const PORCODE: Record<string, CurrencyInfo> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
);

/** Símbolo de una moneda; "$" si el código no está en el catálogo. */
export function currencySymbol(code: string): string {
  return PORCODE[code]?.symbol ?? "$";
}

/** Etiqueta para los selectores, p. ej. "GTQ — Quetzal guatemalteco". */
export function currencyLabel(code: string, lang: string): string {
  const c = PORCODE[code];
  if (!c) return code;
  return `${c.code} — ${lang.startsWith("en") ? c.en : c.es}`;
}
