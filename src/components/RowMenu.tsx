import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { IconEdit, IconTrash } from "../icons";
import { ANCHO_ACCIONES, hayGesto, useFilaDeslizable } from "./useFilaDeslizable";

export interface RowMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  /** Acciones adicionales entre Editar y la acción destructiva. */
  extraItems?: RowMenuItem[];
  /**
   * Borrar de verdad, **sin diálogo y con "Deshacer"**, para el deslizamiento
   * completo de la fila en el móvil. Si no se pasa, el gesto topa con una
   * pared y solo descubre los botones.
   *
   * Está separado de `onDelete` a propósito, y no es un `boolean`. `onDelete`
   * abre el diálogo de confirmación: un deslizamiento completo que abre un
   * diálogo no sirve de nada —son los mismos toques que tocar el botón— y
   * encima parece roto. Para que el gesto valga la pena hay que quitar la
   * confirmación, y quitarla **sin** marcha atrás es donde vive la pérdida.
   *
   * Pidiendo aquí la función de borrado con "Deshacer" en vez de un
   * interruptor, el gesto no se puede encender en una lista que no la tenga:
   * la regla la vigila el compilador y no la memoria de quien programa.
   */
  onBorrarDirecto?: () => void;
}

/**
 * Acciones de una fila. Dos caras según el equipo:
 *
 * - **Escritorio:** los tres puntitos de siempre, más el clic derecho que ya
 *   traen algunas listas.
 * - **iPad/iPhone:** se deslizan la fila a la izquierda y aparecen Editar y
 *   Eliminar. Los tres puntitos son un objetivo de 20 px y abren un menú
 *   encima del contenido: un patrón de ratón. El gesto lo hace el hook
 *   `useFilaDeslizable`, que mueve la fila localizada con `[data-fila]`.
 *
 * Si la fila no lleva `data-fila`, en el móvil se cae a los tres puntitos en
 * vez de quedarse sin acciones. Una lista sin marcar sigue funcionando.
 */
/** Traslación horizontal que el elemento lleva puesta ahora mismo (negativa
 *  cuando la fila está corrida hacia la izquierda). 0 si no tiene ninguna. */
function traslacionX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try { return new DOMMatrixReadOnly(t).m41; } catch { return 0; }
}

/** Radio del contenedor de la lista, para que el panel no asome por fuera de
 *  la curva de la tarjeta. Solo la primera y la última fila tocan una esquina
 *  redondeada; las de en medio van rectas. Se lee del DOM en vez de pasarlo
 *  por prop porque las nueve listas usan contenedores distintos
 *  (`.ios-listcard` a 16, `.data-table` en iPad) y ninguna tendría por qué
 *  saber que existe este panel. */
function radioDeEsquinas(fila: HTMLElement): { arriba: number; abajo: number } {
  const cont = fila.parentElement;
  if (!cont) return { arriba: 0, abajo: 0 };
  const cs = getComputedStyle(cont);
  return {
    arriba: fila.previousElementSibling === null ? parseFloat(cs.borderTopRightRadius) || 0 : 0,
    abajo: fila.nextElementSibling === null ? parseFloat(cs.borderBottomRightRadius) || 0 : 0,
  };
}

