import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Menú anclado a un botón, estilo UIMenu de iOS: baja desde el botón
 * (`transform-origin: top right`), no sube desde abajo como una hoja — las
 * hojas son para formularios/confirmaciones, los menús son para elegir una
 * acción. El ícono de cada ítem va a la DERECHA de la etiqueta (convención
 * de menú de iOS, al revés que un menú de escritorio típico).
 */
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
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <div className="ios-menu-anchor" ref={wrap}>
      <button
        type="button"
        className="ios-bar-button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {button}
      </button>

      {open && (
        <>
          <div className="ios-menu-backdrop" onClick={() => onOpenChange(false)} />
          <div className="ios-menu" role="menu">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`ios-menu-item${item.destructive ? " ios-menu-item--destructive" : ""}`}
                onClick={() => { onOpenChange(false); item.onPress(); }}
              >
                <span className="ios-menu-label">{item.label}</span>
                {item.icon && <span className="ios-menu-icon">{item.icon}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
