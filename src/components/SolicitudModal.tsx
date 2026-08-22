/**
 * SolicitudModal.tsx — la solicitud de carta en Mac e iPad: el diálogo
 * centrado de siempre, con sus dos secciones y su rejilla de dos columnas.
 *
 * En iPhone no se pinta nada de aquí: la hoja de iOS (`NuevaSolicitudIOS`) se
 * lleva el formulario entero. Lo que comparten es `useSolicitud`, así que las
 * dos vistas escriben el MISMO registro con las MISMAS validaciones.
 */
import { useTranslation } from "react-i18next";
import { esMovil } from "../movil";
import { TIPOS_CARTA } from "./CartaEditor";
import { Seccion } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import NuevaSolicitudIOS from "./NuevaSolicitudIOS";
import {
  ESTADOS_SOLICITUD, MEDIOS_ENTREGA, PRIORIDADES,
  useSolicitud, type PropsSolicitud,
} from "./solicitud";

export { ESTADOS_SOLICITUD, PRIORIDADES };

export default function SolicitudModal(props: PropsSolicitud) {
  const { t } = useTranslation();
  const { solicitud, onClose } = props;
  const h = useSolicitud(props);
  const enHoja = esMovil();
  /** La hoja registra su propio Escape (y sus pantallas internas se lo quitan
   *  mientras están abiertas). Un `() => {}` estable evita que este efecto se
   *  vuelva a suscribir en cada render. */
  useEscapeClose(enHoja ? NO_HACE_NADA : onClose);

  /** Un catálogo de claves + su prefijo de i18n -> `option`s del desplegable. */
  const opc = (claves: readonly string[], pref: string) =>
    claves.map((k) => ({ value: k, label: t(`${pref}.${k}`) }));

  if (enHoja) return <NuevaSolicitudIOS solicitud={solicitud} onClose={onClose} h={h} />;

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
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("solicitudes.secSolicitante")}>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              <button type="button" className={`chip${h.esMiembro ? " active" : ""}`} onClick={() => h.setEsMiembro(true)}>
                {t("cartas.miembro")}
              </button>
              <button type="button" className={`chip${!h.esMiembro ? " active" : ""}`} onClick={() => h.setEsMiembro(false)}>
                {t("cartas.destinatario.externo")}
              </button>
            </div>
            <div className="form-grid">
              {h.esMiembro ? (
                <div className="form-group">
                  <label className="form-label">{t("cartas.miembro")}</label>
                  <select className="form-input" value={h.memberId ?? ""} onChange={(e) => h.setMemberId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{t("cartas.eligeMiembro")}</option>
                    {h.members.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">{t("solicitudes.personaExterna")}</label>
                  <input className="form-input" value={h.externo} onChange={(e) => h.setExterno(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t("cartas.tipoCarta")}</label>
                <select className="form-input" value={h.tipoCarta} onChange={(e) => h.setTipoCarta(e.target.value)}>
                  {opc(TIPOS_CARTA, "cartas.tipoDoc").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("solicitudes.motivo")}</label>
                <textarea className="form-textarea" rows={2} value={h.motivo} onChange={(e) => h.setMotivo(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("solicitudes.secGestion")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaSolicitud")}</label>
                <input type="date" className="form-input" value={h.fechaSolicitud} onChange={(e) => h.setFechaSolicitud(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaRequerida")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="date" className="form-input" min={h.fechaSolicitud} value={h.fechaRequerida} onChange={(e) => h.setFechaRequerida(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.medioEntrega")}</label>
                <select className="form-input" value={h.medio} onChange={(e) => h.setMedio(e.target.value)}>
                  {opc(MEDIOS_ENTREGA, "solicitudes.medio").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.responsable")}</label>
                <input className="form-input" value={h.responsable} onChange={(e) => h.setResponsable(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.prioridad")}</label>
                <select className="form-input" value={h.prioridad} onChange={(e) => h.setPrioridad(e.target.value)}>
                  {opc(PRIORIDADES, "solicitudes.prioridadOpcion").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={h.estado} onChange={(e) => h.setEstado(e.target.value)}>
                  {opc(ESTADOS_SOLICITUD, "solicitudes.estado").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={h.observaciones} onChange={(e) => h.setObservaciones(e.target.value)} />
              </div>
            </div>
          </Seccion>

          {h.error && <div className="field-error">{h.error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={h.guardar} disabled={h.saving}>
              {h.saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const NO_HACE_NADA = () => {};
