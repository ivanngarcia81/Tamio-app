import { useTranslation } from "react-i18next";
import { esMovil } from "../movil";
import { IOSPickerInput } from "./ios/IOSPickerField";
import { ChipGroup, Seccion, SwitchRow } from "./FichaMiembroModal";
import { IconClose, IconPlus, IconPrinter, IconSparkles } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { iaHabilitada } from "../ia";
import { useActa, type PropsActa } from "./acta";
import NuevaActaIOS from "./NuevaActaIOS";

export const TIPOS_ACTA = [
  "administrativa", "lideres", "asamblea", "pastoral", "eleccion", "nombramiento",
  "recepcion", "compraventa", "presupuesto", "disciplina", "otra",
] as const;

export const ESTADOS_ACTA = ["borrador", "pendiente", "aprobada", "corregida", "archivada"] as const;

/** Constante de módulo, no una lambda nueva por render: `useEscapeClose` lleva
 *  la función en las dependencias de su efecto. */
const NO_HACE_NADA = () => {};

/* Reexportados desde `acta.ts`: `printActa` los importa desde aquí desde antes
   de que el estado se mudara, y no hay razón para que ese import cambie. */
export { parseMociones, parseAcuerdos } from "./acta";

export default function ActaModal(props: PropsActa) {
  const { acta, onClose, onImprimir } = props;
  const { t } = useTranslation();
  const enHoja = esMovil();
  useEscapeClose(enHoja ? NO_HACE_NADA : onClose);
  const h = useActa(props);
  const {
    saving, error, muestraAprobacion,
    iaAbierta, setIaAbierta, iaPuntos, setIaPuntos, iaGenerando, iaError, setIaError, generarActaIA,
    tipo, setTipo, titulo, setTitulo, fecha, setFecha,
    horaInicio, setHoraInicio, horaCierre, setHoraCierre, lugar, setLugar,
    preside, setPreside, secretario, setSecretario,
    presentes, setPresentes, ausentes, setAusentes, invitados, setInvitados, quorum, setQuorum,
    agenda, setAgenda, resumen, setResumen,
    mociones, setMociones, setMocion, acuerdos, setAcuerdos, setAcuerdo,
    estado, setEstado, confidencial, setConfidencial, fechaAprobacion, setFechaAprobacion,
    guardar,
  } = h;

  // En todo lo táctil el acta entera se va a su propia hoja: es el formulario más
  // largo de la app y en una columna de cajas de 46 px no cabe ni la primera
  // sección.
  if (enHoja) {
    return <NuevaActaIOS churchId={props.church.id} acta={acta} onClose={onClose} onImprimir={onImprimir} h={h} tipos={TIPOS_ACTA} estados={ESTADOS_ACTA} />;
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{acta ? `${acta.folio} — ${t("actas.editarActa")}` : t("actas.nuevaActa")}</div>
            <div className="modal-sub">{t("secretaria.actas.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("actas.secBasica")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("actas.tipoReunion")}</label>
                {enHoja ? (
                  <IOSPickerInput ariaLabel={t("actas.tipoActa")} options={TIPOS_ACTA.map((k) => ({ value: k, label: t(`actas.tipo.${k}`) }))} value={tipo} onSelect={setTipo} />
                ) : (
                  <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_ACTA.map((ti) => (
                  <option key={ti} value={ti}>{t(`actas.tipo.${ti}`)}</option>
                  ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.tituloActa")}</label>
                <input className="form-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t("actas.tituloPlaceholder")} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tx.colFecha")}</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.lugar")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={lugar} onChange={(e) => setLugar(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.horaInicio")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="time" className="form-input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.horaCierre")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="time" className="form-input" value={horaCierre} onChange={(e) => setHoraCierre(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.preside")}</label>
                <input className="form-input" value={preside} onChange={(e) => setPreside(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.secretarioRedacta")}</label>
                <input className="form-input" value={secretario} onChange={(e) => setSecretario(e.target.value)} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("actas.quorum")} value={quorum} onChange={setQuorum} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("actas.confidencial")} value={confidencial} onChange={setConfidencial} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("actas.secAsistencia")}>
            <div className="form-group full">
              <label className="form-label">{t("actas.presentes")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={presentes} onChange={setPresentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("actas.ausentes")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={ausentes} onChange={setAusentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("actas.invitados")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={invitados} onChange={setInvitados} placeholder={t("actas.agregarNombre")} />
            </div>
          </Seccion>

          <Seccion titulo={t("actas.secContenido")}>
            <div className="form-group full">
              <label className="form-label">{t("actas.agenda")}</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder={t("actas.agendaPlaceholder")}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
              />
            </div>
            <div className="form-group full">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="form-label">{t("actas.resumen")}</label>
                {iaHabilitada && (
                  <button
                    type="button"
                    className="btn ia"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => { setIaError(null); setIaAbierta(true); }}
                  >
                    <IconSparkles size={13} /> {t("actas.ia.boton")}
                  </button>
                )}
              </div>
              <textarea
                className="form-textarea"
                rows={5}
                placeholder={t("actas.resumenPlaceholder")}
                value={resumen}
                onChange={(e) => setResumen(e.target.value)}
              />
            </div>

            {iaAbierta && (
              <div className="form-group full form-subcard">
                <div className="form-label modal-title-ia" style={{ marginBottom: 6 }}><IconSparkles size={14} /> {t("actas.ia.titulo")}</div>
                <div className="form-hint" style={{ marginBottom: 8 }}>{t("actas.ia.sub")}</div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  autoFocus
                  placeholder={t("actas.ia.placeholder")}
                  value={iaPuntos}
                  onChange={(e) => setIaPuntos(e.target.value)}
                  disabled={iaGenerando}
                />
                {resumen.trim().length > 0 && (
                  <div className="form-hint" style={{ marginTop: 6 }}>{t("actas.ia.reemplazar")}</div>
                )}
                {iaError && <div className="field-error" style={{ marginTop: 6 }}>{iaError}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn secondary" onClick={() => setIaAbierta(false)} disabled={iaGenerando}>
                    {t("cartas.ia.cancelar")}
                  </button>
                  <button type="button" className="btn ia-primary" onClick={generarActaIA} disabled={iaGenerando || !iaPuntos.trim()}>
                    <IconSparkles size={14} /> {iaGenerando ? t("cartas.ia.generando") : t("cartas.ia.generar")}
                  </button>
                </div>
              </div>
            )}
          </Seccion>

          <Seccion titulo={t("actas.secMociones")}>
            {mociones.map((m, i) => (
              <div key={i} className="form-group full form-subcard">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder={t("actas.mocionTexto")}
                    value={m.texto}
                    onChange={(e) => setMocion(i, { texto: e.target.value })}
                  />
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setMociones((ms) => ms.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 10, marginBottom: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <input className="form-input" placeholder={t("actas.mocionPresenta")} value={m.presenta} onChange={(e) => setMocion(i, { presenta: e.target.value })} />
                  <input className="form-input" placeholder={t("actas.mocionSecunda")} value={m.secunda} onChange={(e) => setMocion(i, { secunda: e.target.value })} />
                  <input className="form-input" placeholder={t("actas.mocionResultado")} value={m.resultado} onChange={(e) => setMocion(i, { resultado: e.target.value })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() => setMociones((ms) => [...ms, { texto: "", presenta: "", secunda: "", resultado: "" }])}
            >
              <IconPlus size={13} /> {t("actas.agregarMocion")}
            </button>
          </Seccion>

          <Seccion titulo={t("actas.secAcuerdos")}>
            {acuerdos.map((a, i) => (
              <div key={i} className="form-group full form-subcard">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder={t("actas.acuerdoTexto")}
                    value={a.texto}
                    onChange={(e) => setAcuerdo(i, { texto: e.target.value })}
                  />
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setAcuerdos((as) => as.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 10, marginBottom: 0 }}>
                  <input className="form-input" placeholder={t("actas.acuerdoResponsable")} value={a.responsable} onChange={(e) => setAcuerdo(i, { responsable: e.target.value })} />
                  <div>
                    <input type="date" className="form-input" title={t("actas.acuerdoFechaLimite")} value={a.fecha_limite ?? ""} onChange={(e) => setAcuerdo(i, { fecha_limite: e.target.value || null })} />
                    <span className="form-label opt" style={{ fontWeight: 500, color: "var(--text-3)" }}>{t("actas.acuerdoFechaLimite")}</span>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() => setAcuerdos((as) => [...as, { texto: "", responsable: "", fecha_limite: null }])}
            >
              <IconPlus size={13} /> {t("actas.agregarAcuerdo")}
            </button>
          </Seccion>

          <Seccion titulo={t("actas.secAprobacion")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("actas.estadoActa")}</label>
                {enHoja ? (
                  <IOSPickerInput ariaLabel={t("actas.estadoActa")} options={ESTADOS_ACTA.map((k) => ({ value: k, label: t(`actas.estado.${k}`) }))} value={estado} onSelect={setEstado} />
                ) : (
                  <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_ACTA.map((es) => (
                  <option key={es} value={es}>{t(`actas.estado.${es}`)}</option>
                  ))}
                  </select>
                )}
              </div>
              {muestraAprobacion && (
                <div className="form-group">
                  <label className="form-label">{t("actas.fechaAprobacion")}</label>
                  <input type="date" className="form-input" value={fechaAprobacion} onChange={(e) => setFechaAprobacion(e.target.value)} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("actas.notaFirmas")}</div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          {acta && onImprimir ? (
            <button className="btn secondary" onClick={onImprimir}>
              <IconPrinter size={13} /> {t("common.imprimir")}
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : acta ? t("common.guardarCambios") : t("actas.guardarActa")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
