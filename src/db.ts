import Database from "@tauri-apps/plugin-sql";
import i18n, { currentLang } from "./i18n";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:tesoreria.db");
  }
  return db;
}

// ---------- Tipos ----------

export interface Church {
  id: number;
  nombre: string;
  ciudad: string | null;
  pais: string;
  moneda: string;
  /** Se sube desde Configuración → Información de la iglesia; se muestra
   *  en el círculo del sidebar y el PDF del Dashboard ya la usa si existe. */
  logo_path: string | null;
  tesorero_nombre: string | null;
  tesorero_cargo: string | null;
  tesorero_email: string | null;
  tesorero_telefono: string | null;
  tesorero_firma_path: string | null;
}

export interface Member {
  id: number;
  church_id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  rfc: string | null;
  etiquetas: string; // JSON string
  fecha_ingreso: string | null;
  notas: string | null;
}

export interface Tx {
  id: number;
  church_id: number;
  tipo: "ingreso" | "gasto";
  categoria: string;
  subcategoria: string | null;
  concepto: string;
  detalle: string | null;
  fecha: string; // "YYYY-MM-DD HH:MM"
  monto: number;
  moneda: string;
  metodo_pago: string;
  member_id: number | null;
  beneficiario: string | null;
  beneficiario_rfc: string | null;
  comprobante_path: string | null;
  emitir_constancia: number;
  estado: "pendiente" | "aprobado" | "rechazado";
  notas: string | null;
  member_nombre?: string | null;
}

// ---------- Catálogos ----------

export const CATEGORIAS_INGRESO = [
  { id: "ofrenda", nombre: "Ofrenda", tagClass: "ofrenda" },
  { id: "diezmo", nombre: "Diezmo", tagClass: "diezmo" },
  { id: "donacion", nombre: "Donación", tagClass: "donacion" },
  { id: "otros", nombre: "Otros", tagClass: "otros" },
] as const;

export const CATEGORIAS_GASTO = [
  { id: "pastores", nombre: "Compensación", tagClass: "pastores", color: "#9f1239" },
  { id: "musicos", nombre: "Suministros", tagClass: "musicos", color: "#1d4ed8" },
  { id: "administracion", nombre: "Varios", tagClass: "administracion", color: "#374151" },
  { id: "limpieza", nombre: "Limpieza", tagClass: "limpieza", color: "#0f766e" },
  { id: "servicios", nombre: "Utilidades", tagClass: "servicios", color: "#92400e" },
  { id: "mantenimiento", nombre: "Mantenimiento", tagClass: "mantenimiento", color: "#57534e" },
  { id: "eventos", nombre: "Alimentos", tagClass: "eventos", color: "#9a3412" },
  { id: "misiones", nombre: "Misiones", tagClass: "misiones", color: "#0369a1" },
  { id: "ayudas", nombre: "Ayudas", tagClass: "ayudas", color: "#9d174d" },
  { id: "tecnologia", nombre: "Tecnología", tagClass: "tecnologia", color: "#86198f" },
  { id: "transporte", nombre: "Transporte", tagClass: "transporte", color: "#4d7c0f" },
] as const;

export const METODOS_PAGO = [
  { id: "efectivo", nombre: "Efectivo", badge: "EF", color: "#16a34a" },
  { id: "transferencia", nombre: "Transferencia", badge: "TR", color: "#2563eb" },
  { id: "tarjeta", nombre: "Tarjeta", badge: "TC", color: "#7c3aed" },
  { id: "cheque", nombre: "Cheque", badge: "CH", color: "#ea580c" },
] as const;

// ---------- Categorías personalizadas ----------

export interface CategoriaCustom {
  id: number;
  church_id: number;
  tipo: "ingreso" | "gasto";
  nombre: string;
  color: string;
}

/** Forma unificada de categoría para la UI: integradas + personalizadas. */
export interface CategoriaUI {
  id: string;
  nombre: string;
  tagClass: string;
  color?: string;
  custom?: boolean;
}

/** Caché en memoria de las categorías personalizadas. Se carga una vez al
 *  arrancar (App) y se refresca al editarlas en Configuración, para que
 *  getCategoriasIngreso/Gasto puedan seguir siendo síncronas como los
 *  catálogos integrados. */
let categoriasCustomCache: CategoriaCustom[] = [];

export function setCategoriasCustomCache(rows: CategoriaCustom[]): void {
  categoriasCustomCache = rows;
}

export async function loadCategoriasCustom(churchId: number): Promise<CategoriaCustom[]> {
  const d = await getDb();
  const rows = await d.select<CategoriaCustom[]>(
    "SELECT * FROM categorias_custom WHERE church_id = $1 ORDER BY nombre",
    [churchId]
  );
  setCategoriasCustomCache(rows);
  return rows;
}

/** Id textual con el que una categoría personalizada se guarda en las
 *  transacciones (p. ej. "custom-3"). */
