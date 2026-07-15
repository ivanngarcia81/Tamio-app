import { useTranslation } from "react-i18next";
import { IconClose } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";

export type Alcance = "sola" | "siguientes" | "serie";

interface Props {
  /** "editar" o "eliminar": cambia el texto del diálogo. */
  modo: "editar" | "eliminar";
  onElegir: (alcance: Alcance) => void;
  onCancel: () => void;
}

/** Pregunta el alcance del cambio sobre una actividad recurrente. */
export default function AlcanceDialog({ modo, onElegir, onCancel }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);
  const eliminar = modo === "eliminar";

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card" style={{ width: 420 }}>
        <div className="modal-header">
          <div className="modal-title">{eliminar ? t("agenda.alcanceEliminarTitulo") : t("agenda.alcanceEditarTitulo")}</div>
          <div className="modal-close" onClick={onCancel}><IconClose /></div>
        </div>
        <div className="modal-body">
          <div className="modal-sub" style={{ marginBottom: 12 }}>{t("agenda.alcanceSub")}</div>
          <div className="alcance-opciones">
            <button className="alcance-opcion" onClick={() => onElegir("sola")}>{t("agenda.alcanceSola")}</button>
            <button className="alcance-opcion" onClick={() => onElegir("siguientes")}>{t("agenda.alcanceSiguientes")}</button>
            <button className={`alcance-opcion${eliminar ? " danger" : ""}`} onClick={() => onElegir("serie")}>
              {eliminar ? t("agenda.alcanceSerieEliminar") : t("agenda.alcanceSerie")}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <span />
          <button className="btn secondary" onClick={onCancel}>{t("common.cancelar")}</button>
        </div>
      </div>
    </div>
  );
}
