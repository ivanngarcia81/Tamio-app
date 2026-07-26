import Database from "./dbmotor";
import i18n, { currentLang } from "./i18n";
import { currencySymbol } from "./currencies";
import { RECURRENCIA_NINGUNA, parseExcepciones, parseRecurrencia } from "./services/agenda/recurrencia";

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
  pastor_nombre: string | null;
  pastor_cargo: string | null;
  pastor_email: string | null;
  pastor_telefono: string | null;
  pastor_firma_path: string | null;
  /** Datos institucionales para el membrete de cartas y documentos. */
  direccion: string | null;
  region: string | null;
  telefono: string | null;
  email: string | null;
  pie_institucional: string | null;
  secretaria_nombre: string | null;
  secretaria_cargo: string | null;
  /** Suscripción (migración v31). plan: completo | tesoreria | secretaria.
   *  sub_estado: activa | cortesia | prueba | vencida. sub_vence: fecha ISO o null.
   *  Por defecto completo/activa para no alterar instalaciones existentes. */
  plan: string;
  sub_estado: string;
  sub_vence: string | null;
  /** Saldo de apertura (migración v34): dinero en caja ANTES del primer
   *  movimiento registrado en Tamio. Se suma al acumulado de movimientos para
   *  el "saldo anterior" del estado financiero. 0 = arrancó de cero. */
  saldo_inicial: number;
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
  /** Fecha en que se registró el miembro en la app (SELECT * la trae). */
  created_at: string;
  /** 1 = activo, 0 = dado de baja (o archivado desde Tesorería). */
  activo: number;
  fecha_baja: string | null;
  /** Clave predefinida (traslado, fallecimiento, retiro, disciplina) o texto libre. */
  motivo_baja: string | null;
  /** Estado dentro del registro (miembros con activo = 1): activo | inactivo | visitante.
   *  Trasladado y fallecido se representan como baja con ese motivo. */
  estado_membresia: string;
  /** Fecha en que comenzó a congregarse (fecha_ingreso = recibido como miembro). */
  fecha_congregacion: string | null;
  iglesia_anterior: string | null;
  bautizado_agua: number;
  fecha_bautismo_agua: string | null;
  bautizado_espiritu: number;
  fecha_bautismo_espiritu: string | null;
  curso_membresia: number;
  /** Arreglos JSON de claves de catálogo o texto libre. */
  ministerios: string;
  ministerios_interes: string;
  instrumentos: string;
  habilidades: string;
  disponibilidad: string | null;
  interes_servir: number;
  /** Arreglo JSON de cargos/funciones (claves de catálogo o texto libre). */
  cargos: string;
  /** Arreglo JSON de {de, a, fecha} — cambios de estado de membresía. */
  historial_estados: string;
  /** Seguimiento pastoral/secretarial (v20). Nunca toca lo financiero. */
  seguimiento_revisado_en: string | null;
  /** Arreglo JSON de {fecha, texto}. */
  seguimiento_notas: string;
}

/** Campos de la ficha del miembro (secciones Membresía / Espiritual / Servicio). */
export interface MemberFicha {
  estado_membresia: string;
  cargos: string[];
  fecha_congregacion: string | null;
  fecha_ingreso: string | null;
  iglesia_anterior: string | null;
  bautizado_agua: boolean;
  fecha_bautismo_agua: string | null;
  bautizado_espiritu: boolean;
  fecha_bautismo_espiritu: string | null;
  curso_membresia: boolean;
  ministerios: string[];
  ministerios_interes: string[];
  instrumentos: string[];
  habilidades: string[];
  disponibilidad: string | null;
  interes_servir: boolean;
}

export async function updateMemberFicha(id: number, churchId: number, f: MemberFicha): Promise<void> {
  const d = await getDb();
  // El cambio de estado dentro del registro (activo/inactivo/visitante/enProceso)
  // también queda en el historial del miembro.
  const prev = await d.select<{ estado_membresia: string; activo: number }[]>(
    "SELECT estado_membresia, activo FROM members WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  if (prev[0]?.activo === 1 && prev[0].estado_membresia !== f.estado_membresia) {
    await registrarCambioEstadoMiembro(id, churchId, prev[0].estado_membresia, f.estado_membresia);
  }
  await d.execute(
    `UPDATE members SET
       estado_membresia = $1, fecha_congregacion = $2, fecha_ingreso = $3, iglesia_anterior = $4,
       bautizado_agua = $5, fecha_bautismo_agua = $6, bautizado_espiritu = $7, fecha_bautismo_espiritu = $8,
       curso_membresia = $9, ministerios = $10, ministerios_interes = $11, instrumentos = $12,
       habilidades = $13, disponibilidad = $14, interes_servir = $15, cargos = $18,
       updated_at = datetime('now')
     WHERE id = $16 AND church_id = $17`,
    [
      f.estado_membresia,
      f.fecha_congregacion,
      f.fecha_ingreso,
      f.iglesia_anterior,
      f.bautizado_agua ? 1 : 0,
      f.fecha_bautismo_agua,
      f.bautizado_espiritu ? 1 : 0,
      f.fecha_bautismo_espiritu,
      f.curso_membresia ? 1 : 0,
      JSON.stringify(f.ministerios),
      JSON.stringify(f.ministerios_interes),
      JSON.stringify(f.instrumentos),
      JSON.stringify(f.habilidades),
      f.disponibilidad,
      f.interes_servir ? 1 : 0,
      id,
      churchId,
      JSON.stringify(f.cargos),
    ]
  );
}

// ---------- Seguimiento pastoral y secretarial (v20) ----------

export interface NotaSeguimiento {
  fecha: string;
  texto: string;
}

export async function marcarMiembroRevisado(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE members SET seguimiento_revisado_en = $1, updated_at = datetime('now') WHERE id = $2 AND church_id = $3",
    [nowLocalIso(), id, churchId]
  );
}

export async function agregarNotaSeguimiento(id: number, churchId: number, texto: string): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ seguimiento_notas: string }[]>(
    "SELECT seguimiento_notas FROM members WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  let notas: NotaSeguimiento[] = [];
  try { notas = JSON.parse(rows[0]?.seguimiento_notas ?? "[]"); } catch { /* noop */ }
  notas.push({ fecha: nowLocalIso(), texto });
  await d.execute(
    "UPDATE members SET seguimiento_notas = $1, updated_at = datetime('now') WHERE id = $2 AND church_id = $3",
    [JSON.stringify(notas), id, churchId]
  );
}

// ---------- Cargas para Informes de membresía (solo lectura, sin finanzas) ----------

export interface ServicioLigero {
  id: number;
  fecha: string;
  tipo: string;
}

export interface AsistenciaLigera {
  servicio_id: number;
  member_id: number;
  presente: number;
  fecha: string;
}

export async function listServiciosLigero(churchId: number, desde?: string | null, hasta?: string | null): Promise<ServicioLigero[]> {
  const d = await getDb();
  return d.select<ServicioLigero[]>(
    `SELECT id, fecha, tipo FROM servicios
      WHERE church_id = $1 AND deleted = 0 AND ($2 IS NULL OR fecha >= $2) AND ($3 IS NULL OR fecha <= $3)
      ORDER BY fecha DESC, id DESC`,
    [churchId, desde ?? null, hasta ?? null]
  );
}

export async function listAsistenciaLigera(churchId: number, desde?: string | null, hasta?: string | null): Promise<AsistenciaLigera[]> {
  const d = await getDb();
  return d.select<AsistenciaLigera[]>(
    `SELECT a.servicio_id, a.member_id, a.presente, s.fecha
       FROM servicio_asistencia a
       JOIN servicios s ON s.id = a.servicio_id
      WHERE s.church_id = $1 AND s.deleted = 0 AND a.deleted = 0 AND ($2 IS NULL OR s.fecha >= $2) AND ($3 IS NULL OR s.fecha <= $3)
      ORDER BY s.fecha DESC, s.id DESC`,
    [churchId, desde ?? null, hasta ?? null]
  );
}

// ---------- Umbrales de informes (configurables, v20) ----------

export async function getUmbralesJson(churchId: number): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<{ umbrales_informes: string | null }[]>(
    "SELECT umbrales_informes FROM churches WHERE id = $1",
    [churchId]
  );
  return rows[0]?.umbrales_informes ?? null;
}

export async function saveUmbralesJson(churchId: number, json: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE churches SET umbrales_informes = $1 WHERE id = $2", [json, churchId]);
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
  /** Si no es null, esta transacción la generó un movimiento recurrente
   *  (ver sección "Movimientos recurrentes" más abajo). */
  recurrente_id?: number | null;
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
  /** Identidad global estable entre equipos (para sincronizar). */
  uid: string;
}

/** Forma unificada de categoría para la UI: integradas + personalizadas. */
export interface CategoriaUI {
  id: string;
  nombre: string;
  tagClass: string;
  color?: string;
  custom?: boolean;
  /** Solo en personalizadas: uid global (para borrarlas al sincronizar). */
  uid?: string;
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
    "SELECT * FROM categorias_custom WHERE church_id = $1 AND deleted = 0 ORDER BY nombre",
    [churchId]
  );
  setCategoriasCustomCache(rows);
  return rows;
}

/** Id textual con el que una categoría personalizada se guarda en las
 *  transacciones (p. ej. "custom-ab12…"). Usa el `uid` GLOBAL, no el id local,
 *  para que la referencia viaje bien entre equipos al sincronizar. */
export function customCatRef(uid: string): string {
  return `custom-${uid}`;
}

function customToUI(c: CategoriaCustom): CategoriaUI {
  return { id: customCatRef(c.uid), nombre: c.nombre, tagClass: "otros", color: c.color, custom: true, uid: c.uid };
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
    "INSERT INTO categorias_custom (church_id, tipo, nombre, color, uid, updated_at) VALUES ($1,$2,$3,$4,$5,datetime('now'))",
    [churchId, tipo, nombre.trim(), color, crypto.randomUUID()]
  );
  await loadCategoriasCustom(churchId);
}

/** Borrado SUAVE (deleted = 1) por uid, para que se propague en la
 *  sincronización. Las consultas ya excluyen deleted = 1. */
export async function deleteCategoriaCustom(uid: string, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE categorias_custom SET deleted = 1, updated_at = datetime('now') WHERE uid = $1 AND church_id = $2",
    [uid, churchId]
  );
  await loadCategoriasCustom(churchId);
}

/** Cuántos movimientos usan una categoría (para impedir borrar las en uso). */
export async function countTxByCategoria(churchId: number, categoriaId: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE church_id = $1 AND categoria = $2 AND deleted = 0",
    [churchId, categoriaId]
  );
  return rows[0]?.n ?? 0;
}

/** Nombre de la categoría en el idioma activo de la app. El campo `nombre`
 *  de los catálogos conserva el nombre canónico en español (se usa para
 *  emparejar archivos CSV); todo lo que se muestra en pantalla o en PDFs
 *  debe pasar por aquí. Las personalizadas usan su propio nombre tal cual. */
export function catNombre(id: string): string {
  const custom = categoriasCustomCache.find((c) => customCatRef(c.uid) === id);
  if (custom) return custom.nombre;
  return i18n.t(`cat.${id}`, { defaultValue: id });
}

export function metodoNombre(id: string): string {
  return i18n.t(`metodo.${id}`, { defaultValue: id });
}

/** Abreviatura de dos letras del distintivo de color. Vive en el catálogo de
 *  traducciones, no en METODOS_PAGO: el badge fijo "EF" quedaba en español
 *  junto al nombre ya traducido ("EF Cash"). */
export function metodoAbr(id: string): string {
  return i18n.t(`metodo.abr.${id}`, { defaultValue: id.slice(0, 2).toUpperCase() });
}

/** Los gastos llevan su color en el catálogo; los ingresos no, así que su
 *  paleta vive aquí. Fuente única para que el punto de una tarjeta, la
 *  barra de progreso y el segmento de la dona no se contradigan. */
const COLOR_INGRESO: Record<string, string> = {
  ofrenda: "#22c55e",
  diezmo: "#7c3aed",
  donacion: "#06b6d4",
  otros: "#64748b",
};

/** Color de una categoría. Gris neutro para las personalizadas y para los
 *  ids retirados del catálogo. */
export function colorCategoria(tipo: "ingreso" | "gasto", id: string): string {
  if (tipo === "ingreso") return COLOR_INGRESO[id] ?? "#64748b";
  const found = CATEGORIAS_GASTO.find((c) => c.id === id);
  return found?.color ?? "#64748b";
}

export function categoriaInfo(tipo: "ingreso" | "gasto", id: string) {
  const list: readonly { id: string; nombre: string; tagClass: string }[] =
    tipo === "ingreso" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;
  const found = list.find((c) => c.id === id);
  if (found) return { ...found, nombre: catNombre(found.id) };
  const custom = categoriasCustomCache.find((c) => customCatRef(c.uid) === id && c.tipo === tipo);
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
  pastor_nombre?: string | null;
  pastor_cargo?: string | null;
  pastor_email?: string | null;
  pastor_telefono?: string | null;
  pastor_firma_path?: string | null;
  direccion?: string | null;
  region?: string | null;
  telefono?: string | null;
  email?: string | null;
  pie_institucional?: string | null;
  secretaria_nombre?: string | null;
  secretaria_cargo?: string | null;
  saldo_inicial?: number;
}

