import { useEffect, useState } from "react";

/** ¿La ventana cumple esta media query AHORA? Se re-renderiza cuando deja de
 *  cumplirla o vuelve a hacerlo — que en un iPad es, sobre todo, girarlo.
 *
 *  Existe porque el maestro-detalle del iPad cambia de FORMA con el giro
 *  (columnas en horizontal, empujar en vertical) pero su ESTADO —qué fila
 *  está abierta— tiene que sobrevivirlo: vive en React, por encima de la
 *  media query, y este hook es el puente. Un `window.innerWidth` leído una
 *  vez no se entera del giro; el listener de `matchMedia` sí. */
export function useMediaQuery(query: string): boolean {
  const [coincide, setCoincide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const alCambiar = () => setCoincide(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [query]);
  return coincide;
}
