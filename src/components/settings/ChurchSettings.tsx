import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { IconBuilding, IconWarn } from "../../icons";

export interface ChurchFormValues {
  nombre: string;
  ciudad: string;
  pais: string;
  moneda: string;
}

interface Props {
  value: ChurchFormValues;
  onChange: (patch: Partial<ChurchFormValues>) => void;
  error?: string | null;
  logoPath: string | null;
  onLogoPathChange: (path: string | null) => void;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function ChurchSettings({ value, onChange, error, logoPath, onLogoPathChange }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!logoPath) {
      setPreviewUrl(null);
      return;
    }
    readFile(logoPath)
      .then((bytes) => {
        if (cancelled) return;
        setPreviewUrl(`data:image/png;base64,${uint8ToBase64(bytes)}`);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  async function pickLogo() {
    setLogoError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: "Seleccionar logo",
        filters: [{ name: "Imagen PNG", extensions: ["png"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".png")) {
        setLogoError("El logo debe ser una imagen PNG.");
        return;
      }
      onLogoPathChange(selected);
    } catch (e) {
      setLogoError(`No se pudo abrir el selector de archivos: ${e}`);
    }
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconBuilding size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Información de la iglesia</div>
            <div className="card-title-sub">Nombre, ubicación y moneda</div>
          </div>
        </div>
      </div>

      <div className="church-logo-row">
        {previewUrl ? (
          <div className="church-logo-preview">
            <img src={previewUrl} alt="Logo de la iglesia" />
          </div>
        ) : (
          <div className="church-logo-placeholder">
            <IconBuilding size={22} />
          </div>
        )}
        <div className="signature-actions" style={{ minWidth: 0 }}>
          <div className="signature-actions-row">
            <button type="button" className="btn secondary" onClick={pickLogo}>
              {previewUrl ? "Cambiar logo" : "Subir logo"}
            </button>
            {previewUrl && (
              <button type="button" className="btn ghost" onClick={() => onLogoPathChange(null)}>Eliminar logo</button>
            )}
          </div>
          <div className="form-hint">Aparece en el círculo de la iglesia en el menú lateral y en los reportes en PDF. Solo PNG.</div>
        </div>
      </div>
      {logoError && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <IconWarn size={13} /> {logoError}
        </div>
      )}

      <div className="form-group full">
        <label className="form-label">Nombre de la iglesia</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="p. ej. Iglesia Central"
        />
        {error && <div className="field-error">{error}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Ciudad <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            value={value.ciudad}
            onChange={(e) => onChange({ ciudad: e.target.value })}
            placeholder="p. ej. Ciudad de México"
          />
        </div>
        <div className="form-group">
          <label className="form-label">País <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            value={value.pais}
            onChange={(e) => onChange({ pais: e.target.value })}
            placeholder="p. ej. México"
          />
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">Moneda</label>
        <select className="form-select" value={value.moneda} onChange={(e) => onChange({ moneda: e.target.value })}>
          <option value="USD">USD — Dólar</option>
          <option value="MXN">MXN — Peso mexicano</option>
        </select>
        <div className="form-hint">Se usará en todos los movimientos nuevos, reportes y balances.</div>
      </div>
    </div>
  );
}
