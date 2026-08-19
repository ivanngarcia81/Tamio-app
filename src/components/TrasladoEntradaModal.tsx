/**
 * TrasladoEntradaModal.tsx — el traslado de entrada en Mac e iPad: el diálogo
 * centrado de siempre, con sus cuatro secciones y su rejilla de dos columnas.
 *
 * En iPhone no se pinta nada de aquí: la hoja de iOS (`NuevoTrasladoIOS`) se
 * lleva el formulario entero. Lo que comparten es `useTrasladoEntrada`, así
 * que las dos vistas escriben el MISMO registro con las MISMAS validaciones,
 * y el enredo de duplicados —la única pantalla que evita miembros repetidos—
 * existe una sola vez.
 */
import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { openPath } from "@tauri-apps/plugin-opener";
import { Seccion } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import DuplicadosTraslado from "./DuplicadosTraslado";
import NuevoTrasladoIOS from "./NuevoTrasladoIOS";
import { IconClose } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { ESTADOS_TE, useTrasladoEntrada, type PropsTrasladoEntrada } from "./trasladoEntrada";

export { ESTADOS_TE };

export default function TrasladoEntradaModal(props: PropsTrasladoEntrada) {
  const { t } = useTranslation();
  const { traslado } = props;
  const h = useTrasladoEntrada(props);
  const enHoja = esIPhone();
  /** La hoja registra su propio Escape. Un `() => {}` estable evita que este
   *  efecto se vuelva a suscribir en cada render. */
  useEscapeClose(enHoja ? NO_HACE_NADA : h.pedirCerrar);

  if (enHoja) return <NuevoTrasladoIOS traslado={traslado} h={h} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) h.pedirCerrar(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {traslado ? `${traslado.folio} — ${t("common.editar")}` : t("traslados.nuevoEntrada")}
            </div>
            <div className="modal-sub">{t("traslados.subEntrada")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={h.pedirCerrar}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("traslados.secPersona")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.visitanteNombre")}</label>
                <input className="form-input" value={h.nombre} onChange={(e) => h.setNombre(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaNacimiento")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="date" className="form-input" value={h.fechaNacimiento} onChange={(e) => h.setFechaNacimiento(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.telefono")}</label>
                <input className="form-input" value={h.telefono} onChange={(e) => h.setTelefono(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.correo")}</label>
                <input className="form-input" type="email" value={h.correo} onChange={(e) => h.setCorreo(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("traslados.direccionPersona")}</label>
                <input className="form-input" value={h.direccion} onChange={(e) => h.setDireccion(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProcedencia")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.iglesiaProcedencia")}</label>
                <input className="form-input" value={h.iglesiaProcedencia} onChange={(e) => h.setIglesiaProcedencia(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.pastorAnterior")}</label>
                <input className="form-input" value={h.pastorAnterior} onChange={(e) => h.setPastorAnterior(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("traslados.direccionAnterior")}</label>
                <input className="form-input" value={h.direccionAnterior} onChange={(e) => h.setDireccionAnterior(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secCartaRecibida")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaEmisionCarta")}</label>
                <input type="date" className="form-input" value={h.fechaEmisionCarta} onChange={(e) => h.setFechaEmisionCarta(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaRecepcion")}</label>
                <input type="date" className="form-input" min={h.fechaEmisionCarta || undefined} value={h.fechaRecepcion} onChange={(e) => h.setFechaRecepcion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.referenciaCarta")}</label>
                <input className="form-input" value={h.referenciaCarta} onChange={(e) => h.setReferenciaCarta(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.adjunto")}</label>
                {h.adjunto ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="tag donacion" title={h.adjunto.fecha}>{h.adjunto.nombre}</span>
                    <button type="button" className="btn secondary" onClick={() => openPath(h.adjunto!.path).catch(() => {})}>
                      {t("traslados.adjuntoAbrir")}
                    </button>
                    <button type="button" className="btn secondary" onClick={h.elegirAdjunto}>
                      {t("traslados.adjuntoReemplazar")}
                    </button>
                    <button type="button" className="btn secondary danger" onClick={() => h.setConfirmQuitarAdjunto(true)}>
                      {t("common.eliminar")}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn secondary" onClick={h.elegirAdjunto}>
                    {t("traslados.adjuntoElegir")}
                  </button>
                )}
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProceso")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("ficha.fechaCongregacion")}</label>
                <input type="date" className="form-input" value={h.fechaCongregacion} onChange={(e) => h.setFechaCongregacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaEntrevista")}</label>
                <input type="date" className="form-input" value={h.fechaEntrevista} onChange={(e) => h.setFechaEntrevista(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.entrevistador")}</label>
                <input className="form-input" value={h.entrevistador} onChange={(e) => h.setEntrevistador(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.decision")}</label>
                <input className="form-input" placeholder={t("traslados.decisionPlaceholder")} value={h.decision} onChange={(e) => h.setDecision(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.fechaAprobacion")}</label>
                <input type="date" className="form-input" value={h.fechaAprobacion} onChange={(e) => h.setFechaAprobacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={h.estado} onChange={(e) => h.setEstado(e.target.value)}>
                {ESTADOS_TE.map((es) => (
                <option key={es} value={es}>{t(`traslados.estadoTE.${es}`)}</option>
                ))}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={h.observaciones} onChange={(e) => h.setObservaciones(e.target.value)} />
              </div>
            </div>
            {h.estado === "aceptado" && h.memberId === null && (
              <button type="button" className="btn primary" onClick={h.crearMiembro} disabled={h.saving}>
                {t("traslados.crearMiembro")}
              </button>
            )}
            {h.memberId !== null && (
              <span className="tag activo">{t("traslados.miembroVinculado")}</span>
            )}
          </Seccion>

          {h.error && <div className="field-error">{h.error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={h.pedirCerrar}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={h.guardarYCerrar} disabled={h.saving}>
              {h.saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {h.confirmQuitarAdjunto && (
        <ConfirmDialog
          title={t("traslados.adjuntoQuitarTitulo")}
          message={t("traslados.adjuntoQuitarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={h.quitarAdjunto}
          onCancel={() => h.setConfirmQuitarAdjunto(false)}
        />
      )}

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

      {h.duplicados && h.duplicados.length > 0 && (
        <DuplicadosTraslado
          nombre={h.nombre.trim()}
          duplicados={h.duplicados}
          onVincular={h.vincularExistente}
          onCrearIgual={h.crearMiembroConfirmado}
          onCancel={() => h.setDuplicados(null)}
        />
      )}
    </div>
  );
}

const NO_HACE_NADA = () => {};
