import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import i18n from "../i18n";
import { IconClose } from "../icons";

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

/**
 * Visor de PDF para iPad/iPhone: en iOS no hay Vista Previa — el documento
 * se muestra DENTRO de la app (páginas renderizadas con pdf.js) y desde ahí
 * el botón Compartir abre la hoja nativa (Archivos, AirDrop, Imprimir…).
 * Se monta imperativamente para que cualquier exportación lo pueda usar sin
 * plomería de React en cada página.
 */

interface Props {
  bytes: Uint8Array;
  fileName: string;
  onCompartir: () => Promise<void>;
  onCerrar: () => void;
}

function Visor({ bytes, fileName, onCompartir, onCerrar }: Props) {
  const contRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // pdf.js consume el buffer: se le da una copia para conservar el
        // original (el botón Compartir usa los bytes intactos).
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        const cont = contRef.current;
        if (!cont || cancelado) return;
        const ancho = Math.min(cont.clientWidth - 24, 900);
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelado) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const escala = (ancho / base.width) * (window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale: escala });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "visor-pdf-pagina";
          canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelado) return;
          cont.appendChild(canvas);
        }
      } catch (e) {
        if (!cancelado) setError(String(e));
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function compartir() {
    setCompartiendo(true);
    try { await onCompartir(); } finally { setCompartiendo(false); }
  }

  return (
    <div className="visor-pdf-overlay">
      <div className="visor-pdf-barra">
        <div className="visor-pdf-nombre">{fileName}</div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button className="btn primary sm" onClick={() => void compartir()} disabled={compartiendo}>
            {compartiendo ? "…" : i18n.t("visorPdf.compartir")}
          </button>
          <button className="modal-close" onClick={onCerrar} aria-label={i18n.t("common.cerrar")}>
            <IconClose size={16} />
          </button>
        </div>
      </div>
      <div className="visor-pdf-paginas" ref={contRef}>
        {error && <div className="form-warning" style={{ margin: 16 }}>{error}</div>}
      </div>
    </div>
  );
}

/** Muestra el visor a pantalla completa. `onCompartir` abre la hoja nativa. */
export function mostrarPdf(bytes: Uint8Array, fileName: string, onCompartir: () => Promise<void>): void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const cerrar = () => {
    root.unmount();
    host.remove();
  };
  root.render(<Visor bytes={bytes} fileName={fileName} onCompartir={onCompartir} onCerrar={cerrar} />);
}
