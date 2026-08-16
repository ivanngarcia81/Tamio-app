import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";
import Portal from "./Portal";

export interface ActionSheetOption {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  /** Título opcional arriba de las opciones (p. ej. "¿Cerrar sesión?"). */
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onCancel: () => void;
}

/**
 * Hoja de acciones al estilo iOS: se ancla abajo, con las opciones en su
 * propio bloque y "Cancelar" separado por un hueco — el patrón nativo para
 * confirmar algo destructivo (aquí, cerrar sesión), distinto del diálogo
 * centrado de `ConfirmDialog` que usa el resto de la app en escritorio.
 */
export default function ActionSheet({ title, message, options, onCancel }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);

  return (
    <Portal>
      <div className="action-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="action-sheet">
          {(title || message) && (
            <div className="action-sheet-head">
              {title && <div className="action-sheet-title">{title}</div>}
              {message && <div className="action-sheet-message">{message}</div>}
            </div>
          )}
          <div className="action-sheet-opciones">
            {options.map((op) => (
              <button
                key={op.label}
                type="button"
                className={`action-sheet-opcion${op.danger ? " danger" : ""}`}
                onClick={op.onClick}
              >
                {op.label}
              </button>
            ))}
          </div>
          <button type="button" className="action-sheet-cancelar" onClick={onCancel}>
            {t("common.cancelar")}
          </button>
        </div>
      </div>
    </Portal>
  );
}
