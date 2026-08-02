// Comprobantes de movimientos y depósitos: dónde viven los archivos.
//
// Hasta la 1.0.8 la app guardaba en `comprobante_path` **la ruta que el usuario
// eligió en el diálogo** — su Escritorio, Descargas, iCloud, un pendrive — y la
// leía de ahí cada vez. Eso tiene dos problemas independientes:
//
//   1. Frágil. Si el usuario mueve, renombra o borra el archivo original (o
//      desconecta el disco donde estaba), el comprobante del asiento se pierde
//      sin aviso. Un comprobante existe justamente para poder demostrar el
//      movimiento tres años después.
//   2. Obliga a que la app tenga permiso de lectura sobre toda la carpeta del
//      usuario, porque el archivo puede estar en cualquier sitio.
//
// Ahora se copia a la carpeta de datos de la app y se guarda una ruta
// **RELATIVA** a esa carpeta (`comprobantes/1754…-recibo.pdf`).
//
// ¿Por qué relativa y no absoluta? Porque una ruta absoluta lleva dentro el
// nombre de usuario del Mac donde se creó (`/Users/ivan/Library/…`). Al
// restaurar un respaldo en otro equipo ese usuario no existe y TODOS los
// comprobantes fallan, aunque los archivos vengan en el paquete. Con la ruta
// relativa, el respaldo se restaura donde sea y sigue apuntando bien.
//
// ¿Por qué la copia la hace Rust y no el plugin `fs`? Porque `fs:scope` limita
// al webview, no al lado Rust. La migración tiene que poder leer iCloud Drive
// (~/Library/Mobile Documents), discos externos y carpetas que el usuario eligió
// hace un año, todas fuera del alcance acotado. Con el plugin, `exists()` daría
// falso sobre un archivo que SÍ está y la app acusaría al tesorero de haberlo
// borrado.

import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../db";

/** ¿Es una ruta absoluta? (`/Users/…`, `C:\…`). Lo que NO lo es, es relativa a
 *  la carpeta de datos de la app. Las filas viejas guardan rutas absolutas y
 *  hay que seguir entendiéndolas siempre, aunque ya no se escriban. */
export function esAbsoluta(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/**
 * Ruta real en disco de lo que hay guardado en `comprobante_path`.
 * Relativa → se resuelve contra la carpeta de datos. Absoluta → tal cual
 * (fila antigua que la migración no pudo traer adentro).
 */
export async function rutaComprobante(guardado: string): Promise<string> {
  if (esAbsoluta(guardado)) return guardado;
  return join(await appDataDir(), guardado);
}

/**
 * Copia el comprobante elegido a la carpeta de la app y devuelve la ruta
 * relativa, que es la que se guarda en la base.
 *
 * Si la copia falla (disco lleno, permisos, unidad desconectada) **no se
 * interrumpe el guardado**: se devuelve la ruta original y el asiento se
 * registra igual. Perder el enlace al comprobante es malo; perder el asiento
 * contable por no poder copiar un PDF sería peor. Esa fila queda como
 * "pendiente de recuperar" y aparece en Ajustes.
 */
export async function guardarComprobante(rutaOrigen: string): Promise<string> {
  try {
    return await invoke<string>("copiar_comprobante", { origen: rutaOrigen });
  } catch {
    return rutaOrigen;
  }
}

/** ¿Sigue existiendo el archivo? Lo pregunta Rust, no el plugin `fs`: el
 *  `exists()` del plugin da falso sobre cualquier ruta fuera del alcance del
 *  webview, y "no lo puedo leer" no es lo mismo que "ya no está". */
export async function comprobanteDisponible(rutaAbsoluta: string): Promise<boolean> {
  try {
    return await invoke<boolean>("comprobante_existe", { ruta: rutaAbsoluta });
  } catch {
    return false;
  }
}

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
  monto: number;
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

  const filas = await d.select<{ id: number; fecha: string; concepto: string; monto: number; comprobante_path: string }[]>(
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

  const deps = await d.select<{ id: number; fecha: string; cuenta_banco: string; monto: number; comprobante_path: string }[]>(
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
