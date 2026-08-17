import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import Portal from "../Portal";
import { IconCheck } from "../../icons";

export interface IOSPickerOption {
  value: string;
  label: string;
}

interface Props {
  title: string;
  options: IOSPickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

/**
 * Hoja de selección de una lista corta (moneda, y lo que necesite un
 * `PickerField` más adelante) — mismo look que `ActionSheet`, reutilizando
 * sus clases (`.action-sheet-*`), con una marca de check en la opción activa
 * y scroll propio para no reventar la altura de la pantalla en listas de
 * más de 6-7 filas.
 */
export default function IOSPickerSheet({ title, options, value, onSelect, onCancel }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);

  return (
    <Portal>
      <div className="action-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="action-sheet">
          <div className="action-sheet-head">
            <div className="action-sheet-title">{title}</div>
          </div>
          <div className="action-sheet-opciones action-sheet-opciones--lista">
            {options.map((op) => (
              <button
                key={op.value}
                type="button"
                className="action-sheet-opcion action-sheet-opcion--lista"
                onClick={() => onSelect(op.value)}
              >
                <span>{op.label}</span>
                {op.value === value && <IconCheck size={17} />}
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
