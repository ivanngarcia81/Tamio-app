// Comprobantes de movimientos y depósitos.
//
// Hasta la 1.0.8 se guardaba en `comprobante_path` **la ruta que el usuario
// eligió en el diálogo** — su Escritorio, Descargas, iCloud, un pendrive — y la
// app leía de ahí cada vez. Si movía, renombraba o borraba el archivo, el
// comprobante del asiento se perdía sin aviso. Un comprobante existe justamente
// para poder demostrar el movimiento tres años después.
//
// Ahora se copia a la carpeta de datos y se guarda la ruta relativa. La regla
// completa, y por qué la copia la hace Rust, están en `services/archivos.ts`.

import { appDataDir } from "@tauri-apps/api/path";
import { getDb } from "../db";
import type { Centavos } from "../dinero";
import {
  CARPETA_COMPROBANTES, esAbsoluta, existeArchivo, guardarEnDatos, rutaEnDatos,
} from "./archivos";

export { esAbsoluta } from "./archivos";

/** Ruta real en disco del comprobante guardado en la base. */
export const rutaComprobante = rutaEnDatos;

/** Copia el comprobante elegido y devuelve la ruta relativa a guardar. */
export function guardarComprobante(rutaOrigen: string): Promise<string> {
  return guardarEnDatos(rutaOrigen, CARPETA_COMPROBANTES);
}

/** ¿Sigue existiendo el archivo? */
export const comprobanteDisponible = existeArchivo;

const TABLAS = ["transactions", "depositos_bancarios"] as const;
type Tabla = (typeof TABLAS)[number];

export interface MigracionComprobantes {
  /** Estaban fuera de la app y se copiaron adentro. */
  copiados: number;
  /** Ya estaban adentro pero con ruta absoluta; solo se reescribió la ruta. */
  normalizados: number;
  /** Estaban fuera y no se pudieron recuperar. Quedan listados en Ajustes. */
  pendientes: number;
}

/**
 * Trae adentro los comprobantes de instalaciones anteriores y pasa a ruta
 * relativa los que ya estaban adentro.
 *
 * Con datos ya sanos cuesta una consulta por tabla y no hace nada, así que
 * puede correr en cada arranque sin marcador de "ya migrado". Incluye las filas
 * borradas: el borrado es suave y se puede deshacer, así que su comprobante
 * también tiene que sobrevivir.
 *
 * No toca `updated_at` a propósito: una ruta relativa ya es válida en cualquier
 * equipo, pero el momento de la migración es asunto local, no un cambio que el
 * usuario haya hecho.
 */
export async function migrarComprobantesExternos(churchId: number): Promise<MigracionComprobantes> {
  const d = await getDb();
  const base = (await appDataDir()).replace(/[\\/]+$/, "");
  const sep = base.includes("\\") ? "\\" : "/";
  let copiados = 0;
  let normalizados = 0;
  let pendientes = 0;

  for (const tabla of TABLAS) {
    const filas = await d.select<{ id: number; comprobante_path: string }[]>(
      `SELECT id, comprobante_path FROM ${tabla}
        WHERE church_id = $1 AND comprobante_path IS NOT NULL AND comprobante_path <> ''`,
      [churchId]
    );
    for (const fila of filas) {
      const guardado = fila.comprobante_path;
      if (!esAbsoluta(guardado)) continue; // ya es relativa: nada que hacer
      const dentro = guardado === base || guardado.startsWith(base + sep);

      const nueva = await guardarComprobante(guardado);
      if (nueva === guardado) { pendientes++; continue; } // no se pudo copiar
      await d.execute(
        `UPDATE ${tabla} SET comprobante_path = $1 WHERE id = $2 AND church_id = $3`,
        [nueva, fila.id, churchId]
      );
      if (dentro) normalizados++; else copiados++;
    }
  }
  return { copiados, normalizados, pendientes };
}

export interface ComprobantePendiente {
  tabla: Tabla;
  id: number;
  fecha: string;
  descripcion: string;
  monto: Centavos;
  /** Dónde estaba el archivo, para que el usuario sepa qué buscar. */
  rutaOriginal: string;
}

/**
 * Comprobantes que quedaron apuntando fuera de la app y no se pudieron traer
 * adentro. Son los que la migración no pudo copiar: normalmente un archivo que
 * el usuario borró o movió, o que está en un disco que hoy no está conectado.
 *
 * Se comprueba fila a fila con Rust en vez de asumir: un pendrive desconectado
 * hoy puede estar conectado mañana, y entonces el arranque siguiente lo copia
 * solo y la fila desaparece de esta lista.
 */
export async function listarComprobantesPendientes(churchId: number): Promise<ComprobantePendiente[]> {
  const d = await getDb();
  const out: ComprobantePendiente[] = [];

  const filas = await d.select<{ id: number; fecha: string; concepto: string; monto: Centavos; comprobante_path: string }[]>(
    `SELECT id, fecha, concepto, monto, comprobante_path FROM transactions
      WHERE church_id = $1 AND comprobante_path IS NOT NULL AND comprobante_path <> '' AND deleted = 0
      ORDER BY fecha DESC`,
    [churchId]
  );
  for (const f of filas) {
    if (!esAbsoluta(f.comprobante_path)) continue;
    out.push({
      tabla: "transactions", id: f.id, fecha: f.fecha.slice(0, 10),
      descripcion: f.concepto, monto: f.monto, rutaOriginal: f.comprobante_path,
    });
  }

  const deps = await d.select<{ id: number; fecha: string; cuenta_banco: string; monto: Centavos; comprobante_path: string }[]>(
    `SELECT id, fecha, cuenta_banco, monto, comprobante_path FROM depositos_bancarios
      WHERE church_id = $1 AND comprobante_path IS NOT NULL AND comprobante_path <> '' AND deleted = 0
      ORDER BY fecha DESC`,
    [churchId]
  );
  for (const f of deps) {
    if (!esAbsoluta(f.comprobante_path)) continue;
    out.push({
      tabla: "depositos_bancarios", id: f.id, fecha: f.fecha.slice(0, 10),
      descripcion: f.cuenta_banco, monto: f.monto, rutaOriginal: f.comprobante_path,
    });
  }
  return out;
}

/** Vuelve a enlazar un comprobante con el archivo que el usuario elija ahora.
 *  El diálogo de archivos concede acceso siempre, con sandbox o sin él: es el
 *  único mecanismo garantizado para recuperar uno de estos. */
export async function reasignarComprobante(
  p: ComprobantePendiente, rutaElegida: string, churchId: number
): Promise<void> {
  const relativa = await guardarComprobante(rutaElegida);
  const d = await getDb();
  await d.execute(
    `UPDATE ${p.tabla} SET comprobante_path = $1, updated_at = datetime('now')
      WHERE id = $2 AND church_id = $3`,
    [relativa, p.id, churchId]
  );
}
