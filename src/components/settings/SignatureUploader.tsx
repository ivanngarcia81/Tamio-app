import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { CARPETA_IMAGENES, guardarEnDatos, rutaEnDatos } from "../../services/archivos";
import { useTranslation } from "react-i18next";
import { IconSignature, IconWarn } from "../../icons";
import GuardadoChip, { type EstadoGuardado } from "./GuardadoChip";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface Props {
  /** Indicador de guardado automático de esta tarjeta. */
  estado?: EstadoGuardado;
  path: string | null;
  onPathChange: (path: string | null) => void;
  /** Elige el bloque de textos i18n: "firma" (tesorero) o "firmaPastor". */
  variant?: "tesorero" | "pastor";
}

/** Firma del tesorero o del pastor — se usa en el bloque de firmas de los
 *  reportes en PDF (Estado financiero, Dashboard, Constancia) cuando hay
 *  una persona configurada. */
export default function SignatureUploader({ path, onPathChange, variant = "tesorero", estado }: Props) {
  const { t } = useTranslation();
  const ns = variant === "pastor" ? "firmaPastor" : "firma";
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setPreviewUrl(null);
      return;
    }
    rutaEnDatos(path).then(readFile)
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
        title: t(`${ns}.seleccionar`),
        filters: [{ name: t("iglesia.imagenPng"), extensions: ["png"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".png")) {
        setError(t(`${ns}.debeSerPng`));
        return;
      }
      // La firma se COPIA a la carpeta de la app, igual que los comprobantes.
      // Antes se guardaba la ruta del archivo del usuario, así que bastaba con
      // que moviera el PNG de su Escritorio para que todos los documentos
      // salieran sin firmar — y sin aviso. Además no entraba en el respaldo.
      onPathChange(await guardarEnDatos(selected, CARPETA_IMAGENES));
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
            <div className="card-title-lg">{t(`${ns}.titulo`)}</div>
            <div className="card-title-sub">{t(`${ns}.sub`)}</div>
          </div>
        </div>
        {estado && <GuardadoChip estado={estado} />}
      </div>

      <div className="signature-body">
        {previewUrl ? (
          <div className="signature-preview">
            <img src={previewUrl} alt={t(`${ns}.alt`)} style={{ maxWidth: "100%", maxHeight: "100%" }} />
          </div>
        ) : (
          <div className="signature-placeholder">
            <IconSignature size={22} />
            <span className="lbl">{t(`${ns}.sinFirma`)}</span>
          </div>
        )}

        <div className="signature-actions">
          <div className="signature-actions-row">
            <button type="button" className="btn secondary" onClick={pickFirma}>
              {previewUrl ? t(`${ns}.cambiar`) : t(`${ns}.subir`)}
            </button>
            {previewUrl && (
              <button type="button" className="btn ghost" onClick={() => onPathChange(null)}>{t(`${ns}.eliminar`)}</button>
            )}
          </div>
          <div className="form-hint">{t(`${ns}.hint`)}</div>
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
