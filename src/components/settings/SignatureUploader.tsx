import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { IconSignature, IconWarn } from "../../icons";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface Props {
  path: string | null;
  onPathChange: (path: string | null) => void;
}

/** Firma del tesorero — se usa en el bloque de firmas de los reportes en PDF
 *  (Estado financiero, Dashboard) cuando hay un tesorero configurado. */
export default function SignatureUploader({ path, onPathChange }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setPreviewUrl(null);
      return;
    }
    readFile(path)
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
  }, [path]);

  async function pickFirma() {
    setError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: "Seleccionar firma",
        filters: [{ name: "Imagen PNG", extensions: ["png"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".png")) {
        setError("La firma debe ser una imagen PNG con fondo transparente.");
        return;
      }
      onPathChange(selected);
    } catch (e) {
      setError(`No se pudo abrir el selector de archivos: ${e}`);
    }
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconSignature size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Firma del tesorero</div>
            <div className="card-title-sub">Aparece en el bloque de firmas de los reportes en PDF</div>
          </div>
        </div>
      </div>

      <div className="signature-body">
        {previewUrl ? (
          <div className="signature-preview">
            <img src={previewUrl} alt="Firma del tesorero" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          </div>
        ) : (
          <div className="signature-placeholder">
            <IconSignature size={22} />
            <span className="lbl">Sin firma registrada</span>
          </div>
        )}

        <div className="signature-actions">
          <div className="signature-actions-row">
            <button type="button" className="btn secondary" onClick={pickFirma}>
              {previewUrl ? "Cambiar firma" : "Subir firma"}
            </button>
            {previewUrl && (
              <button type="button" className="btn ghost" onClick={() => onPathChange(null)}>Eliminar firma</button>
            )}
          </div>
          <div className="form-hint">Solo se aceptan imágenes PNG, idealmente con fondo transparente.</div>
        </div>
      </div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
