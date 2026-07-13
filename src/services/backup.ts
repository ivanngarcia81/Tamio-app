import Papa from "papaparse";
import { save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import {
  METODOS_PAGO, getCategoriasGasto, getCategoriasIngreso,
  listAllTxForExport, listMembers, nowLocalIso, type Member, type Tx,
} from "../db";

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
  const path = await save({ defaultPath: defaultName, filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (!path) return "cancelado";
  await writeFile(path, new TextEncoder().encode("\uFEFF" + csv));
  return "guardado";
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
    monto: tx.monto,
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

/** Copia el archivo SQLite completo (misma carpeta de datos que usa la app)
 *  a la ubicación que elija el usuario. */
export async function backupDatabase(): Promise<BackupResult> {
  const dir = await appDataDir();
  const dbPath = await join(dir, "tesoreria.db");
  const bytes = await readFile(dbPath);
  const path = await save({
    defaultPath: `tesoreria-respaldo-${nowLocalIso().slice(0, 10)}.db`,
    filters: [{ name: "SQLite", extensions: ["db"] }],
  });
  if (!path) return "cancelado";
  await writeFile(path, bytes);
  return "guardado";
}
