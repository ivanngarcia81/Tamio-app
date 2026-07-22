import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Cómo mostrar el número (p. ej. fmtMoney). */
  format: (n: number) => string;
  /** Duración de la animación en ms. */
  duracion?: number;
}

/** Número que "cuenta" hasta su valor al aparecer o cambiar (ease-out).
 *  Respeta prefers-reduced-motion (salta directo al valor final). */
export default function CountUp({ value, format, duracion = 650 }: Props) {
  const [mostrado, setMostrado] = useState(0);
  const desdeRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      desdeRef.current = value;
      setMostrado(value);
      return;
    }
    const desde = desdeRef.current;
    const inicio = performance.now();
    cancelAnimationFrame(rafRef.current);
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      // Durante la cuenta se muestran enteros (sin centavos parpadeando);
      // al terminar aterriza en el valor exacto.
      setMostrado(t < 1 ? Math.round(desde + (value - desde) * ease) : value);
      if (t < 1) rafRef.current = requestAnimationFrame(paso);
      else desdeRef.current = value;
    };
    rafRef.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duracion]);

  return <>{format(mostrado)}</>;
}
