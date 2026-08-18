import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { IOSPickerInput } from "./ios/IOSPickerField";
import { textoCorto } from "../movil";
import { fmtMoney, catNombre, metodoNombre, METODOS_PAGO, getCategoriasGasto, getCategoriasIngreso, currentMonth, mesesPendientesRecurrente } from "../db";
import { IconArrowDown, IconArrowUp, IconCheck, IconClose, IconRepeat, IconSparkles, IconWarn } from "../icons";
import { currencyLabel } from "../currencies";
import { openPath } from "@tauri-apps/plugin-opener";
import { rutaComprobante } from "../services/comprobantes";
import { iaHabilitada } from "../ia";
import { multiplicar, CERO } from "../dinero";
import { fileNameFromPath, parseMonto, useNuevoMovimiento, type Props } from "./nuevoMovimiento";
import NuevoMovimientoIOS from "./NuevoMovimientoIOS";

export type { ModalTab, ModalMode } from "./nuevoMovimiento";

/**
 * "Nuevo ingreso / gasto / miembro" en Mac y iPad: el modal centrado de
 * siempre, sin un cambio.
 *
 * En el iPhone la misma información se enseña como hoja de iOS
 * (`NuevoMovimientoIOS`). Las dos ramas leen el MISMO estado, el de
 * `useNuevoMovimiento`, así que no hay dos formularios que mantener: hay uno
 * con dos pieles. La pestaña de miembro se queda con el modal en las tres
 * plataformas — es otro formulario y no entró en el rediseño.
 */
