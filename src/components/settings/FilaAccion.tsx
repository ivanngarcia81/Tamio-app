import type { ReactNode } from "react";

interface Props {
  /** Glifo de la acción, ya dimensionado (12–13 px). */
  icono: ReactNode;
  /** Color del tile. Se pasan los tokens de sistema `--ios-*`, los mismos que
   *  tiñen el índice de zonas. */
  tinte: string;
  titulo: string;
  /** Qué hace, en una línea. Va bajo el título, en gris. */
  nota?: ReactNode;
  /** El botón de la derecha (o lo que sea que dispare la acción). */
  children: ReactNode;
}

/** Una acción de la zona sensible: tile de color, qué es, y el botón que la
 *  dispara — respaldar, exportar, restaurar, compactar, borrar.
 *
 *  Existe porque el rediseño de macOS pinta esas seis acciones como SEIS FILAS
 *  IGUALES de una sola caja, y antes eran cuatro tarjetas con cuatro formas
 *  distintas: una con tres botones en fila y un párrafo debajo, otra con un
 *  botón y un sello de compilación, otra con una línea de estado, y la de
 *  peligro con dos filas propias. Cada una decía lo mismo de otra manera.
 *
 *  Se llama `settings-accion` y no `fila-accion` porque ESE nombre ya está
 *  cogido: son los botones que asoman al deslizar una fila en el iPhone
 *  (`.fila-acciones-pista`), y con la clase repetida esta fila heredaba su
 *  `flex-direction: column` y salía con el icono, el texto y el botón
 *  apilados y centrados.
 *
 *  El marcado es el mismo en las tres plataformas: una fila con icono, texto y
 *  botón se lee igual de bien en un teléfono, y montar dos versiones de esto
 *  habría sido mantener el doble para el mismo dibujo. */
export default function FilaAccion({ icono, tinte, titulo, nota, children }: Props) {
  return (
    <div className="settings-accion">
      <span className="settings-accion-icono" style={{ background: tinte }} aria-hidden="true">{icono}</span>
      <span className="settings-accion-texto">
        <span className="settings-accion-titulo">{titulo}</span>
        {nota && <span className="settings-accion-nota">{nota}</span>}
      </span>
      {children}
    </div>
  );
}
