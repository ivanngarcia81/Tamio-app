import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Church } from "../../db";
import { sincronizarMiembros, type MotivoSync } from "../../sync";
import { IconRefreshCw, IconCheck, IconWarn } from "../../icons";

interface Props {
  church: Church;
}

/**
 * Sincronización (beta) — piloto de la tabla de miembros.
 * Botón manual que sube los cambios locales a la nube y baja los de las otras
 * Macs de la misma iglesia. La automatización (al guardar / periódica) y el
 * indicador de estado permanente llegan en E5.
 */
export default function SyncSettings({ church }: Props) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [ok, setOk] = useState<{ subidos: number; bajados: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function mensajeMotivo(motivo?: MotivoSync): string {
    switch (motivo) {
      case "sin-login": return t("sync.errorSinLogin");
      case "sin-iglesia": return t("sync.errorSinIglesia");
      case "sin-conexion": return t("sync.errorSinConexion");
      default: return t("sync.errorGeneral");
    }
  }

  async function sincronizar() {
    setError(null);
    setOk(null);
    setWorking(true);
    try {
      const res = await sincronizarMiembros(church.id);
      if (res.ok) {
        setOk({ subidos: res.subidos, bajados: res.bajados });
        setTimeout(() => setOk(null), 6000);
      } else {
        setError(mensajeMotivo(res.motivo));
      }
    } finally {
      setWorking(false);
    }
  }

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
        <button type="button" className="btn secondary" onClick={sincronizar} disabled={working}>
          <IconRefreshCw size={13} /> {working ? t("sync.sincronizando") : t("sync.sincronizarAhora")}
        </button>
      </div>

      <div className="form-hint">{t("sync.hint")}</div>

      {ok && (
        <div className="form-hint" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, color: "var(--pos)" }}>
          <IconCheck size={13} /> {t("sync.resultado", { subidos: ok.subidos, bajados: ok.bajados })}
        </div>
      )}

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