export async function updateChurch(id: number, c: ChurchUpdate): Promise<Church> {
  const d = await getDb();
  await d.execute(
    `UPDATE churches SET
       nombre = $1, ciudad = $2, pais = $3, moneda = $4, logo_path = $5,
       tesorero_nombre = $6, tesorero_cargo = $7, tesorero_email = $8,
       tesorero_telefono = $9, tesorero_firma_path = $10,
       pastor_nombre = $11, pastor_cargo = $12, pastor_email = $13,
       pastor_telefono = $14, pastor_firma_path = $15,
       direccion = $16, region = $17, telefono = $18, email = $19,
       pie_institucional = $20, secretaria_nombre = $21, secretaria_cargo = $22,
       saldo_inicial = COALESCE($23, saldo_inicial)
     WHERE id = $24`,
    [
      c.nombre, c.ciudad ?? null, c.pais ?? null, c.moneda, c.logo_path ?? null,
      c.tesorero_nombre ?? null, c.tesorero_cargo ?? null, c.tesorero_email ?? null,
      c.tesorero_telefono ?? null, c.tesorero_firma_path ?? null,
      c.pastor_nombre ?? null, c.pastor_cargo ?? null, c.pastor_email ?? null,
      c.pastor_telefono ?? null, c.pastor_firma_path ?? null,
      c.direccion ?? null, c.region ?? null, c.telefono ?? null, c.email ?? null,
      c.pie_institucional ?? null, c.secretaria_nombre ?? null, c.secretaria_cargo ?? null,
      // null = "no tocar": COALESCE conserva el saldo de apertura ya guardado
      // cuando el llamador (p. ej. la bienvenida) no incluye el campo.
      c.saldo_inicial ?? null,
      id,
    ]
  );
  const rows = await d.select<Church[]>("SELECT * FROM churches WHERE id = $1", [id]);
  return rows[0];
}

/** Actualiza el plan y estado de suscripción de la iglesia. Separado de
 *  updateChurch porque es administración de la cuenta (no datos institucionales)
 *  y a futuro lo escribirá el webhook de pago. */
export async function updateSuscripcion(
  id: number,
  plan: string,
  subEstado: string,
  subVence: string | null,
): Promise<Church> {
  const d = await getDb();
  await d.execute(
    "UPDATE churches SET plan = $1, sub_estado = $2, sub_vence = $3 WHERE id = $4",
    [plan, subEstado, subVence ?? null, id],
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
  /** Solo lo usa internamente la reinserción de "Deshacer" para conservar
   *  el vínculo con su movimiento recurrente de origen, si tenía uno. */
  recurrente_id?: number | null;
}

export async function insertTx(churchId: number, moneda: string, tx: NewTx): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO transactions
      (church_id, tipo, categoria, subcategoria, concepto, detalle, fecha, monto, moneda, metodo_pago,
       member_id, beneficiario, beneficiario_rfc, emitir_constancia, notas, estado, comprobante_path, recurrente_id,
       uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,datetime('now'))`,
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
      tx.recurrente_id ?? null,
      crypto.randomUUID(),
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
       comprobante_path = $15, updated_at = datetime('now')
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

/** Borrado SUAVE (deleted = 1) para que el borrado se propague en la
 *  sincronización en vez de "revivir" al bajar de la nube. Todas las consultas
 *  de movimientos excluyen deleted = 1, así que desaparece de la app. */
export async function deleteTx(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE transactions SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** Deshace un borrado suave de movimiento (para el "Deshacer" del toast),
 *  conservando el mismo uid para que la sincronización lo reactive. */
export async function undeleteTx(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE transactions SET deleted = 0, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function listPendingTx(churchId: number): Promise<Tx[]> {
  const d = await getDb();
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE t.church_id = $1 AND t.estado = 'pendiente' AND t.deleted = 0
      ORDER BY t.fecha DESC, t.id DESC`,
    [churchId]
  );
}

export async function markTxReviewed(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE transactions SET estado = 'aprobado', updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function countPendingTx(churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE church_id = $1 AND estado = 'pendiente' AND deleted = 0",
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
  let where = "t.church_id = $1 AND t.estado != 'rechazado' AND t.deleted = 0";
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
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 7) = $2 AND deleted = 0
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
    `SELECT * FROM depositos_bancarios WHERE church_id = $1 AND deleted = 0 ORDER BY fecha DESC, id DESC LIMIT ${limit}`,
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
  let where = "church_id = $1 AND fecha = $2 AND monto = $3 AND cuenta_banco = $4 AND deleted = 0";
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
      (church_id, fecha, periodo, monto, moneda, cuenta_banco, referencia, comprobante_path, notas, uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,datetime('now'))`,
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
      crypto.randomUUID(),
    ]
  );
}

export async function updateDeposito(id: number, churchId: number, moneda: string, dep: NewDeposito): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE depositos_bancarios SET
       fecha = $1, periodo = $2, monto = $3, moneda = $4, cuenta_banco = $5,
       referencia = $6, comprobante_path = $7, notas = $8, updated_at = datetime('now')
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

/** Borrado SUAVE (deleted = 1) para que se propague en la sincronización. */
export async function deleteDeposito(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE depositos_bancarios SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** Deshace el borrado suave de un depósito (para el "Deshacer" del toast). */
export async function undeleteDeposito(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE depositos_bancarios SET deleted = 0, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function monthDepositos(churchId: number, yyyyMm: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ total: number | null }[]>(
    "SELECT SUM(monto) AS total FROM depositos_bancarios WHERE church_id = $1 AND periodo = $2 AND deleted = 0",
    [churchId, yyyyMm]
  );
  return rows[0]?.total ?? 0;
}

/** Depósitos bancarios del periodo, con su detalle (fecha, banco, referencia).
 *  El estado financiero mensual los lista en su propia sección; `monthDepositos`
 *  solo devuelve la suma. */
export async function listDepositosPeriodo(churchId: number, yyyyMm: string): Promise<Deposito[]> {
  const d = await getDb();
  return d.select<Deposito[]>(
    `SELECT * FROM depositos_bancarios
      WHERE church_id = $1 AND periodo = $2 AND deleted = 0
      ORDER BY fecha ASC, id ASC`,
    [churchId, yyyyMm]
  );
}

/**
 * Saldo de tesorería acumulado ANTES del periodo dado: la suma de todos los
 * ingresos menos todos los gastos aprobados con fecha anterior al primer día
 * del mes. Es el "saldo anterior" del estado financiero, y con él el saldo
 * final del reporte es un saldo real y no el resultado de un solo mes.
 *
 * Cuenta SOLO los movimientos: el dinero que había en caja antes del primer
 * registro vive en churches.saldo_inicial (migración v34). Para el saldo real
 * usa saldoAnteriorDe(), que suma ambos.
 */
export async function saldoAcumuladoAntesDe(churchId: number, yyyyMm: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ tipo: string; total: number | null }[]>(
    `SELECT tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND deleted = 0
        AND substr(fecha, 1, 7) < $2
      GROUP BY tipo`,
    [churchId, yyyyMm]
  );
  let saldo = 0;
  for (const r of rows) {
    saldo += r.tipo === "ingreso" ? (r.total ?? 0) : -(r.total ?? 0);
  }
  return saldo;
}

/**
 * Saldo REAL de la tesorería al cierre del periodo anterior:
 *
 *   saldo de apertura (churches.saldo_inicial, Configuración → Iglesia)
 * + acumulado de todos los movimientos aprobados anteriores al periodo
 *
 * Cubre los dos casos: la iglesia que arrancó en Tamio desde cero (apertura 0)
 * y la que migró con dinero ya en caja (apertura declarada una sola vez).
 * Es la fuente única del "saldo anterior" del estado financiero mensual.
 */
export async function saldoAnteriorDe(church: Church, yyyyMm: string): Promise<number> {
  const acumulado = await saldoAcumuladoAntesDe(church.id, yyyyMm);
  return (church.saldo_inicial ?? 0) + acumulado;
}

/**
 * Efectivo estimado en caja al cierre del día dado:
 *
 *   apertura + (ingresos − gastos aprobados con fecha ≤ día)
 * − depósitos bancarios con fecha ≤ día
 *
 * Los depósitos no cambian el saldo de tesorería (solo mueven dinero de caja
 * al banco), pero SÍ reducen el efectivo que queda por depositar. Es una
 * estimación: gastos pagados directo del banco no se distinguen aquí.
 */
export async function efectivoDisponibleHasta(
  church: Church,
  fechaISO: string,
  excludeDepositoId?: number
): Promise<number> {
  const d = await getDb();
  const movs = await d.select<{ tipo: string; total: number | null }[]>(
    `SELECT tipo, SUM(monto) AS total
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND deleted = 0
        AND substr(fecha, 1, 10) <= $2
      GROUP BY tipo`,
    [church.id, fechaISO]
  );
  let saldo = church.saldo_inicial ?? 0;
  for (const r of movs) {
    saldo += r.tipo === "ingreso" ? (r.total ?? 0) : -(r.total ?? 0);
  }
  const params: unknown[] = [church.id, fechaISO];
  let where = "church_id = $1 AND deleted = 0 AND substr(fecha, 1, 10) <= $2";
  if (excludeDepositoId != null) {
    params.push(excludeDepositoId);
    where += ` AND id != $${params.length}`;
  }
  const deps = await d.select<{ total: number | null }[]>(
    `SELECT SUM(monto) AS total FROM depositos_bancarios WHERE ${where}`,
    params
  );
  return saldo - (deps[0]?.total ?? 0);
}

export async function yearDepositos(churchId: number, yyyy: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ total: number | null }[]>(
    "SELECT SUM(monto) AS total FROM depositos_bancarios WHERE church_id = $1 AND substr(periodo, 1, 4) = $2 AND deleted = 0",
    [churchId, yyyy]
  );
  return rows[0]?.total ?? 0;
}

export async function countDepositos(churchId: number, yyyyMm: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM depositos_bancarios WHERE church_id = $1 AND periodo = $2 AND deleted = 0",
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
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2 AND deleted = 0
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
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 10) >= $2 AND deleted = 0
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
      WHERE church_id = $1 AND estado = 'aprobado' AND deleted = 0
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
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2 AND deleted = 0
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
      WHERE church_id = $1 AND estado = 'aprobado' AND substr(fecha, 1, 4) = $2 AND deleted = 0
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
        AND member_id IS NOT NULL AND substr(fecha, 1, 4) = $2 AND deleted = 0
      GROUP BY member_id`,
    [churchId, yyyy]
  );
  const ultimos = await d.select<{ member_id: number; ultimo: string }[]>(
    `SELECT member_id, MAX(fecha) AS ultimo
       FROM transactions
      WHERE church_id = $1 AND estado = 'aprobado' AND tipo = 'ingreso' AND member_id IS NOT NULL AND deleted = 0
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
        AND t.estado = 'aprobado' AND substr(t.fecha, 1, 4) = $3 AND t.deleted = 0
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
      WHERE church_id = $1 AND member_id = $2 AND tipo = 'ingreso' AND estado = 'aprobado' AND deleted = 0
      ORDER BY anio DESC`,
    [churchId, memberId]
  );
  return rows.map((r) => r.anio);
}

export async function lastActivityAt(churchId: number): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<{ m: string | null }[]>(
    "SELECT MAX(created_at) AS m FROM transactions WHERE church_id = $1 AND deleted = 0",
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
    "SELECT * FROM members WHERE church_id = $1 AND activo = 1 AND deleted = 0 ORDER BY nombre",
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
  /** Estado dentro del registro al darlo de alta (activo | visitante | …).
   *  Si no se pasa, la base usa 'activo' por defecto. */
  estado_membresia?: string | null;
}

export async function insertMember(churchId: number, m: NewMember): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO members (church_id, nombre, email, telefono, rfc, etiquetas, fecha_ingreso, notas, estado_membresia, uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,datetime('now'))`,
    [
      churchId,
      m.nombre,
      m.email ?? null,
      m.telefono ?? null,
      m.rfc ?? null,
      JSON.stringify(m.etiquetas ?? []),
      m.fecha_ingreso ?? null,
      m.notas ?? null,
      m.estado_membresia ?? "activo",
      crypto.randomUUID(),
    ]
  );
}

/** Alta completa desde Secretaría: inserta el miembro (datos personales) y le
 *  aplica de una vez toda la ficha (membresía, espiritual, servicio), sin tener
 *  que abrirla después para completarla. */
export async function insertMemberConFicha(churchId: number, m: NewMember, ficha: MemberFicha): Promise<void> {
  const d = await getDb();
  const res = await d.execute(
    `INSERT INTO members (church_id, nombre, email, telefono, rfc, etiquetas, fecha_ingreso, notas, uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,datetime('now'))`,
    [
      churchId,
      m.nombre,
      m.email ?? null,
      m.telefono ?? null,
      m.rfc ?? null,
      JSON.stringify(m.etiquetas ?? []),
      m.fecha_ingreso ?? null,
      m.notas ?? null,
      crypto.randomUUID(),
    ]
  );
  const id = res.lastInsertId;
  if (id != null) await updateMemberFicha(Number(id), churchId, ficha);
}

export async function updateMember(id: number, churchId: number, m: NewMember): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE members SET nombre = $1, email = $2, telefono = $3, rfc = $4, notas = $5, updated_at = datetime('now')
     WHERE id = $6 AND church_id = $7`,
    [m.nombre, m.email ?? null, m.telefono ?? null, m.rfc ?? null, m.notas ?? null, id, churchId]
  );
}

