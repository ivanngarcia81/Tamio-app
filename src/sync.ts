// ============================================================================
// Tamio · Motor de sincronización (E4) — piloto: tabla MIEMBROS
// ----------------------------------------------------------------------------
// Offline-first: la app sigue usando SQLite local; esto sube los cambios
// locales a Supabase y baja los de las otras Macs de la misma iglesia.
//
// Estrategia: "el más nuevo gana" (last-write-wins) por fila, comparando
// `updated_at`. La identidad global es `uid` (no el id numérico local, que
// choca entre dispositivos). El aislamiento por iglesia lo hace RLS en la nube.
//
// Piloto (miembros): el borrado FÍSICO local todavía no se propaga; la columna
// `deleted` viaja pero por ahora siempre es 0 en local. Ver docs/sincronizacion.md.
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
