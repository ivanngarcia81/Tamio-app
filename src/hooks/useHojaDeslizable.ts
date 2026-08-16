import { useCallback, useEffect, useRef, useState } from "react";

// Deslizar una hoja inferior (.modal-card.hoja-ia / .hoja-abajo) hacia abajo
// para cerrarla — el mismo espíritu que useFilaDeslizable.ts (fila que se
// mueve con transform, sin esperar a que React reprograme el DOM en cada
// fotograma), pero en vertical y sobre la hoja entera en vez de una fila.
//
// **Por qué cualquier zona no desplazable arranca el gesto, no solo la
// agarradera.** En iOS real, la hoja entera es agarrable — la agarradera es
// una señal visual, no el único sitio donde el gesto empieza. La excepción es
// el CUERPO si tiene su propio scroll: ahí el primer tirón hacia abajo debe
// desplazar el contenido, no la hoja, y solo se convierte en "cerrar la
// hoja" si el cuerpo ya estaba en su tope y el dedo sigue tirando.

const UMBRAL_DISTANCIA = 0.4; // 40% del alto de la hoja
const UMBRAL_VELOCIDAD = 500; // px/s
const ZONA_MUERTA = 6;

export interface EstadoHojaDeslizable {
  /** Cuánto está corrida la hoja hacia abajo, en píxeles. */
  y: number;
  /** ¿Se está arrastrando ahora mismo? (sin transición, sigue al dedo) */
  arrastrando: boolean;
  /** Se engancha a la tarjeta de la hoja (la que se mueve). */
  refHoja: (el: HTMLElement | null) => void;
  /** Se engancha al velo de fondo, para atenuar su opacidad al arrastrar. */
  refVelo: (el: HTMLElement | null) => void;
}

interface Opciones {
  /** true si hay algo que se perdería al cerrar (un campo a medio llenar).
   *  Con el gesto pasado de umbral, en vez de cerrar se llama a
   *  `onIntentoConCambios` y la hoja rebota a su sitio — quien use el hook
   *  decide qué preguntar (el patrón es un ActionSheet "¿Descartar
   *  cambios?"), y si el usuario confirma, cierra llamando a `onCerrar` él
   *  mismo. */
  hayCambiosSinGuardar?: () => boolean;
  onIntentoConCambios?: () => void;
}

