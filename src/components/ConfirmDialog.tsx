import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-card">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn secondary" onClick={onCancel}>{t("common.cancelar")}</button>
          <button className={`btn primary${danger ? " danger" : ""}`} onClick={onConfirm}>
            {confirmLabel ?? t("common.confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