export async function archiveMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE members SET activo = 0,
            fecha_baja = coalesce(fecha_baja, date('now', 'localtime')),
            updated_at = datetime('now')
      WHERE id = $1 AND church_id = $2`,
    [id, churchId]
  );
}

/** Registro oficial completo (activos primero, luego bajas) para Membresía. */
export async function listMembersRegistro(churchId: number): Promise<Member[]> {
  const d = await getDb();
  return d.select<Member[]>(
    "SELECT * FROM members WHERE church_id = $1 AND deleted = 0 ORDER BY activo DESC, nombre",
    [churchId]
  );
}

/** Estado "visible" de una baja según su motivo. */
export function estadoDeBaja(motivo: string | null): string {
  if (motivo === "traslado") return "trasladado";
  if (motivo === "fallecimiento") return "fallecido";
  if (motivo === "retiro") return "retirado";
  return "baja";
}

/** Registra un cambio de estado en el historial del miembro (v20) y deja un
 *  aviso en el Inbox: los miembros también son los aportantes de Tesorería,
 *  así que el tesorero se entera de bajas/traslados sin preguntar. */
async function registrarCambioEstadoMiembro(id: number, churchId: number, de: string, a: string): Promise<void> {
  if (de === a) return;
  const d = await getDb();
  const rows = await d.select<{ historial_estados: string; nombre: string }[]>(
    "SELECT historial_estados, nombre FROM members WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  let hist: { de: string; a: string; fecha: string }[] = [];
  try { hist = JSON.parse(rows[0]?.historial_estados ?? "[]"); } catch { /* noop */ }
  hist.push({ de, a, fecha: nowLocalIso() });
  await d.execute("UPDATE members SET historial_estados = $1, updated_at = datetime('now') WHERE id = $2 AND church_id = $3", [
    JSON.stringify(hist), id, churchId,
  ]);
  try {
    const etiqueta = (x: string) => i18n.t(`membresia.estado.${x}`, { defaultValue: x });
    await insertMensaje(churchId, "secretaria", i18n.t("inboxAvisos.cambioEstado", {
      nombre: rows[0]?.nombre ?? "—", de: etiqueta(de), a: etiqueta(a),
    }));
  } catch { /* el aviso nunca debe frenar el cambio de estado */ }
}

export async function darDeBajaMember(
  id: number,
  churchId: number,
  fecha: string,
  motivo: string | null
): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ estado_membresia: string; activo: number }[]>(
    "SELECT estado_membresia, activo FROM members WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  const de = rows[0]?.activo === 1 ? rows[0].estado_membresia : "baja";
  await registrarCambioEstadoMiembro(id, churchId, de, estadoDeBaja(motivo));
  await d.execute(
    "UPDATE members SET activo = 0, fecha_baja = $1, motivo_baja = $2, updated_at = datetime('now') WHERE id = $3 AND church_id = $4",
    [fecha, motivo, id, churchId]
  );
}

export interface MembresiaStats {
  activos: number;
  altasAnio: number;
  bajasAnio: number;
  total: number;
}

export async function membresiaStats(churchId: number, yyyy: string): Promise<MembresiaStats> {
  const d = await getDb();
  const rows = await d.select<{ activos: number; altas: number; bajas: number; total: number }[]>(
    `SELECT
       SUM(CASE WHEN activo = 1 AND estado_membresia = 'activo' THEN 1 ELSE 0 END) AS activos,
       SUM(CASE WHEN substr(coalesce(fecha_ingreso, ''), 1, 4) = $2 THEN 1 ELSE 0 END) AS altas,
       SUM(CASE WHEN activo = 0 AND substr(coalesce(fecha_baja, ''), 1, 4) = $2 THEN 1 ELSE 0 END) AS bajas,
       COUNT(*) AS total
     FROM members WHERE church_id = $1 AND deleted = 0`,
    [churchId, yyyy]
  );
  const r = rows[0];
  return {
    activos: r?.activos ?? 0,
    altasAnio: r?.altas ?? 0,
    bajasAnio: r?.bajas ?? 0,
    total: r?.total ?? 0,
  };
}

export async function listArchivedMembers(churchId: number): Promise<Member[]> {
  const d = await getDb();
  return d.select<Member[]>(
    "SELECT * FROM members WHERE church_id = $1 AND activo = 0 AND deleted = 0 ORDER BY nombre",
    [churchId]
  );
}

export async function restoreMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ motivo_baja: string | null; activo: number }[]>(
    "SELECT motivo_baja, activo FROM members WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  if (rows[0]?.activo === 0) {
    await registrarCambioEstadoMiembro(id, churchId, estadoDeBaja(rows[0].motivo_baja), "activo");
  }
  await d.execute(
    "UPDATE members SET activo = 1, fecha_baja = NULL, motivo_baja = NULL, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

// ---------- Actas de reuniones ----------

export interface ActaMocion {
  texto: string;
  presenta: string;
  secunda: string;
  /** Resultado de la votación en texto libre (p. ej. "Aprobada, 8 a favor y 2 en contra"). */
  resultado: string;
}

export interface ActaAcuerdo {
  texto: string;
  responsable: string;
  fecha_limite: string | null;
}

export interface Acta {
  id: number;
  church_id: number;
  folio: string;
  /** Clave de catálogo: administrativa, lideres, asamblea, pastoral, eleccion,
   *  nombramiento, recepcion, compraventa, presupuesto, disciplina, otra. */
  tipo: string;
  titulo: string;
  fecha: string;
  hora_inicio: string | null;
  hora_cierre: string | null;
  lugar: string | null;
  preside: string | null;
  secretario: string | null;
  /** Arreglos JSON de nombres. */
  presentes: string;
  ausentes: string;
  invitados: string;
  quorum: number;
  agenda: string | null;
  resumen: string | null;
  /** Arreglo JSON de ActaMocion. */
  mociones: string;
  /** Arreglo JSON de ActaAcuerdo. */
  acuerdos: string;
  /** borrador | pendiente | aprobada | corregida | archivada */
  estado: string;
  confidencial: number;
  fecha_aprobacion: string | null;
  creado_en: string;
}

export interface NewActa {
  tipo: string;
  titulo: string;
  fecha: string;
  hora_inicio: string | null;
  hora_cierre: string | null;
  lugar: string | null;
  preside: string | null;
  secretario: string | null;
  presentes: string[];
  ausentes: string[];
  invitados: string[];
  quorum: boolean;
  agenda: string | null;
  resumen: string | null;
  mociones: ActaMocion[];
  acuerdos: ActaAcuerdo[];
  estado: string;
  confidencial: boolean;
  fecha_aprobacion: string | null;
}

export async function listActas(churchId: number): Promise<Acta[]> {
  const d = await getDb();
  return d.select<Acta[]>(
    "SELECT * FROM actas WHERE church_id = $1 AND deleted = 0 ORDER BY fecha DESC, id DESC",
    [churchId]
  );
}

/** Folio consecutivo por año: ACTA-2026-001, ACTA-2026-002… */
async function nextActaFolio(churchId: number, fecha: string): Promise<string> {
  const d = await getDb();
  const anio = fecha.slice(0, 4);
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM actas WHERE church_id = $1 AND substr(fecha, 1, 4) = $2 AND deleted = 0",
    [churchId, anio]
  );
  const n = (rows[0]?.n ?? 0) + 1;
  return `ACTA-${anio}-${String(n).padStart(3, "0")}`;
}

function actaParams(a: NewActa): unknown[] {
  return [
    a.tipo, a.titulo, a.fecha, a.hora_inicio, a.hora_cierre, a.lugar, a.preside, a.secretario,
    JSON.stringify(a.presentes), JSON.stringify(a.ausentes), JSON.stringify(a.invitados),
    a.quorum ? 1 : 0, a.agenda, a.resumen,
    JSON.stringify(a.mociones), JSON.stringify(a.acuerdos),
    a.estado, a.confidencial ? 1 : 0, a.fecha_aprobacion,
  ];
}

export async function insertActa(churchId: number, a: NewActa): Promise<void> {
  const d = await getDb();
  const folio = await nextActaFolio(churchId, a.fecha);
  await d.execute(
    `INSERT INTO actas (
       tipo, titulo, fecha, hora_inicio, hora_cierre, lugar, preside, secretario,
       presentes, ausentes, invitados, quorum, agenda, resumen, mociones, acuerdos,
       estado, confidencial, fecha_aprobacion, church_id, folio, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,datetime('now'))`,
    [...actaParams(a), churchId, folio, crypto.randomUUID()]
  );
}

export async function updateActa(id: number, churchId: number, a: NewActa): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE actas SET
       tipo = $1, titulo = $2, fecha = $3, hora_inicio = $4, hora_cierre = $5, lugar = $6,
       preside = $7, secretario = $8, presentes = $9, ausentes = $10, invitados = $11,
       quorum = $12, agenda = $13, resumen = $14, mociones = $15, acuerdos = $16,
       estado = $17, confidencial = $18, fecha_aprobacion = $19, updated_at = datetime('now')
     WHERE id = $20 AND church_id = $21`,
    [...actaParams(a), id, churchId]
  );
}

/** Borrado SUAVE (deleted = 1) para que se propague en la sincronización. */
export async function deleteActa(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE actas SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

// ---------- Cartas y traslados ----------

export interface CartaFirma {
  /** pastor | secretaria | presidente | tesorero | otro */
  rol: string;
  nombre: string;
  cargo: string;
  firmado: boolean;
  /** Fecha opcional que se muestra bajo la línea de firma. */
  fecha: string | null;
}

export interface CartaCambioEstado {
  de: string;
  a: string;
  fecha: string;
}

export interface Carta {
  id: number;
  church_id: number;
  numero_seq: number;
  /** CAR-AAAA-0001 — autogenerado al crear el borrador, solo lectura. */
  folio: string;
  tipo: string;
  fecha_emision: string;
  lugar_emision: string | null;
  /** miembro | iglesia | pastor | institucion | externo | personalizado */
  destinatario_tipo: string;
  member_id: number | null;
  destinatario_nombre: string;
  destinatario_direccion: string | null;
  asunto: string | null;
  saludo: string | null;
  cuerpo_html: string;
  despedida: string | null;
  /** JSON de CartaFirma[]. */
  firmas: string;
  /** Observaciones internas — nunca se imprimen. */
  observaciones: string | null;
  estado: string;
  /** JSON de CartaCambioEstado[]. */
  historial_estados: string;
  entregada_a: string | null;
  fecha_entrega: string | null;
  solicitud_id: number | null;
  creado_en: string;
  modificado_en: string;
}

export interface NewCarta {
  tipo: string;
  fecha_emision: string;
  lugar_emision: string | null;
  destinatario_tipo: string;
  member_id: number | null;
  destinatario_nombre: string;
  destinatario_direccion: string | null;
  asunto: string | null;
  saludo: string | null;
  cuerpo_html: string;
  despedida: string | null;
  firmas: CartaFirma[];
  observaciones: string | null;
  estado: string;
  entregada_a: string | null;
  fecha_entrega: string | null;
}

export async function listCartas(churchId: number): Promise<Carta[]> {
  const d = await getDb();
  return d.select<Carta[]>(
    "SELECT * FROM cartas WHERE church_id = $1 AND deleted = 0 ORDER BY fecha_emision DESC, id DESC",
    [churchId]
  );
}

/** Folio CAR-AAAA-0001: MAX(seq)+1 por año (no COUNT, para que eliminar un
 *  borrador nunca repita número; los huecos son aceptados a propósito).
 *
 *  El año se toma del FOLIO ya emitido, no de fecha_emision: el folio nunca
 *  cambia, mientras que editar la fecha de una carta a otro año la sacaba del
 *  filtro y el siguiente folio de ese año se repetía (bug del CAR duplicado).
 *  Además se verifica la colisión directa: si el candidato ya existe (p. ej.
 *  por cartas llegadas por sincronización), se avanza hasta el primer libre. */
async function nextCartaSeq(churchId: number, anio: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ m: number | null }[]>(
    "SELECT MAX(numero_seq) AS m FROM cartas WHERE church_id = $1 AND folio LIKE 'CAR-' || $2 || '-%'",
    [churchId, anio]
  );
  let seq = (rows[0]?.m ?? 0) + 1;
  for (;;) {
    const folio = `CAR-${anio}-${String(seq).padStart(4, "0")}`;
    const dup = await d.select<{ n: number }[]>(
      "SELECT count(*) AS n FROM cartas WHERE church_id = $1 AND folio = $2",
      [churchId, folio]
    );
    if ((dup[0]?.n ?? 0) === 0) return seq;
    seq++;
  }
}

/**
 * Repara folios de carta duplicados: conserva el folio en la carta más antigua
 * (menor id) y renumera las demás con la siguiente seq libre de su año. Los
 * duplicados nacen cuando dos equipos crean cartas sin conexión y la
 * sincronización las junta (cada uno calculó la misma seq); esto se ejecuta al
 * terminar de bajar cartas de la nube y en la migración v35 para datos ya
 * afectados. Devuelve cuántas cartas se renumeraron.
 */
export async function repararFoliosDuplicados(churchId: number): Promise<number> {
  const d = await getDb();
  const dups = await d.select<{ id: number; folio: string }[]>(
    `SELECT c.id, c.folio FROM cartas c
      WHERE c.church_id = $1
        AND EXISTS (
          SELECT 1 FROM cartas o
           WHERE o.church_id = c.church_id AND o.folio = c.folio AND o.id < c.id
        )
      ORDER BY c.id`,
    [churchId]
  );
  for (const c of dups) {
    const anio = c.folio.slice(4, 8);
    const seq = await nextCartaSeq(churchId, anio);
    const nuevo = `CAR-${anio}-${String(seq).padStart(4, "0")}`;
    await d.execute(
      "UPDATE cartas SET numero_seq = $1, folio = $2, updated_at = datetime('now') WHERE id = $3 AND church_id = $4",
      [seq, nuevo, c.id, churchId]
    );
  }
  return dups.length;
}

function cartaParams(c: NewCarta): unknown[] {
  return [
    c.tipo, c.fecha_emision, c.lugar_emision, c.destinatario_tipo, c.member_id,
    c.destinatario_nombre, c.destinatario_direccion, c.asunto, c.saludo, c.cuerpo_html,
    c.despedida, JSON.stringify(c.firmas), c.observaciones, c.estado,
    c.entregada_a, c.fecha_entrega,
  ];
}

export async function insertCarta(churchId: number, c: NewCarta): Promise<Carta | null> {
  const d = await getDb();
  const anio = c.fecha_emision.slice(0, 4);
  const seq = await nextCartaSeq(churchId, anio);
  const folio = `CAR-${anio}-${String(seq).padStart(4, "0")}`;
  const historial = JSON.stringify([{ de: "", a: c.estado, fecha: nowLocalIso() }]);
  await d.execute(
    `INSERT INTO cartas (
       tipo, fecha_emision, lugar_emision, destinatario_tipo, member_id,
       destinatario_nombre, destinatario_direccion, asunto, saludo, cuerpo_html,
       despedida, firmas, observaciones, estado, entregada_a, fecha_entrega,
       church_id, numero_seq, folio, historial_estados, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,datetime('now'))`,
    [...cartaParams(c), churchId, seq, folio, historial, crypto.randomUUID()]
  );
  const rows = await d.select<Carta[]>(
    "SELECT * FROM cartas WHERE church_id = $1 AND folio = $2 ORDER BY id DESC LIMIT 1",
    [churchId, folio]
  );
  return rows[0] ?? null;
}

