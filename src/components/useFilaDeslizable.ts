import { useCallback, useEffect, useRef, useState } from "react";
import { esMovil } from "../movil";

// Gesto de deslizar una fila hacia la izquierda para descubrir Editar y
// Eliminar. Solo en iPad/iPhone: en el escritorio están los tres puntitos y el
// clic derecho, que para un ratón son mejores.
//
// **Por qué la fila se mueve con `transform` y el panel de botones va aparte,
// en un portal.** La alternativa evidente —envolver cada fila en un
// contenedor que recorte— cambia el DOM de nueve listas, y ahí hay reglas de
// CSS que cuentan hijos: `.tx-row:last-child { border-bottom: none }` pasaría
// a cumplirse en TODAS las filas, porque cada una sería hija única de su
// envoltorio, y la lista entera se quedaría sin separadores. Moviendo la fila
// tal cual y dibujando el panel encima con `position: fixed` no cambia ni un
// nodo del DOM existente. Es además el patrón que RowMenu ya usaba para su
// desplegable.
//
// La fila se recorta sola al salirse: las listas ya tienen `overflow: hidden`.

/** Cuánto se descubre al abrir: los dos botones. */
export const ANCHO_ACCIONES = 168;

/** Umbrales distintos para abrir y para cerrar, y no uno solo en el medio.
 *
 *  Con un único umbral al 40 %, abrir costaba 67 px pero cerrar costaba 101
 *  —había que arrastrar de vuelta hasta pasarse de ese mismo 40 %—, y la fila
 *  abierta se sentía pegajosa. Con dos umbrales, cada dirección tiene el suyo:
 *  se abre con poco y se cierra con poco. */
const UMBRAL_ABRIR = ANCHO_ACCIONES * 0.4;
const UMBRAL_CERRAR = ANCHO_ACCIONES * 0.6;

/** Y a partir de aquí, donde hay "Deshacer", soltar borra directamente. */
const UMBRAL_BORRAR = 0.65;

/** Antes de decidir si esto es un gesto o un scroll se miran los primeros
 *  píxeles. Sin esta comprobación la lista se engancha en cada arrastre
 *  vertical y el gesto se vuelve odioso de usar. */
const ZONA_MUERTA = 10;

/** Solo una fila abierta a la vez en toda la app: abrir una cierra la anterior.
 *  Es un módulo compartido y no un contexto de React porque las filas viven en
 *  nueve listas distintas que no tienen ningún ancestro en común. */
let cerrarLaAbierta: (() => void) | null = null;

/** Aviso de que alguna fila se abrió o se cerró. Lo escucha la barra inferior
 *  para apartar el botón de crear: ese botón vive en la esquina inferior
 *  derecha y los botones de Editar y Eliminar salen por ese mismo borde. De
 *  todos los sitios de la app donde se puede tocar sin querer, este es el
 *  único en el que el toque equivocado borra algo. */
export const EVENTO_FILA = "tamio:fila-deslizada";

/** ¿Hay alguna fila abierta o arrastrándose ahora mismo? Se pregunta en vez de
 *  mandarlo en el evento: al abrir una fila se cierra la anterior, así que
 *  llegan dos avisos seguidos y el orden en que se procesan no está
 *  garantizado. Preguntando, la respuesta siempre es la de este instante. */
export function hayFilaAbierta(): boolean {
  return cerrarLaAbierta !== null;
}

function avisar(): void {
  try { window.dispatchEvent(new Event(EVENTO_FILA)); } catch { /* SSR o pruebas */ }
}

export interface EstadoDeslizable {
  /** Cuánto está corrida la fila hacia la izquierda, en píxeles. */
  x: number;
  /** ¿Se está arrastrando ahora mismo? (sin transición, sigue al dedo) */
  arrastrando: boolean;
  /** ¿Pasó el umbral de borrado? El panel rojo se estira para avisarlo. */
  vaABorrar: boolean;
  /** Cierra la fila. */
  cerrar: () => void;
  /** Se engancha al elemento de la fila (el que se mueve). */
  ref: (el: HTMLElement | null) => void;
}

/**
 * @param activo        si false, el gesto no existe (escritorio).
 * @param puedeBorrarAlDeslizar  si true, el deslizamiento completo borra sin
 *        preguntar. **Solo donde ya hay "Deshacer"**: sin marcha atrás, un
 *        gesto que borra sin diálogo es una pérdida esperando a pasar.
 * @param onBorrar      qué hacer cuando el deslizamiento completa el borrado.
 */
