import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface CtxMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

/** Menú contextual de clic derecho, compartido por las tablas. Un solo menú
 *  por tabla: cada fila llama abrirMenu(e, items) desde onContextMenu y el
 *  menú aparece en el cursor (comportamiento estándar de macOS). Reutiliza
 *  los estilos de RowMenu para que "···" y clic derecho se vean idénticos. */
export function useContextMenu(): {
  abrirMenu: (e: ReactMouseEvent, items: CtxMenuItem[]) => void;
  menu: ReactNode;
} {
  const [estado, setEstado] = useState<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function abrirMenu(e: ReactMouseEvent, items: CtxMenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    setEstado({ x: e.clientX, y: e.clientY, items });
  }

  // Una vez montado se mide el tamaño real y se ajusta para no salirse
  // de la ventana (p. ej. clic derecho pegado al borde inferior).
  useLayoutEffect(() => {
    if (!estado || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(estado.x, window.innerWidth - rect.width - 8);
    const y = Math.min(estado.y, window.innerHeight - rect.height - 8);
    if (x !== estado.x || y !== estado.y) setEstado({ ...estado, x: Math.max(8, x), y: Math.max(8, y) });
  }, [estado]);

  useEffect(() => {
    if (!estado) return;
    const cerrar = () => setEstado(null);
    function onDocMouseDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      cerrar();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("keydown", onKey);
    };
  }, [estado]);

  const menu = estado
    ? createPortal(
        <div
          className="row-menu-dropdown"
          ref={menuRef}
          style={{ position: "fixed", top: estado.y, left: estado.x }}
        >
          {estado.items.map((item) => (
            <div
              key={item.label}
              className={`row-menu-item${item.danger ? " danger" : ""}`}
              onClick={() => {
                setEstado(null);
                item.onClick();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return { abrirMenu, menu };
}
