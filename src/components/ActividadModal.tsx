import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ESTADOS_ACTIVIDAD, TIPOS_ACTIVIDAD, hoyISO, insertActividad, listMembersRoster,
  updateActividad, type Actividad, type Church, type NewActividad,
} from "../db";
import { Seccion } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  church: Church;
  /** null = actividad nueva. */
  actividad: Actividad | null;
  /** Fecha preseleccionada (YYYY-MM-DD) al crear desde una celda del calendario. */
  fechaInicial?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ActividadModal({ church, actividad, fechaInicial, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const editar = actividad !== null;

  const [nombre, setNombre] = useState(actividad?.nombre ?? "");
  const [tipo, setTipo] = useState(actividad?.tipo ?? "cultoRegular");
  const [tipoPersonalizado, setTipoPersonalizado] = useState(actividad?.tipo_personalizado ?? "");
  const [fecha, setFecha] = useState(actividad?.fecha ?? fechaInicial ?? hoyISO());
  const [diaCompleto, setDiaCompleto] = useState(actividad ? actividad.dia_completo === 1 : false);
  const [horaInicio, setHoraInicio] = useState(actividad?.hora_inicio ?? "");
  const [horaFin, setHoraFin] = useState(actividad?.hora_fin ?? "");
  const [lugar, setLugar] = useState(actividad?.lugar ?? "");
  const [descripcion, setDescripcion] = useState(actividad?.descripcion ?? "");
  const [responsableMemberId, setResponsableMemberId] = useState<string>(
    actividad?.responsable_member_id != null ? String(actividad.responsable_member_id) : ""
  );
  const [responsablePersona, setResponsablePersona] = useState(actividad?.responsable_persona ?? "");
  const [responsableMinisterio, setResponsableMinisterio] = useState(actividad?.responsable_ministerio ?? "");
  const [invitado, setInvitado] = useState(actividad?.invitado ?? "");
  const [contacto, setContacto] = useState(actividad?.contacto ?? "");
  const [estado, setEstado] = useState(actividad?.estado ?? "programada");
  const [esFechaImportante, setEsFechaImportante] = useState(actividad ? actividad.es_fecha_importante === 1 : false);

  const [miembros, setMiembros] = useState<{ id: number; nombre: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  useEffect(() => {
    let cancelado = false;
    listMembersRoster(church.id)
      .then((m) => { if (!cancelado) setMiembros(m); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  const validar = useMemo(() => {
    return (): string | null => {
      if (!nombre.trim()) return t("agenda.errNombre");
      if (!fecha) return t("agenda.errFecha");
      if (!diaCompleto && !horaInicio) return t("agenda.errHoraInicio");
      if (!diaCompleto && horaInicio && horaFin && horaFin < horaInicio) return t("agenda.errHoraFin");
      if (tipo === "otra" && !tipoPersonalizado.trim()) return t("agenda.errTipoPersonalizado");
      return null;
    };
  }, [nombre, fecha, diaCompleto, horaInicio, horaFin, tipo, tipoPersonalizado, t]);

  async function guardar() {
    const problema = validar();
    if (problema) { setError(problema); return; }
    setSaving(true);
    setError(null);
    const memberId = responsableMemberId ? Number(responsableMemberId) : null;
    const payload: NewActividad = {
      nombre,
      tipo,
      tipo_personalizado: tipoPersonalizado,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      dia_completo: diaCompleto,
      lugar,
      descripcion,
      responsable_member_id: memberId,
      // Si se eligió un miembro, la persona externa se ignora (mutuamente excluyentes).
      responsable_persona: memberId ? "" : responsablePersona,
      responsable_ministerio: responsableMinisterio,
      invitado,
      contacto,
      estado,
      es_fecha_importante: esFechaImportante,
    };
    try {
      if (editar) await updateActividad(actividad!.id, church.id, payload);
      else await insertActividad(church.id, payload);
      playSound("guardado");
      showToast(editar ? t("agenda.toastActualizada") : t("agenda.toastCreada"));
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError(t("agenda.errGuardar"));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 640 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{editar ? t("agenda.editarActividad") : t("agenda.nuevaActividad")}</div>
            <div className="modal-sub">{t("secretaria.agenda.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("agenda.secBasica")}>
            <div className="form-group full">
              <label className="form-label">{t("agenda.nombre")} *</label>
              <input
                className="form-input"
                value={nombre}
                autoFocus
                placeholder={t("agenda.nombrePlaceholder")}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.tipo")} *</label>
                <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_ACTIVIDAD.map((k) => (
                    <option key={k} value={k}>{t(`agenda.tipos.${k}`)}</option>
                  ))}
                </select>
              </div>
              {tipo === "otra" && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.tipoPersonalizado")} *</label>
                  <input
                    className="form-input"
                    value={tipoPersonalizado}
                    placeholder={t("agenda.tipoPersonalizadoPlaceholder")}
                    onChange={(e) => setTipoPersonalizado(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.fecha")} *</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={diaCompleto}
                    onChange={(e) => setDiaCompleto(e.target.checked)}
                  />
                  {t("agenda.diaCompleto")}
                </label>
              </div>
            </div>
            {!diaCompleto && (
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaInicio")} *</label>
                  <input type="time" className="form-input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaFin")}</label>
                  <input type="time" className="form-input" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-group full">
              <label className="form-label">{t("agenda.lugar")}</label>
              <input className="form-input" value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.descripcion")}</label>
              <textarea className="form-textarea" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("agenda.secResponsabilidad")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.responsable")}</label>
                <select
                  className="form-input"
                  value={responsableMemberId}
                  onChange={(e) => setResponsableMemberId(e.target.value)}
                >
                  <option value="">{t("agenda.responsableExterno")}</option>
                  {miembros.map((m) => (
                    <option key={m.id} value={String(m.id)}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              {!responsableMemberId && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.responsablePersona")}</label>
                  <input
                    className="form-input"
                    value={responsablePersona}
                    placeholder={t("agenda.responsablePersonaPlaceholder")}
                    onChange={(e) => setResponsablePersona(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.ministerio")}</label>
                <input className="form-input" value={responsableMinisterio} onChange={(e) => setResponsableMinisterio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("agenda.invitado")}</label>
                <input className="form-input" value={invitado} onChange={(e) => setInvitado(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.contacto")}</label>
              <input className="form-input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("agenda.secEstado")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.estado")}</label>
                <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_ACTIVIDAD.map((k) => (
                    <option key={k} value={k}>{t(`agenda.estados.${k}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={esFechaImportante}
                    onChange={(e) => setEsFechaImportante(e.target.checked)}
                  />
                  {t("agenda.esFechaImportante")}
                </label>
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
              {saving ? t("common.guardando") : editar ? t("common.guardarCambios") : t("agenda.guardarActividad")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
