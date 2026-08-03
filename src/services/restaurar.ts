// Restaurar un respaldo.
//
// Tamio tenía respaldo y no tenía restauración: si la Mac se moría, el tesorero
// tenía el archivo en la mano y no había ningún botón donde ponerlo.
//
// La sustitución NO ocurre en caliente. La conexión a la base vive en un Mutex
// abierto desde el arranque, y el único momento en que nadie la tiene abierta
// es antes de abrirla. Así que el flujo es: preparar → confirmar → reiniciar, y
// el arranque siguiente aplica. El razonamiento completo, en docs/restaurar.md.

import { invoke } from "@tauri-apps/api/core";

export interface ResumenRespaldo {
  /** De qué congregación es el paquete. */
  iglesia: string;
  movimientos: number;
  miembros: number;
  depositos: number;
  /** Fecha del movimiento más reciente del respaldo ("2026-05-14"). */
  hasta: string;
  /** Venía como `.db` suelto, de antes de que el respaldo fuera un paquete. */
  formato_antiguo: boolean;
  /** Documentos incluidos: comprobantes, adjuntos de cartas, logo y firmas. */
  documentos: number;
}

/** Extrae y examina el respaldo SIN tocar la base actual. Si el archivo no
 *  vale, se descubre aquí y todavía no ha cambiado nada. */
export function prepararRestauracion(origen: string): Promise<ResumenRespaldo> {
  return invoke<ResumenRespaldo>("restaurar_preparar", { origen });
}

/** Deja listo el respaldo para que lo aplique el próximo arranque. */
export function confirmarRestauracion(): Promise<void> {
  return invoke("restaurar_confirmar");
}

/** El usuario se echó atrás: se tira lo preparado. */
export function cancelarRestauracion(): Promise<void> {
  return invoke("restaurar_cancelar");
}

export function reiniciarApp(): Promise<void> {
  return invoke("restaurar_reiniciar");
}

/** ¿El arranque de esta sesión aplicó un respaldo? */
export function restauracionAplicada(): Promise<boolean> {
  return invoke<boolean>("restauracion_aplicada").catch(() => false);
}

// --- Sincronización en pausa tras restaurar --------------------------------
//
// `sync.ts` es last-write-wins por `uid` comparando `updated_at`, y eso deja
// dos comportamientos, los dos malos:
//
//   - Con la nube llena, ella es la autoridad: al restaurar un respaldo de hace
//     tres meses, la primera sincronización sobrescribe casi todo lo recién
//     restaurado y los borrados propagados vuelven a borrar. El tesorero ve
//     aparecer sus datos y desaparecer solos.
//   - Con la nube vacía, lo restaurado se sube como verdad, incluidas las filas
//     que se habían borrado a propósito desde otro dispositivo.
//
// Ninguna regla automática acierta en los dos casos. Y quien restaura lo hace
// porque algo salió mal: dejar que ese equipo empiece a empujar o a tirar en
// automático es lo contrario de lo que hace falta. Así que restaurar deja la
// sincronización PAUSADA, con un aviso visible, hasta que un humano mire los
// datos y decida.
//
// La fuente de verdad es un ARCHIVO junto a la base, que escribe Rust en el
// mismo instante en que aplica el respaldo (aplicar_restauracion_pendiente).
// Antes la escribía este frontend en localStorage después de arrancar, y eso
// dejaba un hueco: si la app se cerraba entre aplicar y arrancar la interfaz,
// la pausa no se escribía nunca. localStorage queda solo como espejo síncrono
// (syncManager y el banner necesitan leerla sin await); el arranque lo pone
// al día desde Rust ANTES de encender el motor de sincronización.

const PAUSA_KEY = "tamio-sync-pausado-por-restauracion";

export function syncPausadoPorRestauracion(): boolean {
  try {
    return localStorage.getItem(PAUSA_KEY) === "1";
  } catch {
    return false;
  }
}

export function pausarSyncPorRestauracion(): void {
  try { localStorage.setItem(PAUSA_KEY, "1"); } catch { /* noop */ }
}

/** Pone el espejo al día desde el archivo de Rust. Solo enciende la pausa,
 *  nunca la apaga: si el archivo faltara pero el espejo dijera "en pausa"
 *  (una restauración de antes de que existiera el archivo), quedarse en
 *  pausa es el lado seguro — reactivar es siempre decisión de un humano. */
export async function sincronizarPausaDesdeRust(): Promise<void> {
  const pausada = await invoke<boolean>("sync_pausada").catch(() => false);
  if (pausada) pausarSyncPorRestauracion();
}

export function reactivarSync(): void {
  try { localStorage.removeItem(PAUSA_KEY); } catch { /* noop */ }
  // Si el borrado remoto fallara, el próximo arranque vuelve a poner la
  // pausa desde el archivo y el banner reaparece: error del lado seguro.
  invoke("sync_pausa_quitar").catch(() => {});
}
