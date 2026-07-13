import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { IconWarn } from "../../icons";

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

/**
 * Firma del tesorero — solo guarda la ruta del PNG para usarse en futuras
 * versiones de los reportes en PDF. Deliberadamente NO se dibuja todavía en
 * ningún export (ver export.ts: punto de extensión documentado ahí).
 */
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
    <div className="card pad-lg">
      <div className="card-title" style={{ marginBottom: 4 }}>Firma del tesorero</div>
      <div className="form-hint" style={{ marginBottom: 16 }}>
        Se guarda para usarse en futuras versiones de los reportes — todavía no aparece en el PDF actual.
      </div>

      {previewUrl ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div
            style={{
              width: 160,
              height: 80,
              flexShrink: 0,
              borderRadius: 10,
              border: "1px solid var(--line)",
              backgroundImage:
                "linear-gradient(45deg, #0000000d 25%, transparent 25%), linear-gradient(-45deg, #0000000d 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0000000d 75%), linear-gradient(-45deg, transparent 75%, #0000000d 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            <img src={previewUrl} alt="Firma del tesorero" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn secondary" onClick={pickFirma}>Reemplazar</button>
            <button type="button" className="btn ghost" onClick={() => onPathChange(null)}>Eliminar firma</button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn secondary" onClick={pickFirma}>Subir firma</button>
          <div className="form-hint" style={{ marginTop: 8 }}>
            Solo se aceptan imágenes PNG, idealmente con fondo transparente.
          </div>
        </div>
      )}

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