export async function updateCarta(id: number, churchId: number, c: NewCarta, estadoAnterior: string): Promise<void> {
  const d = await getDb();
  // El historial de estados solo crece cuando el estado realmente cambió.
  if (c.estado !== estadoAnterior) {
    const rows = await d.select<{ historial_estados: string }[]>(
      "SELECT historial_estados FROM cartas WHERE id = $1 AND church_id = $2",
      [id, churchId]
    );
    let hist: CartaCambioEstado[] = [];
    try { hist = JSON.parse(rows[0]?.historial_estados ?? "[]"); } catch { /* noop */ }
    hist.push({ de: estadoAnterior, a: c.estado, fecha: nowLocalIso() });
    await d.execute("UPDATE cartas SET historial_estados = $1 WHERE id = $2 AND church_id = $3", [
      JSON.stringify(hist), id, churchId,
    ]);
  }
  await d.execute(
    `UPDATE cartas SET
       tipo = $1, fecha_emision = $2, lugar_emision = $3, destinatario_tipo = $4, member_id = $5,
       destinatario_nombre = $6, destinatario_direccion = $7, asunto = $8, saludo = $9,
       cuerpo_html = $10, despedida = $11, firmas = $12, observaciones = $13, estado = $14,
       entregada_a = $15, fecha_entrega = $16,
       modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $17 AND church_id = $18`,
    [...cartaParams(c), id, churchId]
  );
  // Al entregar una carta creada desde una solicitud, la solicitud se
  // completa automáticamente (vínculo bidireccional).
  if (c.estado === "entregada" && estadoAnterior !== "entregada") {
    const rows = await d.select<{ solicitud_id: number | null }[]>(
      "SELECT solicitud_id FROM cartas WHERE id = $1 AND church_id = $2",
      [id, churchId]
    );
    const solicitudId = rows[0]?.solicitud_id;
    if (solicitudId) {
      const sol = await d.select<{ estado: string }[]>(
        "SELECT estado FROM solicitudes WHERE id = $1 AND church_id = $2",
        [solicitudId, churchId]
      );
      const previo = sol[0]?.estado;
      if (previo && previo !== "entregada" && previo !== "cancelada") {
        await registrarCambioEstadoSolicitud(solicitudId, churchId, previo, "entregada");
        await d.execute(
          "UPDATE solicitudes SET estado = 'entregada', updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
          [solicitudId, churchId]
        );
      }
    }
  }
}

/** Eliminar solo se permite para borradores (la política prefiere archivar/cancelar). */
export async function deleteCarta(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  // Si el borrador venía de una solicitud, la solicitud queda desvinculada.
  await d.execute("UPDATE solicitudes SET carta_id = NULL WHERE carta_id = $1 AND church_id = $2", [id, churchId]);
  // Borrado SUAVE (solo borradores) para que se propague en la sincronización.
  await d.execute(
    "UPDATE cartas SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2 AND estado = 'borrador'",
    [id, churchId]
  );
}

/** Estado previo al actual según el historial (para "Restaurar"). */
export function estadoAnteriorDeHistorial(historialJson: string, estadoActual: string): string {
  try {
    const hist: CartaCambioEstado[] = JSON.parse(historialJson);
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].a === estadoActual && hist[i].de) return hist[i].de;
    }
  } catch { /* noop */ }
  return "borrador";
}

// ---------- Solicitudes de cartas ----------

export interface Solicitud {
  id: number;
  church_id: number;
  numero_seq: number;
  /** SOL-AAAA-0001 — autogenerado, solo lectura. */
  folio: string;
  member_id: number | null;
  solicitante_externo: string | null;
  tipo_carta: string;
  motivo: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  /** impresa | email | mensajeria | recoge | otro */
  medio_entrega: string | null;
  responsable: string | null;
  /** normal | importante | urgente */
  prioridad: string;
  /** nueva | revision | preparacion | firma | lista | entregada | cancelada */
  estado: string;
  observaciones: string | null;
  carta_id: number | null;
  historial_estados: string;
  creado_en: string;
  modificado_en: string;
}

export interface NewSolicitud {
  member_id: number | null;
  solicitante_externo: string | null;
  tipo_carta: string;
  motivo: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  medio_entrega: string | null;
  responsable: string | null;
  prioridad: string;
  estado: string;
  observaciones: string | null;
}

export async function listSolicitudes(churchId: number): Promise<Solicitud[]> {
  const d = await getDb();
  return d.select<Solicitud[]>(
    "SELECT * FROM solicitudes WHERE church_id = $1 AND deleted = 0 ORDER BY fecha_solicitud DESC, id DESC",
    [churchId]
  );
}

function solicitudParams(s: NewSolicitud): unknown[] {
  return [
    s.member_id, s.solicitante_externo, s.tipo_carta, s.motivo, s.fecha_solicitud,
    s.fecha_requerida, s.medio_entrega, s.responsable, s.prioridad, s.estado, s.observaciones,
  ];
}

export async function insertSolicitud(churchId: number, s: NewSolicitud): Promise<Solicitud | null> {
  const d = await getDb();
  const anio = s.fecha_solicitud.slice(0, 4);
  const rows0 = await d.select<{ m: number | null }[]>(
    "SELECT MAX(numero_seq) AS m FROM solicitudes WHERE church_id = $1 AND substr(fecha_solicitud, 1, 4) = $2",
    [churchId, anio]
  );
  const seq = (rows0[0]?.m ?? 0) + 1;
  const folio = `SOL-${anio}-${String(seq).padStart(4, "0")}`;
  const historial = JSON.stringify([{ de: "", a: s.estado, fecha: nowLocalIso() }]);
  await d.execute(
    `INSERT INTO solicitudes (
       member_id, solicitante_externo, tipo_carta, motivo, fecha_solicitud, fecha_requerida,
       medio_entrega, responsable, prioridad, estado, observaciones,
       church_id, numero_seq, folio, historial_estados, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,datetime('now'))`,
    [...solicitudParams(s), churchId, seq, folio, historial, crypto.randomUUID()]
  );
  const rows = await d.select<Solicitud[]>(
    "SELECT * FROM solicitudes WHERE church_id = $1 AND folio = $2 ORDER BY id DESC LIMIT 1",
    [churchId, folio]
  );
  return rows[0] ?? null;
}

async function registrarCambioEstadoSolicitud(id: number, churchId: number, de: string, a: string): Promise<void> {
  if (de === a) return;
  const d = await getDb();
  const rows = await d.select<{ historial_estados: string }[]>(
    "SELECT historial_estados FROM solicitudes WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
  let hist: CartaCambioEstado[] = [];
  try { hist = JSON.parse(rows[0]?.historial_estados ?? "[]"); } catch { /* noop */ }
  hist.push({ de, a, fecha: nowLocalIso() });
  await d.execute(
    "UPDATE solicitudes SET historial_estados = $1, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now') WHERE id = $2 AND church_id = $3",
    [JSON.stringify(hist), id, churchId]
  );
}

export async function updateSolicitud(id: number, churchId: number, s: NewSolicitud, estadoAnterior: string): Promise<void> {
  const d = await getDb();
  await registrarCambioEstadoSolicitud(id, churchId, estadoAnterior, s.estado);
  await d.execute(
    `UPDATE solicitudes SET
       member_id = $1, solicitante_externo = $2, tipo_carta = $3, motivo = $4,
       fecha_solicitud = $5, fecha_requerida = $6, medio_entrega = $7, responsable = $8,
       prioridad = $9, estado = $10, observaciones = $11,
       modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $12 AND church_id = $13`,
    [...solicitudParams(s), id, churchId]
  );
}

/** Eliminar solo solicitudes nuevas sin carta vinculada; el resto se cancela. */
export async function deleteSolicitud(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  // Borrado SUAVE (solo nuevas sin carta) para que se propague en la sincronización.
  await d.execute(
    "UPDATE solicitudes SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2 AND estado = 'nueva' AND carta_id IS NULL",
    [id, churchId]
  );
}

/** Vincula en ambos sentidos la carta creada desde una solicitud y pasa la
 *  solicitud a "en preparación". */
export async function vincularCartaSolicitud(solicitudId: number, cartaId: number, churchId: number): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ estado: string }[]>(
    "SELECT estado FROM solicitudes WHERE id = $1 AND church_id = $2",
    [solicitudId, churchId]
  );
  const estadoPrevio = rows[0]?.estado ?? "nueva";
  await d.execute("UPDATE cartas SET solicitud_id = $1 WHERE id = $2 AND church_id = $3", [solicitudId, cartaId, churchId]);
  await registrarCambioEstadoSolicitud(solicitudId, churchId, estadoPrevio, "preparacion");
  await d.execute(
    "UPDATE solicitudes SET carta_id = $1, estado = 'preparacion' WHERE id = $2 AND church_id = $3",
    [cartaId, solicitudId, churchId]
  );
}

// ---------- Plantillas de cartas ----------

export interface Plantilla {
  id: number;
  church_id: number;
  nombre: string;
  /** Tipo de carta al que aplica (mismo catálogo de tipos de carta). */
  tipo: string;
  asunto: string | null;
  saludo: string | null;
  /** Cuerpo HTML con variables {{...}}. */
  cuerpo_html: string;
  despedida: string | null;
  activa: number;
  predeterminada: number;
  es_inicial: number;
  creado_en: string;
  modificado_en: string;
}

export interface NewPlantilla {
  nombre: string;
  tipo: string;
  asunto: string | null;
  saludo: string | null;
  cuerpo_html: string;
  despedida: string | null;
  activa: boolean;
  predeterminada: boolean;
}

export async function listPlantillas(churchId: number): Promise<Plantilla[]> {
  const d = await getDb();
  return d.select<Plantilla[]>(
    "SELECT * FROM plantillas WHERE church_id = $1 AND deleted = 0 ORDER BY predeterminada DESC, nombre",
    [churchId]
  );
}

/** Solo puede haber una predeterminada por tipo de carta. */
async function despejarPredeterminada(churchId: number, tipo: string, exceptoId?: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE plantillas SET predeterminada = 0 WHERE church_id = $1 AND tipo = $2 AND ($3 IS NULL OR id != $3)",
    [churchId, tipo, exceptoId ?? null]
  );
}

export async function insertPlantilla(churchId: number, p: NewPlantilla, esInicial = false): Promise<void> {
  const d = await getDb();
  if (p.predeterminada) await despejarPredeterminada(churchId, p.tipo);
  await d.execute(
    `INSERT INTO plantillas (church_id, nombre, tipo, asunto, saludo, cuerpo_html, despedida, activa, predeterminada, es_inicial, uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,datetime('now'))`,
    [churchId, p.nombre, p.tipo, p.asunto, p.saludo, p.cuerpo_html, p.despedida, p.activa ? 1 : 0, p.predeterminada ? 1 : 0, esInicial ? 1 : 0, crypto.randomUUID()]
  );
}

export async function updatePlantilla(id: number, churchId: number, p: NewPlantilla): Promise<void> {
  const d = await getDb();
  if (p.predeterminada) await despejarPredeterminada(churchId, p.tipo, id);
  await d.execute(
    `UPDATE plantillas SET
       nombre = $1, tipo = $2, asunto = $3, saludo = $4, cuerpo_html = $5, despedida = $6,
       activa = $7, predeterminada = $8, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $9 AND church_id = $10`,
    [p.nombre, p.tipo, p.asunto, p.saludo, p.cuerpo_html, p.despedida, p.activa ? 1 : 0, p.predeterminada ? 1 : 0, id, churchId]
  );
}

/** Borrado SUAVE (deleted = 1) para que se propague en la sincronización. */
export async function deletePlantilla(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE plantillas SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** ¿Ya se sembraron las plantillas iniciales? (idempotente) */
export async function hayPlantillasIniciales(churchId: number): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM plantillas WHERE church_id = $1 AND es_inicial = 1 AND deleted = 0",
    [churchId]
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Deduplica las plantillas iniciales conservando una por nombre. Como cada
 *  equipo siembra las suyas, al sincronizar aparecen dobles con el mismo
 *  nombre; se conserva la de MENOR uid (regla determinista igual en todos los
 *  equipos, para que converjan) y las demás se marcan borradas (soft-delete),
 *  de modo que el borrado también se propague. */
export async function dedupPlantillasIniciales(churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE plantillas
        SET deleted = 1, updated_at = datetime('now')
      WHERE church_id = $1 AND es_inicial = 1 AND deleted = 0
        AND uid NOT IN (
          SELECT MIN(uid) FROM plantillas
           WHERE church_id = $1 AND es_inicial = 1 AND deleted = 0
           GROUP BY nombre
        )`,
    [churchId]
  );
}

// ---------- Traslados de salida ----------

export interface TrasladoSalida {
  id: number;
  church_id: number;
  numero_seq: number;
  /** TS-AAAA-0001 */
  folio: string;
  member_id: number;
  fecha_solicitud: string;
  motivo: string | null;
  iglesia_destino: string | null;
  pastor_receptor: string | null;
  direccion: string | null;
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  telefono: string | null;
  email: string | null;
  fecha_aprobacion: string | null;
  aprobado_por: string | null;
  carta_id: number | null;
  fecha_entrega: string | null;
  metodo_entrega: string | null;
  confirmacion_recibida: number;
  fecha_confirmacion: string | null;
  observaciones: string | null;
  /** borrador | solicitud | revision | aprobacion | aprobado | cartaPreparacion |
   *  cartaEmitida | cartaEntregada | confirmacion | completado | cancelado */
  estado: string;
  historial_estados: string;
  creado_en: string;
  modificado_en: string;
}

export type NewTrasladoSalida = Omit<TrasladoSalida, "id" | "church_id" | "numero_seq" | "folio" | "historial_estados" | "creado_en" | "modificado_en">;

async function nextFolio(tabla: string, campoFecha: string, prefijo: string, churchId: number, fecha: string): Promise<{ seq: number; folio: string }> {
  const d = await getDb();
  const anio = fecha.slice(0, 4);
  const rows = await d.select<{ m: number | null }[]>(
    `SELECT MAX(numero_seq) AS m FROM ${tabla} WHERE church_id = $1 AND substr(${campoFecha}, 1, 4) = $2`,
    [churchId, anio]
  );
  const seq = (rows[0]?.m ?? 0) + 1;
  return { seq, folio: `${prefijo}-${anio}-${String(seq).padStart(4, "0")}` };
}

async function registrarCambioEstadoEn(tabla: string, id: number, churchId: number, de: string, a: string): Promise<void> {
  if (de === a) return;
  const d = await getDb();
  const rows = await d.select<{ historial_estados: string }[]>(
    `SELECT historial_estados FROM ${tabla} WHERE id = $1 AND church_id = $2`,
    [id, churchId]
  );
  let hist: CartaCambioEstado[] = [];
  try { hist = JSON.parse(rows[0]?.historial_estados ?? "[]"); } catch { /* noop */ }
  hist.push({ de, a, fecha: nowLocalIso() });
  await d.execute(
    `UPDATE ${tabla} SET historial_estados = $1, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now') WHERE id = $2 AND church_id = $3`,
    [JSON.stringify(hist), id, churchId]
  );
}