export function useFilaDeslizable(
  activo: boolean,
  puedeBorrarAlDeslizar: boolean,
  onBorrar: () => void
): EstadoDeslizable {
  const [x, setX] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const fila = useRef<HTMLElement | null>(null);
  const inicio = useRef<{ x: number; y: number; base: number } | null>(null);
  const decidido = useRef<"gesto" | "scroll" | null>(null);
  const anchoFila = useRef(0);

  // La posición actual y el callback de borrado se leen por referencia, no de
  // las dependencias del efecto. Con `x` en las dependencias, cada píxel de
  // arrastre desmontaba y volvía a montar los tres escuchadores de `touch`
  // —sesenta veces por segundo— y `onBorrar` es una función nueva en cada
  // render del padre, así que bastaba con que la lista se repintara para
  // reiniciar el gesto a media pasada.
  const xRef = useRef(0);
  xRef.current = x;
  const borrarRef = useRef(onBorrar);
  borrarRef.current = onBorrar;

  const cerrar = useCallback(() => {
    setX(0);
    setArrastrando(false);
    if (cerrarLaAbierta === cerrar) cerrarLaAbierta = null;
    avisar();
  }, []);

  // Al desmontarse la fila (borrada, filtrada, cambio de mes) no puede quedar
  // apuntada como "la abierta": la siguiente que se abriera llamaría a una
  // función de un componente que ya no existe.
  useEffect(() => () => {
    if (cerrarLaAbierta === cerrar) { cerrarLaAbierta = null; avisar(); }
  }, [cerrar]);

  const ref = useCallback((el: HTMLElement | null) => {
    fila.current = el;
  }, []);

  useEffect(() => {
    const el = fila.current;
    if (!activo || !el) return;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      inicio.current = { x: t.clientX, y: t.clientY, base: xRef.current };
      decidido.current = null;
      anchoFila.current = el!.getBoundingClientRect().width;
    }

    function onMove(e: TouchEvent) {
      const ini = inicio.current;
      if (!ini || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dx = ini.x - t.clientX; // positivo = hacia la izquierda
      const dy = Math.abs(ini.y - t.clientY);

      if (decidido.current === null) {
        if (Math.abs(dx) < ZONA_MUERTA && dy < ZONA_MUERTA) return;
        // Más vertical que horizontal: es un scroll y la fila no se mueve.
        decidido.current = Math.abs(dx) > dy ? "gesto" : "scroll";
        if (decidido.current === "gesto") {
          if (cerrarLaAbierta && cerrarLaAbierta !== cerrar) cerrarLaAbierta();
          cerrarLaAbierta = cerrar;
          avisar();
          setArrastrando(true);
        }
      }
      if (decidido.current !== "gesto") return;

      // El navegador no debe scrollear mientras la fila sigue al dedo.
      if (e.cancelable) e.preventDefault();

      let nuevo = ini.base + dx;
      if (nuevo < 0) nuevo = 0; // hacia la derecha no hay nada que descubrir
      const tope = puedeBorrarAlDeslizar ? anchoFila.current : ANCHO_ACCIONES;
      if (nuevo > tope) {
        // Pared elástica: se estira con resistencia y no pasa de ahí. Es lo que
        // le dice al dedo "hasta aquí" sin un mensaje.
        nuevo = tope + (nuevo - tope) * 0.15;
      }
      setX(nuevo);
    }

    function onEnd() {
      const eraGesto = decidido.current === "gesto";
      const veniaAbierta = (inicio.current?.base ?? 0) > 0;
      inicio.current = null;
      decidido.current = null;
      if (!eraGesto) return;
      setArrastrando(false);
      setX((actual) => {
        if (puedeBorrarAlDeslizar && actual > anchoFila.current * UMBRAL_BORRAR) {
          // Se va del todo y luego borra: si se borrase antes de la animación,
          // la fila desaparecería de golpe y no se vería a dónde fue.
          queueMicrotask(() => borrarRef.current());
          return anchoFila.current;
        }
        const umbral = veniaAbierta ? UMBRAL_CERRAR : UMBRAL_ABRIR;
        return actual > umbral ? ANCHO_ACCIONES : 0;
      });
    }

    // `passive: false` en el move para poder cortar el scroll del navegador.
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [activo, cerrar, puedeBorrarAlDeslizar]);

  // La fila se mueve desde aquí y no desde el JSX de quien la pinta: este hook
  // lo usa RowMenu, que se dibuja DENTRO de la fila y no la puede envolver.
  // Mientras el dedo manda no hay transición —la fila tiene que ir pegada a
  // él—; al soltar sí, que es lo que da el salto a su sitio.
  useEffect(() => {
    const el = fila.current;
    if (!activo || !el) return;
    el.style.transform = x ? `translateX(${-x}px)` : "";
    el.style.transition = arrastrando ? "none" : "transform var(--dur) ease";
    el.style.willChange = x || arrastrando ? "transform" : "";
    return () => {
      el.style.transform = "";
      el.style.transition = "";
      el.style.willChange = "";
    };
  }, [activo, x, arrastrando]);

  // Con una fila abierta, tocar en cualquier otro sitio o scrollear la cierra.
  // El panel va en `position: fixed` sobre la fila: si la lista se moviera
  // debajo, los botones se quedarían flotando sobre la fila equivocada.
  useEffect(() => {
    if (x === 0 || arrastrando) return;
    function fuera(e: Event) {
      const t = e.target as Node;
      if (fila.current?.contains(t)) return;
      if ((t as HTMLElement)?.closest?.(".fila-acciones")) return;
      cerrar();
    }
    document.addEventListener("touchstart", fuera, true);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("touchstart", fuera, true);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [x, arrastrando, cerrar]);

  return {
    x,
    arrastrando,
    vaABorrar: puedeBorrarAlDeslizar && x > anchoFila.current * UMBRAL_BORRAR,
    cerrar,
    ref,
  };
}

/** ¿Hay que ofrecer el gesto en este equipo? */
export function hayGesto(): boolean {
  return esMovil();
}
