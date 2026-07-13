import { useEffect, useState } from "react";
import { IconCheck } from "../icons";

interface ToastItem {
  id: number;
  msg: string;
}

let seq = 0;

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, msg: String((e as CustomEvent).detail) }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener("tesoreria-toast", onToast);
    return () => window.removeEventListener("tesoreria-toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <IconCheck size={14} strokeWidth={2.4} /> {t.msg}
        </div>
      ))}
    </div>
  );
}
