import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** Las tres alturas a las que la hoja se queda quieta. */
export type Detente = "asomada" | "media" | "completa";

const TODAS: Detente[] = ["asomada", "media", "completa"];

interface Props {
  detente: Detente;
  onDetente: (d: Detente) => void;
  /** Arrastrar por debajo de la altura asomada cierra: esto es lo que corre. */
  onCerrar: () => void;
  /** Etiqueta para el lector de pantalla — la hoja no tiene título propio. */
  etiqueta: string;
  /** Las alturas a las que ESTA hoja puede quedarse. Por omisión las tres.
   *  Con una sola —la de los filtros— la hoja no sube ni baja: solo se cierra
   *  arrastrándola hacia abajo, que es lo que hace una hoja de un solo alto. */
  detentes?: Detente[];
  children: ReactNode;
}

/**
 * Hoja inferior de tres alturas, NO modal.
 *
 * Es la pieza del tercer enfoque de Membresía: «el maestro-detalle no se
 * rompe, se convierte en hoja». En el iPad el padrón y la ficha conviven en
 * dos columnas; en 390 px no caben dos columnas, pero sí una encima de otra —
 * y esa es toda la idea: **el padrón nunca se va**. Cambiar de miembro no es
 * navegar, es tocar otro nombre en la lista que sigue ahí arriba.
 *
 * Por eso NO reutiliza `.ios-sheet`, que es la hoja de formulario del repo:
 * aquella es modal —telón negro al 35 %, 92 % de alto fijo, y nada detrás se
 * puede tocar—, y aquí lo que hay detrás es justamente lo que hay que poder
 * tocar. Comparten idioma visual, no mecanismo.
 *
 * Las tres alturas salen de la maqueta (artboard de 828 px):
 *
 *   asomada    113 px, y POR ENCIMA de la barra de pestañas (bottom: 83)
 *   media      472 de 828 → 57 %
 *   completa   748 de 828 → 90 %
 *
 * El telón aparece solo a partir de «media»: en «asomada» el padrón se toca,
 * que es la promesa del enfoque; en las otras dos se atenúa —«no se perdió,
 * está detrás»— pero se sigue viendo.
 *
 * El arrastre mueve un `translateY` (barato, no relayoutea) y al soltar se
 * elige el detente más cercano a donde quedó el borde. Las dos cosas se
 * animan a la vez con la misma curva, así que el borde superior sale de donde
 * lo dejó el dedo y llega al detente sin saltar. Un tirón hacia abajo desde
 * «asomada» que pase de 60 px cierra.
 */
export default function HojaDetentesIOS({ detente, onDetente, onCerrar, etiqueta, detentes = TODAS, children }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const inicio = useRef<number | null>(null);
  const dy = useRef(0);

  /** Alto visible de cada detente, en píxeles, para decidir el más cercano. */
  function altoDe(d: Detente): number {
    const alto = window.innerHeight;
    if (d === "asomada") return 113;
    if (d === "media") return alto * 0.57;
    return alto * 0.9;
  }

  function alBajar(e: ReactPointerEvent<HTMLDivElement>) {
    inicio.current = e.clientY;
    dy.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    hoja.current?.setAttribute("data-arrastrando", "");
  }

  function alMover(e: ReactPointerEvent<HTMLDivElement>) {
    if (inicio.current === null) return;
    dy.current = e.clientY - inicio.current;
    hoja.current?.style.setProperty("--hd-arrastre", `${dy.current}px`);
  }

  function alSoltar(e: ReactPointerEvent<HTMLDivElement>) {
    if (inicio.current === null) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const arrastre = dy.current;
    inicio.current = null;
    dy.current = 0;
    hoja.current?.style.removeProperty("--hd-arrastre");
    hoja.current?.removeAttribute("data-arrastrando");

    // Hacia abajo desde la altura mínima: se cierra.
    if (detente === detentes[0] && arrastre > 60) { onCerrar(); return; }

    /* El detente más cercano al alto en el que quedó la hoja. `arrastre` es
       positivo hacia abajo, así que el alto visible baja al arrastrar. */
    const altoSoltado = altoDe(detente) - arrastre;
    let mejor = detentes[0];
    let dist = Infinity;
    for (const d of detentes) {
      const dd = Math.abs(altoDe(d) - altoSoltado);
      if (dd < dist) { dist = dd; mejor = d; }
    }
    if (mejor !== detente) onDetente(mejor);
  }

  return (
    <>
      {/* Telón solo cuando la hoja tiene más de una altura y no está en la más
          baja. La hoja de un solo alto —los filtros— no lo lleva a propósito:
          su gracia es «se ve el efecto detrás en el momento», y un velo encima
          de la lista que se está filtrando pelearía con eso. */}
      {detentes.length > 1 && detente !== detentes[0] && (
        <div className="hd-telon" onClick={() => onDetente(detentes[0])} aria-hidden="true" />
      )}
      <div
        className="hoja-detentes"
        data-detente={detente}
        ref={hoja}
        role="dialog"
        aria-label={etiqueta}
      >
        {/* El asa es también la zona de arrastre. Se toca en toda la franja de
            arriba, no solo en la barrita de 36 px: en un teléfono, un objetivo
            de 5 px de alto no se acierta. */}
        <div
          className="hd-asa"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <span aria-hidden="true" />
        </div>
        <div className="hd-cuerpo">{children}</div>
      </div>
    </>
  );
}
