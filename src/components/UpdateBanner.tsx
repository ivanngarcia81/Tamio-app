import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buscarActualizacion, type ActualizacionDisponible } from "../services/update";
import { IconDownload, IconClose } from "../icons";

const DESCARTADA_KEY = "tamio-update-descartada";

/** Aviso discreto cuando hay una versión más nueva publicada. Abre el enlace de
 *  descarga (no auto-instala). Se puede descartar por versión: no vuelve a
 *  molestar con la misma, pero sí reaparece cuando salga una posterior. */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const [act, setAct] = useState<ActualizacionDisponible | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Pequeña espera para no competir con la carga inicial de la app.
    const timer = setTimeout(() => {
      buscarActualizacion()
        .then((r) => {
          if (cancelado || !r) return;
          let descartada: string | null = null;
          try { descartada = localStorage.getItem(DESCARTADA_KEY); } catch { /* noop */ }
          if (descartada === r.version) return; // ya la descartó
          setAct(r);
        })
        .catch(() => {});
    }, 2500);
    return () => { cancelado = true; clearTimeout(timer); };
  }, []);

  if (!act) return null;

  function descartar() {
    try { if (act) localStorage.setItem(DESCARTADA_KEY, act.version); } catch { /* noop */ }
    setAct(null);
  }

  return (
    <div className="update-banner">
      <span className="update-dot" aria-hidden />
      <div className="update-text">
        <b>{t("update.titulo", { version: act.version })}</b>
        {act.notas && <span className="update-notas"> — {act.notas}</span>}
      </div>
      <button className="btn primary sm update-btn" onClick={() => { void openUrl(act.url).catch(() => {}); }}>
        <IconDownload size={13} /> {t("update.descargar")}
      </button>
      <button className="update-cerrar" onClick={descartar} title={t("update.ahoraNo")}>
        <IconClose size={15} />
      </button>
    </div>
  );
}
