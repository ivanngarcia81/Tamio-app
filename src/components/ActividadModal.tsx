/**
 * ActividadModal.tsx — la actividad de la Agenda en Mac e iPad: el diálogo
 * centrado de siempre, con sus cuatro secciones y su rejilla de dos columnas.
 *
 * En iPhone no se pinta nada de aquí: la hoja de iOS (`NuevaActividadIOS`) se
 * lleva el formulario entero. Lo que comparten es `useActividad`, así que las
 * dos vistas escriben el MISMO registro con las MISMAS seis validaciones, y
 * la detección de choques de horario —con su "guardar de todas formas"—
 * existe una sola vez.
 */
import { useTranslation } from "react-i18next";
import { esMovil } from "../movil";
import { ESTADOS_ACTIVIDAD, TIPOS_ACTIVIDAD, type RecFin, type RecurrenciaTipo } from "../db";
import { Seccion } from "./FichaMiembroModal";
import NuevaActividadIOS from "./NuevaActividadIOS";
import { IconClose, IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import {
  RECORDATORIOS_PRESET, REC_TIPOS, useActividad,
  type ConflictoAgenda, type PropsActividad,
} from "./actividad";

export type { ConflictoAgenda };

export default function ActividadModal(props: PropsActividad) {
  const { t } = useTranslation();
  const { onClose } = props;
  const h = useActividad(props);
  const enHoja = esMovil();
  /** La hoja registra su propio Escape. Un `() => {}` estable evita que este
   *  efecto se vuelva a suscribir en cada render. */
  useEscapeClose(enHoja ? NO_HACE_NADA : onClose);

  const opc = (claves: readonly string[], pref: string) =>
    claves.map((k) => ({ value: k, label: t(`${pref}.${k}`) }));

  if (enHoja) return <NuevaActividadIOS onClose={onClose} h={h} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 640 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{h.titulo}</div>
            <div className="modal-sub">{t("secretaria.agenda.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("agenda.secBasica")}>
            <div className="form-group full">
              <label className="form-label">{t("agenda.nombre")}</label>
              <input className="form-input" value={h.nombre} autoFocus placeholder={t("agenda.nombrePlaceholder")} onChange={(e) => h.setNombre(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.tipo")}</label>
                <select className="form-input" value={h.tipo} onChange={(e) => h.setTipo(e.target.value)}>
                  {opc(TIPOS_ACTIVIDAD, "agenda.tipos").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {h.tipo === "otra" && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.tipoPersonalizado")}</label>
                  <input className="form-input" value={h.tipoPersonalizado} placeholder={t("agenda.tipoPersonalizadoPlaceholder")} onChange={(e) => h.setTipoPersonalizado(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.fecha")}</label>
                <input type="date" className="form-input" value={h.fecha} onChange={(e) => h.setFecha(e.target.value)} />
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input type="checkbox" checked={h.diaCompleto} onChange={(e) => h.setDiaCompleto(e.target.checked)} />
                  {t("agenda.diaCompleto")}
                </label>
              </div>
            </div>
            {!h.diaCompleto && (
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaInicio")}</label>
                  <input type="time" className="form-input" value={h.horaInicio} onChange={(e) => h.setHoraInicio(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaFin")} <span className="opt">{t("common.opcional")}</span></label>
                  <input type="time" className="form-input" value={h.horaFin} onChange={(e) => h.setHoraFin(e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-group full">
              <label className="form-label">{t("agenda.lugar")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" value={h.lugar} onChange={(e) => h.setLugar(e.target.value)} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.descripcion")} <span className="opt">{t("common.opcional")}</span></label>
              <textarea className="form-textarea" rows={2} value={h.descripcion} onChange={(e) => h.setDescripcion(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("agenda.secResponsabilidad")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.responsable")}</label>
                <select className="form-input" value={h.responsableMemberId} onChange={(e) => h.setResponsableMemberId(e.target.value)}>
                  {h.opcResponsable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {h.responsableMemberId === "externa" && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.responsablePersona")}</label>
                  <input className="form-input" value={h.responsablePersona} placeholder={t("agenda.responsablePersonaPlaceholder")} onChange={(e) => h.setResponsablePersona(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.ministerio")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={h.responsableMinisterio} onChange={(e) => h.setResponsableMinisterio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("agenda.invitado")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={h.invitado} onChange={(e) => h.setInvitado(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.contacto")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" value={h.contacto} onChange={(e) => h.setContacto(e.target.value)} />
            </div>
          </Seccion>

          {h.mostrarRecurrencia && (
            <Seccion titulo={t("agenda.secRepeticion")}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("agenda.repeticion")}</label>
                  <select className="form-input" value={h.recTipo} onChange={(e) => h.setRecTipo(e.target.value as RecurrenciaTipo)}>
                    {opc(REC_TIPOS, "agenda.rec").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {h.recTipo === "personalizada" && (
                  <div className="form-group">
                    <label className="form-label">{t("agenda.cadaNSemanas")}</label>
                    <input type="number" min={1} className="form-input" value={h.recIntervalo} onChange={(e) => h.setRecIntervalo(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
              </div>
              {h.muestraDias && (
                <div className="form-group full">
                  <label className="form-label">{t("agenda.diasRepeticion")}</label>
                  <div className="dias-toggle">
                    {h.diasSemana.map((d, i) => (
                      <button key={i} type="button" className={`dia-chip${h.recDias.includes(i) ? " active" : ""}`} onClick={() => h.toggleDia(i)}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {h.recTipo !== "ninguna" && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">{t("agenda.finRepeticion")}</label>
                    <select className="form-input" value={h.recFinTipo} onChange={(e) => h.setRecFinTipo(e.target.value as RecFin["tipo"])}>
                      {h.opcRecFin.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {h.recFinTipo === "hasta" && (
                    <div className="form-group">
                      <label className="form-label">{t("agenda.finFecha")}</label>
                      <input type="date" className="form-input" value={h.recHasta} onChange={(e) => h.setRecHasta(e.target.value)} />
                    </div>
                  )}
                  {h.recFinTipo === "conteo" && (
                    <div className="form-group">
                      <label className="form-label">{t("agenda.finVeces")}</label>
                      <input type="number" min={1} className="form-input" value={h.recConteo} onChange={(e) => h.setRecConteo(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                  )}
                </div>
              )}
            </Seccion>
          )}

          <Seccion titulo={t("agenda.secEstado")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.estado")}</label>
                <select className="form-input" value={h.estado} onChange={(e) => h.setEstado(e.target.value)}>
                  {opc(ESTADOS_ACTIVIDAD, "agenda.estados").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input type="checkbox" checked={h.esFechaImportante} onChange={(e) => h.setEsFechaImportante(e.target.checked)} />
                  {t("agenda.esFechaImportante")}
                </label>
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.recordatorios")}</label>
              <div className="dias-toggle">
                {RECORDATORIOS_PRESET.map((r) => (
                  <button key={r.offset} type="button" className={`dia-chip${h.recordatorios.includes(r.offset) ? " active" : ""}`} onClick={() => h.toggleRecordatorio(r.offset)}>
                    {t(`agenda.recordatorio.${r.clave}`)}
                  </button>
                ))}
              </div>
              {/* Decir qué es y qué NO es. El aviso solo se pinta en la lista
                  de Agenda: no hay correo ni notificación del sistema. Sin
                  esta línea, quien marca "un día antes" espera algo que no
                  llega y se entera el día que se le pasa la reunión. */}
              <div className="form-hint">{t("agenda.recordatoriosHint")}</div>
            </div>
          </Seccion>

          {h.conflictos && (
            <div className="agenda-conflicto">
              <div className="agenda-conflicto-head"><IconWarn size={15} /> {t("agenda.conflictoTitulo")}</div>
              <div className="agenda-conflicto-sub">{t("agenda.conflictoSub")}</div>
              <ul className="agenda-conflicto-lista">
                {h.conflictos.map((c, i) => <li key={i}><strong>{c.nombre}</strong> — {c.detalle}</li>)}
              </ul>
              <div className="agenda-conflicto-acciones">
                <button className="btn secondary sm" onClick={() => h.setConflictos(null)}>{t("agenda.conflictoEditar")}</button>
                <button className="btn primary danger sm" onClick={() => h.guardar(true)} disabled={h.saving}>{t("agenda.conflictoGuardar")}</button>
              </div>
            </div>
          )}

          {h.error && <div className="field-error">{h.error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={() => h.guardar(false)} disabled={h.saving || h.conflictos !== null}>
              {h.saving ? t("common.guardando") : h.etiquetaGuardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const NO_HACE_NADA = () => {};
