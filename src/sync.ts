// ============================================================================
// Tamio · Motor de sincronización — MIEMBROS (E4) + TRANSACCIONES (T2)
// ----------------------------------------------------------------------------
// Offline-first: la app sigue usando SQLite local; esto sube los cambios
// locales a Supabase y baja los de las otras Macs de la misma iglesia.
//
// Estrategia: "el más nuevo gana" (last-write-wins) por fila, comparando
// `updated_at`. La identidad global es `uid` (no el id numérico local, que
// choca entre dispositivos). El aislamiento por iglesia lo hace RLS en la nube.
//
// Borrados: SUAVES en miembros y transacciones (deleted = 1). Se propagan por
// la columna `deleted`; las listas/consultas locales excluyen los borrados.
//
// Vínculo transacción→aportante: en la nube se guarda `member_uid` (uid global
// del miembro), no el `member_id` local (que difiere por dispositivo). Al subir
// se mapea member_id→member_uid; al bajar, member_uid→member_id local. Por eso
// se sincronizan primero los miembros y luego las transacciones.
// ============================================================================

import { getDb, dedupPlantillasIniciales, loadCategoriasCustom, repararFoliosDuplicados } from "./db";
import { supabase } from "./supabase";

// Columnas de datos que existen igual en local (SQLite) y en la nube (Postgres).
// Se excluyen: `id` (local, numérico), `church_id` (se mapea aparte: int↔uuid) y
// los metadatos de sync (`uid`, `updated_at`, `deleted`), que se tratan aparte.
const DATA_COLS = [
  "nombre", "email", "telefono", "rfc", "direccion", "etiquetas", "fecha_ingreso",
  "notas", "activo", "created_at", "fecha_baja", "motivo_baja", "estado_membresia",
  "fecha_congregacion", "iglesia_anterior", "bautizado_agua", "fecha_bautismo_agua",
  "bautizado_espiritu", "fecha_bautismo_espiritu", "curso_membresia", "ministerios",
  "ministerios_interes", "instrumentos", "habilidades", "disponibilidad",
  "interes_servir", "cargos", "historial_estados", "seguimiento_revisado_en",
  "seguimiento_notas",
] as const;

type FilaLocal = Record<string, unknown> & {
  id: number;
  uid: string | null;
  updated_at: string | null;
  deleted: number;
};

type FilaRemota = Record<string, unknown> & {
  uid: string;
  church_id: string;
  updated_at: string;
  deleted: boolean;
};

export type MotivoSync = "sin-login" | "sin-conexion" | "sin-iglesia" | "error";

export interface ResultadoSync {
  ok: boolean;
  /** Filas locales enviadas a la nube. */
  subidos: number;
  /** Filas de la nube aplicadas en local. */
  bajados: number;
  motivo?: MotivoSync;
  error?: string;
}

/** Convierte una marca de tiempo a milisegundos epoch para comparar quién es
 *  más nuevo. Acepta el formato de SQLite ('YYYY-MM-DD HH:MM:SS', en UTC) y el
 *  ISO con zona que devuelve Postgres/timestamptz. */
function epoch(s: unknown): number {
  if (typeof s !== "string" || !s) return 0;
  const iso = /[tT]/.test(s) ? s : s.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Lee el church_id (UUID) de la iglesia del usuario desde su perfil en la nube.
 *  Es el destino de todas sus filas y lo que RLS usa para aislar iglesias. */
async function churchIdRemoto(): Promise<string | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const authId = userData.user?.id;
  if (!authId) return null;
  const { data } = await supabase
    .from("perfiles")
    .select("church_id")
    .eq("id", authId)
    .single();
  return (data as { church_id?: string } | null)?.church_id ?? null;
}

/** Baja el plan de suscripción desde la nube (autoridad) y lo aplica en local.
 *  Solo lectura nube→local: el plan lo escriben el webhook de pago o el dueño
 *  en el panel de Supabase, nunca el cliente. Si las columnas aún no existen
 *  en la nube (SQL sub-1 sin correr), no hace nada y no rompe el sync. */
export async function sincronizarPlan(churchIdLocal: number): Promise<void> {
  if (!supabase) return;
  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return;
  const { data, error } = await supabase
    .from("iglesias")
    .select("plan, sub_estado, sub_vence")
    .eq("id", remoteChurch)
    .single();
  if (error || !data) return; // columnas ausentes o sin permiso: se ignora
  const plan = (data as { plan?: string }).plan;
  const estado = (data as { sub_estado?: string }).sub_estado;
  const vence = (data as { sub_vence?: string | null }).sub_vence ?? null;
  if (!plan || !estado) return;
  const d = await getDb();
  await d.execute(
    "UPDATE churches SET plan = $1, sub_estado = $2, sub_vence = $3 WHERE id = $4",
    [plan, estado, vence, churchIdLocal],
  );
}

