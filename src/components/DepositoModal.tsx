import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  efectivoDisponibleHasta, findDuplicateDeposito, fmtMoney, insertDeposito,
  mesLegible, nowLocalIso, updateDeposito,
  type Church, type Deposito,
} from "../db";
import { guardarComprobante, rutaComprobante } from "../services/comprobantes";
import { IconCheck, IconClose, IconWarn } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { CERO, aTextoTecleado, deTextoTecleado, maximo, type Centavos } from "../dinero";
import { currencySymbol } from "../currencies";

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Igual que en Nuevo movimiento: el parseo vive en `dinero.ts` y aquí
 *  solo queda la regla de la pantalla (mayor que cero). */
function parseMonto(s: string): Centavos | null {
  const c = deTextoTecleado(s);
  return c !== null && c > 0 ? c : null;
}

interface Props {
  church: Church;
  editing: Deposito | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DepositoModal({ church, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const isEdit = editing !== null;
  const hoy = nowLocalIso().slice(0, 10);
  /** Mismo criterio que en Nuevo movimiento: el ejemplo lo escribe el mismo
   *  formateador que lee el campo. */
  const placeholderMonto = currencySymbol(church.moneda) + aTextoTecleado(CERO);

  const [fecha, setFecha] = useState(editing?.fecha.slice(0, 10) ?? hoy);
  const [periodo, setPeriodo] = useState(editing?.periodo ?? hoy.slice(0, 7));
  const [monto, setMonto] = useState(editing ? aTextoTecleado(editing.monto) : "");
  const [cuentaBanco, setCuentaBanco] = useState(editing?.cuenta_banco ?? "");
  const [referencia, setReferencia] = useState(editing?.referencia ?? "");
  const [notas, setNotas] = useState(editing?.notas ?? "");
  const [comprobantePath, setComprobantePath] = useState<string | null>(editing?.comprobante_path ?? null);
  const [periodoTocado, setPeriodoTocado] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aviso no bloqueante: el primer Guardar advierte si el monto supera el
  // efectivo estimado en caja; el segundo procede (mismo patrón que el aviso
  // de miembros duplicados). Cambiar monto o fecha reinicia la confirmación.
  const [excedeConfirmado, setExcedeConfirmado] = useState(false);

  function onFechaChange(v: string) {
    setFecha(v);
    setExcedeConfirmado(false);
    if (!periodoTocado && v.length >= 7) setPeriodo(v.slice(0, 7));
  }

  // Los totales y los reportes suman por PERÍODO, no por fecha. Los dos campos
  // pueden diferir a propósito (un depósito hecho en agosto con dinero de
  // julio), pero cuando difieren sin querer el depósito "desaparece" de los
  // totales del mes en que se ve la fecha. Se avisa, sin bloquear.
  const periodoDistinto = fecha.length >= 7 && periodo.length >= 7 && fecha.slice(0, 7) !== periodo;

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

      if (!excedeConfirmado) {
        const disponible = await efectivoDisponibleHasta(church, fecha, editing?.id);
        if (m > disponible) {
          setExcedeConfirmado(true);
          setError(t("depositos.excedeEfectivo", {
            monto: fmtMoney(m),
            disponible: fmtMoney(maximo(disponible, CERO)),
          }));
          setSaving(false);
          return;
        }
      }

      // El comprobante se copia a la carpeta de la app y se guarda ESA ruta:
      // el archivo que eligió el usuario puede moverse o borrarse.
      const rutaGuardada = comprobantePath ? await guardarComprobante(comprobantePath) : null;
      const payload = {
        fecha,
        periodo,
        monto: m,
        cuenta_banco: cuentaBanco.trim(),
        referencia: referencia.trim() || null,
        comprobante_path: rutaGuardada,
        notas: notas.trim() || null,
      };
      if (isEdit) {
        await updateDeposito(editing.id, church.id, church.moneda, payload);
      } else {
        await insertDeposito(church.id, church.moneda, payload);
      }
      showToast(isEdit ? t("toast.cambiosGuardados") : t("toast.depositoGuardado"));
      playSound("guardado");
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
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("depositos.fechaDeposito")}</label>
              <input className="form-input" type="date" value={fecha} max={hoy} onChange={(e) => onFechaChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t("depositos.montoDepositado")}</label>
              <input className="form-input" value={monto} onChange={(e) => { setMonto(e.target.value); setExcedeConfirmado(false); }} placeholder={placeholderMonto} inputMode="decimal" />
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

          {periodoDistinto && (
            <div
              className="form-group full"
              style={{ display: "flex", alignItems: "flex-start", gap: 6, color: "var(--text-2)", marginTop: -4 }}
            >
              <span style={{ color: "var(--accent-4)", flexShrink: 0, marginTop: 1 }}><IconWarn size={13} /></span>
              <span style={{ fontSize: "var(--fs-caption)" }}>
                {t("depositos.avisoPeriodoDistinto", {
                  periodo: mesLegible(periodo),
                  mesFecha: mesLegible(fecha.slice(0, 7)),
                })}
              </span>
            </div>
          )}

          <div className="form-group full">
            <label className="form-label">{t("tx.comprobante")} <span className="opt">{t("common.opcional")}</span></label>
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
                <button type="button" className="btn ghost sm" onClick={async () => { if (comprobantePath) await openPath(await rutaComprobante(comprobantePath)); }}>
                  {t("common.ver")}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setComprobantePath(null)}>
                  {t("common.quitar")}
                </button>
              </div>
            ) : (
              <button type="button" className="file-drop" onClick={pickComprobante}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div>{t("depositos.adjuntarHint")}</div>
              </button>
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
          {/* Antes esta frase ocupaba una franja fija en el pie de cada
              modal para algo que se lee una sola vez. Ahora es un signo de
              interrogación con el texto en el tooltip. */}
          <span className="modal-hint-icon" title={t("common.camposOpcionales")} aria-label={t("common.camposOpcionales")}>?</span>
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
