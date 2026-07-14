import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

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
}

export default function RowMenu({ onEdit, onDelete, deleteLabel, extraItems }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <span className="more" ref={btnRef} onClick={() => setOpen((o) => !o)}>···</span>
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
