import { useTranslation } from "react-i18next";
import { ejecutarSync, useSync } from "../../syncManager";
import { IconRefreshCw, IconCheck, IconWarn } from "../../icons";

/**
 * Sincronización (beta) — piloto de la tabla de miembros.
 * La sincronización ya es automática (al abrir, al guardar, al reconectar y
 * cada pocos minutos); este panel muestra el estado y deja forzarla a mano.
 * El estado se comparte con el indicador del sidebar vía el gestor de sync.
 */
export default function SyncSettings() {
  const { t } = useTranslation();
  const snap = useSync();
  const sincronizando = snap.estado === "sincronizando";

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconRefreshCw size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("sync.titulo")}</div>
            <div className="card-title-sub">{t("sync.sub")}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="btn secondary" onClick={() => { void ejecutarSync(); }} disabled={sincronizando}>
          <IconRefreshCw size={13} /> {sincronizando ? t("sync.sincronizando") : t("sync.sincronizarAhora")}
        </button>
      </div>

      <div className="form-hint">{t("sync.hintAuto")}</div>

      {snap.estado === "ok" && snap.ultima != null && (
        <div className="form-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, color: "var(--pos)" }}>
          <IconCheck size={13} /> {t("sync.resultado", { subidos: snap.subidos, bajados: snap.bajados })}
        </div>
      )}

      {snap.estado === "offline" && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {t("sync.errorSinConexion")}
        </div>
      )}

      {snap.estado === "error" && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {snap.motivo === "sin-iglesia" ? t("sync.errorSinIglesia") : snap.motivo === "sin-login" ? t("sync.errorSinLogin") : t("sync.errorGeneral")}
        </div>
      )}
    </div>
  );
}
