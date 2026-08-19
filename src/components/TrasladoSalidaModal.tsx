/**
 * TrasladoSalidaModal.tsx — el traslado de salida en Mac e iPad: el diálogo
 * centrado de siempre, con sus tres secciones y su rejilla de dos columnas.
 *
 * En iPhone no se pinta nada de aquí: la hoja de iOS
 * (`NuevoTrasladoSalidaIOS`) se lleva el formulario entero. Lo que comparten
 * es `useTrasladoSalida`, así que las dos vistas escriben el MISMO registro
 * con las MISMAS cuatro validaciones, y la generación de la carta vinculada
 * existe una sola vez.
 */
import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { Seccion, SwitchRow } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import NuevoTrasladoSalidaIOS from "./NuevoTrasladoSalidaIOS";
import { IconClose, IconFileText } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import {
  ESTADOS_TS, METODOS_ENTREGA, useTrasladoSalida, type PropsTrasladoSalida,
} from "./trasladoSalida";

export { ESTADOS_TS };

export default function TrasladoSalidaModal(props: PropsTrasladoSalida) {
  const { t } = useTranslation();
  const { traslado, onAbrirCarta } = props;
  const h = useTrasladoSalida(props);
  const enHoja = esIPhone();
  /** La hoja registra su propio Escape. Un `() => {}` estable evita que este
   *  efecto se vuelva a suscribir en cada render. */
  useEscapeClose(enHoja ? NO_HACE_NADA : h.pedirCerrar);

  if (enHoja) return <NuevoTrasladoSalidaIOS traslado={traslado} onAbrirCarta={onAbrirCarta} h={h} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) h.pedirCerrar(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {traslado ? `${traslado.folio} — ${t("common.editar")}` : t("traslados.nuevoSalida")}
            </div>
            <div className="modal-sub">{t("traslados.subSalida")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={h.pedirCerrar}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("traslados.secMiembro")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("cartas.miembro")}</label>
                <select
                  className="form-input"
                  value={h.memberId ?? ""}
                  disabled={h.miembroFijo}
                  onChange={(e) => h.setMemberId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t("cartas.eligeMiembro")}</option>
                  {h.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaSolicitud")}</label>
                <input type="date" className="form-input" value={h.fechaSolicitud} onChange={(e) => h.setFechaSolicitud(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("solicitudes.motivo")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={h.motivo} onChange={(e) => h.setMotivo(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secDestino")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.iglesiaDestino")}</label>
                <input className="form-input" value={h.iglesiaDestino} onChange={(e) => h.setIglesiaDestino(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.pastorReceptor")}</label>
                <input className="form-input" value={h.pastorReceptor} onChange={(e) => h.setPastorReceptor(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("institucion.direccion")}</label>
                <input className="form-input" value={h.direccion} onChange={(e) => h.setDireccion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("iglesia.ciudad")}</label>
                <input className="form-input" value={h.ciudad} onChange={(e) => h.setCiudad(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("institucion.region")}</label>
                <input className="form-input" value={h.region} onChange={(e) => h.setRegion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("iglesia.pais")}</label>
                <input className="form-input" value={h.pais} onChange={(e) => h.setPais(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.telefono")}</label>
                <input className="form-input" value={h.telefono} onChange={(e) => h.setTelefono(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("tesorero.correo")}</label>
                <input className="form-input" type="email" value={h.email} onChange={(e) => h.setEmail(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProceso")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={h.estado} onChange={(e) => h.setEstado(e.target.value)}>
                  {ESTADOS_TS.map((es) => (
                    <option key={es} value={es}>{t(`traslados.estadoTS.${es}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.fechaAprobacion")}</label>
                <input type="date" className="form-input" value={h.fechaAprobacion} onChange={(e) => h.setFechaAprobacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.aprobadoPor")}</label>
                <input className="form-input" value={h.aprobadoPor} onChange={(e) => h.setAprobadoPor(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.cartaVinculada")}</label>
                {h.cartaId ? (
                  <button type="button" className="btn secondary" onClick={() => onAbrirCarta(h.cartaId!)}>
                    {t("traslados.abrirCartaVinculada")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={!h.puedeGenerarCarta || !traslado || h.saving}
                      onClick={h.generarCarta}
                    >
                      <IconFileText size={14} /> {t("traslados.generarCarta")}
                    </button>
                    {/* El motivo vivía en un title, y en una pantalla táctil
                        no hay puntero que lo revele: el botón se veía apagado
                        sin ninguna explicación. Ahora se dice en pantalla. */}
                    {(!traslado || !h.puedeGenerarCarta) && (
                      <div className="form-hint" style={{ marginTop: 6 }}>
                        {!traslado ? t("traslados.guardaPrimero") : t("traslados.generarRequiereAprobado")}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t("cartas.fechaEntrega")}</label>
                <input type="date" className="form-input" value={h.fechaEntrega} onChange={(e) => h.setFechaEntrega(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.metodoEntrega")}</label>
                <select className="form-select" value={h.metodoEntrega} onChange={(e) => h.setMetodoEntrega(e.target.value)}>
                <option value="">—</option>
                {METODOS_ENTREGA.map((m) => (
                  <option key={m} value={m}>{t(`traslados.entrega.${m}`)}</option>
                ))}
                {/* Los traslados anteriores guardaban texto libre. Si el
                    valor no es una de las claves nuevas se ofrece tal cual,
                    para que abrir y guardar un registro viejo no lo borre.
                    Así no hace falta migrar nada. */}
                {h.metodoEntrega && !METODOS_ENTREGA.includes(h.metodoEntrega as (typeof METODOS_ENTREGA)[number]) && (
                  <option value={h.metodoEntrega}>{h.metodoEntrega}</option>
                )}
              </select>
              </div>
              <div className="form-group">
                <SwitchRow label={t("traslados.confirmacionRecibida")} value={h.confirmacion} onChange={h.setConfirmacion} />
              </div>
              {h.confirmacion && (
                <div className="form-group">
                  <label className="form-label">{t("traslados.fechaConfirmacion")}</label>
                  <input type="date" className="form-input" min={h.fechaEntrega || undefined} value={h.fechaConfirmacion} onChange={(e) => h.setFechaConfirmacion(e.target.value)} />
                </div>
              )}
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={h.observaciones} onChange={(e) => h.setObservaciones(e.target.value)} />
              </div>
            </div>
          </Seccion>

          {h.aviso && <div className="form-warning" style={{ marginBottom: 10 }}>{h.aviso}</div>}
          {h.error && <div className="field-error">{h.error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={h.pedirCerrar}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={h.guardar} disabled={h.saving}>
              {h.saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {h.confirmClose && (
        <ConfirmDialog
          title={t("common.descartarCambiosTitulo")}
          message={t("common.descartarCambiosMensaje")}
          confirmLabel={t("common.descartarCambiosBtn")}
          danger
          onConfirm={h.onCerrarDeVerdad}
          onCancel={() => h.setConfirmClose(false)}
        />
      )}

      {h.confirmTrasladado !== null && (
        <ConfirmDialog
          title={t("traslados.trasladadoTitulo")}
          message={t("traslados.trasladadoMensaje", { nombre: h.miembro?.nombre ?? "" })}
          confirmLabel={t("traslados.cambiarATrasladado")}
          onConfirm={h.marcarTrasladado}
          onCancel={() => { h.setConfirmTrasladado(null); h.onCerrarDeVerdad(); }}
        />
      )}
    </div>
  );
}

const NO_HACE_NADA = () => {};