export default function NewRecordModal(props: Props) {
  const { church, onClose } = props;
  const { t, i18n } = useTranslation();
  const h = useNuevoMovimiento(props);
  const {
    tab,
    setTab,
    saving,
    error,
    categoria,
    setCategoria,
    subcategoria,
    setSubcategoria,
    concepto,
    setConcepto,
    fecha,
    setFecha,
    hora,
    setHora,
    monto,
    setMonto,
    metodo,
    setMetodo,
    detalle,
    setDetalle,
    aportanteQuery,
    setAportanteQuery,
    setAportanteId,
    beneficiario,
    setBeneficiario,
    beneficiarioRfc,
    setBeneficiarioRfc,
    constancia,
    setConstancia,
    marcarPendiente,
    setMarcarPendiente,
    esRecurrente,
    setEsRecurrente,
    recDesde,
    setRecDesde,
    comprobantePath,
    setComprobantePath,
    dropActivo,
    iaTexto,
    setIaTexto,
    iaCargando,
    mNombre,
    setMNombre,
    mEmail,
    setMEmail,
    mTelefono,
    setMTelefono,
    mRfc,
    setMRfc,
    mNotas,
    setMNotas,
    mEstado,
    setMEstado,
    isEdit,
    pestanaBloqueada,
    hoy,
    sugerencias,
    descripcionOculta,
    descripcionOpcional,
    placeholderMonto,
    titulo,
    subtitulo,
    botonGuardar,
    comprobanteEsImagen,
    interpretarTexto,
    interpretarComprobante,
    pickComprobante,
    agregarALosMeses,
    guardar,
  } = h;

  if (esIPhone() && h.tab !== "miembro") return <NuevoMovimientoIOS {...props} h={h} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{titulo}</div>
            <div className="modal-sub">{subtitulo}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          {/* El selector Ingreso/Gasto pertenece a los movimientos: en el
              formulario de miembro no pinta nada (y saltar de "Nuevo miembro"
              a un movimiento a mitad de captura solo confundía). */}
          {!isEdit && !pestanaBloqueada && tab !== "miembro" && (
            <div className="tabs-segmented">
              <button type="button" className={`seg${tab === "ingreso" ? " active" : ""}`} aria-pressed={tab === "ingreso"} onClick={() => setTab("ingreso")}>
                <IconArrowUp size={14} strokeWidth={2.2} /> {t("recordModal.segIngreso")}
              </button>
              <button type="button" className={`seg${tab === "gasto" ? " active" : ""}`} aria-pressed={tab === "gasto"} onClick={() => setTab("gasto")}>
                <IconArrowDown size={14} strokeWidth={2.2} /> {t("recordModal.segGasto")}
              </button>
            </div>
          )}

          {tab !== "miembro" && iaHabilitada && !isEdit && (
            <div className="ia-capture">
              <div className="ia-capture-row">
                <span className="ia-capture-spark" aria-hidden><IconSparkles size={16} /></span>
                <input
                  className="form-input"
                  value={iaTexto}
                  onChange={(e) => setIaTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); interpretarTexto(); } }}
                  placeholder={t(tab === "gasto" ? "recordModal.ia.placeholderGasto" : "recordModal.ia.placeholder")}
                  disabled={iaCargando}
                />
                <button
                  type="button"
                  className="btn ia-primary"
                  onClick={interpretarTexto}
                  disabled={iaCargando || !iaTexto.trim()}
                >
                  <IconSparkles size={14} /> {iaCargando ? t("recordModal.ia.interpretando") : t("recordModal.ia.interpretar")}
                </button>
              </div>
              <div className="ia-capture-hint">{t("recordModal.ia.hint")}</div>
            </div>
          )}

          {tab !== "miembro" && (
            <>
              <div className="form-group full">
                <label className="form-label">{tab === "ingreso" ? t("recordModal.tipoIngreso") : t("recordModal.categoria")}</label>
                {tab === "ingreso" ? (
                  <div className="type-grid">
                    {getCategoriasIngreso().map((c) => (
                      <span
                        key={c.id}
                        className={`tag ${c.tagClass} cat-pill${categoria === c.id ? " is-selected" : ""}`}
                        onClick={() => setCategoria(c.id)}
                      >
                        {catNombre(c.id)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="category-grid">
                    {getCategoriasGasto().map((c) => (
                      <span
                        key={c.id}
                        className={`tag ${c.tagClass} cat-pill${categoria === c.id ? " is-selected" : ""}`}
                        onClick={() => setCategoria(c.id)}
                      >
                        {catNombre(c.id)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {tab === "ingreso" && categoria === "otros" && (
                <div className="form-group full">
                  <label className="form-label">{t("recordModal.subcategoria")} <span className="opt">{t("recordModal.subcategoriaEj")}</span></label>
                  <input className="form-input" value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} placeholder={t("recordModal.subcategoriaPlaceholder")} />
                </div>
              )}

              {!descripcionOculta && (
                <div className="form-group full enter">
                  <label className="form-label">
                    {t("recordModal.concepto")}
                    {descripcionOpcional && <> <span className="opt">{t("common.opcional")}</span></>}
                  </label>
                  <input
                    className="form-input"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder={
                      descripcionOpcional
                        ? t("recordModal.conceptoPlaceholderDonacion")
                        : tab === "ingreso"
                          ? t("recordModal.conceptoPlaceholderIngreso")
                          : t("recordModal.conceptoPlaceholderGasto")
                    }
                  />
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("recordModal.fecha")}</label>
                  <input className="form-input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("recordModal.hora")} <span className="opt">{t("common.opcional")}</span></label>
                  <input className="form-input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("recordModal.monto")}</label>
                  <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={placeholderMonto} inputMode="decimal" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("recordModal.moneda")}</label>
                  {/* Una sola opción y deshabilitado: no despliega nada, pero
                      WebKit le pinta igual el doble chevron. */}
                  {esIPhone() ? (
                    <IOSPickerInput
                      ariaLabel={t("iglesia.moneda")}
                      options={[{ value: church.moneda, label: currencyLabel(church.moneda, i18n.language) }]}
                      value={church.moneda}
                      disabled
                      onSelect={() => {}}
                    />
                  ) : (
                    <select className="form-select" value={church.moneda} disabled>
                      <option value={church.moneda}>{currencyLabel(church.moneda, i18n.language)}</option>
                    </select>
                  )}
                </div>
              </div>

              {(tab === "gasto" || tab === "ingreso") && (
                // Una sola línea (antes traía además el texto explicativo
                // debajo, en dos líneas): la explicación completa sigue
                // disponible al pasar el mouse, en el `title` de la tarjeta.
                <div
                  className="form-subcard"
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", marginTop: 6,
                    background: esRecurrente ? "var(--surface-2)" : "transparent",
                  }}
                  title={t("recurrente.hintForm")}
                >
                  <span style={{ color: "var(--text-2)", flexShrink: 0 }}><IconRepeat size={16} strokeWidth={2} /></span>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13 }}>
                    {t("recurrente.pregunta", { tipo: tab === "ingreso" ? t("tx.ingreso").toLowerCase() : t("tx.gasto").toLowerCase() })}
                  </div>
                  {isEdit ? (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ flexShrink: 0 }}
                      onClick={agregarALosMeses}
                      disabled={saving}
                    >
                      {saving ? t("common.guardando") : t("recurrente.agregarMeses")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={esRecurrente}
                      className={`switch${esRecurrente ? " on" : ""}`}
                      title={esRecurrente ? t("recurrente.marcado") : t("recurrente.siRecurrente")}
                      onClick={() => setEsRecurrente(!esRecurrente)}
                    />
                  )}
                </div>
              )}

              {(tab === "gasto" || tab === "ingreso") && esRecurrente && !isEdit && (() => {
                // Vista previa honesta de lo que va a pasar al guardar: qué
                // meses del histórico se llenan (desde el mes elegido hasta el
                // pasado) y por cuánto. El mes en curso se registra al cierre.
                const desdeEf = recDesde || fecha.slice(0, 7);
                const { meses } = mesesPendientesRecurrente(desdeEf, null, currentMonth());
                const montoNum = parseMonto(monto);
                return (
                  <div className="form-subcard" style={{ marginTop: 6 }}>
                    <div className="form-group" style={{ marginBottom: 8, maxWidth: 220 }}>
                      <label className="form-label">{t("recurrente.desdeLabel")}</label>
                      <input
                        className="form-input"
                        type="month"
                        value={desdeEf}
                        max={fecha.slice(0, 7)}
                        onChange={(e) => setRecDesde(e.target.value)}
                      />
                    </div>
                    <div className="form-hint">
                      {meses.length > 0
                        ? t("recurrente.previewMeses", {
                            count: meses.length,
                            rango: meses.length === 1 ? meses[0] : `${meses[0]} → ${meses[meses.length - 1]}`,
                            monto: fmtMoney(montoNum ?? CERO),
                            total: fmtMoney(multiplicar(montoNum ?? CERO, meses.length)),
                          })
                        : t("recurrente.previewSinMeses")}
                    </div>
                  </div>
                );
              })()}

              <div className="form-group full">
                <label className="form-label">{t("recordModal.metodoPago")}</label>
                <div className="method-group">
                  {METODOS_PAGO.map((mp) => (
                    <div
                      key={mp.id}
                      className={`method-choice${metodo === mp.id ? " is-selected" : ""}`}
                      onClick={() => setMetodo(mp.id)}
                    >
                      <span className="m-dot" style={{ background: mp.color }} />
                      {metodoNombre(mp.id)}
                    </div>
                  ))}
                </div>
              </div>

              {tab === "ingreso" ? (
                <>
                  <div className="form-group full">
                    <label className="form-label">
                      {t("recordModal.aportante")} <span className="opt">{t("recordModal.aportanteHint")}</span>
                    </label>
                    <div className="search-combo">
                      <input
                        className="form-input"
                        value={aportanteQuery}
                        onChange={(e) => { setAportanteQuery(e.target.value); setAportanteId(null); }}
                        placeholder={textoCorto(t("common.buscarMiembroCorto"), t("recordModal.buscarMiembro"))}
                      />
                      {sugerencias.length > 0 && (
                        <div className="search-suggest">
                          {sugerencias.map((m) => (
                            <div
                              key={m.id}
                              className="s-item"
                              onClick={() => { setAportanteId(m.id); setAportanteQuery(m.nombre); }}
                            >
                              <div>
                                <div className="s-name">{m.nombre}</div>
                                <div className="s-sub">{m.rfc || m.email || t("recordModal.sinRfcRegistrado")}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="check-row">
                    <input
                      type="checkbox"
                      id="chk-constancia"
                      checked={constancia}
                      onChange={(e) => setConstancia(e.target.checked)}
                    />
                    <label htmlFor="chk-constancia">
                      {t("recordModal.constanciaLabel")}
                    </label>
                  </div>
                </>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">{t("recordModal.beneficiario")}</label>
                    <input className="form-input" value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder={t("recordModal.beneficiarioPlaceholder")} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t("recordModal.rfc")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={beneficiarioRfc} onChange={(e) => setBeneficiarioRfc(e.target.value)} placeholder={t("recordModal.rfcBeneficiarioPlaceholder")} />
                  </div>
                </div>
              )}

              <div className="form-group full">
                <label className="form-label">
                  {t("recordModal.comprobante")} <span className="opt">{tab === "gasto" ? t("recordModal.recomendado") : t("common.opcional")}</span>
                </label>
                {comprobantePath ? (
                  <div
                    className="form-subcard"
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--pos)" }}>
                      <IconCheck size={14} />
                    </span>
                    <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fileNameFromPath(comprobantePath)}
                    </span>
                    {iaHabilitada && comprobanteEsImagen && !isEdit && (
                      <button
                        type="button"
                        className="btn ia sm"
                        onClick={interpretarComprobante}
                        disabled={iaCargando}
                        title={t("recordModal.ia.leerHint")}
                      >
                        <IconSparkles size={12} /> {iaCargando ? t("recordModal.ia.leyendo") : t("recordModal.ia.leerComprobante")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={async () => { if (comprobantePath) await openPath(await rutaComprobante(comprobantePath)); }}
                    >
                      {t("common.ver")}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                      {t("common.quitar")}
                    </button>
                  </div>
                ) : (
                  <button type="button" className={`file-drop${dropActivo ? " activo" : ""}`} onClick={pickComprobante}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    <div>{dropActivo ? t("recordModal.soltarAqui") : t("recordModal.clicElegir")}</div>
                  </button>
                )}
                {tab === "gasto" && !comprobantePath && (
                  <div className="form-warning">
                    <IconWarn size={13} /> {t("recordModal.comprobanteWarn")}
                  </div>
                )}
              </div>

              <div className="form-group full" style={{ marginTop: 6 }}>
                <label className="form-label">{t("recordModal.notas")} <span className="opt">{t("common.opcional")}</span></label>
                <textarea
                  className="form-textarea"
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder={t("recordModal.notasPlaceholder")}
                />
              </div>

              <div className="check-row" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  id="chk-pendiente"
                  checked={marcarPendiente}
                  onChange={(e) => setMarcarPendiente(e.target.checked)}
                />
                <label htmlFor="chk-pendiente">
                  {t("recordModal.marcarPendienteLabel")}
                </label>
              </div>
            </>
          )}

          {tab === "miembro" && (
            <>
              {!isEdit && (
                <div className="form-group full">
                  <label className="form-label">{t("recordModal.tipoPersona")}</label>
                  <div className="method-group">
                    <div
                      className={`method-choice${mEstado === "activo" ? " is-selected" : ""}`}
                      onClick={() => setMEstado("activo")}
                    >
                      {t("recordModal.tipoMiembro")}
                    </div>
                    <div
                      className={`method-choice${mEstado === "visitante" ? " is-selected" : ""}`}
                      onClick={() => setMEstado("visitante")}
                    >
                      {t("recordModal.tipoVisitante")}
                    </div>
                  </div>
                  <div className="form-hint" style={{ marginTop: 6 }}>{t("recordModal.tipoPersonaHint")}</div>
                </div>
              )}
              <div className="form-group full">
                <label className="form-label">{t("recordModal.nombreFamilia")}</label>
                <input className="form-input" value={mNombre} onChange={(e) => setMNombre(e.target.value)} placeholder={t("recordModal.nombreFamiliaPlaceholder")} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("tesorero.correo")} <span className="opt">{t("common.opcional")}</span></label>
                  <input className="form-input" type="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder={t("tesorero.correoPlaceholder")} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("tesorero.telefono")} <span className="opt">{t("common.opcional")}</span></label>
                  <input className="form-input" value={mTelefono} onChange={(e) => setMTelefono(e.target.value)} placeholder={t("tesorero.telefonoPlaceholder")} />
                </div>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("recordModal.rfc")} <span className="opt">{t("recordModal.rfcMiembroHint")}</span></label>
                <input className="form-input" value={mRfc} onChange={(e) => setMRfc(e.target.value)} placeholder={t("recordModal.rfcMiembroPlaceholder")} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("recordModal.notas")} <span className="opt">{t("common.opcional")}</span></label>
                <textarea className="form-textarea" value={mNotas} onChange={(e) => setMNotas(e.target.value)} placeholder={t("usuarios.notasPlaceholder")} />
              </div>
            </>
          )}

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {/* Antes esta frase ocupaba una franja fija en el pie de cada
              modal para algo que se lee una sola vez. Ahora es un signo de
              interrogación con el texto en el tooltip. */}
          <span className="modal-hint-icon" title={t("common.camposOpcionales")} aria-label={t("common.camposOpcionales")}>?</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>{t("common.cancelar")}</button>
            {!isEdit && (
              <button className="btn secondary" onClick={() => guardar(false)} disabled={saving}>
                {t("recordModal.guardarYAgregarOtro")}
              </button>
            )}
            <button className="btn primary" onClick={() => guardar(true)} disabled={saving}>
              {botonGuardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
