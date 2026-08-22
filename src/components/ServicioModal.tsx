import { memo } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone, esMovil } from "../movil";
import NuevoServicioIOS from "./NuevoServicioIOS";
import { IOSPickerInput } from "./ios/IOSPickerField";
import { textoCorto } from "../movil";
import { ChipGroup, Seccion } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconClose, IconPlus, IconSearch } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import {
  RAZONES_AUSENCIA, VISITANTE_VACIO, numeroSano, useServicio,
  type PropsServicio, type RosterState,
} from "./servicio";

export const TIPOS_SERVICIO = [
  "dominical", "oracion", "estudio", "jovenes", "damas", "caballeros",
  "vigilia", "evangelistico", "especial", "otro",
] as const;

/** Constante de módulo, no una lambda nueva por render: `useEscapeClose` lleva
 *  la función en las dependencias de su efecto. */
const NO_HACE_NADA = () => {};

const RosterRow = memo(function RosterRow({ id, estado, conMotivo, onToggle, onRazon, onRazonOtra, onSeguimiento }: {
  id: number;
  estado: RosterState;
  /** Mostrar el desplegable de motivo y la casilla de seguimiento. Durante la
   *  captura van ocultos: todos arrancan ausentes y quince filas de controles
   *  estorban justo cuando la tarea es marcar presentes rápido. */
  conMotivo: boolean;
  onToggle: (id: number) => void;
  onRazon: (id: number, v: string) => void;
  onRazonOtra: (id: number, v: string) => void;
  onSeguimiento: (id: number, v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="roster-row">
      <input
        type="checkbox"
        id={`roster-${id}`}
        checked={estado.presente}
        aria-label={t("servicios.rosterMarcarAria", { nombre: estado.nombre })}
        onChange={() => onToggle(id)}
      />
      <label className="roster-name" htmlFor={`roster-${id}`} title={estado.nombre}>
        {estado.nombre}
      </label>
      {estado.estadoMiembro && estado.estadoMiembro !== "activo" && (
        <span className="tag donacion" style={{ flex: "none" }}>
          {t(`membresia.estado.${estado.estadoMiembro}`)}
        </span>
      )}
      {!estado.presente && conMotivo && (
        <span className="roster-controls">
          {esIPhone() ? (
            <IOSPickerInput
              ariaLabel={t("servicios.razonAusencia")}
              options={[{ value: "", label: t("servicios.sinRazon") }, ...RAZONES_AUSENCIA.map((r) => ({ value: r, label: t(`servicios.razon.${r}`) }))]}
              value={estado.razon}
              placeholder={t("servicios.sinRazon")}
              onSelect={(v) => onRazon(id, v)}
            />
          ) : (
            <select
              className="form-input"
              aria-label={t("servicios.razonAusencia")}
              value={estado.razon}
              onChange={(e) => onRazon(id, e.target.value)}
            >
              <option value="">{t("servicios.sinRazon")}</option>
              {RAZONES_AUSENCIA.map((r) => (
                <option key={r} value={r}>{t(`servicios.razon.${r}`)}</option>
              ))}
            </select>
          )}
          {estado.razon === "otra" && (
            <input
              className="form-input"
              style={{ width: 120 }}
              placeholder={t("servicios.razonOtraPlaceholder")}
              value={estado.razonOtra}
              onChange={(e) => onRazonOtra(id, e.target.value)}
            />
          )}
          <label className="roster-followup">
            <input
              type="checkbox"
              checked={estado.seguimiento}
              onChange={(e) => onSeguimiento(id, e.target.checked)}
            />
            {t("servicios.seguimiento")}
          </label>
        </span>
      )}
    </div>
  );
});

export default function ServicioModal(props: PropsServicio) {
  const { servicio, onClose } = props;
  const { t } = useTranslation();
  const h = useServicio(props);
  const {
    saving, error, confirmClose, setConfirmClose,
    confirmDesmarcar, setConfirmDesmarcar, confirmVacio, setConfirmVacio,
    anotarAusencias, setAnotarAusencias,
    fecha, setFecha, tipo, setTipo, dirige, setDirige, predica, setPredica,
    tituloMensaje, setTituloMensaje, textoBiblico, setTextoBiblico, resumenMensaje, setResumenMensaje,
    participaciones, setParticipaciones, temaEscuela, setTemaEscuela, maestroEscuela, setMaestroEscuela,
    roster, rosterLoading, busqueda, setBusqueda,
    visitantes, setVisitantes, setVisitante, agregarAlPadron,
    ninos, setNinos, jovenes, setJovenes, adultos, setAdultos, totalConteo,
    eventos, setEventos,
    visibles, presentesVisibles, ausentesVisibles, totalPresentes,
    toggle, setRazon, setRazonOtra, setSeguimiento, marcarVisibles, cargarActivos,
    pedirCerrar, guardar,
  } = h;

  const enHoja = esMovil();
  useEscapeClose(enHoja ? NO_HACE_NADA : pedirCerrar);

  // En todo lo táctil el culto se va a su propia hoja: el padrón embebido hace
  // el formulario interminable con cuarenta miembros, y no digamos con
  // trescientos.
  if (enHoja) return <NuevoServicioIOS servicio={servicio} h={h} tipos={TIPOS_SERVICIO} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) pedirCerrar(); }}>
      <div className="modal-card" style={{ width: 760 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{servicio ? t("servicios.editarServicio") : t("servicios.nuevoServicio")}</div>
            <div className="modal-sub">{t("secretaria.servicios.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={pedirCerrar}><IconClose /></button>
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
                {esIPhone() ? (
                  <IOSPickerInput
                    ariaLabel={t("servicios.colServicio")}
                    options={TIPOS_SERVICIO.map((ti) => ({ value: ti, label: t(`servicios.tipo.${ti}`) }))}
                    value={tipo}
                    onSelect={setTipo}
                  />
                ) : (
                  <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_SERVICIO.map((ti) => (
                      <option key={ti} value={ti}>{t(`servicios.tipo.${ti}`)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.dirige")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={dirige} onChange={(e) => setDirige(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.predica")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={predica} onChange={(e) => setPredica(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.participaciones")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={participaciones} onChange={setParticipaciones} placeholder={t("servicios.agregarParticipacion")} />
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secAsistencia")}>
            {rosterLoading ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>{t("common.preparando")}</div>
            ) : roster.size === 0 && !servicio ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
                {t("servicios.sinMiembrosActivos")}
              </div>
            ) : (
              <>
                <div className="tx-head" style={{ marginBottom: 10 }}>
                  <div className="search-input-wrap" style={{ flex: 1, maxWidth: 300 }}>
                    <IconSearch size={14} strokeWidth={2} />
                    <input
                      className="form-input"
                      aria-label={t("servicios.buscarMiembro")}
                      placeholder={textoCorto(t("common.buscarMiembroCorto"), t("servicios.buscarMiembro"))}
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn secondary"
                      title={t("servicios.marcarTodosTooltip")}
                      disabled={ausentesVisibles.length === 0}
                      onClick={() => marcarVisibles(true)}
                    >
                      {t("servicios.marcarTodos")}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      title={t("servicios.desmarcarTodosTooltip")}
                      disabled={presentesVisibles.length === 0}
                      onClick={() => setConfirmDesmarcar(true)}
                    >
                      {t("servicios.desmarcarTodos")}
                    </button>
                  </div>
                </div>

                <div className="roster-counters" style={{ marginBottom: 8 }}>
                  <span>{t("servicios.totalRoster")}: <b>{roster.size}</b></span>
                  <span>{t("servicios.presentes")}: <b>{totalPresentes}</b></span>
                  <span>{t("servicios.ausentesLabel")}: <b>{roster.size - totalPresentes}</b></span>
                </div>

                {roster.size === 0 && servicio ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13, padding: "4px 0 8px" }}>
                    {t("servicios.servicioSinRoster")}{" "}
                    <button type="button" className="btn secondary" onClick={cargarActivos} style={{ marginLeft: 8 }}>
                      {t("servicios.cargarActivos")}
                    </button>
                  </div>
                ) : visibles.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13, padding: "4px 0 8px" }}>
                    {t("servicios.rosterSinResultados")}
                  </div>
                ) : (
                  <div className="roster-box">
                    <div className="roster-section-head">
                      {t("servicios.presentes")} ({presentesVisibles.length})
                    </div>
                    {presentesVisibles.map(([id, e]) => (
                      <RosterRow key={id} id={id} estado={e} conMotivo={anotarAusencias} onToggle={toggle} onRazon={setRazon} onRazonOtra={setRazonOtra} onSeguimiento={setSeguimiento} />
                    ))}
                    {presentesVisibles.length === 0 && (
                      <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--text-3)" }}>{t("servicios.nadieMarcado")}</div>
                    )}
                    <div className="roster-section-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span>{t("servicios.ausentesLabel")} ({ausentesVisibles.length})</span>
                      {!anotarAusencias && ausentesVisibles.length > 0 && (
                        <button type="button" className="btn ghost sm" onClick={() => setAnotarAusencias(true)}>
                          {t("servicios.anotarMotivos")}
                        </button>
                      )}
                    </div>
                    {ausentesVisibles.map(([id, e]) => (
                      <RosterRow key={id} id={id} estado={e} conMotivo={anotarAusencias} onToggle={toggle} onRazon={setRazon} onRazonOtra={setRazonOtra} onSeguimiento={setSeguimiento} />
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginTop: 14 }}>
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
                <input className="form-input" value={totalConteo} disabled style={{ fontWeight: 700 }} />
              </div>
            </div>

            {/* El conteo de arriba y la lista de asistencia son dos registros
                distintos: el conteo alimenta la bitácora de cultos y la lista
                alimenta el informe por miembro. El rótulo lo dice siempre, y
                si se llena uno y no el otro se avisa en la dirección que sea:
                sin esto la app parece contradecirse (un culto "con 4
                asistentes" y un informe que no muestra a nadie, o al revés).
                Para la 1.1 quedó anotado unificar: total = lista + contadores
                (ver docs/ideas-futuras.md). */}
            <div className="form-hint" style={{ marginBottom: 12 }}>{t("servicios.conteoHint")}</div>
            {totalConteo > 0 && totalPresentes === 0 && (
              <div className="form-warning" style={{ marginBottom: 12 }}>
                {t("servicios.avisoConteoSinLista", { n: totalConteo })}
              </div>
            )}
            {totalPresentes > 0 && totalConteo === 0 && (
              <div className="form-warning" style={{ marginBottom: 12 }}>
                {t("servicios.avisoListaSinConteo", { count: totalPresentes })}
              </div>
            )}
          </Seccion>

          <Seccion titulo={t("servicios.visitantes")}>
            {visitantes.map((v, i) => (
              <div key={i} className="form-group full form-subcard">
                <div className="form-grid" style={{ marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("servicios.visitanteNombre")}</label>
                    <input className="form-input" value={v.nombre} onChange={(e) => setVisitante(i, { nombre: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("servicios.visitanteInvitadoPor")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.invitado_por ?? ""} onChange={(e) => setVisitante(i, { invitado_por: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("tesorero.telefono")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.telefono ?? ""} onChange={(e) => setVisitante(i, { telefono: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("tesorero.correo")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.correo ?? ""} onChange={(e) => setVisitante(i, { correo: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label className="roster-followup" style={{ fontSize: 12.5 }}>
                    <input type="checkbox" checked={v.primera_visita} onChange={(e) => setVisitante(i, { primera_visita: e.target.checked })} />
                    {t("servicios.visitantePrimeraVisita")}
                  </label>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder={t("servicios.visitanteNotas")}
                    value={v.notas ?? ""}
                    onChange={(e) => setVisitante(i, { notas: e.target.value })}
                  />
                  <button type="button" className="btn secondary sm" title={t("servicios.agregarAlPadronTooltip")} onClick={() => void agregarAlPadron(i)}>
                    <IconPlus size={12} /> {t("servicios.agregarAlPadron")}
                  </button>
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setVisitantes((vs) => vs.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setVisitantes((vs) => [...vs, { ...VISITANTE_VACIO }])}>
              <IconPlus size={13} /> {t("servicios.agregarVisitante")}
            </button>
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
            <button className="btn secondary" onClick={pedirCerrar}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={() => void guardar()} disabled={saving || rosterLoading}>
              {saving ? t("common.guardando") : servicio ? t("common.guardarCambios") : t("servicios.guardarServicio")}
            </button>
          </div>
        </div>
      </div>

      {confirmVacio && (
        <ConfirmDialog
          title={t("servicios.confirmarVacioTitulo")}
          message={t("servicios.confirmarVacioMensaje")}
          confirmLabel={t("servicios.confirmarVacioBoton")}
          onConfirm={() => { setConfirmVacio(false); void guardar(true); }}
          onCancel={() => setConfirmVacio(false)}
        />
      )}

      {confirmDesmarcar && (
        <ConfirmDialog
          title={t("servicios.desmarcarTitulo")}
          message={t("servicios.desmarcarMensaje", { count: presentesVisibles.length })}
          confirmLabel={t("servicios.desmarcarTodos")}
          danger
          onConfirm={() => { marcarVisibles(false); setConfirmDesmarcar(false); }}
          onCancel={() => setConfirmDesmarcar(false)}
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title={t("servicios.cambiosSinGuardarTitulo")}
          message={t("servicios.cambiosSinGuardarMensaje")}
          confirmLabel={t("servicios.descartarCambios")}
          danger
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>
  );
}
