import { useTranslation } from "react-i18next";
import { ejecutarSync, useSync, type SyncEstado } from "../syncManager";
import { IconRefreshCw } from "../icons";

/** Indicador de sincronización en el pie del sidebar. Muestra el estado y, al
 *  hacer clic, fuerza una sincronización inmediata. Se oculta cuando la sync no
 *  aplica (sin login). */
export default function SyncIndicator() {
  const { t } = useTranslation();
  const snap = useSync();

  if (snap.estado === "desactivado") return null;

  const colorPorEstado: Record<SyncEstado, string> = {
    desactivado: "var(--text-2)",
    inactivo: "var(--text-2)",
    sincronizando: "var(--accent-4, #06b6d4)",
    ok: "var(--pos)",
    offline: "var(--text-2)",
    error: "var(--neg)",
  };
  const textoPorEstado: Record<SyncEstado, string> = {
    desactivado: "",
    inactivo: t("sync.estado.inactivo"),
    sincronizando: t("sync.estado.sincronizando"),
    ok: t("sync.estado.ok"),
    offline: t("sync.estado.offline"),
    error: t("sync.estado.error"),
  };

  const girando = snap.estado === "sincronizando";
  const titulo =
    snap.ultima != null
      ? t("sync.ultimaVez", { hora: new Date(snap.ultima).toLocaleTimeString() })
      : t("sync.hint");

  return (
    <button
      type="button"
      className="sync-indicator"
      onClick={() => { void ejecutarSync(); }}
      title={titulo}
      disabled={girando}
    >
      <span
        className={`sync-dot${girando ? " girando" : ""}`}
        style={{ color: colorPorEstado[snap.estado] }}
      >
        <IconRefreshCw size={13} />
      </span>
      <span className="sync-text">{textoPorEstado[snap.estado]}</span>
    </button>
  );
}
