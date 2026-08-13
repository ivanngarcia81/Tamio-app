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

  // El panel de botones se dibuja donde ha quedado el borde derecho de la fila.
  // Va en `position: fixed` y no dentro de la fila porque la fila se mueve
  // entera: metido dentro, se movería con ella y nunca se vería.
  const fila = conGesto ? btnRef.current?.closest<HTMLElement>("[data-fila]") : null;
  const rect = desliza.x > 0 && fila ? fila.getBoundingClientRect() : null;

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
              left: rect.right - desliza.x,
              width: Math.max(ANCHO_ACCIONES, desliza.x),
              transition: desliza.arrastrando ? "none" : "left var(--dur) ease, width var(--dur) ease",
            }}
          >
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