export function customCatId(rowId: number): string {
  return `custom-${rowId}`;
}

function customToUI(c: CategoriaCustom): CategoriaUI {
  return { id: customCatId(c.id), nombre: c.nombre, tagClass: "otros", color: c.color, custom: true };
}

/** Catálogo completo (integradas + personalizadas) para la UI y los PDFs. */
export function getCategoriasIngreso(): CategoriaUI[] {
  return [
    ...CATEGORIAS_INGRESO.map((c) => ({ ...c } as CategoriaUI)),
    ...categoriasCustomCache.filter((c) => c.tipo === "ingreso").map(customToUI),
  ];
}

export function getCategoriasGasto(): CategoriaUI[] {
  return [
    ...CATEGORIAS_GASTO.map((c) => ({ ...c } as CategoriaUI)),
    ...categoriasCustomCache.filter((c) => c.tipo === "gasto").map(customToUI),
  ];
}

export async function insertCategoriaCustom(
  churchId: number,
  tipo: "ingreso" | "gasto",
  nombre: string,
  color: string
): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO categorias_custom (church_id, tipo, nombre, color) VALUES ($1,$2,$3,$4)",
    [churchId, tipo, nombre.trim(), color]
  );
  await loadCategoriasCustom(churchId);
}

export async function deleteCategoriaCustom(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM categorias_custom WHERE id = $1 AND church_id = $2", [id, churchId]);
  await loadCategoriasCustom(churchId);
}

/** Cuántos movimientos usan una categoría (para impedir borrar las en uso). */
export async function countTxByCategoria(churchId: number, categoriaId: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE church_id = $1 AND categoria = $2",
    [churchId, categoriaId]
  );
  return rows[0]?.n ?? 0;
}

/** Nombre de la categoría en el idioma activo de la app. El campo `nombre`
 *  de los catálogos conserva el nombre canónico en español (se usa para
 *  emparejar archivos CSV); todo lo que se muestra en pantalla o en PDFs
 *  debe pasar por aquí. Las personalizadas usan su propio nombre tal cual. */
export function catNombre(id: string): string {
  const custom = categoriasCustomCache.find((c) => customCatId(c.id) === id);
  if (custom) return custom.nombre;
  return i18n.t(`cat.${id}`, { defaultValue: id });
}

export function metodoNombre(id: string): string {
  return i18n.t(`metodo.${id}`, { defaultValue: id });
}

export function categoriaInfo(tipo: "ingreso" | "gasto", id: string) {
  const list: readonly { id: string; nombre: string; tagClass: string }[] =
    tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;
  const found = list.find((c) => c.id === id);
  if (found) return { ...found, nombre: catNombre(found.id) };
  const custom = categoriasCustomCache.find((c) => customCatId(c.id) === id && c.tipo === tipo);
  if (custom) return { id, nombre: custom.nombre, tagClass: "otros" };
  // Ids retirados del catálogo (datos históricos) conservan nombre legible.
  return { id, nombre: catNombre(id), tagClass: "otros" };
}

// ---------- Iglesia ----------

export async function getOrCreateChurch(): Promise<Church> {
  const d = await getDb();
  const rows = await d.select<Church[]>("SELECT * FROM churches ORDER BY id LIMIT 1");
  if (rows.length > 0) return rows[0];
  await d.execute(
    "INSERT INTO churches (nombre, ciudad, pais, moneda) VALUES ($1, $2, $3, $4)",
    ["Mi Iglesia", "", "", "USD"]
  );
  const created = await d.select<Church[]>("SELECT * FROM churches ORDER BY id LIMIT 1");
  return created[0];
}

export interface ChurchUpdate {
  nombre: string;
  ciudad?: string | null;
  pais?: string | null;
  moneda: string;
  logo_path?: string | null;
  tesorero_nombre?: string | null;
  tesorero_cargo?: string | null;
  tesorero_email?: string | null;
  tesorero_telefono?: string | null;
  tesorero_firma_path?: string | null;
}

export async function updateChurch(id: number, c: ChurchUpdate): Promise<Church> {
  const d = await getDb();
  await d.execute(
    `UPDATE churches SET
       nombre = $1, ciudad = $2, pais = $3, moneda = $4, logo_path = $5,
       tesorero_nombre = $6, tesorero_cargo = $7, tesorero_email = $8,
       tesorero_telefono = $9, tesorero_firma_path = $10
     WHERE id = $11`,
    [
      c.nombre, c.ciudad ?? null, c.pais ?? null, c.moneda, c.logo_path ?? null,
      c.tesorero_nombre ?? null, c.tesorero_cargo ?? null, c.tesorero_email ?? null,
      c.tesorero_telefono ?? null, c.tesorero_firma_path ?? null,
      id,
    ]
  );
  const rows = await d.select<Church[]>("SELECT * FROM churches WHERE id = $1", [id]);
  return rows[0];
}

