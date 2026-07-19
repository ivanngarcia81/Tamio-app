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

import { getDb } from "./db";
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
  const m = await sincronizarMiembros(churchIdLocal);
  if (!m.ok) return m;
  const t = await sincronizarTransacciones(churchIdLocal);
  const dep = await sincronizarDepositos(churchIdLocal);
  return combinar(combinar(m, t), dep);
}
