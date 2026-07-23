import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Church } from "../../db";
import { compactarBase, contarPurgables } from "../../sync";
import { showToast } from "../../toast";
import { IconCheck, IconRefreshCw, IconWarn } from "../../icons";

interface Props {
  church: Church;
}

/** Mantenimiento: purga las "lápidas" (registros ya eliminados) que se
 *  acumulan por el borrado suave y recupera el espacio del archivo. En modo
 *  nube solo purga las que ya se propagaron (más de 90 días); en modo local,
 *  todas. No toca ningún dato visible. */
export default function CompactSettings({ church }: Props) {
  const { t } = useTranslation();
  const [purgables, setPurgables] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refrescar() {
    try {
      setPurgables(await contarPurgables(church.id));
    } catch {
      setPurgables(null);
    }
  }

  useEffect(() => {
    void refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id]);

  async function compactar() {
    setError(null);
    setTrabajando(true);
    try {
      const res = await compactarBase(church.id);
      if (!res.ok) {
        setError(t("compactar.error", { error: res.error ?? "" }));
      } else {
        showToast(res.filasLocal > 0
          ? t("compactar.listo", { count: res.filasLocal })
          : t("compactar.yaCompacta"));
        await refrescar();
      }
    } catch (e) {
      setError(t("compactar.error", { error: String(e) }));
    } finally {
      setTrabajando(false);
    }
  }

  const hayQue = (purgables ?? 0) > 0;

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconRefreshCw size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("compactar.titulo")}</div>
            <div className="card-title-sub">{t("compactar.sub")}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text-2)" }}>
          {purgables === null
            ? "—"
            : hayQue
              ? t("compactar.pendientes", { count: purgables })
              : (<span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pos)" }}>
                  <IconCheck size={13} /> {t("compactar.estaCompacta")}
                </span>)}
        </span>
        <button
          type="button"
          className="btn secondary"
          onClick={compactar}
          disabled={trabajando || !hayQue}
          style={{ marginLeft: "auto" }}
        >
          {trabajando ? t("compactar.compactando") : t("compactar.boton")}
        </button>
      </div>

      <div className="form-hint">{t("compactar.hint")}</div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