// ---------- Movimientos ----------

export interface NewTx {
  tipo: "ingreso" | "gasto";
  categoria: string;
  subcategoria?: string | null;
  concepto: string;
  detalle?: string | null;
  fecha: string;
  monto: number;
  metodo_pago: string;
  member_id?: number | null;
  beneficiario?: string | null;
  beneficiario_rfc?: string | null;
  emitir_constancia?: boolean;
  notas?: string | null;
  estado?: "pendiente" | "aprobado";
  comprobante_path?: string | null;
}

export async function insertTx(churchId: number, moneda: string, tx: NewTx): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO transactions
      (church_id, tipo, categoria, subcategoria, concepto, detalle, fecha, monto, moneda, metodo_pago,
       member_id, beneficiario, beneficiario_rfc, emitir_constancia, notas, estado, comprobante_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      churchId,
      tx.tipo,
      tx.categoria,
      tx.subcategoria ?? null,
      tx.concepto,
      tx.detalle ?? null,
      tx.fecha,
      tx.monto,
      moneda,
      tx.metodo_pago,
      tx.member_id ?? null,
      tx.beneficiario ?? null,
      tx.beneficiario_rfc ?? null,
      tx.emitir_constancia ? 1 : 0,
      tx.notas ?? null,
      tx.estado ?? "aprobado",
      tx.comprobante_path ?? null,
    ]
  );
}

export async function updateTx(
  id: number,
  churchId: number,
  moneda: string,
  tx: NewTx
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE transactions SET
       categoria = $1, subcategoria = $2, concepto = $3, detalle = $4, fecha = $5,
       monto = $6, moneda = $7, metodo_pago = $8, member_id = $9,
       beneficiario = $10, beneficiario_rfc = $11, emitir_constancia = $12, notas = $13, estado = $14,
       comprobante_path = $15
     WHERE id = $16 AND church_id = $17`,
    [
      tx.categoria,
      tx.subcategoria ?? null,
      tx.concepto,
      tx.detalle ?? null,
      tx.fecha,
      tx.monto,
      moneda,
      tx.metodo_pago,
      tx.member_id ?? null,
      tx.beneficiario ?? null,
      tx.beneficiario_rfc ?? null,
      tx.emitir_constancia ? 1 : 0,
      tx.notas ?? null,
      tx.estado ?? "aprobado",
      tx.comprobante_path ?? null,
      id,
      churchId,
    ]
  );
}

export async function deleteTx(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM transactions WHERE id = $1 AND church_id = $2", [id, churchId]);
}

export async function listPendingTx(churchId: number): Promise<Tx[]> {
  const d = await getDb();
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE t.church_id = $1 AND t.estado = 'pendiente'
      ORDER BY t.fecha DESC, t.id DESC`,
    [churchId]
  );
}

export async function markTxReviewed(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE transactions SET estado = 'aprobado' WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function countPendingTx(churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE church_id = $1 AND estado = 'pendiente'",
    [churchId]
  );
  return rows[0]?.n ?? 0;
}

