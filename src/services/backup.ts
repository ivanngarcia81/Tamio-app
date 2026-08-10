import Papa from "papaparse";
import { aTextoCsv } from "../dinero";
import { save } from "@tauri-apps/plugin-dialog";
import { readFile, remove } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import {
  METODOS_PAGO, getCategoriasGasto, getCategoriasIngreso,
  listAllTxForExport, listMembers, nowLocalIso, type Member, type Tx,
} from "../db";
import { entregarArchivo, esMovil } from "./entrega";
import { appDataDir, join } from "@tauri-apps/api/path";

export type BackupResult = "guardado" | "cancelado" | "vacio";

/** Nombre canónico en español de los catálogos: es el que los importadores
 *  CSV de la app siempre reconocen, sin importar el idioma activo. */
function canonicalCat(tipo: "ingreso" | "gasto", id: string): string {
  const lista = tipo === "ingreso" ? getCategoriasIngreso() : getCategoriasGasto();
  return lista.find((c) => c.id === id)?.nombre ?? id;
}

function canonicalMetodo(id: string): string {
  return METODOS_PAGO.find((m) => m.id === id)?.nombre ?? id;
}

/** El BOM hace que Excel abra el archivo como UTF-8 y respete los acentos. */
async function saveCsv(defaultName: string, csv: string): Promise<BackupResult> {
  const ok = await entregarArchivo(new TextEncoder().encode("\uFEFF" + csv), defaultName);
  return ok ? "guardado" : "cancelado";
}

/** Convierte movimientos al CSV que el importador de la app puede volver
 *  a leer (las columnas extra se ignoran en el paso de mapeo). Pura, para
 *  poder probar el viaje redondo exportar → importar. */
export function movimientosToCsv(txs: Tx[]): string {
  const rows = txs.map((tx) => ({
    fecha: tx.fecha.slice(0, 10),
    tipo: tx.tipo,
    categoria: canonicalCat(tx.tipo, tx.categoria),
    concepto: tx.concepto,
    // DECIMALES a propósito, no centavos: este CSV lo abre Excel y lo lee
    // gente, y el importador lo vuelve a leer con deTexto(). Es la única
    // salida donde el formato viejo se conserva (plan-centavos.md §3).
    monto: aTextoCsv(tx.monto),
    metodo_pago: canonicalMetodo(tx.metodo_pago),
    beneficiario: tx.beneficiario ?? "",
    notas: tx.detalle ?? "",
    hora: tx.fecha.slice(11, 16),
    subcategoria: tx.subcategoria ?? "",
    miembro: tx.member_nombre ?? "",
    estado: tx.estado,
  }));
  return Papa.unparse(rows);
}

export async function exportMovimientosCsv(churchId: number): Promise<BackupResult> {
  const txs = await listAllTxForExport(churchId);
  if (txs.length === 0) return "vacio";
  return saveCsv(`movimientos-${nowLocalIso().slice(0, 10)}.csv`, movimientosToCsv(txs));
}

/** Convierte miembros al CSV con las columnas que acepta el importador. */
export function miembrosToCsv(members: Member[]): string {
  const rows = members.map((m) => ({
    nombre: m.nombre,
    email: m.email ?? "",
    telefono: m.telefono ?? "",
    rfc: m.rfc ?? "",
    notas: m.notas ?? "",
  }));
  return Papa.unparse(rows);
}

export async function exportMiembrosCsv(churchId: number): Promise<BackupResult> {
  const members = await listMembers(churchId);
  if (members.length === 0) return "vacio";
  return saveCsv(`miembros-${nowLocalIso().slice(0, 10)}.csv`, miembrosToCsv(members));
}

/**
 * Respaldo completo: un PAQUETE `.zip` con la base más los documentos.
 *
 * Antes era solo el archivo `.db`, y eso dejó de bastar cuando los
 * comprobantes pasaron a vivir dentro de la carpeta de la app. Hasta entonces
 * estaban en el Escritorio o en Descargas del usuario y se los llevaba su Time
 * Machine; ahora, restaurar el `.db` solo en otra Mac dejaba la base apuntando
 * a archivos que allí no existen y todos los comprobantes desaparecían en
 * silencio, justo después de haberlos "protegido". Para una tesorería
 * auditable eso es lo contrario de lo que se buscaba.
 *
 * Dentro del ZIP: `tamio.db` (la base, descifrada y legible en cualquier
 * parte) y `datos/` (comprobantes, adjuntos de cartas, logo y firmas).
 *
 * La base en disco está cifrada con SQLCipher; la copia la exporta el motor en
 * Rust ya descifrada, para que el respaldo se pueda abrir donde sea. Esa copia
 * sin cifrar solo existe dentro del paquete: se genera en un temporal de la
 * carpeta de la app y se borra al terminar.
 */
export async function backupDatabase(): Promise<BackupResult> {
  const fileName = `tamio-respaldo-${nowLocalIso().slice(0, 10)}.zip`;
  if (esMovil()) {
    // iOS: el paquete se arma en la carpeta de la app y de ahí sale por la
    // hoja de compartir (Archivos, AirDrop…).
    const dir = await appDataDir();
    const destino = await join(dir, fileName);
    await invoke("db_backup_paquete", { destino });
    const bytes = await readFile(destino);
    const ok = await entregarArchivo(bytes, fileName);
    await remove(destino).catch(() => {});
    return ok ? "guardado" : "cancelado";
  }
  const path = await save({ defaultPath: fileName, filters: [{ name: "Tamio", extensions: ["zip"] }] });
  if (!path) return "cancelado";
  await invoke("db_backup_paquete", { destino: path });
  return "guardado";
}
