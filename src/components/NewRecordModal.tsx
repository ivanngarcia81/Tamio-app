import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  METODOS_PAGO, catNombre, getCategoriasGasto, getCategoriasIngreso, metodoNombre,
  insertMovimientoRecurrente, insertMember, insertTx, listMembers, nowLocalIso, updateMember, updateTx,
  type Church, type Member, type Tx,
} from "../db";
import { IconArrowDown, IconArrowUp, IconCheck, IconClose, IconRepeat, IconWarn } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export type ModalTab = "ingreso" | "gasto" | "miembro";

export type ModalMode =
  | { kind: "create"; tab: ModalTab; bloquearPestana?: boolean }
  | { kind: "editTx"; tx: Tx }
  | { kind: "editMember"; member: Member };

interface Props {
  church: Church;
  mode: ModalMode;
  onClose: () => void;
  onSaved: () => void;
}

function parseMonto(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function NewRecordModal({ church, mode, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const isEdit = mode.kind !== "create";
  // Cuando se abre desde Membresía (Secretaría) la pestaña queda fija en
  // "miembro" y no se muestran Ingreso/Gasto (no aplican a su rol).
  const pestanaBloqueada = mode.kind === "create" && mode.bloquearPestana === true;
  const initialTab: ModalTab =
    mode.kind === "create" ? mode.tab : mode.kind === "editTx" ? mode.tx.tipo : "miembro";

  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- estado ingreso/gasto ---
  const now = nowLocalIso();
  const hoy = now.slice(0, 10);
  const [categoria, setCategoria] = useState<string>(initialTab === "gasto" ? "servicios" : "ofrenda");
  const [subcategoria, setSubcategoria] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(now.slice(0, 10));
  const [hora, setHora] = useState(now.slice(11, 16));
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [detalle, setDetalle] = useState("");
  const [aportanteQuery, setAportanteQuery] = useState("");
  const [aportanteId, setAportanteId] = useState<number | null>(null);
  const [beneficiario, setBeneficiario] = useState("");
  const [beneficiarioRfc, setBeneficiarioRfc] = useState("");
  const [constancia, setConstancia] = useState(false);
  const [marcarPendiente, setMarcarPendiente] = useState(false);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [comprobantePath, setComprobantePath] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // --- estado miembro ---
  const [mNombre, setMNombre] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mTelefono, setMTelefono] = useState("");
  const [mRfc, setMRfc] = useState("");
  const [mNotas, setMNotas] = useState("");

  useEffect(() => {
    listMembers(church.id).then(setMembers).catch(() => {});
  }, [church.id]);

  // Precargar el formulario cuando se abre en modo edición
  useEffect(() => {
    if (mode.kind === "editTx") {
      const tx = mode.tx;
      setCategoria(tx.categoria);
      setSubcategoria(tx.subcategoria ?? "");
      setConcepto(tx.concepto);
      setFecha(tx.fecha.slice(0, 10));
      setHora(tx.fecha.slice(11, 16));
      setMonto(String(tx.monto));
      setMetodo(tx.metodo_pago);
      setDetalle(tx.detalle ?? "");
      setAportanteId(tx.member_id ?? null);
      setAportanteQuery(tx.member_nombre ?? "");
      setBeneficiario(tx.beneficiario ?? "");
      setBeneficiarioRfc(tx.beneficiario_rfc ?? "");
      setConstancia(!!tx.emitir_constancia);
      setMarcarPendiente(tx.estado === "pendiente");
      setComprobantePath(tx.comprobante_path ?? null);
    } else if (mode.kind === "editMember") {
      const m = mode.member;
      setMNombre(m.nombre);
      setMEmail(m.email ?? "");
      setMTelefono(m.telefono ?? "");
      setMRfc(m.rfc ?? "");
      setMNotas(m.notas ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode.kind !== "create") return;
    setCategoria(tab === "gasto" ? "servicios" : "ofrenda");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sugerencias = useMemo(() => {
    const q = aportanteQuery.trim().toLowerCase();
    if (q.length < 2 || aportanteId !== null) return [];
    return members.filter((m) => m.nombre.toLowerCase().includes(q)).slice(0, 4);
  }, [aportanteQuery, aportanteId, members]);

  // Descripción contextual: para Diezmo y Ofrenda la categoría ya define el
  // ingreso por completo, así que el campo se oculta y se guarda el nombre de
  // la categoría; para Donación es visible pero opcional (propósito del
  // donativo); para Otros y categorías personalizadas sigue siendo requerido.
  const descripcionOculta = tab === "ingreso" && (categoria === "diezmo" || categoria === "ofrenda");
  const descripcionOpcional = tab === "ingreso" && categoria === "donacion";
  /** Concepto a persistir, o null si falta y es obligatorio. */
  function conceptoFinal(): string | null {
    const escrito = concepto.trim();
    if (descripcionOculta) return catNombre(categoria);
    if (!escrito) return descripcionOpcional ? catNombre(categoria) : null;
    return escrito;
  }

  const titulo = isEdit
    ? tab === "miembro" ? t("recordModal.editarMiembro") : tab === "ingreso" ? t("recordModal.editarIngreso") : t("recordModal.editarGasto")
    : tab === "miembro" ? t("recordModal.nuevoMiembro") : tab === "ingreso" ? t("recordModal.nuevoIngreso") : t("recordModal.nuevoGasto");
  const subtitulo = tab === "miembro"
    ? t("recordModal.subMiembro")
    : tab === "ingreso" ? t("recordModal.subIngreso") : t("recordModal.subGasto");
  const botonGuardar = saving
    ? t("common.guardando")
    : isEdit ? t("common.guardarCambios") : tab === "miembro" ? t("recordModal.guardarMiembro") : tab === "ingreso" ? t("recordModal.guardarIngreso") : t("recordModal.guardarGasto");

  async function pickComprobante() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: t("recordModal.seleccionarComprobante"),
        filters: [{ name: t("tx.comprobante"), extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof path === "string") setComprobantePath(path);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function agregarALosMeses() {
    if (mode.kind !== "editTx") return;
    if (tab !== "ingreso" && tab !== "gasto") return;
    setError(null);
    const m = parseMonto(monto);
    const conceptoGuardar = conceptoFinal();
    if (conceptoGuardar === null) { setError(t("common.conceptoObligatorio")); return; }
    if (m === null) { setError(t("common.montoInvalido")); return; }
    if (fecha > hoy) {
      setError(tab === "ingreso" ? t("recordModal.fechaFuturaIngresos") : t("recordModal.fechaFuturaGastos"));
      return;
    }
    setSaving(true);
    try {
      await updateTx(mode.tx.id, church.id, church.moneda, {
        tipo: tab,
        categoria,
        subcategoria: tab === "ingreso" && categoria === "otros" ? subcategoria.trim() || null : null,
        concepto: conceptoGuardar,
        detalle: detalle.trim() || null,
        fecha: `${fecha} ${hora}`,
        monto: m,
        metodo_pago: metodo,
        member_id: tab === "ingreso" ? aportanteId : null,
        beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
        beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
        emitir_constancia: tab === "ingreso" ? constancia : false,
        estado: marcarPendiente ? "pendiente" : "aprobado",
        comprobante_path: comprobantePath,
      });
      const mesesRegistrados = await insertMovimientoRecurrente(
        church.id,
        church.moneda,
        {
          tipo: tab,
          categoria,
          subcategoria: null,
          concepto: conceptoGuardar,
          detalle: detalle.trim() || null,
          monto: m,
          metodo_pago: metodo,
          beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
          beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
          dia: Number(fecha.slice(8, 10)),
          mes_inicio: `${fecha.slice(0, 4)}-01`,
        },
        fecha.slice(0, 7) // el mes de este movimiento ya existe — no se duplica
      );
      showToast(
        mesesRegistrados > 0
          ? t("recurrente.toastCreado", { count: mesesRegistrados })
          : t("recurrente.toastCreadoSinMeses")
      );
      playSound("guardado");
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  async function guardar() {
    setError(null);
    try {
      if (tab === "miembro") {
        if (!mNombre.trim()) { setError(t("validacion.nombreObligatorio")); return; }
        setSaving(true);
        const payload = {
          nombre: mNombre.trim(),
          email: mEmail.trim() || null,
          telefono: mTelefono.trim() || null,
          rfc: mRfc.trim() || null,
          notas: mNotas.trim() || null,
        };
        if (mode.kind === "editMember") {
          await updateMember(mode.member.id, church.id, payload);
        } else {
          // La fecha de alta del registro de membresía es el día en que se
          // agrega el miembro (el CSV puede traer fechas históricas propias).
          await insertMember(church.id, { ...payload, fecha_ingreso: hoy });
        }
      } else {
        const m = parseMonto(monto);
        const conceptoGuardar = conceptoFinal();
        if (conceptoGuardar === null) { setError(t("common.conceptoObligatorio")); return; }
        if (m === null) { setError(t("common.montoInvalido")); return; }
        if (fecha > hoy) {
          setError(tab === "ingreso" ? t("recordModal.fechaFuturaIngresos") : t("recordModal.fechaFuturaGastos"));
          return;
        }
        setSaving(true);
        if ((tab === "gasto" || tab === "ingreso") && !isEdit && esRecurrente) {
          const dia = Number(fecha.slice(8, 10));
          const mesesRegistrados = await insertMovimientoRecurrente(church.id, church.moneda, {
            tipo: tab,
            categoria,
            subcategoria: null,
            concepto: conceptoGuardar,
            detalle: detalle.trim() || null,
            monto: m,
            metodo_pago: metodo,
            beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
            beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
            dia,
            mes_inicio: `${fecha.slice(0, 4)}-01`,
          });
          showToast(
            mesesRegistrados > 0
              ? t("recurrente.toastCreado", { count: mesesRegistrados })
              : t("recurrente.toastCreadoSinMeses")
          );
          playSound(tab === "ingreso" ? "ingreso" : "gasto");
          onSaved();
          onClose();
          return;
        }
        const payload = {
          tipo: tab,
          categoria,
          subcategoria: categoria === "otros" ? subcategoria.trim() || null : null,
          concepto: conceptoGuardar,
          detalle: detalle.trim() || null,
          fecha: `${fecha} ${hora}`,
          monto: m,
          metodo_pago: metodo,
          member_id: tab === "ingreso" ? aportanteId : null,
          beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
          beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
          emitir_constancia: tab === "ingreso" ? constancia : false,
          estado: marcarPendiente ? "pendiente" : "aprobado",
          comprobante_path: comprobantePath,
        } as const;
        if (mode.kind === "editTx") {
          await updateTx(mode.tx.id, church.id, church.moneda, payload);
        } else {
          await insertTx(church.id, church.moneda, payload);
        }
      }
      showToast(
        isEdit
          ? t("toast.cambiosGuardados")
          : tab === "miembro"
            ? t("toast.miembroGuardado")
            : tab === "ingreso"
              ? t("toast.ingresoGuardado")
              : t("toast.gastoGuardado")
      );
      playSound(isEdit || tab === "miembro" ? "guardado" : tab === "ingreso" ? "ingreso" : "gasto");
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{titulo}</div>
            <div className="modal-sub">{subtitulo}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          {!isEdit && !pestanaBloqueada && (
            <div className="tabs-segmented">
              <div className={`seg${tab === "ingreso" ? " active" : ""}`} onClick={() => setTab("ingreso")}>
                <IconArrowUp size={14} strokeWidth={2.2} /> {t("recordModal.segIngreso")}
              </div>
              <div className={`seg${tab === "gasto" ? " active" : ""}`} onClick={() => setTab("gasto")}>
                <IconArrowDown size={14} strokeWidth={2.2} /> {t("recordModal.segGasto")}
              </div>
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
                  <label className="form-label">{t("recordModal.hora")}</label>
                  <input className="form-input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("recordModal.monto")}</label>
                  <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0.00" inputMode="decimal" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("recordModal.moneda")}</label>
                  <select className="form-select" defaultValue={church.moneda} disabled>
                    <option value="USD">{t("iglesia.monedaUsd")}</option>
                    <option value="MXN">{t("iglesia.monedaMxn")}</option>
                  </select>
                </div>
              </div>

              {(tab === "gasto" || tab === "ingreso") && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 12, marginTop: 6,
                    border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px",
                    background: esRecurrente ? "var(--surface-2)" : "transparent",
                  }}
                >
                  <span style={{ color: "var(--text-2)", flexShrink: 0 }}><IconRepeat size={16} strokeWidth={2} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {t("recurrente.pregunta", { tipo: tab === "ingreso" ? t("tx.ingreso").toLowerCase() : t("tx.gasto").toLowerCase() })}
                    </div>
                    <div className="form-hint" style={{ marginTop: 2 }}>{t("recurrente.hintForm")}</div>
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
                        placeholder={t("recordModal.buscarMiembro")}
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
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--pos)" }}>
                      <IconCheck size={14} />
                    </span>
                    <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fileNameFromPath(comprobantePath)}
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => comprobantePath && openPath(comprobantePath)}
                    >
                      {t("common.ver")}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                      {t("common.quitar")}
                    </button>
                  </div>
                ) : (
                  <div className="file-drop" onClick={pickComprobante}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    <div>{t("recordModal.clicElegir")}</div>
                  </div>
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
          <div className="form-hint">{t("common.camposOpcionales")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {botonGuardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