export async function listTx(
  churchId: number,
  opts: { tipo?: "ingreso" | "gasto"; limit?: number; mes?: string } = {}
): Promise<Tx[]> {
  const d = await getDb();
  const params: unknown[] = [churchId];
  let where = "t.church_id = $1 AND t.estado != 'rechazado'";
  if (opts.tipo) {
    params.push(opts.tipo);
    where += ` AND t.tipo = $${params.length}`;
  }
  if (opts.mes) {
    params.push(opts.mes);
    where += ` AND substr(t.fecha, 1, 7) = $${params.length}`;
  }
  const limit = opts.limit ?? 200;
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE ${where}
      ORDER BY t.fecha DESC, t.id DESC
      LIMIT ${limit}`,
    params
  );
}

export interface MonthTotals {
  ingresos: number;
  gastos: number;
  porCategoriaIngreso: Record<string, number>;
  porCategoriaGasto: Record<string, number>;
  conteoCategoriaIngreso: Record<string, number>;
  conteoCategoriaGasto: Record<string, number>;
}

export async function monthTotals(churchId: number, yyyyMm: string): Promise<MonthTotals> {
  const d = await getDb();
  const rows = await d.select<{ tipo: string; categoria: string; total: number; cnt: number }[]>(
    `SELECT tipo, categoria, SUM(monto) AS total, COUNT(*) AS cnt
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 7) = $2
      GROUP BY tipo, categoria`,
    [churchId, yyyyMm]
  );
  const out: MonthTotals = {
    ingresos: 0, gastos: 0,
    porCategoriaIngreso: {}, porCategoriaGasto: {},
    conteoCategoriaIngreso: {}, conteoCategoriaGasto: {},
  };
  for (const r of rows) {
    if (r.tipo === "ingreso") {
      out.ingresos += r.total;
      out.porCategoriaIngreso[r.categoria] = (out.porCategoriaIngreso[r.categoria] ?? 0) + r.total;
      out.conteoCategoriaIngreso[r.categoria] = (out.conteoCategoriaIngreso[r.categoria] ?? 0) + r.cnt;
    } else {
      out.gastos += r.total;
      out.porCategoriaGasto[r.categoria] = (out.porCategoriaGasto[r.categoria] ?? 0) + r.total;
      out.conteoCategoriaGasto[r.categoria] = (out.conteoCategoriaGasto[r.categoria] ?? 0) + r.cnt;
    }
  }
  return out;
}

// ---------- Depósitos bancarios ----------

export interface Deposito {
  id: number;
  church_id: number;
  fecha: string; // "YYYY-MM-DD"
  periodo: string; // "YYYY-MM"
  monto: number;
  moneda: string;
  cuenta_banco: string;
  referencia: string | null;
  comprobante_path: string | null;
  notas: string | null;
}

export interface NewDeposito {
  fecha: string;
  periodo: string;
  monto: number;
  cuenta_banco: string;
  referencia?: string | null;
  comprobante_path?: string | null;
  notas?: string | null;
}

export async function listDepositos(churchId: number, opts: { limit?: number } = {}): Promise<Deposito[]> {
  const d = await getDb();
  const limit = opts.limit ?? 300;
  return d.select<Deposito[]>(
    `SELECT * FROM depositos_bancarios WHERE church_id = $1 ORDER BY fecha DESC, id DESC LIMIT ${limit}`,
    [churchId]
  );
}

/** true si ya existe un depósito con la misma fecha, monto y cuenta/banco —
 *  usado para evitar registrar el mismo depósito por accidente dos veces. */
export async function findDuplicateDeposito(
  churchId: number,
  fecha: string,
  monto: number,
  cuentaBanco: string,
  excludeId?: number
): Promise<boolean> {
  const d = await getDb();
  const params: unknown[] = [churchId, fecha, monto, cuentaBanco.trim()];
  let where = "church_id = $1 AND fecha = $2 AND monto = $3 AND cuenta_banco = $4";
  if (excludeId != null) {
    params.push(excludeId);
    where += ` AND id != $${params.length}`;
  }
  const rows = await d.select<{ n: number }[]>(
    `SELECT count(*) AS n FROM depositos_bancarios WHERE ${where}`,
    params
  );
  return (rows[0]?.n ?? 0) > 0;
}

export async function insertDeposito(churchId: number, moneda: string, dep: NewDeposito): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO depositos_bancarios
      (church_id, fecha, periodo, monto, moneda, cuenta_banco, referencia, comprobante_path, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      churchId,
      dep.fecha,
      dep.periodo,
      dep.monto,
      moneda,
      dep.cuenta_banco.trim(),
      dep.referencia?.trim() || null,
      dep.comprobante_path ?? null,
      dep.notas?.trim() || null,
    ]
  );
}

export async function updateDeposito(id: number, churchId: number, moneda: string, dep: NewDeposito): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE depositos_bancarios SET
       fecha = $1, periodo = $2, monto = $3, moneda = $4, cuenta_banco = $5,
       referencia = $6, comprobante_path = $7, notas = $8
     WHERE id = $9 AND church_id = $10`,
    [
      dep.fecha,
      dep.periodo,
      dep.monto,
      moneda,
      dep.cuenta_banco.trim(),
      dep.referencia?.trim() || null,
      dep.comprobante_path ?? null,
      dep.notas?.trim() || null,
      id,
      churchId,
    ]
  );
}

export async function deleteDeposito(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM depositos_bancarios WHERE id = $1 AND church_id = $2", [id, churchId]);
}

export async function monthDepositos(churchId: number, yyyyMm: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ total: number | null }[]>(
    "SELECT SUM(monto) AS total FROM depositos_bancarios WHERE church_id = $1 AND periodo = $2",
    [churchId, yyyyMm]
  );
  return rows[0]?.total ?? 0;
}

export async function yearDepositos(churchId: number, yyyy: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ total: number | null }[]>(
    "SELECT SUM(monto) AS total FROM depositos_bancarios WHERE church_id = $1 AND substr(periodo, 1, 4) = $2",
    [churchId, yyyy]
  );
  return rows[0]?.total ?? 0;
}

export async function countDepositos(churchId: number, yyyyMm: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM depositos_bancarios WHERE church_id = $1 AND periodo = $2",
    [churchId, yyyyMm]
  );
  return rows[0]?.n ?? 0;
}

export interface YearTotals {
  ingresos: number;
  gastos: number;
}

