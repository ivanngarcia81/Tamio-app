import { useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  findDuplicateDeposito, insertDeposito, nowLocalIso, updateDeposito,
  type Church, type Deposito,
} from "../db";
import { IconCheck, IconClose, IconWarn } from "../icons";

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function parseMonto(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Props {
  church: Church;
  editing: Deposito | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DepositoModal({ church, editing, onClose, onSaved }: Props) {
  const isEdit = editing !== null;
  const hoy = nowLocalIso().slice(0, 10);

  const [fecha, setFecha] = useState(editing?.fecha.slice(0, 10) ?? hoy);
  const [periodo, setPeriodo] = useState(editing?.periodo ?? hoy.slice(0, 7));
  const [monto, setMonto] = useState(editing ? String(editing.monto) : "");
  const [cuentaBanco, setCuentaBanco] = useState(editing?.cuenta_banco ?? "");
  const [referencia, setReferencia] = useState(editing?.referencia ?? "");
  const [notas, setNotas] = useState(editing?.notas ?? "");
  const [comprobantePath, setComprobantePath] = useState<string | null>(editing?.comprobante_path ?? null);
  const [periodoTocado, setPeriodoTocado] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFechaChange(v: string) {
    setFecha(v);
    if (!periodoTocado && v.length >= 7) setPeriodo(v.slice(0, 7));
  }

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

    if (!fecha) { setError("La fecha del depósito es obligatoria."); return; }
    if (!periodo) { setError("El período correspondiente es obligatorio."); return; }
    if (fecha > hoy) { setError("No se pueden registrar depósitos con una fecha futura."); return; }
    if (periodo > hoy.slice(0, 7)) { setError("No se puede elegir un período futuro."); return; }
    const m = parseMonto(monto);
    if (m === null) { setError("Escribe un monto válido mayor a cero."); return; }
    if (!cuentaBanco.trim()) { setError("La cuenta bancaria o nombre del banco es obligatorio."); return; }

    setSaving(true);
    try {
      const duplicado = await findDuplicateDeposito(
        church.id, fecha, m, cuentaBanco.trim(), editing?.id
      );
      if (duplicado) {
        setError("Ya existe un depósito registrado con esta misma fecha, monto y cuenta bancaria. Revisa que no sea un duplicado.");
        setSaving(false);
        return;
      }

      const payload = {
        fecha,
        periodo,
        monto: m,
        cuenta_banco: cuentaBanco.trim(),
        referencia: referencia.trim() || null,
        comprobante_path: comprobantePath,
        notas: notas.trim() || null,
      };
      if (isEdit) {
        await updateDeposito(editing.id, church.id, church.moneda, payload);
      } else {
        await insertDeposito(church.id, church.moneda, payload);
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
            <div className="modal-title">{isEdit ? "Editar depósito" : "Nuevo depósito"}</div>
            <div className="modal-sub">Registrar dinero depositado en la cuenta bancaria de la iglesia</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Fecha del depósito</label>
              <input className="form-input" type="date" value={fecha} max={hoy} onChange={(e) => onFechaChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Monto depositado</label>
              <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0.00" inputMode="decimal" />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">Cuenta bancaria o banco</label>
            <input
              className="form-input"
              value={cuentaBanco}
              onChange={(e) => setCuentaBanco(e.target.value)}
              placeholder="p. ej. BBVA · Cuenta 1234"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Referencia o comprobante <span className="opt">(opcional)</span></label>
              <input
                className="form-input"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Folio o número de referencia"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Período correspondiente</label>
              <input
                className="form-input"
                type="month"
                value={periodo}
                max={hoy.slice(0, 7)}
                onChange={(e) => { setPeriodo(e.target.value); setPeriodoTocado(true); }}
              />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">Comprobante <span className="opt">(opcional)</span></label>
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
                <button type="button" className="btn ghost sm" onClick={() => comprobantePath && openPath(comprobantePath)}>
                  Ver
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                  Quitar
                </button>
              </div>
            ) : (
              <div className="file-drop" onClick={pickComprobante}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div>Haz clic para adjuntar una imagen o PDF del comprobante</div>
              </div>
            )}
          </div>

          <div className="form-group full" style={{ marginTop: 6 }}>
            <label className="form-label">Notas <span className="opt">(opcional)</span></label>
            <textarea
              className="form-textarea"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalle adicional sobre este depósito…"
            />
          </div>

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
              {saving ? "Guardando…" : "Guardar depósito"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
