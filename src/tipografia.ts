/**
 * tipografia.ts — "Tamaño de texto" (Config → Preferencias → Presentación).
 *
 * El último control que el rediseño de iPad dejó dibujado y apagado. Estuvo
 * así desde la 1.2.5, y no por pereza: **encenderlo antes habría sido peor
 * que no tenerlo.**
 *
 * El motivo, medido antes de tocar nada: la app tenía 248 `font-size` que
 * salían de los tokens `--fs-*` y **395 con píxeles a pelo**. Un multiplicador
 * sobre los tokens habría agrandado un tercio de la app y dejado quieto el
 * resto — y los píxeles a pelo estaban justo donde más duele: `.tx-amount`,
 * `.ios-stat-num`, `.nm-monto-cifra`. O sea, **las cifras de dinero se
 * habrían quedado chicas mientras las etiquetas crecían**, que es exactamente
 * lo contrario de lo que busca quien sube el tamaño porque no ve bien los
 * importes.
 *
 * Así que primero se movió la tipografía entera a un solo factor
 * (`--fs-escala` en styles.css, aplicado a los 395 sueltos, a los 29 tokens y
 * a los 136 tamaños en línea del JSX) y luego se encendió el control. En
 * "Normal" el factor es 1 y no cambia un píxel.
 *
 * **Es del DISPOSITIVO, no de la iglesia**, como el tema y el acento: quien
 * necesita la letra más grande es una persona en su iPad, no la congregación.
 * Por eso vive en localStorage y no viaja por la sincronización.
 *
 * **Lo que NO escala, a propósito:** las plantillas de impresión
 * (`services/print/`), que arman su propio documento. Un informe en papel no
 * cambia de tamaño porque alguien ajuste su iPad, y el estado financiero
 * tiene que caber donde siempre.
 */

export const TAMANOS = ["chico", "normal", "grande"] as const;
export type TamanoTexto = (typeof TAMANOS)[number];

/** El factor de cada talla.
 *
 *  Los saltos son cortos —±12%— y eso es deliberado: con 1.25 el maestro-
 *  detalle del iPad se queda sin sitio para la columna del panel, que necesita
 *  700px de contenido. Esto es "tamaño de texto", no la Ampliación de
 *  pantalla de iOS; lo que tiene que hacer es que un renglón de 12.5px se lea,
 *  no rehacer la retícula. */
const FACTOR: Record<TamanoTexto, number> = {
  chico: 0.88,
  normal: 1,
  grande: 1.12,
};

const CLAVE = "tamio-tamano-texto";

export function tamanoTexto(): TamanoTexto {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v && (TAMANOS as readonly string[]).includes(v)) return v as TamanoTexto;
  } catch { /* noop */ }
  return "normal";
}

/** Escribe el factor en `:root`. En "normal" QUITA la propiedad en vez de
 *  ponerla a 1: así el valor que manda es el de styles.css, que es el aspecto
 *  original de Tamio — el mismo criterio que usa el acento "neutro". */
export function aplicarTamanoTexto(t: TamanoTexto): void {
  const raiz = document.documentElement;
  if (t === "normal") raiz.style.removeProperty("--fs-escala");
  else raiz.style.setProperty("--fs-escala", String(FACTOR[t]));
}

export function setTamanoTexto(t: TamanoTexto): void {
  try { localStorage.setItem(CLAVE, t); } catch { /* noop */ }
  aplicarTamanoTexto(t);
}
