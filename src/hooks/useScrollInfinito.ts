import { useEffect, useRef } from "react";

/**
 * Carga la página siguiente al llegar al final de la lista, en vez de con un
 * paginador numérico.
 *
 * El "Página 3 de 12" con sus dos flechas (`Pagination.tsx`) es un control de
 * navegador: en iOS una lista larga no se pagina, se sigue desplazando y ella
 * sola trae más. Este enganche es el reemplazo en el teléfono — el paginador
 * se queda tal cual en Mac y iPad, donde un salto directo a la página 7 sí
 * tiene sentido con ratón y teclado.
 *
 * NO cambia de dónde salen los datos: las páginas siguen siendo la misma
 * rebanada del array que ya tenía cada pantalla (`visibles.slice(...)`), solo
 * que el corte crece en vez de moverse. Nada de consultas nuevas, ni de
 * estado que pueda desincronizarse con el filtro de arriba.
 *
 * @param activo   si false no se observa nada (Mac/iPad, o lista completa).
 * @param cargarMas se llama UNA vez por cada aparición del centinela.
 * @returns la referencia que hay que colgar del elemento centinela, un div
 *          vacío al final de la lista.
 */
export function useScrollInfinito(activo: boolean, cargarMas: () => void) {
  const centinela = useRef<HTMLDivElement | null>(null);
  // `cargarMas` es una función nueva en cada render del padre; con ella en las
  // dependencias, el observador se desmontaba y volvía a montarse en cada
  // repintado de la lista —y un IntersectionObserver recién montado dispara
  // enseguida si su objetivo ya está visible, así que la lista se cargaba
  // entera de golpe en vez de página a página.
  const cargarRef = useRef(cargarMas);
  cargarRef.current = cargarMas;

  useEffect(() => {
    const el = centinela.current;
    if (!activo || !el) return;
    const obs = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) cargarRef.current(); },
      // 320px de antelación: la página siguiente ya está pintada cuando el
      // dedo llega al final, así que la lista no da el tirón de "se acabó y
      // ahora aparece más" que delata la carga.
      { rootMargin: "320px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activo]);

  return centinela;
}