export async function listTrasladosSalida(churchId: number): Promise<TrasladoSalida[]> {
  const d = await getDb();
  return d.select<TrasladoSalida[]>(
    "SELECT * FROM traslados_salida WHERE church_id = $1 AND deleted = 0 ORDER BY fecha_solicitud DESC, id DESC",
    [churchId]
  );
}

const TS_CAMPOS = `member_id, fecha_solicitud, motivo, iglesia_destino, pastor_receptor, direccion,
  ciudad, region, pais, telefono, email, fecha_aprobacion, aprobado_por, carta_id,
  fecha_entrega, metodo_entrega, confirmacion_recibida, fecha_confirmacion, observaciones, estado`;

function tsParams(s: NewTrasladoSalida): unknown[] {
  return [
    s.member_id, s.fecha_solicitud, s.motivo, s.iglesia_destino, s.pastor_receptor, s.direccion,
    s.ciudad, s.region, s.pais, s.telefono, s.email, s.fecha_aprobacion, s.aprobado_por, s.carta_id,
    s.fecha_entrega, s.metodo_entrega, s.confirmacion_recibida ? 1 : 0, s.fecha_confirmacion,
    s.observaciones, s.estado,
  ];
}

export async function insertTrasladoSalida(churchId: number, s: NewTrasladoSalida): Promise<TrasladoSalida | null> {
  const d = await getDb();
  const { seq, folio } = await nextFolio("traslados_salida", "fecha_solicitud", "TS", churchId, s.fecha_solicitud);
  const historial = JSON.stringify([{ de: "", a: s.estado, fecha: nowLocalIso() }]);
  await d.execute(
    `INSERT INTO traslados_salida (${TS_CAMPOS}, church_id, numero_seq, folio, historial_estados, uid, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,datetime('now'))`,
    [...tsParams(s), churchId, seq, folio, historial, crypto.randomUUID()]
  );
  const rows = await d.select<TrasladoSalida[]>(
    "SELECT * FROM traslados_salida WHERE church_id = $1 AND folio = $2 ORDER BY id DESC LIMIT 1",
    [churchId, folio]
  );
  return rows[0] ?? null;
}

export async function updateTrasladoSalida(id: number, churchId: number, s: NewTrasladoSalida, estadoAnterior: string): Promise<void> {
  const d = await getDb();
  await registrarCambioEstadoEn("traslados_salida", id, churchId, estadoAnterior, s.estado);
  await d.execute(
    `UPDATE traslados_salida SET
       member_id = $1, fecha_solicitud = $2, motivo = $3, iglesia_destino = $4, pastor_receptor = $5,
       direccion = $6, ciudad = $7, region = $8, pais = $9, telefono = $10, email = $11,
       fecha_aprobacion = $12, aprobado_por = $13, carta_id = $14, fecha_entrega = $15,
       metodo_entrega = $16, confirmacion_recibida = $17, fecha_confirmacion = $18,
       observaciones = $19, estado = $20,
       modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $21 AND church_id = $22`,
    [...tsParams(s), id, churchId]
  );
}

/** Solo borradores se eliminan; el resto se cancela para conservar historial. */
export async function deleteTrasladoSalida(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE traslados_salida SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2 AND estado = 'borrador'",
    [id, churchId]
  );
}

/** ¿El miembro ya tiene otro traslado de salida en proceso? (advertencia) */
export async function memberTieneTrasladoActivo(memberId: number, churchId: number, excluirId?: number): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    `SELECT count(*) AS n FROM traslados_salida
      WHERE church_id = $1 AND member_id = $2 AND estado NOT IN ('completado', 'cancelado')
        AND deleted = 0 AND ($3 IS NULL OR id != $3)`,
    [churchId, memberId, excluirId ?? null]
  );
  return (rows[0]?.n ?? 0) > 0;
}

// ---------- Traslados de entrada ----------

export interface TrasladoEntrada {
  id: number;
  church_id: number;
  numero_seq: number;
  /** TE-AAAA-0001 */
  folio: string;
  nombre: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  iglesia_procedencia: string | null;
  pastor_anterior: string | null;
  direccion_anterior: string | null;
  fecha_emision_carta: string | null;
  fecha_recepcion: string | null;
  referencia_carta: string | null;
  /** Ruta del archivo copiado a la carpeta de datos de la app. */
  adjunto_path: string | null;
  adjunto_nombre: string | null;
  adjunto_fecha: string | null;
  fecha_congregacion: string | null;
  fecha_entrevista: string | null;
  entrevistador: string | null;
  decision: string | null;
  fecha_aprobacion: string | null;
  observaciones: string | null;
  /** recibida | revision | incompleta | entrevista | aprobacion | aceptado |
   *  noAceptado | completado | archivado */
  estado: string;
  member_id: number | null;
  historial_estados: string;
  creado_en: string;
  modificado_en: string;
}

export type NewTrasladoEntrada = Omit<TrasladoEntrada, "id" | "church_id" | "numero_seq" | "folio" | "historial_estados" | "creado_en" | "modificado_en">;

export async function listTrasladosEntrada(churchId: number): Promise<TrasladoEntrada[]> {
  const d = await getDb();
  return d.select<TrasladoEntrada[]>(
    "SELECT * FROM traslados_entrada WHERE church_id = $1 AND deleted = 0 ORDER BY id DESC",
    [churchId]
  );
}

function teParams(s: NewTrasladoEntrada): unknown[] {
  return [
    s.nombre, s.fecha_nacimiento, s.telefono, s.correo, s.direccion,
    s.iglesia_procedencia, s.pastor_anterior, s.direccion_anterior,
    s.fecha_emision_carta, s.fecha_recepcion, s.referencia_carta,
    s.adjunto_path, s.adjunto_nombre, s.adjunto_fecha,
    s.fecha_congregacion, s.fecha_entrevista, s.entrevistador, s.decision,
    s.fecha_aprobacion, s.observaciones, s.estado, s.member_id,
  ];
}

export async function insertTrasladoEntrada(churchId: number, s: NewTrasladoEntrada): Promise<TrasladoEntrada | null> {
  const d = await getDb();
  const hoy = nowLocalIso().slice(0, 10);
  const { seq, folio } = await nextFolio("traslados_entrada", "creado_en", "TE", churchId, s.fecha_recepcion ?? hoy);
  const historial = JSON.stringify([{ de: "", a: s.estado, fecha: nowLocalIso() }]);
  await d.execute(
    `INSERT INTO traslados_entrada (
       nombre, fecha_nacimiento, telefono, correo, direccion,
       iglesia_procedencia, pastor_anterior, direccion_anterior,
       fecha_emision_carta, fecha_recepcion, referencia_carta,
       adjunto_path, adjunto_nombre, adjunto_fecha,
       fecha_congregacion, fecha_entrevista, entrevistador, decision,
       fecha_aprobacion, observaciones, estado, member_id,
       church_id, numero_seq, folio, historial_estados, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,datetime('now'))`,
    [...teParams(s), churchId, seq, folio, historial, crypto.randomUUID()]
  );
  const rows = await d.select<TrasladoEntrada[]>(
    "SELECT * FROM traslados_entrada WHERE church_id = $1 AND folio = $2 ORDER BY id DESC LIMIT 1",
    [churchId, folio]
  );
  return rows[0] ?? null;
}

export async function updateTrasladoEntrada(id: number, churchId: number, s: NewTrasladoEntrada, estadoAnterior: string): Promise<void> {
  const d = await getDb();
  await registrarCambioEstadoEn("traslados_entrada", id, churchId, estadoAnterior, s.estado);
  await d.execute(
    `UPDATE traslados_entrada SET
       nombre = $1, fecha_nacimiento = $2, telefono = $3, correo = $4, direccion = $5,
       iglesia_procedencia = $6, pastor_anterior = $7, direccion_anterior = $8,
       fecha_emision_carta = $9, fecha_recepcion = $10, referencia_carta = $11,
       adjunto_path = $12, adjunto_nombre = $13, adjunto_fecha = $14,
       fecha_congregacion = $15, fecha_entrevista = $16, entrevistador = $17, decision = $18,
       fecha_aprobacion = $19, observaciones = $20, estado = $21, member_id = $22,
       modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $23 AND church_id = $24`,
    [...teParams(s), id, churchId]
  );
}

export async function deleteTrasladoEntrada(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE traslados_entrada SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2 AND estado = 'recibida' AND member_id IS NULL",
    [id, churchId]
  );
}

// ---------- Detección de duplicados (Decisión G) ----------

/** Minúsculas, sin acentos; teléfonos: solo dígitos. */
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function normalizarTelefono(s: string): string {
  return s.replace(/\D/g, "");
}

// ---------- Fusión de miembros duplicados ----------

/** Qué historial arrastra un miembro (para mostrar antes de fusionar). */
export interface FusionResumen {
  movimientos: number;
  asistencias: number;
  documentos: number;
}

