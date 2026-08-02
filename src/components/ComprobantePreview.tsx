import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { comprobanteDisponible } from "../services/comprobantes";
import { IconClose, IconExternalLink } from "../icons";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};

interface Props {
  path: string;
  onClose: () => void;
}

/** Vista previa rápida del comprobante (estilo Quick Look): muestra la imagen
 *  o el PDF en un panel flotante sin salir de la app. El archivo se lee con el
 *  plugin fs y se sirve como blob porque el webview no puede cargar file://
 *  directamente. "Abrir con el sistema" queda como salida para formatos que
 *  el webview no renderice (p. ej. HEIC en versiones viejas de macOS). */
export default function ComprobantePreview({ path, onClose }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [url, setUrl] = useState<string | null>(null);
  // Dos fallos distintos que antes se contaban como uno solo: "el archivo ya no
  // está donde se guardó" y "el archivo está pero el webview no sabe pintarlo".
  // Decirle a alguien que pruebe a abrirlo con el sistema cuando el archivo ya
  // no existe es mandarlo a perder el tiempo.
  const [fallo, setFallo] = useState<"no-existe" | "no-se-puede-ver" | null>(null);

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const esPdf = ext === "pdf";
  const nombre = path.split("/").pop() ?? path;

  useEffect(() => {
    let objUrl: string | null = null;
    let cancelado = false;
    (async () => {
      if (!(await comprobanteDisponible(path))) {
        if (!cancelado) setFallo("no-existe");
        return;
      }
      try {
        const bytes = await readFile(path);
        if (cancelado) return;
        const blob = new Blob([bytes as BlobPart], { type: MIME[ext] ?? "application/octet-stream" });
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      } catch {
        if (!cancelado) setFallo("no-se-puede-ver");
      }
    })();
    return () => {
      cancelado = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [path, ext]);

  return (
    <div className="ql-overlay" onClick={onClose}>
      <div className="ql-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ql-bar">
          <span className="ql-nombre" title={path}>{nombre}</span>
          <div className="ql-acciones">
            {fallo !== "no-existe" && (
              <button className="btn secondary" onClick={() => openPath(path)}>
                <IconExternalLink size={12} /> {t("comprobante.abrirSistema")}
              </button>
            )}
            <button className="ql-cerrar" onClick={onClose} title={t("common.cerrar")}>
              <IconClose size={16} />
            </button>
          </div>
        </div>
        <div className="ql-cuerpo">
          {fallo === "no-existe" ? (
            <div className="ql-error">
              {t("comprobante.noDisponible")}
              <div className="ql-ruta">{path}</div>
            </div>
          ) : fallo ? (
            <div className="ql-error">{t("comprobante.error")}</div>
          ) : !url ? (
            <div className="ql-error">{t("common.preparando")}</div>
          ) : esPdf ? (
            <iframe className="ql-frame" src={url} title={nombre} />
          ) : (
            <img className="ql-img" src={url} alt={nombre} onError={() => setFallo("no-se-puede-ver")} />
          )}
        </div>
      </div>
    </div>
  );
}
