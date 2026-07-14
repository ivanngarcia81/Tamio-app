import { useState } from "react";
import { useTranslation } from "react-i18next";
import { insertServicio, updateServicio, type Church, type NewServicio, type Servicio } from "../db";
import { ChipGroup, Seccion } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const TIPOS_SERVICIO = [
  "dominical", "oracion", "estudio", "jovenes", "damas", "caballeros",
  "vigilia", "evangelistico", "especial", "otro",
] as const;

function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function numeroSano(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

interface Props {
  church: Church;
  /** null = servicio nuevo. */
  servicio: Servicio | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ServicioModal({ church, servicio, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(servicio?.fecha ?? hoyLocal());
  const [tipo, setTipo] = useState(servicio?.tipo ?? "dominical");
  const [dirige, setDirige] = useState(servicio?.dirige ?? "");
  const [predica, setPredica] = useState(servicio?.predica ?? "");
  const [tituloMensaje, setTituloMensaje] = useState(servicio?.titulo_mensaje ?? "");
  const [textoBiblico, setTextoBiblico] = useState(servicio?.texto_biblico ?? "");
  const [resumenMensaje, setResumenMensaje] = useState(servicio?.resumen_mensaje ?? "");
  const [participaciones, setParticipaciones] = useState<string[]>(() => (servicio ? parseNombres(servicio.participaciones) : []));
  const [temaEscuela, setTemaEscuela] = useState(servicio?.tema_escuela ?? "");
  const [maestroEscuela, setMaestroEscuela] = useState(servicio?.maestro_escuela ?? "");
  const [asistentes, setAsistentes] = useState<string[]>(() => (servicio ? parseNombres(servicio.asistentes) : []));
  const [ausentes, setAusentes] = useState<string[]>(() => (servicio ? parseNombres(servicio.ausentes) : []));
  const [visitantes, setVisitantes] = useState<string[]>(() => (servicio ? parseNombres(servicio.visitantes) : []));
  const [ninos, setNinos] = useState(servicio?.ninos ?? 0);
  const [jovenes, setJovenes] = useState(servicio?.jovenes ?? 0);
  const [adultos, setAdultos] = useState(servicio?.adultos ?? 0);
  const [eventos, setEventos] = useState(servicio?.eventos ?? "");

  const total = ninos + jovenes + adultos;

  async function guardar() {
    setError(null);
    if (!fecha) { setError(t("servicios.fechaObligatoria")); return; }
    setSaving(true);
    try {
      const payload: NewServicio = {
        fecha,
        tipo,
        dirige: dirige.trim() || null,
        predica: predica.trim() || null,
        titulo_mensaje: tituloMensaje.trim() || null,
        texto_biblico: textoBiblico.trim() || null,
        resumen_mensaje: resumenMensaje.trim() || null,
        participaciones,
        tema_escuela: temaEscuela.trim() || null,
        maestro_escuela: maestroEscuela.trim() || null,
        asistentes,
        ausentes,
        visitantes,
        ninos,
        jovenes,
        adultos,
        eventos: eventos.trim() || null,
      };
      if (servicio) {
        await updateServicio(servicio.id, church.id, payload);
      } else {
        await insertServicio(church.id, payload);
      }
      playSound("guardado");
      showToast(t("servicios.toastGuardado"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{servicio ? t("servicios.editarServicio") : t("servicios.nuevoServicio")}</div>
            <div className="modal-sub">{t("secretaria.servicios.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("servicios.secServicio")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("tx.colFecha")}</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.tipoServicio")}</label>
                <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_SERVICIO.map((ti) => (
                    <option key={ti} value={ti}>{t(`servicios.tipo.${ti}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.dirige")}</label>
                <input className="form-input" value={dirige} onChange={(e) => setDirige(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.predica")}</label>
                <input className="form-input" value={predica} onChange={(e) => setPredica(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.participaciones")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={participaciones} onChange={setParticipaciones} placeholder={t("servicios.agregarParticipacion")} />
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secMensaje")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.tituloMensaje")}</label>
                <input className="form-input" value={tituloMensaje} onChange={(e) => setTituloMensaje(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.textoBiblico")}</label>
                <input className="form-input" placeholder={t("servicios.textoBiblicoPlaceholder")} value={textoBiblico} onChange={(e) => setTextoBiblico(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.resumenMensaje")}</label>
              <textarea className="form-textarea" rows={3} value={resumenMensaje} onChange={(e) => setResumenMensaje(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secEscuela")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.temaEscuela")}</label>
                <input className="form-input" value={temaEscuela} onChange={(e) => setTemaEscuela(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.maestroEscuela")}</label>
                <input className="form-input" value={maestroEscuela} onChange={(e) => setMaestroEscuela(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secAsistencia")}>
            <div className="form-group full">
              <label className="form-label">{t("servicios.asistentes")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={asistentes} onChange={setAsistentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.ausentes")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={ausentes} onChange={setAusentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.visitantes")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={visitantes} onChange={setVisitantes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
              <div className="form-group">
                <label className="form-label">{t("servicios.ninos")}</label>
                <input type="number" min={0} className="form-input" value={ninos} onChange={(e) => setNinos(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.jovenes")}</label>
                <input type="number" min={0} className="form-input" value={jovenes} onChange={(e) => setJovenes(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.adultos")}</label>
                <input type="number" min={0} className="form-input" value={adultos} onChange={(e) => setAdultos(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.totalPresentes")}</label>
                <input className="form-input" value={total} disabled style={{ fontWeight: 700 }} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secEventos")}>
            <div className="form-group full">
              <textarea
                className="form-textarea"
                rows={3}
                placeholder={t("servicios.eventosPlaceholder")}
                value={eventos}
                onChange={(e) => setEventos(e.target.value)}
              />
            </div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : servicio ? t("common.guardarCambios") : t("servicios.guardarServicio")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
