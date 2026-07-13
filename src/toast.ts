/** Notificaciones breves de confirmación ("Guardado ✓"). Se emiten como
 *  evento global para poder llamarse desde cualquier componente o servicio
 *  sin hilos de props; ToastHost (montado en App) las muestra y desecha. */
export function showToast(mensaje: string): void {
  window.dispatchEvent(new CustomEvent("tesoreria-toast", { detail: mensaje }));
}