export async function resumenFusion(churchId: number, deId: number): Promise<FusionResumen> {
  const d = await getDb();
  const uno = async (sql: string): Promise<number> => {
    const rows = await d.select<{ n: number }[]>(sql, [churchId, deId]);
    return rows[0]?.n ?? 0;
  };
  const [movs, asis, cartas, sols, ts, te] = await Promise.all([
    uno("SELECT count(*) AS n FROM transactions WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
    uno("SELECT count(*) AS n FROM servicio_asistencia WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
    uno("SELECT count(*) AS n FROM cartas WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
    uno("SELECT count(*) AS n FROM solicitudes WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
    uno("SELECT count(*) AS n FROM traslados_salida WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
    uno("SELECT count(*) AS n FROM traslados_entrada WHERE church_id = $1 AND member_id = $2 AND deleted = 0"),
  ]);
  return { movimientos: movs, asistencias: asis, documentos: cartas + sols + ts + te };
}

/** Fusiona el miembro `deId` dentro de `aId`: todo su historial (aportes,
 *  asistencia, cartas, solicitudes, traslados, agenda) pasa al destino y el
 *  origen queda con borrado suave (el sync lo propaga). Resuelve el caso
 *  "dio como visitante y luego como miembro": la constancia anual sale por
 *  el total en una sola persona. No se puede deshacer desde la app. */
export async function fusionarMiembros(churchId: number, deId: number, aId: number): Promise<void> {
  if (deId === aId) return;
  const d = await getDb();

  await d.execute(
    "UPDATE transactions SET member_id = $3, updated_at = datetime('now') WHERE church_id = $1 AND member_id = $2",
    [churchId, deId, aId]
  );

  // Asistencia: clave primaria (servicio_id, member_id). Donde el destino ya
  // tiene fila para el mismo servicio (viva o borrada), la del origen se
  // borra suave; el resto se re-apunta al destino.
  await d.execute(
    `UPDATE servicio_asistencia SET deleted = 1, updated_at = datetime('now')
      WHERE church_id = $1 AND member_id = $2 AND deleted = 0
        AND servicio_id IN (SELECT servicio_id FROM servicio_asistencia WHERE church_id = $1 AND member_id = $3)`,
    [churchId, deId, aId]
  );
  await d.execute(
    `UPDATE servicio_asistencia SET member_id = $3, updated_at = datetime('now')
      WHERE church_id = $1 AND member_id = $2 AND deleted = 0`,
    [churchId, deId, aId]
  );

  for (const tabla of ["cartas", "solicitudes", "traslados_salida", "traslados_entrada"]) {
    await d.execute(
      `UPDATE ${tabla} SET member_id = $3, updated_at = datetime('now') WHERE church_id = $1 AND member_id = $2`,
      [churchId, deId, aId]
    );
  }
  await d.execute(
    "UPDATE agenda SET responsable_member_id = $3, updated_at = datetime('now') WHERE church_id = $1 AND responsable_member_id = $2",
    [churchId, deId, aId]
  );

  // Datos de contacto: lo que el destino no tenga se completa con el origen.
  await d.execute(
    `UPDATE members SET
        email    = COALESCE(email, (SELECT email FROM members WHERE id = $2)),
        telefono = COALESCE(telefono, (SELECT telefono FROM members WHERE id = $2)),
        rfc      = COALESCE(rfc, (SELECT rfc FROM members WHERE id = $2)),
        updated_at = datetime('now')
      WHERE id = $3 AND church_id = $1`,
    [churchId, deId, aId]
  );

  await d.execute(
    "UPDATE members SET deleted = 1, updated_at = datetime('now') WHERE id = $2 AND church_id = $1",
    [churchId, deId]
  );
}

/** Posibles duplicados en members comparando nombre + teléfono + correo
 *  normalizados (members no guarda fecha de nacimiento). */
export async function buscarPosiblesDuplicados(
  churchId: number,
  datos: { nombre: string; telefono?: string | null; correo?: string | null }
): Promise<Member[]> {
  const todos = await listMembersRegistro(churchId);
  const nombre = normalizarTexto(datos.nombre);
  const tel = datos.telefono ? normalizarTelefono(datos.telefono) : "";
  const correo = datos.correo ? normalizarTexto(datos.correo) : "";
  return todos.filter((m) => {
    if (nombre && normalizarTexto(m.nombre) === nombre) return true;
    if (tel && m.telefono && normalizarTelefono(m.telefono) === tel) return true;
    if (correo && m.email && normalizarTexto(m.email) === correo) return true;
    return false;
  });
}

/** Alta de miembro desde un traslado de entrada aceptado: crea el registro
 *  básico y completa iglesia anterior y fecha de congregación en la ficha. */
export async function insertMemberDesdeTraslado(
  churchId: number,
  te: Pick<TrasladoEntrada, "nombre" | "telefono" | "correo" | "iglesia_procedencia" | "fecha_congregacion">
): Promise<number | null> {
  const d = await getDb();
  const hoy = nowLocalIso().slice(0, 10);
  await d.execute(
    `INSERT INTO members (church_id, nombre, email, telefono, etiquetas, fecha_ingreso, uid, updated_at)
     VALUES ($1,$2,$3,$4,'[]',$5,$6,datetime('now'))`,
    [churchId, te.nombre, te.correo ?? null, te.telefono ?? null, hoy, crypto.randomUUID()]
  );
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  const id = rows[0]?.id ?? null;
  if (id) {
    await d.execute(
      "UPDATE members SET iglesia_anterior = $1, fecha_congregacion = $2, updated_at = datetime('now') WHERE id = $3 AND church_id = $4",
      [te.iglesia_procedencia ?? null, te.fecha_congregacion ?? null, id, churchId]
    );
  }
  return id;
}

/** Documentos de Cartas y traslados relacionados con un miembro (ficha). */
export interface MemberDoc {
  folio: string;
  clase: "carta" | "solicitud" | "salida" | "entrada";
  fecha: string;
  estado: string;
}

export async function memberDocs(memberId: number, churchId: number): Promise<MemberDoc[]> {
  const d = await getDb();
  const [cartas, sols, salidas, entradas] = await Promise.all([
    d.select<{ folio: string; fecha: string; estado: string }[]>(
      "SELECT folio, fecha_emision AS fecha, estado FROM cartas WHERE church_id = $1 AND member_id = $2 AND deleted = 0",
      [churchId, memberId]
    ),
    d.select<{ folio: string; fecha: string; estado: string }[]>(
      "SELECT folio, fecha_solicitud AS fecha, estado FROM solicitudes WHERE church_id = $1 AND member_id = $2 AND deleted = 0",
      [churchId, memberId]
    ),
    d.select<{ folio: string; fecha: string; estado: string }[]>(
      "SELECT folio, fecha_solicitud AS fecha, estado FROM traslados_salida WHERE church_id = $1 AND member_id = $2 AND deleted = 0",
      [churchId, memberId]
    ),
    d.select<{ folio: string; fecha: string; estado: string }[]>(
      "SELECT folio, coalesce(fecha_recepcion, substr(creado_en, 1, 10)) AS fecha, estado FROM traslados_entrada WHERE church_id = $1 AND member_id = $2 AND deleted = 0",
      [churchId, memberId]
    ),
  ]);
  const docs: MemberDoc[] = [
    ...cartas.map((x) => ({ ...x, clase: "carta" as const })),
    ...sols.map((x) => ({ ...x, clase: "solicitud" as const })),
    ...salidas.map((x) => ({ ...x, clase: "salida" as const })),
    ...entradas.map((x) => ({ ...x, clase: "entrada" as const })),
  ];
  docs.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return docs;
}

// ---------- Registro de servicios ----------

export interface Servicio {
  id: number;
  church_id: number;
  fecha: string;
  /** Clave de catálogo: dominical, oracion, estudio, jovenes, damas,
   *  caballeros, vigilia, evangelistico, especial, otro. */
  tipo: string;
  dirige: string | null;
  predica: string | null;
  titulo_mensaje: string | null;
  texto_biblico: string | null;
  resumen_mensaje: string | null;
  /** Arreglo JSON de nombres (cantos y participaciones especiales). */
  participaciones: string;
  tema_escuela: string | null;
  maestro_escuela: string | null;
  /** Arreglos JSON de nombres. */
  asistentes: string;
  ausentes: string;
  visitantes: string;
  ninos: number;
  jovenes: number;
  adultos: number;
  eventos: string | null;
  creado_en: string;
}

/** Una entrada del roster de asistencia. La llave relacional es member_id;
 *  nombre_snapshot es solo para mostrar el histórico aunque el miembro
 *  cambie de nombre o de estado después. */
export interface AsistenciaEntry {
  member_id: number;
  presente: boolean;
  /** Clave: justificada, enfermedad, trabajo, viaje, emergencia, desconocida, otra. */
  razon: string | null;
  razon_otra: string | null;
  seguimiento: boolean;
  nombre_snapshot: string;
}

export interface ServicioVisitante {
  nombre: string;
  telefono: string | null;
  correo: string | null;
  invitado_por: string | null;
  primera_visita: boolean;
  notas: string | null;
}

export interface NewServicio {
  fecha: string;
  tipo: string;
  dirige: string | null;
  predica: string | null;
  titulo_mensaje: string | null;
  texto_biblico: string | null;
  resumen_mensaje: string | null;
  participaciones: string[];
  tema_escuela: string | null;
  maestro_escuela: string | null;
  /** Roster completo (presentes y ausentes) que se congela como snapshot. */
  asistencia: AsistenciaEntry[];
  visitantes: ServicioVisitante[];
  ninos: number;
  jovenes: number;
  adultos: number;
  eventos: string | null;
}

export async function listServicios(churchId: number): Promise<Servicio[]> {
  const d = await getDb();
  return d.select<Servicio[]>(
    "SELECT * FROM servicios WHERE church_id = $1 AND deleted = 0 ORDER BY fecha DESC, id DESC",
    [churchId]
  );
}

/** Visitantes tolerando el formato viejo (arreglo de strings). */
export function parseVisitantes(json: string): ServicioVisitante[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.map((x) =>
      typeof x === "string"
        ? { nombre: x, telefono: null, correo: null, invitado_por: null, primera_visita: false, notas: null }
        : {
            nombre: String(x?.nombre ?? ""),
            telefono: x?.telefono ?? null,
            correo: x?.correo ?? null,
            invitado_por: x?.invitado_por ?? null,
            primera_visita: Boolean(x?.primera_visita),
            notas: x?.notas ?? null,
          }
    ).filter((x) => x.nombre.trim());
  } catch {
    return [];
  }
}

// Las columnas JSON asistentes/ausentes quedan como legado (versiones previas
// guardaban nombres); el roster nuevo vive en servicio_asistencia por ID.
function servicioParams(s: NewServicio): unknown[] {
  return [
    s.fecha, s.tipo, s.dirige, s.predica, s.titulo_mensaje, s.texto_biblico, s.resumen_mensaje,
    JSON.stringify(s.participaciones), s.tema_escuela, s.maestro_escuela,
    "[]", "[]", JSON.stringify(s.visitantes),
    s.ninos, s.jovenes, s.adultos, s.eventos,
  ];
}

async function replaceAsistencia(churchId: number, servicioId: number, asistencia: AsistenciaEntry[]): Promise<void> {
  const d = await getDb();
  // Guardado por DIFERENCIAS (no borrar-y-reinsertar): así el uid de cada par
  // (servicio, miembro) se conserva entre guardados y el borrado de quien se
  // quitó se propaga como lápida en vez de perderse. Necesario para sincronizar.
  const existentes = await d.select<{ member_id: number }[]>(
    "SELECT member_id FROM servicio_asistencia WHERE servicio_id = $1 AND deleted = 0",
    [servicioId]
  );
  const nuevos = new Set(asistencia.map((a) => a.member_id));

  for (const a of asistencia) {
    const presente = a.presente ? 1 : 0;
    const razon = a.presente ? null : a.razon;
    const razonOtra = a.presente ? null : a.razon_otra;
    const seguimiento = a.presente ? 0 : a.seguimiento ? 1 : 0;
    // UPSERT por la clave compuesta (servicio_id, member_id), conservando uid.
    const yaEsta = await d.select<{ n: number }[]>(
      "SELECT count(*) AS n FROM servicio_asistencia WHERE servicio_id = $1 AND member_id = $2",
      [servicioId, a.member_id]
    );
    if ((yaEsta[0]?.n ?? 0) > 0) {
      await d.execute(
        `UPDATE servicio_asistencia
            SET presente = $1, razon = $2, razon_otra = $3, seguimiento = $4, nombre_snapshot = $5,
                deleted = 0, church_id = $6, updated_at = datetime('now')
          WHERE servicio_id = $7 AND member_id = $8`,
        [presente, razon, razonOtra, seguimiento, a.nombre_snapshot, churchId, servicioId, a.member_id]
      );
    } else {
      await d.execute(
        `INSERT INTO servicio_asistencia
           (servicio_id, member_id, presente, razon, razon_otra, seguimiento, nombre_snapshot, church_id, uid, updated_at, deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,datetime('now'),0)`,
        [servicioId, a.member_id, presente, razon, razonOtra, seguimiento, a.nombre_snapshot, churchId, crypto.randomUUID()]
      );
    }
  }

  // Quien estaba y ya no: borrado suave (lápida) para propagar la baja.
  for (const e of existentes) {
    if (!nuevos.has(e.member_id)) {
      await d.execute(
        "UPDATE servicio_asistencia SET deleted = 1, updated_at = datetime('now') WHERE servicio_id = $1 AND member_id = $2",
        [servicioId, e.member_id]
      );
    }
  }
}

export async function insertServicio(churchId: number, s: NewServicio): Promise<number | null> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO servicios (
       fecha, tipo, dirige, predica, titulo_mensaje, texto_biblico, resumen_mensaje,
       participaciones, tema_escuela, maestro_escuela, asistentes, ausentes, visitantes,
       ninos, jovenes, adultos, eventos, church_id, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,datetime('now'))`,
    [...servicioParams(s), churchId, crypto.randomUUID()]
  );
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  const servicioId = rows[0]?.id;
  if (servicioId) await replaceAsistencia(churchId, servicioId, s.asistencia);
  return servicioId ?? null;
}

/** Cierra el círculo del puente Agenda→Bitácora: la actividad queda marcada
 *  como realizada y enlazada (v35, columna local) al servicio registrado.
 *  El estado 'completada' sincroniza; el enlace es de esta Mac. */
export async function marcarActividadRealizada(
  actividadId: number,
  churchId: number,
  servicioId: number | null
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE agenda SET estado = 'completada', servicio_id = $3,
            modificado_en = datetime('now'), updated_at = datetime('now')
      WHERE id = $1 AND church_id = $2`,
    [actividadId, churchId, servicioId]
  );
}

export async function updateServicio(id: number, churchId: number, s: NewServicio): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE servicios SET
       fecha = $1, tipo = $2, dirige = $3, predica = $4, titulo_mensaje = $5,
       texto_biblico = $6, resumen_mensaje = $7, participaciones = $8, tema_escuela = $9,
       maestro_escuela = $10, asistentes = $11, ausentes = $12, visitantes = $13,
       ninos = $14, jovenes = $15, adultos = $16, eventos = $17, updated_at = datetime('now')
     WHERE id = $18 AND church_id = $19`,
    [...servicioParams(s), id, churchId]
  );
  await replaceAsistencia(churchId, id, s.asistencia);
}

/** Borrado SUAVE del servicio y de su roster (ambos se propagan en la
 *  sincronización como lápidas). */
export async function deleteServicio(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE servicio_asistencia SET deleted = 1, updated_at = datetime('now') WHERE servicio_id = $1 AND deleted = 0",
    [id]
  );
  await d.execute(
    "UPDATE servicios SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** Snapshot guardado del roster de un servicio, ordenado por nombre. */
export async function getServicioAsistencia(servicioId: number): Promise<AsistenciaEntry[]> {
  const d = await getDb();
  const rows = await d.select<{
    member_id: number; presente: number; razon: string | null;
    razon_otra: string | null; seguimiento: number; nombre_snapshot: string;
  }[]>(
    "SELECT member_id, presente, razon, razon_otra, seguimiento, nombre_snapshot FROM servicio_asistencia WHERE servicio_id = $1 AND deleted = 0 ORDER BY nombre_snapshot",
    [servicioId]
  );
  return rows.map((r) => ({
    member_id: r.member_id,
    presente: r.presente === 1,
    razon: r.razon,
    razon_otra: r.razon_otra,
    seguimiento: r.seguimiento === 1,
    nombre_snapshot: r.nombre_snapshot,
  }));
}

/** Miembros que entran al roster de un servicio NUEVO: solo estado Activo
 *  (excluye inactivos, visitantes y cualquier baja: trasladado, fallecido…). */
export async function listMembersRoster(churchId: number): Promise<{ id: number; nombre: string }[]> {
  const d = await getDb();
  return d.select<{ id: number; nombre: string }[]>(
    "SELECT id, nombre FROM members WHERE church_id = $1 AND activo = 1 AND estado_membresia = 'activo' AND deleted = 0 ORDER BY nombre",
    [churchId]
  );
}

/** Roster de ASISTENCIA de la Bitácora: además de los activos incluye
 *  visitantes y personas en proceso — su asistencia también se registra, y
 *  así un visitante recurrente se marca con un clic en vez de reescribirlo
 *  como texto libre en cada servicio. */
export async function listMembersAsistencia(
  churchId: number
): Promise<{ id: number; nombre: string; estado: string }[]> {
  const d = await getDb();
  return d.select<{ id: number; nombre: string; estado: string }[]>(
    `SELECT id, nombre, estado_membresia AS estado FROM members
      WHERE church_id = $1 AND activo = 1
        AND estado_membresia IN ('activo', 'visitante', 'enProceso')
        AND deleted = 0
      ORDER BY nombre`,
    [churchId]
  );
}

/** Alta de un visitante de la Bitácora directo al padrón, con estado
 *  "visitante": su asistencia queda ligada a members desde el primer día y,
 *  cuando se convierta en miembro, su historial ya es uno solo. */
export async function insertVisitanteComoMiembro(
  churchId: number,
  v: ServicioVisitante,
  fechaServicio: string
): Promise<number | null> {
  const d = await getDb();
  const notas = [
    v.invitado_por?.trim() ? i18n.t("servicios.notaInvitadoPor", { nombre: v.invitado_por.trim() }) : null,
    v.notas?.trim() || null,
  ].filter(Boolean).join(" · ") || null;
  await d.execute(
    `INSERT INTO members (church_id, nombre, email, telefono, etiquetas, fecha_ingreso, notas, estado_membresia, uid, updated_at)
     VALUES ($1,$2,$3,$4,'[]',$5,$6,'visitante',$7,datetime('now'))`,
    [
      churchId,
      v.nombre.trim(),
      (v.correo ?? "").trim() || null,
      (v.telefono ?? "").trim() || null,
      fechaServicio,
      notas,
      crypto.randomUUID(),
    ]
  );
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  return rows[0]?.id ?? null;
}

// ---------- Mensajes internos (tesorería ↔ secretaría) ----------

export interface Mensaje {
  id: number;
  church_id: number;
  /** Rol que envió el mensaje: "tesorero" | "secretaria". */
  de_rol: string;
  cuerpo: string;
  leido: number;
  creado_en: string;
}

export async function listMensajes(churchId: number): Promise<Mensaje[]> {
  const d = await getDb();
  return d.select<Mensaje[]>(
    "SELECT * FROM mensajes WHERE church_id = $1 AND deleted = 0 ORDER BY id ASC",
    [churchId]
  );
}

export async function insertMensaje(churchId: number, deRol: string, cuerpo: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO mensajes (church_id, de_rol, cuerpo, uid, updated_at) VALUES ($1, $2, $3, $4, datetime('now'))",
    [churchId, deRol, cuerpo.trim(), crypto.randomUUID()]
  );
}

/** Marca como leídos los mensajes que recibió `paraRol` (los que NO envió él).
 *  Devuelve cuántos marcó (0 si no había ninguno sin leer) para que la UI evite
 *  refrescos innecesarios. */
export async function marcarMensajesLeidos(churchId: number, paraRol: string): Promise<number> {
  const d = await getDb();
  const res = await d.execute(
    "UPDATE mensajes SET leido = 1, updated_at = datetime('now') WHERE church_id = $1 AND de_rol <> $2 AND leido = 0",
    [churchId, paraRol]
  );
  return res.rowsAffected ?? 0;
}

/** Borrado SUAVE (deleted = 1) para que se propague en la sincronización. */
export async function deleteMensaje(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE mensajes SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

export async function countMensajesNoLeidos(churchId: number, paraRol: string): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM mensajes WHERE church_id = $1 AND de_rol <> $2 AND leido = 0 AND deleted = 0",
    [churchId, paraRol]
  );
  return rows[0]?.n ?? 0;
}

// ---------- Agenda y calendarios ----------

/** Catálogo de tipos de actividad (clave estable; la etiqueta la resuelve i18n). */
export const TIPOS_ACTIVIDAD = [
  "cultoRegular", "cultoEspecial", "reunionLideres", "reunionAdministrativa", "asamblea",
  "escuelaBiblica", "santaCena", "bautismo", "presentacionNinos", "boda", "funeral",
  "vigilia", "campana", "congreso", "retiro", "ensayo", "actividadJuvenil", "actividadDamas",
  "actividadCaballeros", "actividadInfantil", "actividadComunitaria", "fechaLimite", "otra",
] as const;

/** Estados posibles de una actividad. */
export const ESTADOS_ACTIVIDAD = [
  "borrador", "programada", "confirmada", "completada", "cancelada",
] as const;

// ---- Recurrencia (la serie se guarda como una maestra + regla, no copias) ----

export type RecurrenciaTipo = "ninguna" | "semanal" | "quincenal" | "mensual" | "anual" | "personalizada";
export type RecFin =
  | { tipo: "nunca" }
  | { tipo: "hasta"; hasta: string }
  | { tipo: "conteo"; conteo: number };

export interface Recurrencia {
  tipo: RecurrenciaTipo;
  /** Cada cuántas unidades (semanas/meses/años). semanal=1, quincenal=2. */
  intervalo: number;
  /** Días de la semana (0=domingo … 6=sábado) para semanal/personalizada. */
  diasSemana: number[];
  fin: RecFin;
}

/** Override o borrado de una ocurrencia concreta de la serie. */
export interface ExcepcionAgenda {
  /** Fecha original de la ocurrencia (YYYY-MM-DD) que identifica la excepción. */
  fechaOriginal: string;
  /** true = esa ocurrencia se borra. */
  eliminada?: boolean;
  /** Campos que cambian solo en esa ocurrencia. */
  cambios?: Partial<Pick<Actividad,
    "nombre" | "tipo" | "tipo_personalizado" | "fecha" | "hora_inicio" | "hora_fin" | "dia_completo" |
    "lugar" | "descripcion" | "responsable_member_id" | "responsable_persona" | "responsable_ministerio" |
    "invitado" | "contacto" | "estado" | "es_fecha_importante">>;
}

// El parseo y la expansión de recurrencia viven en el servicio puro (sin
// dependencias de Tauri) para poder probarlos de forma aislada; se reexportan
// para que el resto de la app los consuma desde db.ts como antes.
export { RECURRENCIA_NINGUNA, parseRecurrencia, parseExcepciones };

/** Fila cruda de la tabla agenda (fechas como cadenas locales, sin objetos Date). */
export interface Actividad {
  id: number;
  church_id: number;
  nombre: string;
  tipo: string;
  tipo_personalizado: string | null;
  /** YYYY-MM-DD (fecha local, nunca UTC). */
  fecha: string;
  /** HH:mm o null. */
  hora_inicio: string | null;
  hora_fin: string | null;
  dia_completo: number;
  lugar: string | null;
  descripcion: string | null;
  /** Referencia al miembro (solo el id); el nombre se resuelve al render. */
  responsable_member_id: number | null;
  /** Persona externa por texto libre (alternativa al miembro). */
  responsable_persona: string | null;
  responsable_ministerio: string | null;
  invitado: string | null;
  contacto: string | null;
  estado: string;
  /** JSON de la regla de recurrencia (fases futuras). */
  recurrencia: string;
  /** JSON de excepciones de la serie (fases futuras). */
  excepciones: string;
  /** JSON de offsets de recordatorio (fases futuras). */
  recordatorios: string;
  es_fecha_importante: number;
  creado_en: string;
  modificado_en: string;
}

export interface NewActividad {
  nombre: string;
  tipo: string;
  tipo_personalizado: string | null;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  dia_completo: boolean;
  lugar: string | null;
  descripcion: string | null;
  responsable_member_id: number | null;
  responsable_persona: string | null;
  responsable_ministerio: string | null;
  invitado: string | null;
  contacto: string | null;
  estado: string;
  es_fecha_importante: boolean;
  /** Regla de recurrencia; por defecto "ninguna" (evento único). */
  recurrencia?: Recurrencia;
  /** Offsets de recordatorio en días antes de la fecha (0 = el mismo día). */
  recordatorios?: number[];
}

/** Parsea el JSON de recordatorios de una actividad a una lista de días de anticipación. */
export function parseRecordatorios(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number" && x >= 0).sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

export async function listActividades(churchId: number): Promise<Actividad[]> {
  const d = await getDb();
  return d.select<Actividad[]>(
    "SELECT * FROM agenda WHERE church_id = $1 AND deleted = 0 ORDER BY fecha ASC, hora_inicio ASC, id ASC",
    [churchId]
  );
}

function actividadParams(a: NewActividad): unknown[] {
  const diaCompleto = a.dia_completo;
  return [
    a.nombre.trim(),
    a.tipo,
    a.tipo === "otra" ? (a.tipo_personalizado?.trim() || null) : null,
    a.fecha,
    // Si es de día completo no se guardan horas (los campos ocultos no se persisten).
    diaCompleto ? null : (a.hora_inicio || null),
    diaCompleto ? null : (a.hora_fin || null),
    diaCompleto ? 1 : 0,
    a.lugar?.trim() || null,
    a.descripcion?.trim() || null,
    a.responsable_member_id,
    a.responsable_member_id ? null : (a.responsable_persona?.trim() || null),
    a.responsable_ministerio?.trim() || null,
    a.invitado?.trim() || null,
    a.contacto?.trim() || null,
    a.estado,
    a.es_fecha_importante ? 1 : 0,
    JSON.stringify(a.recurrencia ?? RECURRENCIA_NINGUNA),
    JSON.stringify(a.recordatorios ?? []),
  ];
}

export async function insertActividad(churchId: number, a: NewActividad): Promise<number> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO agenda (
       nombre, tipo, tipo_personalizado, fecha, hora_inicio, hora_fin, dia_completo,
       lugar, descripcion, responsable_member_id, responsable_persona, responsable_ministerio,
       invitado, contacto, estado, es_fecha_importante, recurrencia, recordatorios, church_id, uid, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,datetime('now'))`,
    [...actividadParams(a), churchId, crypto.randomUUID()]
  );
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  return rows[0]?.id ?? 0;
}