export default function RowMenu({ onEdit, onDelete, deleteLabel, extraItems, onBorrarDirecto }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [conGesto, setConGesto] = useState(false);
  const desliza = useFilaDeslizable(conGesto, onBorrarDirecto !== undefined, onBorrarDirecto ?? onDelete);

  // El gesto descubre Editar y Eliminar, que son las dos de siempre. Una fila
  // con acciones de más —imprimir un acta, fusionar un miembro, ver el
  // comprobante— **conserva los tres puntitos también en el móvil**: quitarlos
  // por limpieza dejaría esas acciones sin ninguna forma de llegar a ellas.
  const hayExtras = (extraItems ?? []).length > 0;

  // La fila que se mueve es un ANCESTRO de este componente, así que se busca
  // una vez montado. Sin `[data-fila]` no hay gesto y quedan los tres puntitos.
  useLayoutEffect(() => {
    if (!hayGesto()) return;
    const fila = btnRef.current?.closest<HTMLElement>("[data-fila]") ?? null;
    desliza.ref(fila);
    setConGesto(fila !== null);
  }, [desliza]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 140;
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - menuWidth),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function closeOnScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", closeOnScrollOrResize, true);
    window.addEventListener("resize", closeOnScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", closeOnScrollOrResize, true);
      window.removeEventListener("resize", closeOnScrollOrResize);
    };
  }, [open]);

  // El panel de botones se dibuja en el hueco que la fila deja al correrse.
  // Va en `position: fixed` y no dentro de la fila porque la fila se mueve
  // entera: metido dentro, se movería con ella y nunca se vería.
  const fila = conGesto ? btnRef.current?.closest<HTMLElement>("[data-fila]") : null;
  const rect = desliza.x > 0 && fila ? fila.getBoundingClientRect() : null;
  // `rect` NO sirve tal cual para colocar el panel, por dos motivos a la vez:
  //
  //  1. `getBoundingClientRect()` de un elemento con `transform` devuelve la
  //     caja YA desplazada, así que `rect.right` vale (borde original − x).
  //     Restarle `x` otra vez —lo que se hacía— dejaba el panel en
  //     (borde original − 2x): con la fila abierta, 168 px a la izquierda de
  //     su sitio, pintado ENCIMA de la fila en vez de en su hueco.
  //  2. La traslación la aplica el hook en un efecto, o sea DESPUÉS de
  //     pintar, así que durante el arrastre el DOM lleva todavía la `x` del
  //     render anterior y el panel iría un frame por detrás de la fila.
  //
  // Los dos se arreglan recuperando el borde ORIGINAL: se le quita a `rect`
  // la traslación que tiene puesta en este preciso momento, y a partir de
  // ahí se resta la `x` de ESTE render.
  const derechaOriginal = fila && rect ? rect.right - traslacionX(fila) : 0;
  const radioEsquinas = fila && rect ? radioDeEsquinas(fila) : { arriba: 0, abajo: 0 };

  return (
    <>
      {!conGesto || hayExtras ? (
        <span className="more" ref={btnRef} onClick={() => setOpen((o) => !o)}>···</span>
      ) : (
        // Ocupa la misma casilla de la rejilla que ocupaban los puntitos: sin
        // este hueco la fila recoloca todas sus columnas en el móvil.
        <span className="more sin-puntos" ref={btnRef} aria-hidden />
      )}

      {rect &&
        createPortal(
          <div
            className={`fila-acciones${desliza.vaABorrar ? " borrando" : ""}`}
            style={{
              position: "fixed",
              top: rect.top,
              height: rect.height,
              // La ventana es justo el hueco: empieza donde acabó la fila y
              // termina donde acababa antes de moverse.
              left: derechaOriginal - desliza.x,
              width: desliza.x,
              borderTopRightRadius: radioEsquinas.arriba,
              borderBottomRightRadius: radioEsquinas.abajo,
              transition: desliza.arrastrando ? "none" : "left var(--dur) ease, width var(--dur) ease",
            }}
          >
            {/* Los botones van en una pista de ancho FIJO pegada al borde
                derecho, y la ventana de arriba la recorta: así se descubren
                desde el borde sin cambiar de tamaño, como en Mail, en vez de
                aparecer enteros desde el primer píxel del arrastre. El
                `min-width: 100%` del CSS la deja crecer cuando la ventana se
                pasa de ancho — la pared elástica y, sobre todo, el borrado
                por deslizamiento completo, donde el rojo se come el panel. */}
            <div className="fila-acciones-pista" style={{ width: ANCHO_ACCIONES }}>
              <button
                className="fila-accion editar"
                onClick={() => { desliza.cerrar(); onEdit(); }}
              >
                <IconEdit size={18} />
                <span>{t("common.editar")}</span>
              </button>
              <button
                className="fila-accion eliminar"
                onClick={() => { desliza.cerrar(); onDelete(); }}
              >
                <IconTrash size={18} />
                <span>{deleteLabel ?? t("common.eliminar")}</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {open && pos &&
        createPortal(
          <div
            className="row-menu-dropdown"
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
          >
            <div className="row-menu-item" onClick={() => { setOpen(false); onEdit(); }}>
              {t("common.editar")}
            </div>
            {(extraItems ?? []).map((item) => (
              <div
                key={item.label}
                className={`row-menu-item${item.danger ? " danger" : ""}`}
                onClick={() => { setOpen(false); item.onClick(); }}
              >
                {item.label}
              </div>
            ))}
            <div className="row-menu-item danger" onClick={() => { setOpen(false); onDelete(); }}>
              {deleteLabel ?? t("common.eliminar")}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
