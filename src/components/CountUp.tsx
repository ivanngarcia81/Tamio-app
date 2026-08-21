import { useEffect, useRef, useState } from "react";

interface Props<T extends number> {
  value: T;
  /** Cómo mostrar el número (p. ej. fmtMoney). */
  format: (n: T) => string;
  /** Duración de la animación en ms. */
  duracion?: number;
  /**
   * A qué múltiplo se redondea MIENTRAS cuenta. 1 para cuentas de personas;
   * **100 para dinero**, que va en centavos: sin esto los dos últimos dígitos
   * parpadearían durante la animación, que es justo lo que este componente
   * evitaba cuando los importes eran decimales.
   */
  paso?: number;
}

/** Número que "cuenta" hasta su valor al aparecer o cambiar (ease-out).
 *  Respeta prefers-reduced-motion (salta directo al valor final). */
export default function CountUp<T extends number>({ value, format, duracion = 650, paso = 1 }: Props<T>) {
  const [mostrado, setMostrado] = useState<T>(0 as T);
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
    /* `cuadro`, no `paso`: la función del rAF se llamaba igual que el prop y
       lo SOMBREABA, así que `Number(paso)` era `Number(función)` — NaN. El
       redondeo intermedio salía NaN en cada cuadro con t<1, y toda cifra
       animada de la app decía "$NaN" durante los 650ms de la cuenta antes de
       aterrizar en el valor bueno (medido: $NaN a los 300ms, $4,600.00 a los
       900). El aterrizaje final nunca falló porque a t=1 se pinta `value`
       directo — por eso el bug sobrevivió: en cualquier captura tardía todo
       se ve bien. */
    const cuadro = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      // Durante la cuenta se muestran múltiplos de `paso` (sin centavos
      // parpadeando); al terminar aterriza en el valor exacto.
      const objetivo = Number(value);
      const intermedio = Math.round((desde + (objetivo - desde) * ease) / paso) * paso;
      setMostrado(t < 1 ? (intermedio as T) : value);
      if (t < 1) rafRef.current = requestAnimationFrame(cuadro);
      else desdeRef.current = value;
    };
    rafRef.current = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duracion, paso]);

  return <>{format(mostrado)}</>;
}