export async function updateActividad(id: number, churchId: number, a: NewActividad): Promise<void> {
  const d = await getDb();
  // Nota: `excepciones` se administra aparte y no se toca aquí.
  await d.execute(
    `UPDATE agenda SET
       nombre = $1, tipo = $2, tipo_personalizado = $3, fecha = $4, hora_inicio = $5,
       hora_fin = $6, dia_completo = $7, lugar = $8, descripcion = $9,
       responsable_member_id = $10, responsable_persona = $11, responsable_ministerio = $12,
       invitado = $13, contacto = $14, estado = $15, es_fecha_importante = $16, recurrencia = $17,
       recordatorios = $18, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now')
     WHERE id = $19 AND church_id = $20`,
    [...actividadParams(a), id, churchId]
  );
}

/** Agrega o reemplaza una excepción (override o borrado) en la serie maestra. */
export async function agregarExcepcionAgenda(masterId: number, churchId: number, exc: ExcepcionAgenda): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ excepciones: string }[]>(
    "SELECT excepciones FROM agenda WHERE id = $1 AND church_id = $2", [masterId, churchId]
  );
  const previas = parseExcepciones(rows[0]?.excepciones);
  const anterior = previas.find((e) => e.fechaOriginal === exc.fechaOriginal);
  const lista = previas.filter((e) => e.fechaOriginal !== exc.fechaOriginal);
  // Si ambos son overrides, se fusionan los cambios para no perder ediciones previas.
  const fusionada: ExcepcionAgenda = (!exc.eliminada && anterior && !anterior.eliminada)
    ? { fechaOriginal: exc.fechaOriginal, cambios: { ...anterior.cambios, ...exc.cambios } }
    : exc;
  lista.push(fusionada);
  await d.execute(
    "UPDATE agenda SET excepciones = $1, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now') WHERE id = $2 AND church_id = $3",
    [JSON.stringify(lista), masterId, churchId]
  );
}

function diaAntes(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Cierra la serie para que termine el día ANTES de `desdeISO` (el punto de
 *  corte de "esta y las siguientes"). Poda las excepciones desde el corte. */
export async function truncarSerieAgenda(masterId: number, churchId: number, desdeISO: string): Promise<void> {
  const d = await getDb();
  const rows = await d.select<{ recurrencia: string; excepciones: string }[]>(
    "SELECT recurrencia, excepciones FROM agenda WHERE id = $1 AND church_id = $2", [masterId, churchId]
  );
  const rec = parseRecurrencia(rows[0]?.recurrencia);
  rec.fin = { tipo: "hasta", hasta: diaAntes(desdeISO) };
  const exc = parseExcepciones(rows[0]?.excepciones).filter((e) => e.fechaOriginal < desdeISO);
  await d.execute(
    "UPDATE agenda SET recurrencia = $1, excepciones = $2, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now') WHERE id = $3 AND church_id = $4",
    [JSON.stringify(rec), JSON.stringify(exc), masterId, churchId]
  );
}

/** Cambia solo el estado (confirmar/completar/cancelar) sin abrir el editor. */
export async function setEstadoActividad(id: number, churchId: number, estado: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE agenda SET estado = $1, modificado_en = datetime('now', 'localtime'), updated_at = datetime('now') WHERE id = $2 AND church_id = $3",
    [estado, id, churchId]
  );
}

export async function deleteActividad(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE agenda SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2", [id, churchId]);
}

/** Cuántos servicios referencian a un miembro (para archivar en vez de borrar). */
export async function countMemberAsistencias(memberId: number, churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    `SELECT count(*) AS n
       FROM servicio_asistencia a
       JOIN servicios s ON s.id = a.servicio_id
      WHERE a.member_id = $1 AND s.church_id = $2 AND s.deleted = 0 AND a.deleted = 0`,
    [memberId, churchId]
  );
  return rows[0]?.n ?? 0;
}

export interface MemberAsistenciaHist {
  fecha: string;
  tipo: string;
  presente: boolean;
  razon: string | null;
  razon_otra: string | null;
}

export interface MemberAsistenciaStats {
  /** Servicios en los que el miembro formaba parte del roster (denominador). */
  enRoster: number;
  asistencias: number;
  ausencias: number;
  ultimaAsistencia: string | null;
  /** asistencias / enRoster, en 0–100; null si enRoster = 0. */
  pct: number | null;
  /** Ausencias consecutivas hasta el servicio más reciente en su roster (global,
   *  todos los tipos). Las justificadas cuentan para la racha… */
  rachaAusencias: number;
  /** …pero se reportan aparte para no disparar "requiere seguimiento" en falso. */
  rachaJustificadas: number;
  historial: MemberAsistenciaHist[];
}

