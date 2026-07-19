// ============================================================================
// Tamio · Gestor de sincronización (E5) — automatización + estado compartido
// ----------------------------------------------------------------------------
// Envuelve el motor de E4 (sincronizarMiembros) y le añade:
//  - Un estado observable (para el indicador del sidebar y el botón de Ajustes).
//  - Disparadores automáticos: al arrancar, cada X minutos, al reconectar
//    (evento "online") y al volver a la ventana ("focus").
//  - programarSync(): un disparo "pronto" (con espera) tras un cambio local,
//    para que guardar algo se suba casi enseguida sin apretar nada.
// El motor sigue siendo manual-friendly: ejecutarSync() se puede llamar a mano.
// ============================================================================

import { useSyncExternalStore } from "react";
import { sincronizarMiembros, type MotivoSync } from "./sync";

export type SyncEstado =
  | "desactivado"    // sin login / sin credenciales: la sync no aplica
  | "inactivo"       // activa pero aún sin sincronizar en esta sesión
  | "sincronizando"
  | "ok"
  | "offline"
  | "error";

export interface SyncSnapshot {
  estado: SyncEstado;
  /** epoch ms de la última sincronización exitosa. */
  ultima: number | null;
  subidos: number;
  bajados: number;
  motivo?: MotivoSync;
}

let snapshot: SyncSnapshot = { estado: "desactivado", ultima: null, subidos: 0, bajados: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function subscribeSync(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

/** Hook de React para leer el estado de sincronización de forma reactiva. */
export function useSync(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

// --- configuración / estado interno del motor ------------------------------
let churchId: number | null = null;
let habilitado = false;
let corriendo = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

/** Enciende o apaga la sincronización y fija la iglesia local a sincronizar. */
export function configurarSync(cid: number | null, on: boolean): void {
  churchId = cid;
  habilitado = on;
  if (!on) set({ estado: "desactivado" });
  else if (snapshot.estado === "desactivado") set({ estado: "inactivo" });
}

/** Ejecuta una sincronización ahora (si está habilitada y no hay otra en curso). */
export async function ejecutarSync(): Promise<void> {
  if (!habilitado || churchId == null || corriendo) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    set({ estado: "offline" });
    return;
  }
  corriendo = true;
  set({ estado: "sincronizando" });
  try {
    const res = await sincronizarMiembros(churchId);
    if (res.ok) {
      set({ estado: "ok", ultima: Date.now(), subidos: res.subidos, bajados: res.bajados, motivo: undefined });
    } else {
      set({ estado: res.motivo === "sin-conexion" ? "offline" : "error", motivo: res.motivo });
    }
  } catch {
    set({ estado: "error" });
  } finally {
    corriendo = false;
  }
}

/** Programa una sincronización "pronto" tras un cambio local (con espera para
 *  agrupar varios cambios seguidos en un solo envío). */
export function programarSync(ms = 1500): void {
  if (!habilitado) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { void ejecutarSync(); }, ms);
}

function onOnline() { void ejecutarSync(); }
function onFocus() { void ejecutarSync(); }

/** Arranca los disparadores automáticos. Devuelve una función de limpieza. */
export function iniciarAutoSync(cadaMs = 180000): () => void {
  void ejecutarSync(); // sincroniza al arrancar
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => { void ejecutarSync(); }, cadaMs);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  return () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
  };
}
