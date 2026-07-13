import { useState } from "react";
import { open as openFileDialog, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { insertTx, nowLocalIso, type Church, type NewTx } from "../db";
import { CSV_TEMPLATE, parseCsv, type ImportRowError } from "../services/importCsv";
import { IconCheck, IconClose, IconDownload, IconWarn } from "../icons";

interface Props {
  church: Church;
  onClose: () => void;
  onImported: () => void;
}

type Step =
  | { kind: "elegir" }
  | { kind: "preview"; validas: NewTx[]; errores: ImportRowError[]; totalFilas: number }
  | { kind: "importando" }
  | { kind: "listo"; cantidad: number };

export default function ImportCsvModal({ church, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>({ kind: "elegir" });
  const [error, setError] = useState<string | null>(null);

  async function descargarPlantilla() {
    setError(null);
    try {
      const path = await save({
        defaultPath: "plantilla-movimientos.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      await writeFile(path, new TextEncoder().encode(CSV_TEMPLATE));
    } catch (e) {
      setError(`No se pudo guardar la plantilla: ${e}`);
    }
  }

  async function elegirArchivo() {
    setError(null);
    try {
      const path = await openFileDialog({
        multiple: false,
        title: "Seleccionar archivo CSV",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (typeof path !== "string") return;
      const bytes = await readFile(path);
      const text = new TextDecoder("utf-8").decode(bytes);
      const hoy = nowLocalIso().slice(0, 10);
      const { validas, errores, totalFilas } = parseCsv(text, hoy);
      setStep({ kind: "preview", validas, errores, totalFilas });
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e}`);
    }
  }

  async function confirmarImportacion() {
    if (step.kind !== "preview") return;
    const { validas } = step;
    setStep({ kind: "importando" });
    try {
      for (const tx of validas) {
        await insertTx(church.id, church.moneda, tx);
      }
      setStep({ kind: "listo", cantidad: validas.length });
      onImported();
    } catch (e) {
      setError(`No se pudo completar la importación: ${e}`);
      setStep({ kind: "preview", validas, errores: [], totalFilas: validas.length });
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">Importar movimientos desde CSV</div>
            <div className="modal-sub">Carga ingresos y gastos de meses anteriores sin llenarlos uno por uno</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          {step.kind === "elegir" && (
            <>
              <div className="form-hint" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                El archivo debe tener las columnas <strong>fecha, tipo, categoria, concepto, monto,
                metodo_pago, beneficiario, notas</strong> (las últimas tres son opcionales). La fecha va
                en formato AAAA-MM-DD y no puede ser futura.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary" onClick={descargarPlantilla}>
                  <IconDownload size={13} /> Descargar plantilla CSV
                </button>
                <button type="button" className="btn primary" onClick={elegirArchivo}>
                  Elegir archivo CSV
                </button>
              </div>
            </>
          )}

          {step.kind === "preview" && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div className="stat-card" style={{ flex: 1, padding: "14px 16px" }}>
                  <div className="stat-label">Listas para importar</div>
                  <div className="stat-value md" style={{ color: "#059669" }}>{step.validas.length}</div>
                </div>
                <div className="stat-card" style={{ flex: 1, padding: "14px 16px" }}>
                  <div className="stat-label">Con errores (se omiten)</div>
                  <div className="stat-value md" style={{ color: step.errores.length > 0 ? "#dc2626" : "inherit" }}>
                    {step.errores.length}
                  </div>
                </div>
              </div>

              {step.errores.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 16 }}>
                  {step.errores.map((e, i) => (
                    <div
                      key={i}
                      className="form-warning"
                      style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}
                    >
                      <IconWarn size={12} /> Fila {e.fila}: {e.mensaje}
                    </div>
                  ))}
                </div>
              )}

              {step.validas.length > 0 && (
                <div className="data-table roomy">
                  <div className="thead" style={{ gridTemplateColumns: "104px 68px 1fr 110px" }}>
                    <div className="th">Fecha</div>
                    <div className="th">Tipo</div>
                    <div className="th">Concepto</div>
                    <div className="th" style={{ textAlign: "right" }}>Monto</div>
                  </div>
                  {step.validas.slice(0, 8).map((tx, i) => (
                    <div className="tr" key={i} style={{ gridTemplateColumns: "104px 68px 1fr 110px" }}>
                      <div className="td" style={{ fontSize: 12.5 }}>{tx.fecha.slice(0, 10)}</div>
                      <div className="td" style={{ fontSize: 12.5 }}>{tx.tipo === "ingreso" ? "Ingreso" : "Gasto"}</div>
                      <div className="td truncate" style={{ fontSize: 12.5 }} title={tx.concepto}>{tx.concepto}</div>
                      <div className="td" style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}>
                        ${tx.monto.toLocaleString("en-US")}
                      </div>
                    </div>
                  ))}
                  {step.validas.length > 8 && (
                    <div style={{ padding: "10px 18px", fontSize: 12, color: "var(--text-3)" }}>
                      Y {step.validas.length - 8} más…
                    </div>
                  )}
                </div>
              )}

              {step.validas.length === 0 && step.errores.length === 0 && (
                <div style={{ color: "var(--text-3)", fontSize: 13 }}>El archivo no tiene filas de datos.</div>
              )}
            </>
          )}

          {step.kind === "importando" && (
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>Importando movimientos…</div>
          )}

          {step.kind === "listo" && (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <div className="empty-icon"><IconCheck size={20} /></div>
              <div className="empty-title">Importación completa</div>
              <div className="empty-sub">
                Se importaron {step.cantidad} movimiento{step.cantidad === 1 ? "" : "s"} correctamente.
              </div>
            </div>
          )}

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">
            {step.kind === "preview" ? "Las filas con errores no se importan; corrígelas y vuelve a intentar si las necesitas." : ""}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {step.kind === "listo" ? (
              <button className="btn primary" onClick={onClose}>Cerrar</button>
            ) : (
              <>
                <button className="btn secondary" onClick={onClose} disabled={step.kind === "importando"}>Cancelar</button>
                {step.kind === "preview" && (
                  <button
                    className="btn primary"
                    onClick={confirmarImportacion}
                    disabled={step.validas.length === 0}
                  >
                    Importar {step.validas.length} movimiento{step.validas.length === 1 ? "" : "s"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
