import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Church } from "../../db";
import { compactarBase, contarPurgables } from "../../sync";
import { showToast } from "../../toast";
import { IconCheck, IconRefreshCw, IconWarn } from "../../icons";
import FilaAccion from "./FilaAccion";

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
      {/* Sin cabecera de tarjeta: la fila de abajo ya dice el título y el
          subtítulo, y con las dos cosas salía el mismo texto dos veces. */}
      {/* El estado —cuántas lápidas quedan, o que ya está compacta— es la NOTA
          de la fila: es exactamente lo que explica por qué el botón está o no
          disponible, y como línea suelta al lado del botón se leía como otra
          cosa. */}
      <FilaAccion
        icono={<IconRefreshCw size={12} />}
        tinte="var(--ios-gray)"
        titulo={t("compactar.titulo")}
        nota={purgables === null
          ? "—"
          : hayQue
            ? t("compactar.pendientes", { count: purgables })
            : (<span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pos)" }}>
                <IconCheck size={12} /> {t("compactar.estaCompacta")}
              </span>)}
      >
        <button type="button" className="btn secondary" onClick={compactar} disabled={trabajando || !hayQue}>
          {trabajando ? t("compactar.compactando") : t("compactar.boton")}
        </button>
      </FilaAccion>

      <div className="form-hint">{t("compactar.hint")}</div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
