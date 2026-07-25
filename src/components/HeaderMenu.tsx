import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "../icons";

export interface HeaderMenuItem {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  label: string;
  items: HeaderMenuItem[];
}

/**
 * Botón de encabezado que agrupa acciones secundarias en un menú desplegable.
 * Mismo patrón de portal que RowMenu: position:fixed calculada en JS para no
 * quedar recortado por overflow de los contenedores.
 */
export default function HeaderMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = Math.max(180, rect.width);
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

  return (
    <>
      <button className="btn secondary" ref={btnRef} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} <IconChevronDown size={13} />
      </button>
      {open && pos &&
        createPortal(
          <div
            className="row-menu-dropdown"
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: 180 }}
          >
            {items.map((item) => (
              <div
                key={item.label}
                className={`row-menu-item${item.disabled ? " disabled" : ""}`}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {item.icon}
                  {item.label}
                </span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
