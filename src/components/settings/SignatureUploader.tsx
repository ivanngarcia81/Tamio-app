import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        title: t("firma.seleccionar"),
        filters: [{ name: t("iglesia.imagenPng"), extensions: ["png"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".png")) {
        setError(t("firma.debeSerPng"));
        return;
      }
      onPathChange(selected);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconSignature size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("firma.titulo")}</div>
            <div className="card-title-sub">{t("firma.sub")}</div>
          </div>
        </div>
      </div>

      <div className="signature-body">
        {previewUrl ? (
          <div className="signature-preview">
            <img src={previewUrl} alt={t("firma.alt")} style={{ maxWidth: "100%", maxHeight: "100%" }} />
          </div>
        ) : (
          <div className="signature-placeholder">
            <IconSignature size={22} />
            <span className="lbl">{t("firma.sinFirma")}</span>
          </div>
        )}

        <div className="signature-actions">
          <div className="signature-actions-row">
            <button type="button" className="btn secondary" onClick={pickFirma}>
              {previewUrl ? t("firma.cambiar") : t("firma.subir")}
            </button>
            {previewUrl && (
              <button type="button" className="btn ghost" onClick={() => onPathChange(null)}>{t("firma.eliminar")}</button>
            )}
          </div>
          <div className="form-hint">{t("firma.hint")}</div>
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
