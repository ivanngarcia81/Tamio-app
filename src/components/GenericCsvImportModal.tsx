import { useState, type ReactNode } from "react";
import { open as openFileDialog, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { autoDetectMapping, applyMapping, parseCsvFile, type CsvField, type ImportRowError } from "../services/csvImport";
import { IconCheck, IconClose, IconDownload, IconWarn } from "../icons";

export interface PreviewColumn<T> {
  label: string;
  align?: "left" | "right";
  render: (item: T) => ReactNode;
  title?: (item: T) => string;
}

interface Props<T> {
  titulo: string;
  subtitulo: string;
  instrucciones: ReactNode;
  fields: CsvField[];
  templateCsv: string;
  templateFileName: string;
  validarFila: (row: Record<string, string>) => { data?: T; error?: string };
  previewColumns: PreviewColumn<T>[];
  previewColsTemplate: string;
  /** Devuelve el sustantivo pluralizado, p. ej. n=>n===1?"movimiento":"movimientos". */
  etiquetaItem: (n: number) => string;
  onConfirmar: (items: T[]) => Promise<void>;
  onClose: () => void;
  onImportado: () => void;
}

type Step<T> =
  | { kind: "elegir" }
  | { kind: "mapear"; headers: string[]; rows: Record<string, string>[]; mapping: Record<string, string | null> }
  | { kind: "preview"; validas: T[]; errores: ImportRowError[] }
  | { kind: "importando" }
  | { kind: "listo"; cantidad: number };

/** Modal genérico de "elegir archivo → mapear columnas → previsualizar →
 *  confirmar" reutilizado por la importación de Movimientos y de Miembros.
 *  No conoce el dominio (ingresos, miembros, etc.): recibe los campos
 *  esperados, cómo validar cada fila ya mapeada, y cómo insertar el
 *  resultado — todo lo específico vive en el llamador. */
export default function GenericCsvImportModal<T>({
  titulo, subtitulo, instrucciones, fields, templateCsv, templateFileName,
  validarFila, previewColumns, previewColsTemplate, etiquetaItem, onConfirmar, onClose, onImportado,
}: Props<T>) {
  const [step, setStep] = useState<Step<T>>({ kind: "elegir" });
  const [error, setError] = useState<string | null>(null);

  async function descargarPlantilla() {
    setError(null);
    try {
      const path = await save({ defaultPath: templateFileName, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (!path) return;
      await writeFile(path, new TextEncoder().encode(templateCsv));
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
      const { headers, rows } = parseCsvFile(text);
      if (headers.length === 0) {
        setError("El archivo no tiene columnas reconocibles.");
        return;
      }
      setStep({ kind: "mapear", headers, rows, mapping: autoDetectMapping(headers, fields) });
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e}`);
    }
  }

  function actualizarMapeo(key: string, columna: string) {
    if (step.kind !== "mapear") return;
    setStep({ ...step, mapping: { ...step.mapping, [key]: columna || null } });
  }

  function continuarDesdeMapeo() {
    if (step.kind !== "mapear") return;
    const faltantes = fields.filter((f) => f.required && !step.mapping[f.key]);
    if (faltantes.length > 0) {
      setError(`Falta indicar la columna para: ${faltantes.map((f) => f.label).join(", ")}.`);
      return;
    }
    setError(null);
    const mappedRows = applyMapping(step.rows, step.mapping, fields);
    const validas: T[] = [];
    const errores: ImportRowError[] = [];
    mappedRows.forEach((row, i) => {
      const fila = i + 2; // +1 por el encabezado, +1 porque las hojas de cálculo empiezan en 1
      const r = validarFila(row);
      if (r.data) validas.push(r.data);
      else errores.push({ fila, mensaje: r.error ?? "Fila inválida." });
    });
    setStep({ kind: "preview", validas, errores });
  }

  async function confirmarImportacion() {
    if (step.kind !== "preview") return;
    const { validas } = step;
    setStep({ kind: "importando" });
    try {
      await onConfirmar(validas);
      setStep({ kind: "listo", cantidad: validas.length });
      onImportado();
    } catch (e) {
      setError(`No se pudo completar la importación: ${e}`);
      setStep({ kind: "preview", validas, errores: [] });
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
          {step.kind === "elegir" && (
            <>
              <div className="form-hint" style={{ marginBottom: 14, lineHeight: 1.6 }}>{instrucciones}</div>
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

          {step.kind === "mapear" && (
            <>
              <div className="form-hint" style={{ marginBottom: 16, lineHeight: 1.6 }}>
                Indica qué columna de tu archivo corresponde a cada dato — ya intentamos adivinarlo,
                revisa que esté correcto antes de continuar.
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {fields.map((f) => (
                  <div className="form-group" key={f.key}>
                    <label className="form-label">
                      {f.label} {!f.required && <span className="opt">(opcional)</span>}
                    </label>
                    <select
                      className="form-select"
                      value={step.mapping[f.key] ?? ""}
                      onChange={(e) => actualizarMapeo(f.key, e.target.value)}
                    >
                      <option value="">{f.required ? "— Selecciona una columna —" : "— Ninguna —"}</option>
                      {step.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
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
                    <div key={i} className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <IconWarn size={12} /> Fila {e.fila}: {e.mensaje}
                    </div>
                  ))}
                </div>
              )}

              {step.validas.length > 0 && (
                <div className="data-table roomy">
                  <div className="thead" style={{ gridTemplateColumns: previewColsTemplate }}>
                    {previewColumns.map((c, i) => (
                      <div className="th" key={i} style={{ textAlign: c.align ?? "left" }}>{c.label}</div>
                    ))}
                  </div>
                  {step.validas.slice(0, 8).map((item, i) => (
                    <div className="tr" key={i} style={{ gridTemplateColumns: previewColsTemplate }}>
                      {previewColumns.map((c, j) => (
                        <div
                          className="td truncate"
                          key={j}
                          style={{ fontSize: 12.5, textAlign: c.align ?? "left", fontWeight: c.align === "right" ? 600 : undefined }}
                          title={c.title?.(item)}
                        >
                          {c.render(item)}
                        </div>
                      ))}
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
            <div style={{ color: "var(--text-2)", fontSize: 13 }}>Importando…</div>
          )}

          {step.kind === "listo" && (
            <div className="empty-state" style={{ padding: "32px 24px" }}>
              <div className="empty-icon"><IconCheck size={20} /></div>
              <div className="empty-title">Importación completa</div>
              <div className="empty-sub">
                Se importaron {step.cantidad} {etiquetaItem(step.cantidad)} correctamente.
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
                {step.kind === "mapear" && (
                  <button className="btn primary" onClick={continuarDesdeMapeo}>Continuar</button>
                )}
                {step.kind === "preview" && (
                  <button className="btn primary" onClick={confirmarImportacion} disabled={step.validas.length === 0}>
                    Importar {step.validas.length} {etiquetaItem(step.validas.length)}
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