function encontrarDesplazable(nodo: EventTarget | null, techo: HTMLElement): HTMLElement | null {
  let el = nodo as HTMLElement | null;
  while (el && el !== techo) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function useHojaDeslizable(
  activo: boolean,
  onCerrar: () => void,
  opciones: Opciones = {},
): EstadoHojaDeslizable {
  const [y, setY] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const hoja = useRef<HTMLElement | null>(null);
  const velo = useRef<HTMLElement | null>(null);
  const inicio = useRef<{ y: number; scrollEl: HTMLElement | null } | null>(null);
  const decidido = useRef<"gesto" | "scroll" | null>(null);
  const altoHoja = useRef(0);
  const ultimaMuestra = useRef({ y: 0, t: 0 });
  const velocidad = useRef(0);
  const reducida = useRef(false);

  // Las callbacks son nuevas en cada render del padre; leerlas por
  // referencia evita reabrir los listeners de touch en cada tecla que
  // teclee el formulario de la hoja.
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;

  useEffect(() => {
    reducida.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const refHoja = useCallback((el: HTMLElement | null) => { hoja.current = el; }, []);
  const refVelo = useCallback((el: HTMLElement | null) => { velo.current = el; }, []);

  const rebotar = useCallback(() => {
    setArrastrando(false);
    setY(0);
  }, []);

  useEffect(() => {
    const el = hoja.current;
    // Con "movimiento reducido" el gesto no existe: la hoja se cierra por
    // los botones/✕ de siempre, sin arrastre ni rebote animado.
    if (!activo || !el || reducida.current) return;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const scrollEl = encontrarDesplazable(e.target, el!);
      inicio.current = { y: t.clientY, scrollEl };
      decidido.current = null;
      altoHoja.current = el!.getBoundingClientRect().height;
      ultimaMuestra.current = { y: t.clientY, t: performance.now() };
      velocidad.current = 0;
    }

    function onMove(e: TouchEvent) {
      const ini = inicio.current;
      if (!ini || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dy = t.clientY - ini.y;

      if (decidido.current === null) {
        if (dy < ZONA_MUERTA) {
          // Hacia arriba, o casi nada: no es un cierre. Si el cuerpo tiene
          // scroll propio, que suba con normalidad.
          if (dy < -ZONA_MUERTA) decidido.current = "scroll";
          return;
        }
        // Tirando hacia abajo: solo se vuelve gesto de cerrar si no arrancó
        // dentro de un cuerpo desplazable, o si ese cuerpo ya está en su
        // tope (scrollTop 0) — si no, el tirón es para leer lo de arriba.
        if (ini.scrollEl && ini.scrollEl.scrollTop > 0) return;
        decidido.current = "gesto";
        setArrastrando(true);
      }
      if (decidido.current !== "gesto") return;

      if (e.cancelable) e.preventDefault();
      const nuevo = Math.max(0, dy);
      setY(nuevo);

      const ahora = performance.now();
      const dt = ahora - ultimaMuestra.current.t;
      if (dt > 0) velocidad.current = ((t.clientY - ultimaMuestra.current.y) / dt) * 1000;
      ultimaMuestra.current = { y: t.clientY, t: ahora };
    }

    function onEnd() {
      const eraGesto = decidido.current === "gesto";
      inicio.current = null;
      decidido.current = null;
      if (!eraGesto) return;

      const alto = altoHoja.current || 1;
      setY((actual) => {
        const pasaDistancia = actual / alto >= UMBRAL_DISTANCIA;
        const pasaVelocidad = velocidad.current >= UMBRAL_VELOCIDAD;
        if (pasaDistancia || pasaVelocidad) {
          if (opcionesRef.current.hayCambiosSinGuardar?.()) {
            setArrastrando(false);
            queueMicrotask(() => opcionesRef.current.onIntentoConCambios?.());
            return 0;
          }
          setArrastrando(false);
          queueMicrotask(() => cerrarRef.current());
          return actual;
        }
        setArrastrando(false);
        return 0;
      });
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", rebotar);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", rebotar);
    };
  }, [activo, rebotar]);

  // La hoja sigue al dedo por transform directo (sin pasar por el estilo de
  // React en cada fotograma no hace falta aquí porque `y` ya viene de
  // eventos nativos, pero el transform SÍ se aplica a mano para no depender
  // de que el JSX de cada hoja traiga su propio estilo en línea). Sin
  // transición mientras se arrastra —tiene que ir pegada al dedo—; con
  // "spring" al soltar, sea para rebotar a 0 o para completar el cierre.
  useEffect(() => {
    const el = hoja.current;
    if (!activo || !el) return;
    el.style.transform = y ? `translateY(${y}px)` : "";
    el.style.transition = arrastrando
      ? "none"
      : "transform .32s cubic-bezier(.34,1.56,.64,1)";
    return () => {
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [activo, y, arrastrando]);

  // El velo se atenúa en proporción a lo arrastrado: a mitad de camino del
  // umbral de cierre, ya se nota que "esto se está yendo".
  useEffect(() => {
    const el = velo.current;
    if (!activo || !el) return;
    const alto = altoHoja.current || 1;
    const progreso = Math.min(1, y / (alto * UMBRAL_DISTANCIA));
    el.style.opacity = y ? String(1 - progreso * 0.9) : "";
    el.style.transition = arrastrando ? "none" : "opacity .32s ease";
    return () => {
      el.style.opacity = "";
      el.style.transition = "";
    };
  }, [activo, y, arrastrando]);

  return { y, arrastrando, refHoja, refVelo };
}
