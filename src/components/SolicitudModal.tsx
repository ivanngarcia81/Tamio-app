import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  insertSolicitud, updateSolicitud,
  type Church, type Member, type NewSolicitud, type Solicitud,
} from "../db";
import { TIPOS_CARTA } from "./CartaEditor";
import { Seccion } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const PRIORIDADES = ["normal", "importante", "urgente"] as const;
export const ESTADOS_SOLICITUD = ["nueva", "revision", "preparacion", "firma", "lista", "entregada", "cancelada"] as const;
const MEDIOS_ENTREGA = ["impresa", "email", "mensajeria", "recoge", "otro"] as const;

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  church: Church;
  solicitud: Solicitud | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SolicitudModal({ church, solicitud, members, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [esMiembro, setEsMiembro] = useState(solicitud ? solicitud.member_id !== null : true);
  const [memberId, setMemberId] = useState<number | null>(solicitud?.member_id ?? null);
  const [externo, setExterno] = useState(solicitud?.solicitante_externo ?? "");
  const [tipoCarta, setTipoCarta] = useState(solicitud?.tipo_carta ?? "recomendacion");
  const [motivo, setMotivo] = useState(solicitud?.motivo ?? "");
  const [fechaSolicitud, setFechaSolicitud] = useState(solicitud?.fecha_solicitud ?? hoyLocal());
  const [fechaRequerida, setFechaRequerida] = useState(solicitud?.fecha_requerida ?? "");
  const [medio, setMedio] = useState(solicitud?.medio_entrega ?? "impresa");
  const [responsable, setResponsable] = useState(solicitud?.responsable ?? church.secretaria_nombre ?? "");
  const [prioridad, setPrioridad] = useState(solicitud?.prioridad ?? "normal");
  const [estado, setEstado] = useState(solicitud?.estado ?? "nueva");
  const [observaciones, setObservaciones] = useState(solicitud?.observaciones ?? "");

  async function guardar() {
    setError(null);
    const nombreSolicitante = esMiembro
      ? members.find((m) => m.id === memberId)?.nombre
      : externo.trim();
    if (!nombreSolicitante) { setError(t("solicitudes.solicitanteObligatorio")); return; }
    if (!fechaSolicitud) { setError(t("solicitudes.fechaObligatoria")); return; }
    if (fechaRequerida && fechaRequerida < fechaSolicitud) { setError(t("solicitudes.requeridaAntes")); return; }
    setSaving(true);
    try {
      const payload: NewSolicitud = {
        member_id: esMiembro ? memberId : null,
        solicitante_externo: esMiembro ? null : externo.trim() || null,
        tipo_carta: tipoCarta,
        motivo: motivo.trim() || null,
        fecha_solicitud: fechaSolicitud,
        fecha_requerida: fechaRequerida || null,
        medio_entrega: medio,
        responsable: responsable.trim() || null,
        prioridad,
        estado,
        observaciones: observaciones.trim() || null,
      };
      if (solicitud) {
        await updateSolicitud(solicitud.id, church.id, payload, solicitud.estado);
      } else {
        await insertSolicitud(church.id, payload);
      }
      playSound("guardado");
      showToast(t("solicitudes.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {solicitud ? `${solicitud.folio} — ${t("common.editar")}` : t("solicitudes.nuevaSolicitud")}
            </div>
            <div className="modal-sub">{t("solicitudes.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("solicitudes.secSolicitante")}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button type="button" className={`chip${esMiembro ? " active" : ""}`} onClick={() => setEsMiembro(true)}>
                {t("cartas.miembro")}
              </button>
              <button type="button" className={`chip${!esMiembro ? " active" : ""}`} onClick={() => setEsMiembro(false)}>
                {t("cartas.destinatario.externo")}
              </button>
            </div>
            <div className="form-grid">
              {esMiembro ? (
                <div className="form-group">
                  <label className="form-label">{t("cartas.miembro")}</label>
                  <select className="form-input" value={memberId ?? ""} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{t("cartas.eligeMiembro")}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">{t("solicitudes.personaExterna")}</label>
                  <input className="form-input" value={externo} onChange={(e) => setExterno(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t("cartas.tipoCarta")}</label>
                <select className="form-input" value={tipoCarta} onChange={(e) => setTipoCarta(e.target.value)}>
                  {TIPOS_CARTA.map((ti) => (
                    <option key={ti} value={ti}>{t(`cartas.tipoDoc.${ti}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("solicitudes.motivo")}</label>
                <textarea className="form-textarea" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("solicitudes.secGestion")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaSolicitud")}</label>
                <input type="date" className="form-input" value={fechaSolicitud} onChange={(e) => setFechaSolicitud(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaRequerida")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="date" className="form-input" min={fechaSolicitud} value={fechaRequerida} onChange={(e) => setFechaRequerida(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.medioEntrega")}</label>
                <select className="form-input" value={medio} onChange={(e) => setMedio(e.target.value)}>
                  {MEDIOS_ENTREGA.map((m) => (
                    <option key={m} value={m}>{t(`solicitudes.medio.${m}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.responsable")}</label>
                <input className="form-input" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.prioridad")}</label>
                <select className="form-input" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>{t(`solicitudes.prioridadOpcion.${p}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_SOLICITUD.map((es) => (
                    <option key={es} value={es}>{t(`solicitudes.estado.${es}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
