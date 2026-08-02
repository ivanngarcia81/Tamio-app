import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { comprobanteDisponible, rutaComprobante } from "../services/comprobantes";
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
  /** Lo que hay guardado en `comprobante_path`: relativo a la carpeta de datos
   *  (lo normal) o absoluto (fila antigua que no se pudo traer adentro). */
  path: string;
  onClose: () => void;
}

/**
 * Tres fallos distintos, no uno.
 *
 * Antes todo lo que no se veía se reportaba igual, y desde que el alcance de
 * archivos se acotó eso pasó a ser una acusación falsa: a un comprobante que
 * está en iCloud y que el webview ya no tiene permiso de leer, la app le decía
 * al tesorero "se movió, se renombró o se borró". No hizo nada de eso.
 *
 * - `no-existe`: lo confirma **Rust**, que no está sujeto al `fs:scope`. Si Rust
 *   dice que no está, de verdad no está.
 * - `no-se-puede-leer`: Rust lo ve pero el webview no puede abrirlo. Es un
 *   problema de permisos (alcance acotado, o el sandbox del Mac App Store el
 *   día que lo haya), no del archivo. Tiene arreglo: volver a elegirlo.
 * - `no-se-puede-ver`: el archivo se leyó pero el webview no sabe pintar ese
 *   formato (HEIC en macOS viejos, por ejemplo). Ahí sí sirve abrirlo fuera.
 */
type Fallo = "no-existe" | "no-se-puede-leer" | "no-se-puede-ver";

export default function ComprobantePreview({ path, onClose }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  // Ruta real en disco. La de la base puede ser relativa a la carpeta de datos.
  const [absoluta, setAbsoluta] = useState<string | null>(null);

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const esPdf = ext === "pdf";
  const nombre = path.split(/[\\/]/).pop() ?? path;

  useEffect(() => {
    let objUrl: string | null = null;
    let cancelado = false;
    (async () => {
      const real = await rutaComprobante(path);
      if (cancelado) return;
      setAbsoluta(real);
      if (!(await comprobanteDisponible(real))) {
        if (!cancelado) setFallo("no-existe");
        return;
      }
      try {
        const bytes = await readFile(real);
        if (cancelado) return;
        const blob = new Blob([bytes as BlobPart], { type: MIME[ext] ?? "application/octet-stream" });
        objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
      } catch {
        // Rust lo ve y el webview no: son permisos, no un archivo perdido.
        if (!cancelado) setFallo("no-se-puede-leer");
      }
    })();
    return () => {
      cancelado = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [path, ext]);

  // "Abrir con el sistema" solo tiene sentido si el archivo está ahí.
  const puedeAbrirFuera = absoluta !== null && fallo !== "no-existe";

  return (
    <div className="ql-overlay" onClick={onClose}>
      <div className="ql-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ql-bar">
          <span className="ql-nombre" title={absoluta ?? path}>{nombre}</span>
          <div className="ql-acciones">
            {puedeAbrirFuera && (
              <button className="btn secondary" onClick={() => openPath(absoluta)}>
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
              <div className="ql-ruta">{absoluta ?? path}</div>
            </div>
          ) : fallo === "no-se-puede-leer" ? (
            <div className="ql-error">
              {t("comprobante.sinPermiso")}
              <div className="ql-ruta">{absoluta ?? path}</div>
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
