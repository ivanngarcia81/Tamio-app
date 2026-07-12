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
  confirmLabel = "Confirmar",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-card">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn secondary" onClick={onCancel}>Cancelar</button>
          <button className={`btn primary${danger ? " danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
