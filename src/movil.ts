/** Detección de plataforma táctil compartida por toda la app.
 *
 *  La clase la pone main.tsx antes de montar React (iPad/iPhone, incluido
 *  iPadOS, que se disfraza de Mac), así que leerla en tiempo de render es
 *  seguro: nunca cambia durante la sesión.
 */
export function esMovil(): boolean {
  return document.documentElement.classList.contains("movil");
}

/** iPhone específicamente (ni iPad ni Mac): el sidebar con split view no
 *  corresponde ahí en ningún ancho — ver la nota en main.tsx. */
export function esIPhone(): boolean {
  return document.documentElement.classList.contains("iphone");
}

/** iPad específicamente (ni iPhone ni Mac). Es `.movil` sin `.iphone`, pero
 *  con nombre propio: el iPad tiene decisiones suyas —la barra de la cabecera,
 *  el ancho del sidebar, el maestro-detalle— que no son las del teléfono ni
 *  las del escritorio, y una condición en positivo se lee mejor que
 *  `esMovil() && !esIPhone()` repetida en cada componente. */
export function esIPad(): boolean {
  return document.documentElement.classList.contains("ipad");
}

/** Escritorio (ni iPad ni iPhone). La clase la pone main.tsx antes de montar
 *  React, igual que las otras dos, así que leerla al renderizar es seguro.
 *  `!esMovil()` diría lo mismo hoy, pero el nombre positivo es el que se lee
 *  en una condición: `esMac() ? toolbar : título de página`. */
export function esMac(): boolean {
  return document.documentElement.classList.contains("mac");
}

/** Texto para un campo: la versión corta en teléfono, la larga en el resto.
 *  Los placeholders descriptivos de escritorio ("Buscar por nombre, correo
 *  o RFC…") se cortan a media palabra en una pantalla angosta. */
export function textoCorto(corto: string, largo: string): string {
  return esMovil() ? corto : largo;
}
