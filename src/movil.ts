/** Detección de plataforma táctil compartida por toda la app.
 *
 *  La clase la pone main.tsx antes de montar React (iPad/iPhone, incluido
 *  iPadOS, que se disfraza de Mac), así que leerla en tiempo de render es
 *  seguro: nunca cambia durante la sesión.
 */
export function esMovil(): boolean {
  return document.documentElement.classList.contains("movil");
}

/** Texto para un campo: la versión corta en teléfono, la larga en el resto.
 *  Los placeholders descriptivos de escritorio ("Buscar por nombre, correo
 *  o RFC…") se cortan a media palabra en una pantalla angosta. */
export function textoCorto(corto: string, largo: string): string {
  return esMovil() ? corto : largo;
}
