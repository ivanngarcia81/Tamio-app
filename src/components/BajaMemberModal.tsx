import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Member } from "../db";
import { useEscapeClose } from "../hooks/useEscapeClose";

const MOTIVOS = ["traslado", "fallecimiento", "retiro", "disciplina", "otro"] as const;
type MotivoId = (typeof MOTIVOS)[number];

interface Props {
  member: Member;
  onConfirm: (fecha: string, motivo: string | null) => void;
  onCancel: () => void;
}

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Baja formal del registro de membresía: pide fecha y motivo. El miembro
 *  no se elimina — conserva su historial de aportes y puede reactivarse. */
export default function BajaMemberModal({ member, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [fecha, setFecha] = useState(hoyLocal);
  const [motivo, setMotivo] = useState<MotivoId>("traslado");
  const [motivoOtro, setMotivoOtro] = useState("");
  useEscapeClose(onCancel);

  function confirmar() {
    const texto = motivo === "otro" ? motivoOtro.trim() : t(`membresia.motivo.${motivo}`);
    onConfirm(fecha, texto || null);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-card">
        <div className="confirm-title">{t("membresia.bajaTitulo", { nombre: member.nombre })}</div>
        <div className="confirm-message">{t("membresia.bajaMensaje")}</div>

        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">{t("membresia.bajaFecha")}</label>
          <input
            type="date"
            className="form-input"
            value={fecha}
            max={hoyLocal()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t("membresia.bajaMotivo")}</label>
          <select className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoId)}>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{t(`membresia.motivo.${m}`)}</option>
            ))}
          </select>
        </div>
        {motivo === "otro" && (
          <div className="form-group">
            <input
              className="form-input"
              placeholder={t("membresia.motivoPlaceholder")}
              value={motivoOtro}
              onChange={(e) => setMotivoOtro(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="confirm-actions">
          <button className="btn secondary" onClick={onCancel}>{t("common.cancelar")}</button>
          <button className="btn primary danger" onClick={confirmar} disabled={!fecha}>
            {t("membresia.confirmarBaja")}
          </button>
        </div>
      </div>
    </div>
  );
}