export async function yearTotals(churchId: number, yyyy: string): Promise<YearTotals> {
  const d = await getDb();
  const rows = await d.select<{ tipo: string; total: number }[]>(
    `SELECT tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2
      GROUP BY tipo`,
    [churchId, yyyy]
  );
  const out: YearTotals = { ingresos: 0, gastos: 0 };
  for (const r of rows) {
    if (r.tipo === "ingreso") out.ingresos = r.total;
    else out.gastos = r.total;
  }
  return out;
}

export interface DailyPoint {
  fecha: string;
  ingresos: number;
  gastos: number;
}

export async function dailyTotals(churchId: number, days: number): Promise<DailyPoint[]> {
  const d = await getDb();
  const p = (x: number) => String(x).padStart(2, "0");
  const fmt = (dt: Date) => `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const startStr = fmt(start);

  const rows = await d.select<{ fecha: string; tipo: string; total: number }[]>(
    `SELECT substr(fecha, 1, 10) AS fecha, tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 10) >= $2
      GROUP BY fecha, tipo`,
    [churchId, startStr]
  );
  const map = new Map<string, { ingresos: number; gastos: number }>();
  for (const r of rows) {
    const entry = map.get(r.fecha) ?? { ingresos: 0, gastos: 0 };
    if (r.tipo === "ingreso") entry.ingresos += r.total;
    else entry.gastos += r.total;
    map.set(r.fecha, entry);
  }
  const out: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + i);
    const key = fmt(dt);
    out.push({ fecha: key, ...(map.get(key) ?? { ingresos: 0, gastos: 0 }) });
  }
  return out;
}

export interface MonthSummary {
  mes: string;
  ingresos: number;
  gastos: number;
}

export async function monthlySummary(churchId: number, months: number): Promise<MonthSummary[]> {
  const d = await getDb();
  const rows = await d.select<{ mes: string; tipo: string; total: number }[]>(
    `SELECT substr(fecha, 1, 7) AS mes, tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado'
      GROUP BY mes, tipo`,
    [churchId]
  );
  const map = new Map<string, { ingresos: number; gastos: number }>();
  for (const r of rows) {
    const entry = map.get(r.mes) ?? { ingresos: 0, gastos: 0 };
    if (r.tipo === "ingreso") entry.ingresos += r.total;
    else entry.gastos += r.total;
    map.set(r.mes, entry);
  }
  const meses = [...map.keys()].sort().slice(-months);
  return meses.map((mes) => ({ mes, ...(map.get(mes) as { ingresos: number; gastos: number }) }));
}

/** Resumen mensual de un año completo (solo meses con movimientos). */
export async function yearMonthlySummary(churchId: number, yyyy: string): Promise<MonthSummary[]> {
  const d = await getDb();
  const rows = await d.select<{ mes: string; tipo: string; total: number }[]>(
    `SELECT substr(fecha, 1, 7) AS mes, tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2
      GROUP BY mes, tipo`,
    [churchId, yyyy]
  );
  const map = new Map<string, { ingresos: number; gastos: number }>();
  for (const r of rows) {
    const entry = map.get(r.mes) ?? { ingresos: 0, gastos: 0 };
    if (r.tipo === "ingreso") entry.ingresos += r.total;
    else entry.gastos += r.total;
    map.set(r.mes, entry);
  }
  return [...map.keys()].sort().map((mes) => ({ mes, ...(map.get(mes) as { ingresos: number; gastos: number }) }));
}

export interface YearCategorias {
  porCategoriaIngreso: Record<string, number>;
  porCategoriaGasto: Record<string, number>;
}

/** Totales del año agrupados por categoría, para el reporte anual. */
export async function yearCategoriaTotals(churchId: number, yyyy: string): Promise<YearCategorias> {
  const d = await getDb();
  const rows = await d.select<{ tipo: string; categoria: string; total: number }[]>(
    `SELECT tipo, categoria, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2
      GROUP BY tipo, categoria`,
    [churchId, yyyy]
  );
  const out: YearCategorias = { porCategoriaIngreso: {}, porCategoriaGasto: {} };
  for (const r of rows) {
    if (r.tipo === "ingreso") out.porCategoriaIngreso[r.categoria] = r.total;
    else out.porCategoriaGasto[r.categoria] = r.total;
  }
  return out;
}

export interface MemberStat {
  totalAnio: number;
  ultimoAporte: string | null;
}

export async function memberStats(churchId: number, yyyy: string): Promise<Record<number, MemberStat>> {
  const d = await getDb();
  const totals = await d.select<{ member_id: number; total: number }[]>(
    `SELECT member_id, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND tipo = 'ingreso'
        AND member_id IS NOT NULL AND substr(fecha, 1, 4) = $2
      GROUP BY member_id`,
    [churchId, yyyy]
  );
  const ultimos = await d.select<{ member_id: number; ultimo: string }[]>(
    `SELECT member_id, MAX(fecha) AS ultimo
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND tipo = 'ingreso' AND member_id IS NOT NULL
      GROUP BY member_id`,
    [churchId]
  );
  const out: Record<number, MemberStat> = {};
  for (const r of totals) out[r.member_id] = { totalAnio: r.total, ultimoAporte: null };
  for (const r of ultimos) {
    out[r.member_id] = { totalAnio: out[r.member_id]?.totalAnio ?? 0, ultimoAporte: r.ultimo };
  }
  return out;
}

/** Aportes (ingresos aprobados) de un miembro en un año, más recientes primero. */
export async function listMemberAportes(memberId: number, churchId: number, yyyy: string): Promise<Tx[]> {
  const d = await getDb();
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE t.church_id = $1 AND t.member_id = $2 AND t.tipo = 'ingreso'
        AND t.estado = 'aprobado' AND substr(t.fecha, 1, 4) = $3
      ORDER BY t.fecha DESC, t.id DESC`,
    [churchId, memberId, yyyy]
  );
}