export async function memberAsistenciaStats(memberId: number, churchId: number): Promise<MemberAsistenciaStats> {
  const d = await getDb();
  const rows = await d.select<{
    fecha: string; tipo: string; presente: number; razon: string | null; razon_otra: string | null;
  }[]>(
    `SELECT s.fecha, s.tipo, a.presente, a.razon, a.razon_otra
       FROM servicio_asistencia a
       JOIN servicios s ON s.id = a.servicio_id
      WHERE a.member_id = $1 AND s.church_id = $2 AND s.deleted = 0 AND a.deleted = 0
      ORDER BY s.fecha DESC, s.id DESC`,
    [memberId, churchId]
  );
  const historial: MemberAsistenciaHist[] = rows.map((r) => ({
    fecha: r.fecha,
    tipo: r.tipo,
    presente: r.presente === 1,
    razon: r.razon,
    razon_otra: r.razon_otra,
  }));
  const enRoster = historial.length;
  const asistencias = historial.filter((h) => h.presente).length;
  let rachaAusencias = 0;
  let rachaJustificadas = 0;
  for (const h of historial) {
    if (h.presente) break;
    rachaAusencias++;
    if (h.razon === "justificada") rachaJustificadas++;
  }
  return {
    enRoster,
    asistencias,
    ausencias: enRoster - asistencias,
    ultimaAsistencia: historial.find((h) => h.presente)?.fecha ?? null,
    pct: enRoster > 0 ? Math.round((asistencias / enRoster) * 100) : null,
    rachaAusencias,
    rachaJustificadas,
    historial,
  };
}

/** TODOS los movimientos (incluidos pendientes y rechazados), para respaldo. */
export async function listAllTxForExport(churchId: number): Promise<Tx[]> {
  const d = await getDb();
  return d.select<Tx[]>(
    `SELECT t.*, m.nombre AS member_nombre
       FROM transactions t
       LEFT JOIN members m ON m.id = t.member_id
      WHERE t.church_id = $1 AND t.deleted = 0
      ORDER BY t.fecha ASC, t.id ASC`,
    [churchId]
  );
}

export async function countMemberTx(memberId: number, churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE member_id = $1 AND church_id = $2 AND deleted = 0",
    [memberId, churchId]
  );
  return rows[0]?.n ?? 0;
}

/** Borrado SUAVE: marca deleted = 1 (no borra físico) para que el borrado se
 *  propague en la sincronización en vez de "revivir" al bajar de la nube.
 *  Las listas de miembros excluyen deleted = 1, así que desaparece de la UI. */
export async function deleteMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE members SET deleted = 1, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

/** Deshace un borrado suave (para el "Deshacer" del toast): conserva el mismo
 *  uid, así que la sincronización lo trata como una reactivación de la fila. */
export async function undeleteMember(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE members SET deleted = 0, updated_at = datetime('now') WHERE id = $1 AND church_id = $2",
    [id, churchId]
  );
}

// ---------- Movimientos recurrentes (ingreso o gasto fijo) ----------
//
// El usuario define el movimiento una sola vez ("¿Este gasto/ingreso se
// repite todos los meses?" en el modal de Nuevo registro); la definición se
// guarda aquí y se MATERIALIZA como transacciones normales, una por mes,
// SOLO para meses ya concluidos: desde enero (del año de la fecha elegida)
// hasta el mes pasado. El mes en curso no se contabiliza hasta que termina
// — se registra automáticamente la primera vez que la app se abre en el
// mes siguiente. Nunca se generan meses futuros. ultimo_mes_generado hace
// la operación idempotente. La tabla se sigue llamando "gastos_recurrentes"
// por compatibilidad con instalaciones existentes (migración v8); la
// columna "tipo" (migración v9) la generaliza a también cubrir ingresos.

export interface MovimientoRecurrente {
  id: number;
  church_id: number;
  tipo: "ingreso" | "gasto";
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

export interface NewMovimientoRecurrente {
  tipo: "ingreso" | "gasto";
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

/** Campos editables de una definición ya creada — tipo y mes_inicio no
 *  cambian (alterarían el historial ya generado); solo afectan a los
 *  meses que se generen de aquí en adelante. */
export interface MovimientoRecurrenteUpdate {
  categoria: string;
  subcategoria?: string | null;
  concepto: string;
  detalle?: string | null;
  monto: number;
  metodo_pago: string;
  beneficiario?: string | null;
  beneficiario_rfc?: string | null;
  dia: number;
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
  def: MovimientoRecurrente,
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
         member_id, beneficiario, beneficiario_rfc, emitir_constancia, notas, estado, comprobante_path, recurrente_id,
         uid, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,0,NULL,'aprobado',NULL,$13,$14,datetime('now'))`,
      [
        def.church_id, def.tipo, def.categoria, def.subcategoria, def.concepto, def.detalle,
        fechaEnMes(mes, def.dia), def.monto, moneda, def.metodo_pago,
        def.beneficiario, def.beneficiario_rfc, def.id, crypto.randomUUID(),
      ]
    );
  }
  await d.execute(
    "UPDATE gastos_recurrentes SET ultimo_mes_generado = $1 WHERE id = $2",
    [marcaHasta, def.id]
  );
  return meses.length;
}

/** Crea la definición y registra de inmediato los meses ya concluidos
 *  (enero→mes pasado). Devuelve cuántos meses se registraron. */
export async function insertMovimientoRecurrente(
  churchId: number,
  moneda: string,
  g: NewMovimientoRecurrente,
  /** Mes "YYYY-MM" que NO debe generarse (cuando el movimiento de ese mes
   *  ya existe — p. ej. al convertir en recurrente uno ya registrado). */
  skipMes?: string
): Promise<number> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO gastos_recurrentes
      (church_id, tipo, categoria, subcategoria, concepto, detalle, monto, metodo_pago,
       beneficiario, beneficiario_rfc, dia, mes_inicio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      churchId, g.tipo, g.categoria, g.subcategoria ?? null, g.concepto, g.detalle ?? null,
      g.monto, g.metodo_pago, g.beneficiario ?? null, g.beneficiario_rfc ?? null,
      g.dia, g.mes_inicio,
    ]
  );
  const rows = await d.select<MovimientoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 ORDER BY id DESC LIMIT 1",
    [churchId]
  );
  return materializarDef(d, rows[0], moneda, skipMes);
}

/** Actualiza los datos de una definición existente (monto, día, categoría,
 *  concepto, método, beneficiario). Los meses ya generados NO se corrigen
 *  retroactivamente — solo cambia lo que se genere de aquí en adelante,
 *  igual que si hubieras cambiado el monto de la renta a partir de ahora. */
export async function updateMovimientoRecurrente(
  id: number,
  churchId: number,
  g: MovimientoRecurrenteUpdate
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `UPDATE gastos_recurrentes SET
       categoria = $1, subcategoria = $2, concepto = $3, detalle = $4, monto = $5,
       metodo_pago = $6, beneficiario = $7, beneficiario_rfc = $8, dia = $9
     WHERE id = $10 AND church_id = $11`,
    [
      g.categoria, g.subcategoria ?? null, g.concepto, g.detalle ?? null, g.monto,
      g.metodo_pago, g.beneficiario ?? null, g.beneficiario_rfc ?? null, g.dia,
      id, churchId,
    ]
  );
}

/** Registra los meses que hayan llegado desde la última apertura de la app,
 *  para todas las definiciones activas (ingreso y gasto). Idempotente. */
export async function materializeMovimientosRecurrentes(churchId: number, moneda: string): Promise<number> {
  const d = await getDb();
  const hastaMes = currentMonth();
  const defs = await d.select<MovimientoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 AND (ultimo_mes_generado IS NULL OR ultimo_mes_generado < $2)",
    [churchId, prevMonth(hastaMes)]
  );
  let total = 0;
  for (const def of defs) {
    total += await materializarDef(d, def, moneda);
  }
  return total;
}

export async function listMovimientosRecurrentes(
  churchId: number,
  tipo?: "ingreso" | "gasto"
): Promise<MovimientoRecurrente[]> {
  const d = await getDb();
  if (tipo) {
    return d.select<MovimientoRecurrente[]>(
      "SELECT * FROM gastos_recurrentes WHERE church_id = $1 AND tipo = $2 ORDER BY concepto",
      [churchId, tipo]
    );
  }
  return d.select<MovimientoRecurrente[]>(
    "SELECT * FROM gastos_recurrentes WHERE church_id = $1 ORDER BY concepto",
    [churchId]
  );
}

/** Elimina la definición: deja de generar meses nuevos. Las transacciones
 *  ya registradas se conservan (son historial contable real). */
export async function deleteMovimientoRecurrente(id: number, churchId: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM gastos_recurrentes WHERE id = $1 AND church_id = $2", [id, churchId]);
}

/** Movimientos vivos generados por una serie recurrente. */
export async function countTxDeSerie(recurrenteId: number, churchId: number): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT count(*) AS n FROM transactions WHERE recurrente_id = $1 AND church_id = $2 AND deleted = 0",
    [recurrenteId, churchId]
  );
  return rows[0]?.n ?? 0;
}

/** Borra (suave, para que el sync lo propague) TODOS los movimientos que
 *  generó una serie. Se usa junto con deleteMovimientoRecurrente cuando el
 *  usuario decide eliminar la serie completa y no solo la definición. */
export async function deleteTxDeSerie(recurrenteId: number, churchId: number): Promise<number> {
  const d = await getDb();
  const res = await d.execute(
    "UPDATE transactions SET deleted = 1, updated_at = datetime('now') WHERE recurrente_id = $1 AND church_id = $2 AND deleted = 0",
    [recurrenteId, churchId]
  );
  return res.rowsAffected ?? 0;
}

/** Corrige el monto de TODOS los movimientos ya generados por la serie
 *  (p. ej. una renta capturada mal): la definición se actualiza aparte con
 *  updateMovimientoRecurrente. */
export async function updateMontoDeSerie(recurrenteId: number, churchId: number, monto: number): Promise<number> {
  const d = await getDb();
  const res = await d.execute(
    "UPDATE transactions SET monto = $3, updated_at = datetime('now') WHERE recurrente_id = $1 AND church_id = $2 AND deleted = 0",
    [recurrenteId, churchId, monto]
  );
  return res.rowsAffected ?? 0;
}

// ---------- Formato ----------

// Símbolo activo de la app. La app usa UNA moneda por iglesia, así que basta un
// símbolo global que se fija al cargar (o cambiar) la iglesia; fmtMoney lo lee.
let simboloActivo = "$";

/** Fija el símbolo que usará fmtMoney según el código de moneda de la iglesia. */
export function setMonedaActiva(code: string): void {
  simboloActivo = currencySymbol(code);
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}${simboloActivo}${abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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

/** Fecha local de hoy como "YYYY-MM-DD" (nunca UTC; base de la agenda). */
export function hoyISO(): string {
  return nowLocalIso().slice(0, 10);
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

// ---------- Borrado masivo (Ajustes → solo administrador) ----------

/** Datos transaccionales de la iglesia, en orden seguro para borrar. Todas
 *  tienen columna church_id (servicio_asistencia se limpia por servicio). */
const TABLAS_DATOS = [
  "transactions", "depositos_bancarios", "members", "actas", "cartas",
  "solicitudes", "traslados_salida", "traslados_entrada", "servicios",
  "agenda", "mensajes", "gastos_recurrentes",
] as const;

/** Opción A: borra todos los REGISTROS de la iglesia (movimientos, miembros,
 *  cartas, actas, servicios, etc.) pero CONSERVA la configuración: la fila de
 *  la iglesia (nombre, logo, firmas, datos del tesorero/pastor), las categorías
 *  personalizadas, las plantillas de cartas y los usuarios locales. */
export async function borrarDatosIglesia(churchId: number): Promise<void> {
  const d = await getDb();
  // Todo dentro de UNA transacción con defer_foreign_keys: SQLite pospone la
  // comprobación de claves foráneas hasta el COMMIT, cuando ya no queda
  // ninguna fila hija, así que el orden de borrado deja de importar y la
  // operación es atómica (todo o nada). Antes fallaba con "FOREIGN KEY
  // constraint failed" porque members se borraba antes que cartas,
  // solicitudes y traslados, que lo referencian con RESTRICT (y cartas antes
  // que quienes la referencian). Verificado con SQLite real reproduciendo el
  // esquema y sus claves foráneas.
  await d.execute("BEGIN");
  try {
    await d.execute("PRAGMA defer_foreign_keys = ON");
    await d.execute(
      "DELETE FROM servicio_asistencia WHERE servicio_id IN (SELECT id FROM servicios WHERE church_id = $1)",
      [churchId]
    );
    for (const tabla of TABLAS_DATOS) {
      await d.execute(`DELETE FROM ${tabla} WHERE church_id = $1`, [churchId]);
    }
    await d.execute("COMMIT");
  } catch (e) {
    await d.execute("ROLLBACK").catch(() => { /* la transacción ya se deshizo */ });
    throw e;
  }
}

/** Opción B: reinicio de fábrica. Borra TODO, incluida la configuración de la
 *  iglesia, dejando la base como recién instalada. Tras llamarla, la app debe
 *  recargarse: getOrCreateChurch creará una iglesia nueva y saldrá la
 *  bienvenida. */
export async function reinicioDeFabrica(): Promise<void> {
  const d = await getDb();
  const todas = [
    "servicio_asistencia", ...TABLAS_DATOS,
    "plantillas", "categorias_custom", "usuarios", "churches",
  ];
  // Mismo motivo que en borrarDatosIglesia: defer_foreign_keys dentro de una
  // transacción para que el orden no importe y el reinicio sea atómico. Aquí
  // también se borraba members antes que cartas/solicitudes/traslados.
  await d.execute("BEGIN");
  try {
    await d.execute("PRAGMA defer_foreign_keys = ON");
    for (const tabla of todas) {
      await d.execute(`DELETE FROM ${tabla}`);
    }
    await d.execute("COMMIT");
  } catch (e) {
    await d.execute("ROLLBACK").catch(() => { /* la transacción ya se deshizo */ });
    throw e;
  }
}
