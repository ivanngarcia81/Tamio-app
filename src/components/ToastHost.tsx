import { useEffect, useState } from "react";
import { IconCheck } from "../icons";
import type { ToastDetail } from "../toast";

interface ToastItem extends ToastDetail {
  id: number;
}

let seq = 0;

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function dismiss(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = ++seq;
      setToasts((t) => [...t, { id, ...detail }]);
      const duration = detail.duration ?? (detail.onAction ? 5000 : 2600);
      setTimeout(() => dismiss(id), duration);
    };
    window.addEventListener("tesoreria-toast", onToast);
    return () => window.removeEventListener("tesoreria-toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <IconCheck size={14} strokeWidth={2.4} /> {t.mensaje}
          {t.onAction && (
            <button
              type="button"
              className="toast-action"
              onClick={() => { t.onAction?.(); dismiss(t.id); }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
