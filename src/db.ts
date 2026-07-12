import Database from "@tauri-apps/plugin-sql";

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
  { id: "pastores", nombre: "Compensación pastoral", tagClass: "pastores", color: "#9f1239" },
  { id: "musicos", nombre: "Suministros", tagClass: "musicos", color: "#1d4ed8" },
  { id: "administracion", nombre: "Misceláneos", tagClass: "administracion", color: "#374151" },
  { id: "limpieza", nombre: "Limpieza", tagClass: "limpieza", color: "#0f766e" },
  { id: "servicios", nombre: "Servicios", tagClass: "servicios", color: "#92400e" },
  { id: "mantenimiento", nombre: "Mantenimiento", tagClass: "mantenimiento", color: "#57534e" },
  { id: "eventos", nombre: "Comida", tagClass: "eventos", color: "#9a3412" },
  { id: "materiales", nombre: "Materiales", tagClass: "materiales", color: "#3730a3" },
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

export function categoriaInfo(tipo: "ingreso" | "gasto", id: string) {
  const list: readonly { id: string; nombre: string; tagClass: string }[] =
    tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;
  return list.find((c) => c.id === id) ?? { id, nombre: id, tagClass: "otros" };
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
}

export async function updateChurch(id: number, c: ChurchUpdate): Promise<Church> {
  const d = await getDb();
  await d.execute(
    "UPDATE churches SET nombre = $1, ciudad = $2, pais = $3, moneda = $4 WHERE id = $5",
    [c.nombre, c.ciudad ?? null, c.pais ?? null, c.moneda, id]
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
  opts: { tipo?: "ingreso" | "gasto"; limit?: number } = {}
): Promise<Tx[]> {
  const d = await getDb();
  const params: unknown[] = [churchId];
  let where = "t.church_id = $1 AND t.estado != 'rechazado'";
  if (opts.tipo) {
    params.push(opts.tipo);
    where += ` AND t.tipo = $${params.length}`;
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
}

export async function monthTotals(churchId: number, yyyyMm: string): Promise<MonthTotals> {
  const d = await getDb();
  const rows = await d.select<{ tipo: string; categoria: string; total: number }[]>(
    `SELECT tipo, categoria, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 7) = $2
      GROUP BY tipo, categoria`,
    [churchId, yyyyMm]
  );
  const out: MonthTotals = { ingresos: 0, gastos: 0, porCategoriaIngreso: {}, porCategoriaGasto: {} };
  for (const r of rows) {
    if (r.tipo === "ingreso") {
      out.ingresos += r.total;
      out.porCategoriaIngreso[r.categoria] = (out.porCategoriaIngreso[r.categoria] ?? 0) + r.total;
    } else {
      out.gastos += r.total;
      out.porCategoriaGasto[r.categoria] = (out.porCategoriaGasto[r.categoria] ?? 0) + r.total;
    }
  }
  return out;
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

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function fmtFecha(fecha: string): { dia: string; mesAnio: string; nombreDia: string; hora: string } {
  const [datePart, timePart] = fecha.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dia: String(d),
    mesAnio: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`,
    nombreDia: DIAS[dt.getDay()],
    hora: timePart ?? "",
  };
}

export function mesLegible(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`;
}