/** Años (desc) en los que un miembro tiene aportes registrados. */
export async function memberAporteYears(memberId: number, churchId: number): Promise<string[]> {
  const d = await getDb();
  const rows = await d.select<{ anio: string }[]>(
    `SELECT DISTINCT substr(fecha, 1, 4) AS anio
       FROM transactions
      WHERE church_id = $1 AND member_id = $2 AND tipo = 'ingreso' AND estado = 'aprobado'
      ORDER BY anio DESC`,
    [churchId, memberId]
  );
  return rows.map((r) => r.anio);
}

export async function lastActivityAt(churchId: number): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<{ m: string | null }[]>(
    "SELECT MAX(created_at) AS m FROM transactions WHERE church_id = $1",
    [churchId]
  );
  return rows[0]?.m ?? null;
}

// ---------- Usuarios (directorio administrativo) ----------
//
// Directorio de personas que administran la iglesia (Tesorero, Pastor,
// Secretario, Auditor, Consejo...). Todavía NO hay autenticación ni
// backend — esto es solo el directorio/datos, preparado para que el
// futuro sistema de login se conecte aquí sin rediseñar el modelo.

export const ROLES_USUARIO = [
  { id: "tesorero", nombre: "Tesorero" },
  { id: "pastor", nombre: "Pastor" },
  { id: "secretario", nombre: "Secretario" },
  { id: "auditor", nombre: "Auditor" },
  { id: "consejo", nombre: "Consejo administrativo" },
  { id: "otro", nombre: "Otro" },
] as const;

export interface Usuario {
  id: number;
  church_id: number;
  nombre: string;
  rol: string;
  email: string | null;
  telefono: string | null;
  notas: string | null;
}

export interface NewUsuario {
  nombre: string;
  rol: string;
  email?: string | null;
  telefono?: string | null;
  notas?: string | null;
}

export async function listUsuarios(churchId: number): Promise<Usuario[]> {
  const d = await getDb();
  return d.select<Usuario[]>("SELECT * FROM usuarios WHERE church_id = $1 ORDER BY nombre", [churchId]);
}

export async function insertUsuario(churchId: number, u: NewUsuario): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO usuarios (church_id, nombre, rol, email, telefono, notas) VALUES ($1,$2,$3,$4,$5,$6)`,
    [churchId, u.nombre.trim(), u.rol, u.email?.trim() || null, u.telefono?.trim() || null, u.notas?.trim() || null]
  );
}

export async function updateUsuario(id: number, churchId: number, u: NewUsuario): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE usuarios SET nombre = $1, rol = $2, email = $3, telefono = $4, notas = $5 WHERE id = $6 AND church_id = $7`,
    [u.nombre.trim(), u.rol, u.email?.trim() || null, u.telefono?.trim() || null, u.notas?.trim() || null, id, churchId]
  );
}

export async function deleteUsuario(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM usuarios WHERE id = $1 AND church_id = $2", [id, churchId]);
}

// ---------- Miembros ----------

export async function listMembers(churchId: number): Promise<Member[]> {
  const d = await getDb();
  return d.select<Member[]>(
    "SELECT * FROM members WHERE church_id = $1 AND activo = 1 ORDER BY nombre",
    [churchId]
  );
}

export interface NewMember {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  etiquetas?: string[];
  fecha_ingreso?: string | null;
  notas?: string | null;
}

export async function insertMember(churchId: number, m: NewMember): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO members (church_id, nombre, email, telefono, rfc, etiquetas, fecha_ingreso, notas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      churchId,
      m.nombre,
      m.email ?? null,
      m.telefono ?? null,
      m.rfc ?? null,
      JSON.stringify(m.etiquetas ?? []),
      m.fecha_ingreso ?? null,
      m.notas ?? null,
    ]
  );
}

