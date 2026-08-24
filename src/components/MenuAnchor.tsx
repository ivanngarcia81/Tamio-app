import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Apagado con su explicación en `title`: la acción está en su sitio del
   *  menú pero todavía no tiene motor. Es el mismo trato que damos a los
   *  botones sin motor en el resto de la app —apagado y diciendo por qué—,
   *  en vez de esconder la opción y que el menú mienta sobre lo que se puede
   *  hacer con un depósito. */
  disabled?: boolean;
  title?: string;
  onPress: () => void;
};

/**
 * Menú anclado a un botón, estilo UIMenu de iOS: baja desde el botón, no sube
 * desde abajo como una hoja — las hojas son para formularios/confirmaciones,
 * los menús son para elegir una acción. El ícono de cada ítem va a la DERECHA
 * de la etiqueta (convención de menú de iOS, al revés que un menú de
 * escritorio típico).
 *
 * **Cuelga de `<body>` y se posiciona en `fixed`** (23 ago 2026). Antes era un
 * `position: absolute` dentro del propio anclaje, y eso lo dejaba a merced de
 * cualquier ancestro con `overflow`. Medido en el chip del mes de Reportes: el
 * menú ocupaba 546–796 y el panel empieza en 648, así que **102px se los comía
 * el `overflow-y: auto` del panel** — el menú aparecía cortado por la mitad,
 * "detrás" de la columna maestra. Es el mismo remedio que ya usaban
 * `RowMenu`, `HeaderMenu` y `ContextMenu`, y el que documenta `Portal.tsx`:
 * fuera del árbol, donde ningún ancestro puede recortarlo.
 *
 * Con el menú suelto hay que colocarlo a mano, y de paso resuelve dos cosas
 * que el `right: 4px` de antes no podía:
 *
 *  - **Se voltea.** Cuelga alineado al borde IZQUIERDO del disparador y crece
 *    hacia la derecha; solo si así se saldría de la ventana se alinea a la
 *    derecha. Antes se alineaba siempre a la derecha (`right: 4px`), y con un
 *    chip pegado al borde del panel eso mandaba el menú entero sobre la
 *    columna maestra.
 *  - **Se limita de alto.** El menú de meses tiene doce entradas o más; si no
 *    cabe debajo se abre hacia arriba, y si tampoco cabe así, se queda con el
 *    alto disponible y se desplaza por dentro.
 *
 * Se cierra al desplazar o redimensionar, como los otros menús de la casa: un
 * `fixed` no sigue a su disparador, así que quedarse abierto sería quedarse
 * flotando en el sitio equivocado.
 */

/** Aire contra los bordes de la ventana, y hueco entre botón y menú. */
const MARGEN = 8;
const HUECO = 4;

interface Sitio {
  top: number;
  left: number;
  maxAlto: number;
  origen: string;
}

export function MenuAnchor({
  open,
  onOpenChange,
  button,
  items,
  ariaLabel = "Acciones",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Contenido del botón disparador (el glifo del "+"). */
  button: ReactNode;
  items: MenuItem[];
  ariaLabel?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [sitio, setSitio] = useState<Sitio | null>(null);

  /* Dos pasadas: el menú se monta sin colocar (invisible), se mide, y se
     coloca antes de pintar. `useLayoutEffect` es lo que evita el parpadeo. */
  useLayoutEffect(() => {
    if (!open) {
      setSitio(null);
      return;
    }
    const b = btn.current;
    const m = menu.current;
    if (!b || !m) return;
    const r = b.getBoundingClientRect();
    const ancho = m.offsetWidth;
    const alto = m.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    /* Por defecto se alinea con el borde IZQUIERDO del disparador y crece
       hacia la derecha, que es lo que espera cualquiera de un desplegable; se
       voltea a la derecha solo si así se saldría de la ventana, que es el
       caso de los "+" de las cabeceras. Alinear siempre a la derecha —lo que
       hacía el `right: 4px` de antes— dejaba el menú del chip del mes tapando
       la columna maestra, porque ese chip está pegado al borde del panel. */
    let left = r.left;
    let origen = "top left";
    if (left + ancho > vw - MARGEN) {
      left = r.right - ancho;
      origen = "top right";
    }
    left = Math.min(Math.max(MARGEN, left), Math.max(MARGEN, vw - ancho - MARGEN));

    let top = r.bottom + HUECO;
    let maxAlto = vh - top - MARGEN;
    const arriba = r.top - HUECO - MARGEN;
    if (alto > maxAlto && arriba > maxAlto) {
      // Cabe mejor hacia arriba.
      top = Math.max(MARGEN, r.top - HUECO - Math.min(alto, arriba));
      maxAlto = arriba;
      origen = origen.replace("top", "bottom");
    }

    setSitio({ top, left, maxAlto: Math.max(120, maxAlto), origen });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    const cerrar = () => onOpenChange(false);
    window.addEventListener("keydown", onKey);
    // `true`: en la fase de captura, para enterarse también del desplazamiento
    // de los paneles internos y no solo del de la ventana.
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [open, onOpenChange]);

  return (
    <div className="ios-menu-anchor">
      <button
        ref={btn}
        type="button"
        className="ios-bar-button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {button}
      </button>

      {open &&
        createPortal(
          <>
            <div className="ios-menu-backdrop" onClick={() => onOpenChange(false)} />
            <div
              ref={menu}
              className="ios-menu"
              role="menu"
              style={{
                top: sitio?.top ?? 0,
                left: sitio?.left ?? 0,
                maxHeight: sitio?.maxAlto,
                transformOrigin: sitio?.origen,
                // Mientras no esté medido no se enseña, para que no se vea
                // saltar desde la esquina.
                visibility: sitio ? "visible" : "hidden",
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`ios-menu-item${item.destructive ? " ios-menu-item--destructive" : ""}`}
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => { onOpenChange(false); item.onPress(); }}
                >
                  <span className="ios-menu-label">{item.label}</span>
                  {item.icon && <span className="ios-menu-icon">{item.icon}</span>}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
