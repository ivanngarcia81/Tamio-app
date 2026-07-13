import { useEffect, useMemo, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  CATEGORIAS_GASTO, CATEGORIAS_INGRESO, METODOS_PAGO,
  insertMember, insertTx, listMembers, nowLocalIso, updateMember, updateTx,
  type Church, type Member, type Tx,
} from "../db";
import { IconArrowDown, IconArrowUp, IconCheck, IconClose, IconMiembros, IconWarn } from "../icons";

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export type ModalTab = "ingreso" | "gasto" | "miembro";

export type ModalMode =
  | { kind: "create"; tab: ModalTab }
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
  const isEdit = mode.kind !== "create";
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

  const titulo = isEdit
    ? tab === "miembro" ? "Editar miembro" : tab === "ingreso" ? "Editar ingreso" : "Editar gasto"
    : tab === "miembro" ? "Nuevo miembro" : tab === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto";
  const subtitulo = tab === "miembro"
    ? "Agrega una persona o familia al directorio"
    : tab === "ingreso" ? "Registra dinero que entró a la iglesia" : "Registra un pago o salida de dinero";
  const botonGuardar = saving
    ? "Guardando…"
    : isEdit ? "Guardar cambios" : tab === "miembro" ? "Guardar miembro" : tab === "ingreso" ? "Guardar ingreso" : "Guardar gasto";

  async function pickComprobante() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: "Seleccionar comprobante",
        filters: [{ name: "Comprobante", extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof path === "string") setComprobantePath(path);
    } catch (e) {
      setError(`No se pudo abrir el selector de archivos: ${e}`);
    }
  }

  async function guardar() {
    setError(null);
    try {
      if (tab === "miembro") {
        if (!mNombre.trim()) { setError("El nombre es obligatorio."); return; }
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
          await insertMember(church.id, payload);
        }
      } else {
        const m = parseMonto(monto);
        if (!concepto.trim()) { setError("El concepto es obligatorio."); return; }
        if (m === null) { setError("Escribe un monto válido mayor a cero."); return; }
        if (fecha > hoy) {
          setError(`No se pueden registrar ${tab === "ingreso" ? "ingresos" : "gastos"} con una fecha futura.`);
          return;
        }
        setSaving(true);
        const payload = {
          tipo: tab,
          categoria,
          subcategoria: categoria === "otros" ? subcategoria.trim() || null : null,
          concepto: concepto.trim(),
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
      onSaved();
      onClose();
    } catch (e) {
      setError(`No se pudo guardar: ${e}`);
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
          {!isEdit && (
            <div className="tabs-segmented">
              <div className={`seg${tab === "ingreso" ? " active" : ""}`} onClick={() => setTab("ingreso")}>
                <IconArrowUp size={14} strokeWidth={2.4} /> Ingreso
              </div>
              <div className={`seg${tab === "gasto" ? " active" : ""}`} onClick={() => setTab("gasto")}>
                <IconArrowDown size={14} strokeWidth={2.4} /> Gasto
              </div>
              <div className={`seg${tab === "miembro" ? " active" : ""}`} onClick={() => setTab("miembro")}>
                <IconMiembros size={14} strokeWidth={2.4} /> Miembro
              </div>
            </div>
          )}

          {tab !== "miembro" && (
            <>
              <div className="form-group full">
                <label className="form-label">{tab === "ingreso" ? "Tipo de ingreso" : "Categoría"}</label>
                {tab === "ingreso" ? (
                  <div className="type-grid">
                    {CATEGORIAS_INGRESO.map((c) => (
                      <span
                        key={c.id}
                        className={`tag ${c.tagClass} cat-pill${categoria === c.id ? " is-selected" : ""}`}
                        onClick={() => setCategoria(c.id)}
                      >
                        {c.nombre}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="category-grid">
                    {CATEGORIAS_GASTO.map((c) => (
                      <span
                        key={c.id}
                        className={`tag ${c.tagClass} cat-pill${categoria === c.id ? " is-selected" : ""}`}
                        onClick={() => setCategoria(c.id)}
                      >
                        {c.nombre}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {tab === "ingreso" && categoria === "otros" && (
                <div className="form-group full">
                  <label className="form-label">Subcategoría <span className="opt">(p. ej. Rentas del salón)</span></label>
                  <input className="form-input" value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} placeholder="Escribe una subcategoría…" />
                </div>
              )}

              <div className="form-group full">
                <label className="form-label">Concepto / descripción</label>
                <input
                  className="form-input"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder={tab === "ingreso" ? "p. ej. Ofrenda servicio dominical" : "p. ej. CFE · Energía eléctrica"}
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input className="form-input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hora</label>
                  <input className="form-input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0.00" inputMode="decimal" />
                </div>
                <div className="form-group">
                  <label className="form-label">Moneda</label>
                  <select className="form-select" defaultValue={church.moneda} disabled>
                    <option value="USD">USD — Dólar</option>
                    <option value="MXN">MXN — Peso mexicano</option>
                  </select>
                </div>
              </div>

              <div className="form-group full">
                <label className="form-label">Método de pago</label>
                <div className="method-group">
                  {METODOS_PAGO.map((mp) => (
                    <div
                      key={mp.id}
                      className={`method-choice${metodo === mp.id ? " is-selected" : ""}`}
                      onClick={() => setMetodo(mp.id)}
                    >
                      <span className="m-dot" style={{ background: mp.color }} />
                      {mp.nombre}
                    </div>
                  ))}
                </div>
              </div>

              {tab === "ingreso" ? (
                <>
                  <div className="form-group full">
                    <label className="form-label">
                      Aportante <span className="opt">(opcional — deja vacío si es colectivo)</span>
                    </label>
                    <div className="search-combo">
                      <input
                        className="form-input"
                        value={aportanteQuery}
                        onChange={(e) => { setAportanteQuery(e.target.value); setAportanteId(null); }}
                        placeholder="Buscar miembro por nombre…"
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
                                <div className="s-sub">{m.rfc || m.email || "Sin RFC registrado"}</div>
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
                      Emitir constancia (recibo deducible) — requiere RFC del aportante
                    </label>
                  </div>
                </>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Beneficiario</label>
                    <input className="form-input" value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder="Proveedor o persona" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">RFC <span className="opt">(opcional)</span></label>
                    <input className="form-input" value={beneficiarioRfc} onChange={(e) => setBeneficiarioRfc(e.target.value)} placeholder="RFC del beneficiario" />
                  </div>
                </div>
              )}

              <div className="form-group full">
                <label className="form-label">
                  Comprobante <span className="opt">({tab === "gasto" ? "recomendado" : "opcional"})</span>
                </label>
                {comprobantePath ? (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#059669" }}>
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
                      Ver
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="file-drop" onClick={pickComprobante}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    <div>Haz clic para elegir una imagen o PDF</div>
                  </div>
                )}
                {tab === "gasto" && !comprobantePath && (
                  <div className="form-warning">
                    <IconWarn size={13} /> Se recomienda adjuntar un comprobante para respaldar este gasto en tus reportes.
                  </div>
                )}
              </div>

              <div className="form-group full" style={{ marginTop: 6 }}>
                <label className="form-label">Notas <span className="opt">(opcional)</span></label>
                <textarea
                  className="form-textarea"
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Detalle adicional, número de personas, folio…"
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
                  Marcar para revisar después — no se contará en los totales del mes hasta que lo confirmes en Bandeja
                </label>
              </div>
            </>
          )}

          {tab === "miembro" && (
            <>
              <div className="form-group full">
                <label className="form-label">Nombre completo o de familia</label>
                <input className="form-input" value={mNombre} onChange={(e) => setMNombre(e.target.value)} placeholder="p. ej. Carlos y Ana Ruiz" />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Correo electrónico <span className="opt">(opcional)</span></label>
                  <input className="form-input" type="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder="correo@ejemplo.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono <span className="opt">(opcional)</span></label>
                  <input className="form-input" value={mTelefono} onChange={(e) => setMTelefono(e.target.value)} placeholder="55 0000 0000" />
                </div>
              </div>
              <div className="form-group full">
                <label className="form-label">RFC <span className="opt">(opcional — necesario para constancias deducibles)</span></label>
                <input className="form-input" value={mRfc} onChange={(e) => setMRfc(e.target.value)} placeholder="RFC a 13 caracteres" />
              </div>
              <div className="form-group full">
                <label className="form-label">Notas <span className="opt">(opcional)</span></label>
                <textarea className="form-textarea" value={mNotas} onChange={(e) => setMNotas(e.target.value)} placeholder="Información adicional relevante…" />
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
          <div className="form-hint">Los campos marcados como opcionales se pueden completar después.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {botonGuardar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