export async function updateMember(id: number, churchId: number, m: NewMember): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE members SET nombre = $1, email = $2, telefono = $3, rfc = $4, notas = $5
     WHERE id = $6 AND church_id = $7`,
    [m.nombre, m.email ?? null, m.telefono ?? null, m.rfc ?? null, m.notas ?? null, id, churchId]
  );
}

export async function archiveMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE members SET activo = 0 WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function listArchivedMembers(churchId: number): Promise<Member[]> {
  const d = await getDb();
  return d.select<Member[]>(
    "SELECT * FROM members WHERE church_id = $1 AND activo = 0 ORDER BY nombre",
    [churchId]
  );
}

export async function restoreMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE members SET activo = 1 WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** TODOS los movimientos (incluidos pendientes y rechazados), para respaldo. */
export async function listAllTxForExport(churchId: number): Promise<Tx[]> {
  const d = await getDb();
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE t.church_id = $1
      ORDER BY t.fecha ASC, t.id ASC`,
    [churchId]
  );
}

export async function countMemberTx(memberId: number, churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE member_id = $1 AND church_id = $2",
    [memberId, churchId]
  );
  return rows[0]?.n ?? 0;
}

export async function deleteMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM members WHERE id = $1 AND church_id = $2", [id, churchId]);
}

// ---------- Gastos fijos recurrentes ----------
//
// El usuario define el gasto una sola vez ("Gasto fijo recurrente" en el
// modal de Nuevo gasto); la definición se guarda aquí y se MATERIALIZA como
// transacciones normales, una por mes, SOLO para meses ya concluidos:
// desde enero (del año de la fecha elegida) hasta el mes pasado. El mes en
// curso no se contabiliza hasta que termina — se registra automáticamente
// la primera vez que la app se abre en el mes siguiente. Nunca se generan
// meses futuros. ultimo_mes_generado hace la operación idempotente.

export interface GastoRecurrente {
  id: number;
  church_id: number;
  categoria: string;
  subcategoria: string | null;
  concepto: string;
  detalle: string | null;
  monto: number;
  metodo_pago: string;
  beneficiario: string | null;
  beneficiario_rfc: string | null;
  /** Día del mes en que se registra (se ajusta en meses cortos). */
  dia: number;
  /** Primer mes a generar, "YYYY-MM". */
  mes_inicio: string;
  /** Último mes ya insertado como transacción, "YYYY-MM". */
  ultimo_mes_generado: string | null;
}

export interface NewGastoRecurrente {
  categoria: string;
  subcategoria?: string | null;
  concepto: string;
  detalle?: string | null;
  monto: number;
  metodo_pago: string;
  beneficiario?: string | null;
  beneficiario_rfc?: string | null;
  dia: number;
  mes_inicio: string;
}

/** Meses "YYYY-MM" desde inicio hasta fin, ambos inclusive. */
export function mesesEntre(inicio: string, fin: string): string[] {
  const out: string[] = [];
  let m = inicio;
  while (m <= fin) {
    out.push(m);
    m = nextMonth(m);
  }
  return out;
}

/** Fecha "YYYY-MM-DD 12:00" para un mes dado, ajustando el día a la
 *  longitud del mes (día 31 → 28/29 en febrero, etc.). */
export function fechaEnMes(yyyyMm: string, dia: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const d = Math.min(dia, ultimoDia);
  return `${yyyyMm}-${String(d).padStart(2, "0")} 12:00`;
}

/** Meses pendientes de generar para una definición, con la regla de
 *  "solo meses concluidos": la ventana termina en el mes pasado, nunca en
 *  el mes en curso. `skipMes` cubre el caso de convertir en recurrente un
 *  gasto ya registrado: ese mes se considera cubierto (marcaHasta) para
 *  que no se duplique cuando concluya. Pura, para poder probarla. */
export function mesesPendientesRecurrente(
  mesInicio: string,
  ultimoMesGenerado: string | null,
  hoyMes: string,
  skipMes?: string
): { meses: string[]; marcaHasta: string } {
  const hastaMes = prevMonth(hoyMes);
  const desde = ultimoMesGenerado ? nextMonth(ultimoMesGenerado) : mesInicio;
  const meses = mesesEntre(desde, hastaMes).filter((m) => m !== skipMes);
  const marcaHasta = skipMes && skipMes > hastaMes ? skipMes : hastaMes;
  return { meses, marcaHasta };
}

