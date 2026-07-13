export interface ToastOptions {
  /** Texto del botón de acción (p. ej. "Deshacer"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Duración en ms antes de desaparecer solo. Más larga cuando hay acción,
   *  para dar tiempo a reaccionar. */
  duration?: number;
}

export interface ToastDetail extends ToastOptions {
  mensaje: string;
}

/** Notificaciones breves de confirmación ("Guardado ✓"), opcionalmente con
 *  un botón de acción (p. ej. "Deshacer"). Se emiten como evento global
 *  para poder llamarse desde cualquier componente o servicio sin hilos de
 *  props; ToastHost (montado en App) las muestra y desecha. */
export function showToast(mensaje: string, opts?: ToastOptions): void {
  const detail: ToastDetail = { mensaje, ...opts };
  window.dispatchEvent(new CustomEvent<ToastDetail>("tesoreria-toast", { detail }));
}
