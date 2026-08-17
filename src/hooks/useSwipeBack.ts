import { useEffect, useRef } from "react";

// Volver deslizando desde el borde izquierdo — el gesto nativo de iOS para
// "atrás" en una pantalla con nav bar. Tamio no tiene rutas por pantalla de
// Ajustes (todo vive en un solo componente con `zonaActiva` como estado), así
// que no hay gesto de router que activar: se reconoce a mano, igual de
// simple que el resto de gestos táctiles de la app (ver useHojaDeslizable.ts)
// pero sin arrastre visual — el criterio de aceptación solo pide que el
// gesto funcione, no que la pantalla seaga al dedo.

const BORDE_PX = 20;
const UMBRAL_PX = 60;

export function useSwipeBack(activo: boolean, onBack: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const el = ref.current;
    if (!activo || !el) return;

    let inicio: { x: number; y: number } | null = null;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      inicio = t.clientX <= BORDE_PX ? { x: t.clientX, y: t.clientY } : null;
    }

    function onMove(e: TouchEvent) {
      if (!inicio || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dx = t.clientX - inicio.x;
      const dy = Math.abs(t.clientY - inicio.y);
      // Horizontal de verdad: el vertical se deja para el scroll normal.
      if (dx >= UMBRAL_PX && dy < dx) {
        inicio = null;
        onBackRef.current();
      }
    }

    function onEnd() {
      inicio = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [activo]);

  return ref;
}
