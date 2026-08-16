import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "../icons";

export interface HeaderMenuItem {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Acción destructiva (borrar, reiniciar…): va en rojo. Agrúpala sola en
   *  la ÚLTIMA sección — nunca mezclada con acciones normales — para que no
   *  quede a un toque de distancia de algo inocuo. */
  danger?: boolean;
  onClick: () => void;
}

/** Un grupo de items separado del resto por una línea. Secciones en vez de
 *  una lista plana: "menú nativo con secciones", no un popover de accesos
 *  directos sueltos. */
export interface HeaderMenuSection {
  items: HeaderMenuItem[];
}

interface Props {
  /** Ícono o texto del botón que abre el menú. Con `icon`, el botón queda
   *  solo-ícono (el "···" de la fila fija de iPhone/iPad); con `label`, el
   *  botón de texto+flecha de siempre (escritorio). Uno de los dos. */
  icon?: ReactNode;
  label?: string;
  ariaLabel?: string;
  /** Atajo para un menú de una sola sección, sin separadores. */
  items?: HeaderMenuItem[];
  sections?: HeaderMenuSection[];
}

/**
 * Botón de encabezado que agrupa acciones secundarias en un menú desplegable.
 * Mismo patrón de portal que RowMenu: position:fixed calculada en JS para no
 * quedar recortado por overflow de los contenedores.
 */
export default function HeaderMenu({ icon, label, ariaLabel, items, sections }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const grupos = sections ?? [{ items: items ?? [] }];

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
      <button
        className={icon ? "btn-header-menu-icono" : "btn secondary"}
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={icon ? ariaLabel : undefined}
      >
        {icon ?? (
          <>
            {label} <IconChevronDown size={13} />
          </>
        )}
      </button>
      {open && pos &&
        createPortal(
          <div
            className="row-menu-dropdown"
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: 180 }}
          >
            {grupos.map((grupo, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="row-menu-separator" />}
                {grupo.items.map((item) => (
                  <div
                    key={item.label}
                    className={`row-menu-item${item.disabled ? " disabled" : ""}${item.danger ? " danger" : ""}`}
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
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
