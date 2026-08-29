/**
 * IOSFormSheet.tsx — hoja de formulario de pantalla completa, estilo iOS
 * ("modal form sheet"): sube desde abajo y cubre toda la pantalla, con su
 * propia nav bar (Cancelar / título / Guardar) — a diferencia de
 * `ActionSheet`, que se ancla abajo y no tapa el contenido. Usada por las
 * pantallas de Ajustes que crean/editan un elemento de una lista (p. ej.
 * Categorías) en vez de un campo suelto.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import Portal from "../Portal";

export default function IOSFormSheet({
  title,
  onCancel,
  onSave,
  canSave,
  saveLabel,
  children,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  /** Qué dice la acción de la derecha. Por omisión «Guardar», que es lo que
   *  hacen casi todas; la hoja de recuperar acceso no guarda nada — envía un
   *  código— y llamarla «Guardar» sería mentir sobre lo que va a pasar. */
  saveLabel?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="ios-sheet">
          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCancel}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{title}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={onSave} disabled={!canSave}>
                {saveLabel ?? t("common.guardar")}
              </button>
            </span>
          </div>
          <div className="ios-form ios-sheet-body">{children}</div>
        </div>
      </div>
    </Portal>
  );
}
