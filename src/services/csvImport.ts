import Papa from "papaparse";

/** Describe un campo que la app necesita — el usuario indica qué columna
 *  de SU archivo corresponde a cada uno (con una sugerencia automática
 *  por nombre parecido), en vez de exigir nombres de columna exactos. */
export interface CsvField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

export interface ImportRowError {
  fila: number;
  mensaje: string;
}

export function parseCsvFile(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}

/** Sugiere automáticamente qué columna del archivo va con cada campo,
 *  comparando nombres (insensible a mayúsculas/acentos simples). El
 *  usuario siempre puede corregir la sugerencia antes de continuar. */
export function autoDetectMapping(headers: string[], fields: CsvField[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const usados = new Set<string>();
  for (const field of fields) {
    const match = headers.find((h) => {
      if (usados.has(h)) return false;
      const hLower = h.trim().toLowerCase();
      return field.aliases.some((a) => a.toLowerCase() === hLower);
    });
    mapping[field.key] = match ?? null;
    if (match) usados.add(match);
  }
  return mapping;
}

/** Reconstruye cada fila del archivo usando las claves internas de la app
 *  (fecha, tipo, monto...) según el mapeo elegido, sin importar cómo se
 *  llamaban las columnas originales. */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string | null>,
  fields: CsvField[]
): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const field of fields) {
      const columnaOrigen = mapping[field.key];
      mapped[field.key] = columnaOrigen ? row[columnaOrigen] ?? "" : "";
    }
    return mapped;
  });
}
