import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/** Las tres alturas a las que la hoja se queda quieta. */
export type Detente = "asomada" | "media" | "completa";

const TODAS: Detente[] = ["asomada", "media", "completa"];

/** Lo que hay que arrastrar para cambiar de altura. */
const PASO = 44;
/** Por debajo de esto el gesto es un toque, no un arrastre. */
const HOLGURA = 8;
/** Y lo que hay que tirar hacia abajo desde la altura mínima para cerrar. */
const CIERRE = 60;

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
 * elige a qué altura se queda. Las dos cosas se animan con la misma curva, así
 * que el borde superior sale de donde lo dejó el dedo y llega al detente sin
 * saltar.
 *
 * CÓMO SE ELIGE ESA ALTURA, que es lo que se rehízo el 29 de agosto de 2026
 * después de probarla en el aparato. Antes era «el detente más cercano al alto
 * en el que quedó», a secas, y en un iPhone de 852 px eso significa: de
 * «asomada» (113) a «media» (486) hay 373 px, así que **había que arrastrar
 * 187 px hacia arriba** para cruzar el punto medio; con menos, la hoja volvía
 * a bajarse. Lo mismo para bajarla. El aparato lo dijo así: «hay que presionar
 * para arriba mucho para que suba, y también para bajarlo».
 *
 * Ahora un arrastre de 44 px basta para cambiar de altura: se elige el más
 * cercano, pero nunca menos de UN escalón en la dirección del gesto. Un tirón
 * largo puede saltarse dos; uno corto sube o baja uno; uno de menos de 44 px
 * no mueve nada y la hoja vuelve a su sitio.
 *
 * Y DE DÓNDE SE PUEDE ARRASTRAR. Antes, solo del asa de 22 px. El resto de la
 * hoja —el avatar, el nombre, la tarjeta entera— no respondía, y eso es lo que
 * se sentía como que «se paraliza»: el dedo la agarra donde cae y no pasa
 * nada. Ahora agarra cualquier sitio que no sea un control ni una lista ya
 * desplazada; en la altura asomada, además, **un toque la sube un escalón**,
 * que es lo que hace una hoja de iOS asomada y quita la necesidad de arrastrar
 * para lo más común.
 */