async function materializarDef(
  d: Awaited<ReturnType<typeof getDb>>,
  def: GastoRecurrente,
  moneda: string,
  skipMes?: string
): Promise<number> {
  const { meses, marcaHasta } = mesesPendientesRecurrente(
    def.mes_inicio, def.ultimo_mes_generado, currentMonth(), skipMes
  );
  for (const mes of meses) {
    await d.execute(
      `INSERT INTO transactions
        (church_id, tipo, categoria, subcategoria, concepto, detalle, fecha, monto, moneda, metodo_pago,
         member_id, beneficiario, beneficiario_rfc, emitir_constancia, notas, estado, comprobante_path)
       VALUES ($1,'gasto',$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,0,NULL,'aprobado',NULL)`,
      [
        def.church_id, def.categoria, def.subcategoria, def.concepto, def.detalle,
        fechaEnMes(mes, def.dia), def.monto, moneda, def.metodo_pago,
        def.beneficiario, def.beneficiario_rfc,
      ]
    );
  }
  await d.execute(
    "UPDATE gastos_recurrentes SET ultimo_mes_generado = $1 WHERE id = $2",
    [marcaHasta, def.id]
  );
  return meses.length;
}

/** Crea la definición y registra de inmediato los meses transcurridos
 *  (enero→mes actual). Devuelve cuántos meses se registraron. */
export async function insertGastoRecurrente(
  churchId: number,
  moneda: string,
  g: NewGastoRecurrente,
  /** Mes "YYYY-MM" que NO debe generarse (cuando el gasto de ese mes ya
   *  existe — p. ej. al convertir en recurrente un gasto ya registrado). */
  skipMes?: string
): Promise<number> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO gastos_recurrentes
      (church_id, categoria, subcategoria, concepto, detalle, monto, metodo_pago,
       beneficiario, beneficiario_rfc, dia, mes_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      churchId, g.categoria, g.subcategoria ?? null, g.concepto, g.detalle ?? null,
      g.monto, g.metodo_pago, g.beneficiario ?? null, g.beneficiario_rfc ?? null,
      g.dia, g.mes_inicio,
    ]
  );
  const rows = await d.select<GastoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 ORDER BY id DESC LIMIT 1",
    [churchId]
  );
  return materializarDef(d, rows[0], moneda, skipMes);
}

/** Registra los meses que hayan llegado desde la última apertura de la app,
 *  para todas las definiciones activas. Idempotente. */
export async function materializeGastosRecurrentes(churchId: number, moneda: string): Promise<number> {
  const d = await getDb();
  const hastaMes = currentMonth();
  const defs = await d.select<GastoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 AND (ultimo_mes_generado IS NULL OR ultimo_mes_generado < $2)",
    [churchId, prevMonth(hastaMes)]
  );
  let total = 0;
  for (const def of defs) {
    total += await materializarDef(d, def, moneda);
  }
  return total;
}

export async function listGastosRecurrentes(churchId: number): Promise<GastoRecurrente[]> {
  const d = await getDb();
  return d.select<GastoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 ORDER BY concepto",
    [churchId]
  );
}

/** Elimina la definición: deja de generar meses nuevos. Las transacciones
 *  ya registradas se conservan (son historial contable real). */
export async function deleteGastoRecurrente(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM gastos_recurrentes WHERE id = $1 AND church_id = $2", [id, churchId]);
}

// ---------- Formato ----------

export function fmtMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function nowLocalIso(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function currentMonth(): string {
  return nowLocalIso().slice(0, 7);
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}

export function prevMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function pctChange(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

const MESES: Record<"es" | "en", string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio",
       "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June",
       "July", "August", "September", "October", "November", "December"],
};
const MESES_ABBR: Record<"es" | "en", string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const DIAS: Record<"es" | "en", string[]> = {
  es: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** "13 jul 2026" en español, "Jul 13, 2026" en inglés. */
export function fmtFechaCorta(fecha: string): string {
  const [datePart] = fecha.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const lang = currentLang();
  return lang === "en" ? `${MESES_ABBR.en[m - 1]} ${d}, ${y}` : `${d} ${MESES_ABBR.es[m - 1]} ${y}`;
}

export function fmtRelativo(fechaIso: string | null): string {
  if (!fechaIso) return i18n.t("fechas.sinActividad");
  const then = new Date(fechaIso.replace(" ", "T"));
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return i18n.t("fechas.haceMomento");
  if (diffMin < 60) return i18n.t("fechas.haceMin", { n: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return i18n.t("fechas.haceHoras", { n: diffH });
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return i18n.t("fechas.ayer");
  if (diffD < 7) return i18n.t("fechas.haceDias", { n: diffD });
  return fmtFechaCorta(fechaIso);
}

export function fmtFecha(fecha: string): { dia: string; mesAnio: string; nombreDia: string; hora: string } {
  const [datePart, timePart] = fecha.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const lang = currentLang();
  const mes = MESES[lang][m - 1];
  return {
    dia: String(d),
    mesAnio: `${mes[0].toUpperCase()}${mes.slice(1)} ${y}`,
    nombreDia: DIAS[lang][dt.getDay()],
    hora: timePart ?? "",
  };
}

/** "Julio 2026" en español, "July 2026" en inglés. */
export function mesLegible(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const lang = currentLang();
  const mes = MESES[lang][m - 1];
  return `${mes[0].toUpperCase()}${mes.slice(1)} ${y}`;
}
