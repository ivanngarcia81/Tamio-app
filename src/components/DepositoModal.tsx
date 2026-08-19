/**
 * DepositoModal.tsx — el depósito bancario en Mac e iPad: el diálogo centrado
 * de siempre, con su rejilla de dos columnas.
 *
 * En iPhone no se pinta nada de aquí: la hoja de iOS (`NuevoDepositoIOS`) se
 * lleva el formulario entero. Lo que comparten es `useDeposito`, así que las
 * dos vistas escriben el MISMO registro y los cuatro avisos contables
 * —duplicado, exceso de efectivo, período distinto y fechas futuras— existen
 * una sola vez.
 */
import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { openPath } from "@tauri-apps/plugin-opener";
import { mesLegible } from "../db";
import { rutaComprobante } from "../services/comprobantes";
import NuevoDepositoIOS from "./NuevoDepositoIOS";
import { IconCheck, IconClose, IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { fileNameFromPath, useDeposito, type PropsDeposito } from "./deposito";

export default function DepositoModal(props: PropsDeposito) {
  const { t } = useTranslation();
  const { church, onClose } = props;
  const h = useDeposito(props);
  const enHoja = esIPhone();
  /** La hoja registra su propio Escape. Un `() => {}` estable evita que este
   *  efecto se vuelva a suscribir en cada render. */
  useEscapeClose(enHoja ? NO_HACE_NADA : onClose);

  if (enHoja) return <NuevoDepositoIOS church={church} onClose={onClose} h={h} />;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{h.isEdit ? t("depositos.modalEditar") : t("depositos.modalNuevo")}</div>
            <div className="modal-sub">{t("depositos.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("depositos.fechaDeposito")}</label>
              <input className="form-input" type="date" value={h.fecha} max={h.hoy} onChange={(e) => h.onFechaChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t("depositos.montoDepositado")}</label>
              <input className="form-input" value={h.monto} onChange={(e) => h.onMontoChange(e.target.value)} placeholder={h.placeholderMonto} inputMode="decimal" />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">{t("depositos.cuentaBancaria")}</label>
            <input
              className="form-input"
              value={h.cuentaBanco}
              onChange={(e) => h.setCuentaBanco(e.target.value)}
              placeholder={t("depositos.cuentaPlaceholder")}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("depositos.referenciaLabel")} <span className="opt">{t("common.opcional")}</span></label>
              <input
                className="form-input"
                value={h.referencia}
                onChange={(e) => h.setReferencia(e.target.value)}
                placeholder={t("depositos.referenciaPlaceholder")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t("depositos.periodoCorrespondiente")}</label>
              <input
                className="form-input"
                type="month"
                value={h.periodo}
                max={h.hoy.slice(0, 7)}
                onChange={(e) => h.onPeriodoChange(e.target.value)}
              />
            </div>
          </div>

          {h.periodoDistinto && (
            <div
              className="form-group full"
              style={{ display: "flex", alignItems: "flex-start", gap: 6, color: "var(--text-2)", marginTop: -4 }}
            >
              <span style={{ color: "var(--accent-4)", flexShrink: 0, marginTop: 1 }}><IconWarn size={13} /></span>
              <span style={{ fontSize: "var(--fs-caption)" }}>
                {t("depositos.avisoPeriodoDistinto", {
                  periodo: mesLegible(h.periodo),
                  mesFecha: mesLegible(h.fecha.slice(0, 7)),
                })}
              </span>
            </div>
          )}

          <div className="form-group full">
            <label className="form-label">{t("tx.comprobante")} <span className="opt">{t("common.opcional")}</span></label>
            {h.comprobantePath ? (
              <div
                className="form-subcard"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--pos)" }}>
                  <IconCheck size={14} />
                </span>
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fileNameFromPath(h.comprobantePath)}
                </span>
                <button type="button" className="btn ghost sm" onClick={async () => { if (h.comprobantePath) await openPath(await rutaComprobante(h.comprobantePath)); }}>
                  {t("common.ver")}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => h.setComprobantePath(null)}>
                  {t("common.quitar")}
                </button>
              </div>
            ) : (
              <button type="button" className="file-drop" onClick={h.pickComprobante}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <div>{t("depositos.adjuntarHint")}</div>
              </button>
            )}
          </div>

          <div className="form-group full" style={{ marginTop: 6 }}>
            <label className="form-label">{t("recordModal.notas")} <span className="opt">{t("common.opcional")}</span></label>
            <textarea
              className="form-textarea"
              value={h.notas}
              onChange={(e) => h.setNotas(e.target.value)}
              placeholder={t("depositos.notasPlaceholder")}
            />
          </div>

          {h.error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {h.error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {/* Antes esta frase ocupaba una franja fija en el pie de cada
              modal para algo que se lee una sola vez. Ahora es un signo de
              interrogación con el texto en el tooltip. */}
          <span className="modal-hint-icon" title={t("common.camposOpcionales")} aria-label={t("common.camposOpcionales")}>?</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={h.saving}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={h.guardar} disabled={h.saving}>
              {h.saving ? t("common.guardando") : t("depositos.guardarDeposito")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const NO_HACE_NADA = () => {};
