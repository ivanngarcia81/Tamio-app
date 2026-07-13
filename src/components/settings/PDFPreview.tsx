import { IconDownload, IconExternalLink, IconFileText, IconPrinter, IconRefreshCw } from "../../icons";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function previewPeriodo(): string {
  const d = new Date();
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function previewFecha(): string {
  const d = new Date();
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function previewFolio(): string {
  const d = new Date();
  return `EF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-000001`;
}

interface Props {
  churchNombre: string;
  tesoreroNombre: string;
  tesoreroCargo: string;
}

/** Simulación del encabezado del PDF — se actualiza en vivo mientras el
 *  usuario escribe. No invoca el motor real de PDF (export.ts); es solo
 *  una vista previa visual con la misma información. Las acciones de la
 *  barra superior (Abrir/Imprimir/Exportar) operan sobre el reporte real
 *  del mes desde la pantalla Reportes — aquí quedan preparadas visualmente
 *  para cuando esta vista previa esté conectada a un reporte real. */
export default function PDFPreview({ churchNombre, tesoreroNombre, tesoreroCargo }: Props) {
  return (
    <div className="card pad-lg settings-card pdf-preview-card" style={{ position: "sticky", top: 20 }}>
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconFileText size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Vista previa del PDF</div>
            <div className="card-title-sub">Así se verá el encabezado de tus reportes</div>
          </div>
        </div>
      </div>

      <div className="pdf-preview-toolbar">
        <button type="button" className="btn secondary sm" disabled title="Disponible desde Reportes">
          <IconExternalLink size={13} /> Abrir PDF
        </button>
        <button type="button" className="btn secondary sm" disabled title="Disponible desde Reportes">
          <IconPrinter size={13} /> Imprimir
        </button>
        <button type="button" className="btn secondary sm" disabled title="Disponible desde Reportes">
          <IconDownload size={13} /> Exportar PDF
        </button>
        <button type="button" className="btn ghost sm" disabled title="La vista previa ya se actualiza mientras escribes">
          <IconRefreshCw size={13} /> Actualizar
        </button>
      </div>
      <div className="pdf-preview-hint">
        Las acciones de reporte real están disponibles en la pantalla Reportes.
      </div>

      <div className="pdf-preview-stage">
        <div className="pdf-sheet">
          <div className="pdf-sheet-title">Estado financiero mensual</div>
          <div className="pdf-sheet-church">{churchNombre.trim() || "Mi Iglesia"}</div>
          <div className="pdf-sheet-period">Periodo: {previewPeriodo()}</div>

          <div className="pdf-sheet-rule" />

          <div className="pdf-sheet-eyebrow">Generado por</div>
          <div className="pdf-sheet-name">{tesoreroNombre.trim() || "—"}</div>
          <div className="pdf-sheet-role">{tesoreroCargo.trim() || "Tesorero"}</div>

          <div className="pdf-sheet-cards">
            <div className="pdf-sheet-card">
              <div className="k">Ingresos</div>
              <div className="v" />
            </div>
            <div className="pdf-sheet-card">
              <div className="k">Gastos</div>
              <div className="v" />
            </div>
            <div className="pdf-sheet-card">
              <div className="k">Balance</div>
              <div className="v" />
            </div>
          </div>

          <div className="pdf-sheet-rule" />

          <div className="pdf-sheet-foot">Reporte {previewFolio()}</div>
          <div className="pdf-sheet-foot">{previewFecha()}</div>
        </div>
      </div>
    </div>
  );
}
