import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        title: t("depositos.seleccionarComprobante"),
        filters: [{ name: t("tx.comprobante"), extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof path === "string") setComprobantePath(path);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function guardar() {
    setError(null);

    if (!fecha) { setError(t("depositos.fechaObligatoria")); return; }
    if (!periodo) { setError(t("depositos.periodoObligatorio")); return; }
    if (fecha > hoy) { setError(t("depositos.fechaFutura")); return; }
    if (periodo > hoy.slice(0, 7)) { setError(t("depositos.periodoFuturo")); return; }
    const m = parseMonto(monto);
    if (m === null) { setError(t("common.montoInvalido")); return; }
    if (!cuentaBanco.trim()) { setError(t("depositos.cuentaObligatoria")); return; }

    setSaving(true);
    try {
      const duplicado = await findDuplicateDeposito(
        church.id, fecha, m, cuentaBanco.trim(), editing?.id
      );
      if (duplicado) {
        setError(t("depositos.duplicado"));
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
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? t("depositos.modalEditar") : t("depositos.modalNuevo")}</div>
            <div className="modal-sub">{t("depositos.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("depositos.fechaDeposito")}</label>
              <input className="form-input" type="date" value={fecha} max={hoy} onChange={(e) => onFechaChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t("depositos.montoDepositado")}</label>
              <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$0.00" inputMode="decimal" />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">{t("depositos.cuentaBancaria")}</label>
            <input
              className="form-input"
              value={cuentaBanco}
              onChange={(e) => setCuentaBanco(e.target.value)}
              placeholder={t("depositos.cuentaPlaceholder")}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("depositos.referenciaLabel")} <span className="opt">{t("common.opcional")}</span></label>
              <input
                className="form-input"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder={t("depositos.referenciaPlaceholder")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t("depositos.periodoCorrespondiente")}</label>
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
            <label className="form-label">{t("tx.comprobante")} <span className="opt">{t("common.opcional")}</span></label>
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
                  {t("common.ver")}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                  {t("common.quitar")}
                </button>
              </div>
            ) : (
              <div className="file-drop" onClick={pickComprobante}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div>{t("depositos.adjuntarHint")}</div>
              </div>
            )}
          </div>

          <div className="form-group full" style={{ marginTop: 6 }}>
            <label className="form-label">{t("recordModal.notas")} <span className="opt">{t("common.opcional")}</span></label>
            <textarea
              className="form-textarea"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={t("depositos.notasPlaceholder")}
            />
          </div>

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
              {saving ? t("common.guardando") : t("depositos.guardarDeposito")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