/**
 * Sincroniza la tabla de miembros de una iglesia local contra Supabase.
 * No lanza excepciones: siempre devuelve un ResultadoSync (ok/motivo) para que
 * la UI pueda mostrar un estado claro.
 */
export async function sincronizarMiembros(churchIdLocal: number): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };

  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();

    // 1) Estado completo local y remoto. En el piloto el volumen es chico
    //    (miembros de una iglesia), así que traer todo es lo más simple y seguro.
    const locales = await d.select<FilaLocal[]>(
      "SELECT * FROM members WHERE church_id = $1",
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from("members")
      .select("*")
      .eq("church_id", remoteChurch);
    if (errPull) {
      return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    }
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    // 2) PUSH — subir filas locales que no están en la nube o son más nuevas.
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue; // tras la migración v23 siempre hay uid; guardia por si acaso
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of DATA_COLS) fila[c] = l[c] ?? null;
        // Se manda como ISO/UTC explícito para que Postgres lo guarde sin ambigüedad.
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from("members").upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // 3) PULL — aplicar en local las filas remotas que no existen o son más nuevas.
    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      const remotaGana = !l || epoch(r.updated_at) > epoch(l.updated_at);
      if (!remotaGana) continue;

      const valores = DATA_COLS.map((c) => r[c] ?? null);
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;

      if (l) {
        const sets = DATA_COLS.map((c, i) => `${c} = $${i + 1}`).join(", ");
        const n = DATA_COLS.length;
        await d.execute(
          `UPDATE members SET ${sets}, updated_at = $${n + 1}, deleted = $${n + 2} WHERE uid = $${n + 3}`,
          [...valores, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...DATA_COLS, "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO members (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

// ============================================================================
// TRANSACCIONES (T2)
// ============================================================================

// Columnas 1:1 entre local y nube. Se excluyen: `id`, `church_id` (int↔uuid),
// `member_id` (se mapea a `member_uid`), `recurrente_id` (link local, no viaja)
// y los metadatos de sync (`uid`, `updated_at`, `deleted`).
const TX_DATA_COLS = [
  "tipo", "categoria", "subcategoria", "concepto", "detalle", "fecha", "monto",
  "moneda", "metodo_pago", "beneficiario", "beneficiario_rfc", "comprobante_path",
  "emitir_constancia", "estado", "notas", "created_at",
] as const;

/** Sincroniza las transacciones de una iglesia local contra Supabase, mapeando
 *  el vínculo con el aportante por `member_uid` (global) en vez del id local. */
export async function sincronizarTransacciones(churchIdLocal: number): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };

  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();

    // Mapas de miembros en ambos sentidos (id local ↔ uid global).
    const miembros = await d.select<{ id: number; uid: string | null }[]>(
      "SELECT id, uid FROM members WHERE church_id = $1",
      [churchIdLocal],
    );
    const uidPorId = new Map<number, string>();
    const idPorUid = new Map<string, number>();
    for (const m of miembros) {
      if (m.uid) { uidPorId.set(m.id, m.uid); idPorUid.set(m.uid, m.id); }
    }

    const locales = await d.select<FilaLocal[]>(
      "SELECT * FROM transactions WHERE church_id = $1",
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from("transactions")
      .select("*")
      .eq("church_id", remoteChurch);
    if (errPull) {
      return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    }
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    // PUSH — subir locales nuevas o más nuevas, mapeando member_id → member_uid.
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue;
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of TX_DATA_COLS) fila[c] = l[c] ?? null;
        const midLocal = l.member_id as number | null;
        fila.member_uid = midLocal != null ? uidPorId.get(midLocal) ?? null : null;
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from("transactions").upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // PULL — aplicar remotas nuevas o más nuevas, mapeando member_uid → member_id.
    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      const remotaGana = !l || epoch(r.updated_at) > epoch(l.updated_at);
      if (!remotaGana) continue;

      const valores = TX_DATA_COLS.map((c) => r[c] ?? null);
      const memberUid = r.member_uid as string | null;
      const memberIdLocal = memberUid ? idPorUid.get(memberUid) ?? null : null;
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;
      const n = TX_DATA_COLS.length;

      if (l) {
        const sets = TX_DATA_COLS.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await d.execute(
          `UPDATE transactions SET ${sets}, member_id = $${n + 1}, updated_at = $${n + 2}, deleted = $${n + 3} WHERE uid = $${n + 4}`,
          [...valores, memberIdLocal, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...TX_DATA_COLS, "member_id", "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO transactions (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, memberIdLocal, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

// ============================================================================
// DEPÓSITOS BANCARIOS (D1) — sin vínculos externos, igual de simple que miembros
// ============================================================================

const DEP_DATA_COLS = [
  "fecha", "periodo", "monto", "moneda", "cuenta_banco", "referencia",
  "comprobante_path", "notas", "created_at",
] as const;

/** Sincroniza los depósitos bancarios de una iglesia local contra Supabase. */
export async function sincronizarDepositos(churchIdLocal: number): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };

  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();

    const locales = await d.select<FilaLocal[]>(
      "SELECT * FROM depositos_bancarios WHERE church_id = $1",
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from("depositos_bancarios")
      .select("*")
      .eq("church_id", remoteChurch);
    if (errPull) {
      return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    }
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    // PUSH
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue;
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of DEP_DATA_COLS) fila[c] = l[c] ?? null;
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from("depositos_bancarios").upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // PULL
    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      if (l && !(epoch(r.updated_at) > epoch(l.updated_at))) continue;

      const valores = DEP_DATA_COLS.map((c) => r[c] ?? null);
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;
      const n = DEP_DATA_COLS.length;

      if (l) {
        const sets = DEP_DATA_COLS.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await d.execute(
          `UPDATE depositos_bancarios SET ${sets}, updated_at = $${n + 1}, deleted = $${n + 2} WHERE uid = $${n + 3}`,
          [...valores, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...DEP_DATA_COLS, "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO depositos_bancarios (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

// ============================================================================
// ACTAS (A1) — texto independiente, sin vínculos externos
// ============================================================================

const ACTA_DATA_COLS = [
  "folio", "tipo", "titulo", "fecha", "hora_inicio", "hora_cierre", "lugar",
  "preside", "secretario", "presentes", "ausentes", "invitados", "quorum",
  "agenda", "resumen", "mociones", "acuerdos", "estado", "confidencial",
  "fecha_aprobacion", "creado_en",
] as const;

/** Sincroniza las actas de una iglesia local contra Supabase. */
export async function sincronizarActas(churchIdLocal: number): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };

  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();

    const locales = await d.select<FilaLocal[]>(
      "SELECT * FROM actas WHERE church_id = $1",
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from("actas")
      .select("*")
      .eq("church_id", remoteChurch);
    if (errPull) {
      return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    }
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    // PUSH
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue;
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of ACTA_DATA_COLS) fila[c] = l[c] ?? null;
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from("actas").upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // PULL
    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      if (l && !(epoch(r.updated_at) > epoch(l.updated_at))) continue;

      const valores = ACTA_DATA_COLS.map((c) => r[c] ?? null);
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;
      const n = ACTA_DATA_COLS.length;

      if (l) {
        const sets = ACTA_DATA_COLS.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await d.execute(
          `UPDATE actas SET ${sets}, updated_at = $${n + 1}, deleted = $${n + 2} WHERE uid = $${n + 3}`,
          [...valores, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...ACTA_DATA_COLS, "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO actas (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

// ============================================================================
// CARTAS y SOLICITUDES (C1) — con vínculo a miembro (member_uid). El enlace
// mutuo carta↔solicitud NO se sincroniza (queda local en cada Mac).
// ============================================================================

const CARTA_DATA_COLS = [
  "numero_seq", "folio", "tipo", "fecha_emision", "lugar_emision", "destinatario_tipo",
  "destinatario_nombre", "destinatario_direccion", "asunto", "saludo", "cuerpo_html",
  "despedida", "firmas", "observaciones", "estado", "historial_estados",
  "entregada_a", "fecha_entrega", "creado_en", "modificado_en",
] as const;

const SOLICITUD_DATA_COLS = [
  "numero_seq", "folio", "solicitante_externo", "tipo_carta", "motivo", "fecha_solicitud",
  "fecha_requerida", "medio_entrega", "responsable", "prioridad", "estado", "observaciones",
  "historial_estados", "creado_en", "modificado_en",
] as const;

/** Sincroniza una tabla simple sin vínculos externos (LWW por uid). */
async function sincronizarTablaSimple(
  churchIdLocal: number,
  tabla: string,
  dataCols: readonly string[],
): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };
  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();
    const locales = await d.select<FilaLocal[]>(`SELECT * FROM ${tabla} WHERE church_id = $1`, [churchIdLocal]);

    const { data: remotasRaw, error: errPull } = await supabase.from(tabla).select("*").eq("church_id", remoteChurch);
    if (errPull) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue;
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of dataCols) fila[c] = l[c] ?? null;
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from(tabla).upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      if (l && !(epoch(r.updated_at) > epoch(l.updated_at))) continue;
      const valores = dataCols.map((c) => r[c] ?? null);
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;
      const n = dataCols.length;
      if (l) {
        const sets = dataCols.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await d.execute(
          `UPDATE ${tabla} SET ${sets}, updated_at = $${n + 1}, deleted = $${n + 2} WHERE uid = $${n + 3}`,
          [...valores, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...dataCols, "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

const SERVICIO_DATA_COLS = [
  "fecha", "tipo", "dirige", "predica", "titulo_mensaje", "texto_biblico", "resumen_mensaje",
  "participaciones", "tema_escuela", "maestro_escuela", "asistentes", "ausentes", "visitantes",
  "ninos", "jovenes", "adultos", "eventos", "creado_en",
] as const;

/** Sincroniza el registro de cultos (servicios). El roster por miembro
 *  (servicio_asistencia) NO se sincroniza: es una tabla de unión con clave
 *  compuesta y guardado por reemplazo total (pendiente aparte). */
export function sincronizarServicios(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaSimple(churchIdLocal, "servicios", SERVICIO_DATA_COLS);
}

/** Construye los mapas id local ↔ uid global de los miembros de una iglesia. */
async function cargarMapasMiembros(
  d: Awaited<ReturnType<typeof getDb>>,
  churchIdLocal: number,
): Promise<{ uidPorId: Map<number, string>; idPorUid: Map<string, number> }> {
  const miembros = await d.select<{ id: number; uid: string | null }[]>(
    "SELECT id, uid FROM members WHERE church_id = $1",
    [churchIdLocal],
  );
  const uidPorId = new Map<number, string>();
  const idPorUid = new Map<string, number>();
  for (const m of miembros) {
    if (m.uid) { uidPorId.set(m.id, m.uid); idPorUid.set(m.uid, m.id); }
  }
  return { uidPorId, idPorUid };
}

/** Sincroniza una tabla con vínculo a miembro, mapeando el id local del miembro
 *  (columna `memberCol`, p. ej. member_id o responsable_member_id) ↔ member_uid
 *  global. Las columnas de datos van en `dataCols`. */
async function sincronizarTablaConMiembro(
  churchIdLocal: number,
  tabla: string,
  dataCols: readonly string[],
  memberCol = "member_id",
): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };
  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();
    const { uidPorId, idPorUid } = await cargarMapasMiembros(d, churchIdLocal);

    const locales = await d.select<FilaLocal[]>(
      `SELECT * FROM ${tabla} WHERE church_id = $1`,
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from(tabla)
      .select("*")
      .eq("church_id", remoteChurch);
    if (errPull) {
      return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    }
    const remotas = (remotasRaw ?? []) as FilaRemota[];

    const remotasPorUid = new Map<string, FilaRemota>();
    for (const r of remotas) remotasPorUid.set(r.uid, r);
    const localesPorUid = new Map<string, FilaLocal>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid, l);

    // PUSH — mapeando member_id → member_uid.
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      if (!l.uid) continue;
      const r = remotasPorUid.get(l.uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        const fila: Record<string, unknown> = { uid: l.uid, church_id: remoteChurch };
        for (const c of dataCols) fila[c] = l[c] ?? null;
        const midLocal = l[memberCol] as number | null;
        fila.member_uid = midLocal != null ? uidPorId.get(midLocal) ?? null : null;
        fila.updated_at = new Date(epoch(l.updated_at) || Date.now()).toISOString();
        fila.deleted = l.deleted === 1;
        aSubir.push(fila);
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from(tabla).upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // PULL — mapeando member_uid → member_id local. No se toca el enlace mutuo.
    let bajados = 0;
    for (const r of remotas) {
      const l = localesPorUid.get(r.uid);
      if (l && !(epoch(r.updated_at) > epoch(l.updated_at))) continue;

      const valores = dataCols.map((c) => r[c] ?? null);
      const memberUid = r.member_uid as string | null;
      const memberIdLocal = memberUid ? idPorUid.get(memberUid) ?? null : null;
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();
      const del = r.deleted ? 1 : 0;
      const n = dataCols.length;

      if (l) {
        const sets = dataCols.map((c, i) => `${c} = $${i + 1}`).join(", ");
        await d.execute(
          `UPDATE ${tabla} SET ${sets}, ${memberCol} = $${n + 1}, updated_at = $${n + 2}, deleted = $${n + 3} WHERE uid = $${n + 4}`,
          [...valores, memberIdLocal, updatedAt, del, r.uid],
        );
      } else {
        const cols = ["church_id", ...dataCols, memberCol, "uid", "updated_at", "deleted"];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await d.execute(
          `INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${placeholders})`,
          [churchIdLocal, ...valores, memberIdLocal, r.uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

export async function sincronizarCartas(churchIdLocal: number): Promise<ResultadoSync> {
  const r = await sincronizarTablaConMiembro(churchIdLocal, "cartas", CARTA_DATA_COLS);
  // Dos equipos sin conexión pueden emitir el mismo folio (cada uno calculó la
  // misma seq); al juntarse aquí, se renumeran los repetidos. Un fallo en la
  // reparación no debe tumbar la sincronización completa.
  if (r.ok) {
    try { await repararFoliosDuplicados(churchIdLocal); } catch { /* noop */ }
  }
  return r;
}
export function sincronizarSolicitudes(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaConMiembro(churchIdLocal, "solicitudes", SOLICITUD_DATA_COLS);
}

// Traslados (TR1). Salida lleva member_id (obligatorio) y carta_id (NO se
// sincroniza, queda local). Entrada lleva member_id (opcional).
const TRASLADO_SALIDA_DATA_COLS = [
  "numero_seq", "folio", "fecha_solicitud", "motivo", "iglesia_destino", "pastor_receptor",
  "direccion", "ciudad", "region", "pais", "telefono", "email", "fecha_aprobacion",
  "aprobado_por", "fecha_entrega", "metodo_entrega", "confirmacion_recibida",
  "fecha_confirmacion", "observaciones", "estado", "historial_estados", "creado_en", "modificado_en",
] as const;

const TRASLADO_ENTRADA_DATA_COLS = [
  "numero_seq", "folio", "nombre", "fecha_nacimiento", "telefono", "correo", "direccion",
  "iglesia_procedencia", "pastor_anterior", "direccion_anterior", "fecha_emision_carta",
  "fecha_recepcion", "referencia_carta", "adjunto_path", "adjunto_nombre", "adjunto_fecha",
  "fecha_congregacion", "fecha_entrevista", "entrevistador", "decision", "fecha_aprobacion",
  "observaciones", "estado", "historial_estados", "creado_en", "modificado_en",
] as const;

export function sincronizarTrasladosSalida(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaConMiembro(churchIdLocal, "traslados_salida", TRASLADO_SALIDA_DATA_COLS);
}
export function sincronizarTrasladosEntrada(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaConMiembro(churchIdLocal, "traslados_entrada", TRASLADO_ENTRADA_DATA_COLS);
}

// Agenda (AG1): el responsable puede ser un miembro (responsable_member_id →
// member_uid). El resto es contenido del evento.
const AGENDA_DATA_COLS = [
  "nombre", "tipo", "tipo_personalizado", "fecha", "hora_inicio", "hora_fin", "dia_completo",
  "lugar", "descripcion", "responsable_persona", "responsable_ministerio", "invitado", "contacto",
  "estado", "recurrencia", "excepciones", "recordatorios", "es_fecha_importante",
  "creado_en", "modificado_en",
] as const;

export function sincronizarAgenda(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaConMiembro(churchIdLocal, "agenda", AGENDA_DATA_COLS, "responsable_member_id");
}

// Mensajes (MSG1): buzón interno entre roles, tabla simple.
const MENSAJE_DATA_COLS = ["de_rol", "cuerpo", "leido", "creado_en"] as const;

export function sincronizarMensajes(churchIdLocal: number): Promise<ResultadoSync> {
  return sincronizarTablaSimple(churchIdLocal, "mensajes", MENSAJE_DATA_COLS);
}

// Plantillas de cartas (P1): tabla simple. Cada equipo siembra sus iniciales,
// así que tras bajar se deduplica por nombre (soft-delete determinista).
const PLANTILLA_DATA_COLS = [
  "nombre", "tipo", "asunto", "saludo", "cuerpo_html", "despedida",
  "activa", "predeterminada", "es_inicial", "creado_en", "modificado_en",
] as const;

export async function sincronizarPlantillas(churchIdLocal: number): Promise<ResultadoSync> {
  const r = await sincronizarTablaSimple(churchIdLocal, "plantillas", PLANTILLA_DATA_COLS);
  if (r.ok) { try { await dedupPlantillasIniciales(churchIdLocal); } catch { /* noop */ } }
  return r;
}

// Categorías personalizadas (CAT1): tabla simple. Los movimientos ya las
// referencian por uid global (custom-<uid>), así que viajan sin ambigüedad.
const CATEGORIA_DATA_COLS = ["tipo", "nombre", "color", "created_at"] as const;

export async function sincronizarCategorias(churchIdLocal: number): Promise<ResultadoSync> {
  const r = await sincronizarTablaSimple(churchIdLocal, "categorias_custom", CATEGORIA_DATA_COLS);
  if (r.ok) { try { await loadCategoriasCustom(churchIdLocal); } catch { /* noop */ } }
  return r;
}

// ============================================================================
// ROSTER de asistencia (SV2) — tabla de unión con clave compuesta
// ----------------------------------------------------------------------------
// Enlaza a un servicio (servicio_uid) y a un miembro (member_uid), ambos por su
// uid global. Al subir se mapea id local → uid; al bajar, uid → id local. Se
// omiten filas cuyo servicio o miembro aún no exista localmente (se resuelven en
// una sincronización posterior, cuando su padre baje).
// ============================================================================

export async function sincronizarRoster(churchIdLocal: number): Promise<ResultadoSync> {
  if (!supabase) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-login" };
  const remoteChurch = await churchIdRemoto();
  if (!remoteChurch) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-iglesia" };

  try {
    const d = await getDb();
    const { uidPorId: uidPorMember, idPorUid: idPorMemberUid } = await cargarMapasMiembros(d, churchIdLocal);

    const servicios = await d.select<{ id: number; uid: string | null }[]>(
      "SELECT id, uid FROM servicios WHERE church_id = $1",
      [churchIdLocal],
    );
    const uidPorServ = new Map<number, string>();
    const servPorUid = new Map<string, number>();
    for (const s of servicios) if (s.uid) { uidPorServ.set(s.id, s.uid); servPorUid.set(s.uid, s.id); }

    const locales = await d.select<Record<string, unknown>[]>(
      `SELECT servicio_id, member_id, presente, razon, razon_otra, seguimiento, nombre_snapshot, uid, updated_at, deleted
         FROM servicio_asistencia WHERE church_id = $1`,
      [churchIdLocal],
    );

    const { data: remotasRaw, error: errPull } = await supabase
      .from("servicio_asistencia").select("*").eq("church_id", remoteChurch);
    if (errPull) return { ok: false, subidos: 0, bajados: 0, motivo: "sin-conexion", error: errPull.message };
    const remotas = (remotasRaw ?? []) as Record<string, unknown>[];

    const remotasPorUid = new Map<string, Record<string, unknown>>();
    for (const r of remotas) remotasPorUid.set(r.uid as string, r);
    const localesPorUid = new Map<string, Record<string, unknown>>();
    for (const l of locales) if (l.uid) localesPorUid.set(l.uid as string, l);

    // PUSH — mapeando servicio_id → servicio_uid y member_id → member_uid.
    const aSubir: Record<string, unknown>[] = [];
    for (const l of locales) {
      const uid = l.uid as string | null;
      if (!uid) continue;
      const servUid = uidPorServ.get(l.servicio_id as number);
      const memUid = uidPorMember.get(l.member_id as number);
      if (!servUid || !memUid) continue; // padre sin uid (no debería pasar): se omite
      const r = remotasPorUid.get(uid);
      if (!r || epoch(l.updated_at) > epoch(r.updated_at)) {
        aSubir.push({
          uid, church_id: remoteChurch, servicio_uid: servUid, member_uid: memUid,
          presente: (l.presente as number) === 1 ? 1 : 0,
          razon: l.razon ?? null, razon_otra: l.razon_otra ?? null,
          seguimiento: (l.seguimiento as number) === 1 ? 1 : 0,
          nombre_snapshot: l.nombre_snapshot ?? null,
          updated_at: new Date(epoch(l.updated_at) || Date.now()).toISOString(),
          deleted: (l.deleted as number) === 1,
        });
      }
    }
    if (aSubir.length > 0) {
      const { error } = await supabase.from("servicio_asistencia").upsert(aSubir, { onConflict: "uid" });
      if (error) return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: error.message };
    }

    // PULL — mapeando servicio_uid → id local y member_uid → id local.
    let bajados = 0;
    for (const r of remotas) {
      const uid = r.uid as string;
      const l = localesPorUid.get(uid);
      if (l && !(epoch(r.updated_at) > epoch(l.updated_at))) continue;
      const servIdLocal = servPorUid.get(r.servicio_uid as string);
      const memIdLocal = idPorMemberUid.get(r.member_uid as string);
      if (!servIdLocal || !memIdLocal) continue; // padre aún no sincronizado: luego

      const presente = r.presente ? 1 : 0;
      const seguimiento = r.seguimiento ? 1 : 0;
      const del = r.deleted ? 1 : 0;
      const updatedAt = typeof r.updated_at === "string" ? r.updated_at : new Date().toISOString();

      if (l) {
        await d.execute(
          `UPDATE servicio_asistencia
              SET presente = $1, razon = $2, razon_otra = $3, seguimiento = $4, nombre_snapshot = $5,
                  deleted = $6, updated_at = $7, church_id = $8, servicio_id = $9, member_id = $10
            WHERE uid = $11`,
          [presente, r.razon ?? null, r.razon_otra ?? null, seguimiento, r.nombre_snapshot ?? null,
            del, updatedAt, churchIdLocal, servIdLocal, memIdLocal, uid],
        );
      } else {
        // Respeta la clave compuesta (servicio_id, member_id): si ya hay una
        // fila local para ese par con otro uid, la remota gana ese lugar.
        await d.execute(
          "DELETE FROM servicio_asistencia WHERE servicio_id = $1 AND member_id = $2",
          [servIdLocal, memIdLocal],
        );
        await d.execute(
          `INSERT INTO servicio_asistencia
             (servicio_id, member_id, presente, razon, razon_otra, seguimiento, nombre_snapshot, church_id, uid, updated_at, deleted)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [servIdLocal, memIdLocal, presente, r.razon ?? null, r.razon_otra ?? null, seguimiento,
            r.nombre_snapshot ?? null, churchIdLocal, uid, updatedAt, del],
        );
      }
      bajados++;
    }

    return { ok: true, subidos: aSubir.length, bajados };
  } catch (e) {
    return { ok: false, subidos: 0, bajados: 0, motivo: "error", error: String(e) };
  }
}

// ============================================================================
// COMPACTACIÓN — purga física de "lápidas" (deleted = 1) + VACUUM
// ----------------------------------------------------------------------------
// Los borrados son SUAVES: la fila queda con deleted = 1 para que el borrado se
// propague por sincronización. Con el tiempo esas lápidas se acumulan. Compactar
// las elimina de verdad y recupera el espacio del archivo SQLite.
//
// Seguridad frente a "resurrección":
//  - Modo LOCAL (sin nube): no hay que propagar nada → se purgan TODAS.
//  - Modo NUBE: solo se purgan lápidas VIEJAS (> DIAS_TOMBSTONE), y además se
//    borran de la nube por uid para que no vuelvan a bajar. Si un equipo llevara
//    más de DIAS_TOMBSTONE sin sincronizar podría resucitar una fila; el margen
//    amplio hace ese caso prácticamente imposible en el uso real.
// ============================================================================

/** Margen (días) antes de purgar una lápida en modo nube: debe haberse
 *  propagado a todos los equipos con holgura. */
const DIAS_TOMBSTONE = 90;

export interface CompactResultado {
  ok: boolean;
  /** Filas físicamente eliminadas en local. */
  filasLocal: number;
  /** Filas eliminadas también en la nube (0 en modo local). */
  filasNube: number;
  /** true si corrió en modo local (sin sincronización). */
  soloLocal: boolean;
  error?: string;
}

/** Marca de corte en formato UTC de SQLite ('YYYY-MM-DD HH:MM:SS'). */
function cutoffUtc(dias: number): string {
  return new Date(Date.now() - dias * 86400000).toISOString().replace("T", " ").slice(0, 19);
}

/** Tablas de la base que tienen columna `deleted` y `church_id` (las que
 *  acumulan lápidas). Se descubre en tiempo real para cubrir tablas futuras. */
async function tablasConDeleted(
  d: Awaited<ReturnType<typeof getDb>>,
): Promise<{ tabla: string; tieneUid: boolean }[]> {
  const tablas = await d.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const res: { tabla: string; tieneUid: boolean }[] = [];
  for (const { name } of tablas) {
    // El nombre viene de sqlite_master (no de entrada del usuario): seguro.
    const cols = await d.select<{ name: string }[]>(`PRAGMA table_info(${name})`);
    const nombres = new Set(cols.map((c) => c.name));
    if (nombres.has("deleted") && nombres.has("church_id")) {
      res.push({ tabla: name, tieneUid: nombres.has("uid") });
    }
  }
  return res;
}

/** Cuántas lápidas hay listas para purgar (para mostrarlo en Ajustes). */
export async function contarPurgables(churchIdLocal: number): Promise<number> {
  const d = await getDb();
  const synced = Boolean(supabase) && (await churchIdRemoto()) !== null;
  const cutoff = synced ? cutoffUtc(DIAS_TOMBSTONE) : null;
  const tablas = await tablasConDeleted(d);
  let total = 0;
  for (const { tabla } of tablas) {
    const sql = cutoff
      ? `SELECT count(*) AS n FROM ${tabla} WHERE church_id = $1 AND deleted = 1 AND coalesce(updated_at, '') < $2`
      : `SELECT count(*) AS n FROM ${tabla} WHERE church_id = $1 AND deleted = 1`;
    const r = await d.select<{ n: number }[]>(sql, cutoff ? [churchIdLocal, cutoff] : [churchIdLocal]);
    total += r[0]?.n ?? 0;
  }
  return total;
}

/** Purga física las lápidas purgables y ejecuta VACUUM para recuperar espacio.
 *  No lanza: devuelve un CompactResultado con el conteo o el error. */
export async function compactarBase(churchIdLocal: number): Promise<CompactResultado> {
  try {
    const d = await getDb();
    const remoteChurch = supabase ? await churchIdRemoto() : null;
    const synced = remoteChurch !== null;
    const cutoff = synced ? cutoffUtc(DIAS_TOMBSTONE) : null;
    const tablas = await tablasConDeleted(d);

    let filasLocal = 0;
    let filasNube = 0;

    for (const { tabla, tieneUid } of tablas) {
      const selSql = cutoff
        ? `SELECT id, uid FROM ${tabla} WHERE church_id = $1 AND deleted = 1 AND coalesce(updated_at, '') < $2`
        : `SELECT id, uid FROM ${tabla} WHERE church_id = $1 AND deleted = 1`;
      const params = cutoff ? [churchIdLocal, cutoff] : [churchIdLocal];
      const filas = await d.select<{ id: number; uid: string | null }[]>(selSql, params);
      if (filas.length === 0) continue;

      // Modo nube: borrar primero en la nube por uid. Si falla (offline u otro
      // error), NO se purga local — así la lápida sigue viva y no resucita.
      if (synced && tieneUid && supabase && remoteChurch) {
        const uids = filas.map((f) => f.uid).filter((u): u is string => !!u);
        if (uids.length > 0) {
          const { error } = await supabase.from(tabla).delete().eq("church_id", remoteChurch).in("uid", uids);
          if (error) continue;
          filasNube += uids.length;
        }
      }

      await d.execute(selSql.replace("SELECT id, uid", "DELETE"), params);
      filasLocal += filas.length;
    }

    // Reordena el archivo y libera las páginas que quedaron vacías.
    await d.execute("VACUUM");

    return { ok: true, filasLocal, filasNube, soloLocal: !synced };
  } catch (e) {
    return { ok: false, filasLocal: 0, filasNube: 0, soloLocal: true, error: String(e) };
  }
}

/** Suma parcial de dos resultados de sincronización, propagando el primer fallo. */
function combinar(a: ResultadoSync, b: ResultadoSync): ResultadoSync {
  return {
    ok: a.ok && b.ok,
    subidos: a.subidos + b.subidos,
    bajados: a.bajados + b.bajados,
    motivo: b.motivo ?? a.motivo,
    error: b.error ?? a.error,
  };
}

/** Sincroniza todo lo cubierto: miembros (primero, para resolver member_uid de
 *  las transacciones), luego transacciones y depósitos. Si miembros falla, no
 *  sigue (las transacciones dependen de ellos). */
export async function sincronizarTodo(churchIdLocal: number): Promise<ResultadoSync> {
  // El plan baja primero (nube = autoridad); si falla, no afecta a los datos.
  await sincronizarPlan(churchIdLocal).catch(() => {});
  const m = await sincronizarMiembros(churchIdLocal);
  if (!m.ok) return m;
  // Categorías antes que las transacciones, para que sus referencias
  // (custom-<uid>) resuelvan al pintar los movimientos que bajen.
  const cat = await sincronizarCategorias(churchIdLocal);
  const t = await sincronizarTransacciones(churchIdLocal);
  const dep = await sincronizarDepositos(churchIdLocal);
  const act = await sincronizarActas(churchIdLocal);
  const car = await sincronizarCartas(churchIdLocal);
  const sol = await sincronizarSolicitudes(churchIdLocal);
  const ts = await sincronizarTrasladosSalida(churchIdLocal);
  const te = await sincronizarTrasladosEntrada(churchIdLocal);
  const sv = await sincronizarServicios(churchIdLocal);
  // El roster depende de servicios y miembros ya sincronizados (por uid).
  const ros = await sincronizarRoster(churchIdLocal);
  const ag = await sincronizarAgenda(churchIdLocal);
  const msg = await sincronizarMensajes(churchIdLocal);
  const pla = await sincronizarPlantillas(churchIdLocal);
  return [cat, t, dep, act, car, sol, ts, te, sv, ros, ag, msg, pla].reduce(combinar, m);
}
