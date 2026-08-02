// Color de una categoría, leído de la ÚNICA paleta que existe: las variables
// `--cat-*` de styles.css.
//
// Antes había dos listas para lo mismo. El hex del chip vivía en el CSS y el de
// los gráficos en `db.ts`, y nadie las mantenía a la vez: los once gastos
// coincidían por casualidad —alguien copió los mismos valores— pero los cuatro
// ingresos no. El chip "Ofrenda" era `#15803d` y su porción del donut `#22c55e`:
// dos verdes distintos para la misma cosa, en la misma pantalla.
//
// Ahora el CSS manda y esto lo lee. Añadir una categoría es añadir sus dos
// variables y nada más; no hay forma de que las dos vuelvan a separarse porque
// ya no hay dos.

/** Se cachea porque `getComputedStyle` obliga al navegador a recalcular estilo,
 *  y esto se llama una vez por porción de gráfico en cada repintado. Los tonos
 *  no cambian en toda la sesión (son los mismos en claro y en oscuro: se eligen
 *  para contrastar sobre el fondo claro del chip y sobre el lienzo del gráfico). */
const cache = new Map<string, string>();

/** Gris neutro de reserva: el mismo que usa `.tag.otros`. Es lo que se pinta
 *  para una categoría personalizada o un id retirado del catálogo. */
const RESERVA = "#475569";

function leerToken(nombre: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  } catch {
    return ""; // entorno sin DOM (pruebas)
  }
}

/** Tono de una categoría para gráficos. Es el MISMO color que el texto de su
 *  chip, porque sale de la misma variable. */
export function tonoCategoria(id: string): string {
  const guardado = cache.get(id);
  if (guardado !== undefined) return guardado;
  const tono = leerToken(`--cat-${id}`) || leerToken("--cat-otros") || RESERVA;
  cache.set(id, tono);
  return tono;
}