export default function HojaDetentesIOS({ detente, onDetente, onCerrar, etiqueta, detentes = TODAS, children }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const inicio = useRef<number | null>(null);
  const dy = useRef(0);
  /** Si el gesto ya pasó de la holgura: por debajo de eso es un toque. */
  const arrastrando = useRef(false);

  /** Alto visible de cada detente, en píxeles, para decidir el más cercano. */
  function altoDe(d: Detente): number {
    const alto = window.innerHeight;
    if (d === "asomada") return 113;
    if (d === "media") return alto * 0.57;
    return alto * 0.9;
  }

  /** ¿Este toque es para arrastrar la hoja, o es de quien lo recibió?
   *
   *  El asa y las zonas marcadas como agarre siempre arrastran. Un control se
   *  queda con su toque —si no, no habría manera de pulsar «Anotar visita»—. Y
   *  una lista que ya está desplazada se queda con el suyo: ahí el gesto es
   *  seguir leyendo, no mover la hoja. Solo desde arriba del todo el arrastre
   *  vuelve a ser de la hoja, que es exactamente lo que hace iOS. */
  function agarra(t: HTMLElement | null): boolean {
    if (!t) return false;
    if (t.closest(".hd-asa, .hd-agarre")) return true;
    if (t.closest("button, a, input, select, textarea, label")) return false;
    const cuerpo = t.closest(".hd-cuerpo") as HTMLElement | null;
    if (!cuerpo) return true;
    /* Un cuerpo que TIENE algo que desplazar se queda con el gesto entero, no
       solo cuando ya está desplazado. Al posar el dedo todavía no se sabe si
       va a subir o a bajar, y capturar «por si acaso» deja una lista que no
       se puede leer: es justo lo que le pasaría a la hoja de filtros, que es
       de una sola altura y no tiene a dónde ir. Para mover esas hojas están
       el asa y las zonas de agarre. */
    return cuerpo.scrollTop <= 0 && cuerpo.scrollHeight <= cuerpo.clientHeight + 1;
  }

  function alBajar(e: ReactPointerEvent<HTMLDivElement>) {
    if (!agarra(e.target as HTMLElement)) return;
    inicio.current = e.clientY;
    dy.current = 0;
    arrastrando.current = false;
    /* La captura va AQUÍ, no al pasar la holgura: en cuanto el dedo sale del
       borde de la hoja —y arrastrando hacia arriba sale enseguida— los
       `pointermove` se los queda lo que haya debajo, y el arrastre se pierde
       a los pocos píxeles. Robarle el clic a un botón no es un riesgo porque
       `agarra()` ya devolvió false para los controles: sobre ellos no se
       captura nada. */
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function alMover(e: ReactPointerEvent<HTMLDivElement>) {
    if (inicio.current === null) return;
    dy.current = e.clientY - inicio.current;
    /* El corte de la transición sí espera a la holgura: hacerlo al posar el
       dedo haría saltar un simple toque. */
    if (!arrastrando.current) {
      if (Math.abs(dy.current) < HOLGURA) return;
      arrastrando.current = true;
      hoja.current?.setAttribute("data-arrastrando", "");
    }
    hoja.current?.style.setProperty("--hd-arrastre", `${dy.current}px`);
  }

  /** El navegador se quedó con el gesto (se lo llevó el desplazamiento de una
   *  lista, o entró una llamada). Se deshace lo empezado y no se elige nada:
   *  cometer media decisión con un gesto que ya no es nuestro es como se
   *  consiguen las hojas que «saltan solas». */
  function alCancelar() {
    inicio.current = null;
    dy.current = 0;
    arrastrando.current = false;
    hoja.current?.style.removeProperty("--hd-arrastre");
    hoja.current?.removeAttribute("data-arrastrando");
  }

  function alSoltar(e: ReactPointerEvent<HTMLDivElement>) {
    if (inicio.current === null) return;
    const arrastre = dy.current;
    const huboArrastre = arrastrando.current;
    inicio.current = null;
    dy.current = 0;
    arrastrando.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ya se soltó */ }
    hoja.current?.style.removeProperty("--hd-arrastre");
    hoja.current?.removeAttribute("data-arrastrando");

    const i = detentes.indexOf(detente);

    // Un TOQUE en la altura más baja la sube un escalón. Es lo que hace una
    // hoja asomada de iOS, y es el gesto que la gente intenta primero.
    if (!huboArrastre) {
      if (i === 0 && detentes.length > 1) onDetente(detentes[1]);
      return;
    }

    // Hacia abajo desde la altura mínima: se cierra.
    if (i === 0 && arrastre > CIERRE) { onCerrar(); return; }

    // Un arrastre corto no mueve nada: la hoja vuelve a donde estaba.
    if (Math.abs(arrastre) < PASO) return;

    /* El detente más cercano al alto en el que quedó la hoja (`arrastre` es
       positivo hacia abajo, así que el alto visible baja al arrastrar)… */
    const altoSoltado = altoDe(detente) - arrastre;
    let mejor = detentes[0];
    let dist = Infinity;
    for (const d of detentes) {
      const dd = Math.abs(altoDe(d) - altoSoltado);
      if (dd < dist) { dist = dd; mejor = d; }
    }
    /* …pero nunca menos de un escalón en la dirección del gesto. Sin esto, el
       hueco entre alturas obliga a arrastrar la mitad de ese hueco —187 px
       entre asomada y media— antes de que pase nada. */
    const arriba = arrastre < 0;
    const iMejor = detentes.indexOf(mejor);
    const iPaso = Math.min(Math.max(i + (arriba ? 1 : -1), 0), detentes.length - 1);
    const destino = detentes[arriba ? Math.max(iMejor, iPaso) : Math.min(iMejor, iPaso)];
    if (destino !== detente) onDetente(destino);
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
      {/* Los manejadores van en la HOJA, no en el asa: quien la agarra por el
          nombre o por el hueco de al lado también la mueve. `agarra()` decide
          en cada toque si es de la hoja o del control que lo recibió. */}
      <div
        className="hoja-detentes"
        data-detente={detente}
        ref={hoja}
        role="dialog"
        aria-label={etiqueta}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
      >
        <div className="hd-asa">
          <span aria-hidden="true" />
        </div>
        <div className="hd-cuerpo">{children}</div>
      </div>
    </>
  );
}
