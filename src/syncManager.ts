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
import { sincronizarTodo, type MotivoSync } from "./sync";
import { syncPausadoPorRestauracion } from "./services/restaurar";

/** Interruptor global de la sincronización en la nube. Encendido en 1.1: el
 *  disparador `al_crear_usuario` (supabase/sync-e1.sql) ya crea Y enlaza la
 *  iglesia al registrarse, así que el sync ya no falla por RLS — ver
 *  docs/plan-1-1.md, "Estado real del proyecto de Supabase". Sin
 *  LOGIN_HABILITADO o sin credenciales en el .env, sigue sin aplicar (ver
 *  authHabilitado en supabase.ts): la app queda 100% offline-first igual. */
export const SYNC_HABILITADO = true;

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
  /** Mensaje de error real (tabla + detalle) cuando la sync falla. Solo para
   *  diagnóstico: el panel de Ajustes lo muestra bajo el aviso genérico. */
  error?: string;
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
  // Tras restaurar un respaldo la sincronización queda en pausa hasta que un
  // humano revise los datos: con last-write-wins, mezclar sin mirar sale mal
  // en los dos sentidos (la nube pisa lo restaurado, o lo restaurado resucita
  // lo que se borró a propósito). Ver services/restaurar.ts.
  habilitado = on && !syncPausadoPorRestauracion();
  if (!habilitado) set({ estado: "desactivado" });
  else if (snapshot.estado === "desactivado") set({ estado: "inactivo" });
}

/** Ejecuta una sincronización ahora (si está habilitada y no hay otra en curso). */
export async function ejecutarSync(): Promise<void> {
  if (!habilitado || churchId == null || corriendo) return;
  // Nota iOS: navigator.onLine miente en WKWebView (reporta false con red
  // buena), así que NO se usa como veto. Se intenta siempre; si de verdad no
  // hay conexión, la petición falla y el resultado marca "offline" abajo.
  corriendo = true;
  set({ estado: "sincronizando" });
  try {
    const res = await sincronizarTodo(churchId);
    if (res.ok) {
      set({ estado: "ok", ultima: Date.now(), subidos: res.subidos, bajados: res.bajados, motivo: undefined, error: undefined });
    } else {
      set({ estado: res.motivo === "sin-conexion" ? "offline" : "error", motivo: res.motivo, error: res.error });
    }
  } catch (e) {
    set({ estado: "error", error: String(e) });
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
