import { useTranslation } from "react-i18next";
import { currentMonth, fmtFechaCorta, mesLegible, nowLocalIso } from "../../db";
import { IconFileText } from "../../icons";

function previewPeriodo(): string {
  return mesLegible(currentMonth());
}

function previewFecha(): string {
  return fmtFechaCorta(nowLocalIso());
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
  const { t } = useTranslation();
  return (
    <div className="card pad-lg settings-card pdf-preview-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconFileText size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("pdfPreview.titulo")}</div>
            <div className="card-title-sub">{t("pdfPreview.sub")}</div>
          </div>
        </div>
      </div>

      {/* Sin botones: eran cuatro controles deshabilitados que duplicaban
          la pantalla de Reportes, con un cartel que te mandaba a Reportes.
          Una vista previa es una vista previa; se actualiza sola al escribir
          y las acciones reales viven donde el cartel dice. */}
      <div className="pdf-preview-hint">
        {t("pdfPreview.hint")}
      </div>

      <div className="pdf-preview-stage">
        <div className="pdf-sheet">
          <div className="pdf-sheet-title">{t("pdfPreview.tituloHoja")}</div>
          <div className="pdf-sheet-church">{churchNombre.trim() || t("pdfPreview.miIglesia")}</div>
          <div className="pdf-sheet-period">{t("pdfPreview.periodo", { periodo: previewPeriodo() })}</div>

          <div className="pdf-sheet-rule" />

          <div className="pdf-sheet-eyebrow">{t("pdfPreview.generadoPor")}</div>
          <div className="pdf-sheet-name">{tesoreroNombre.trim() || "—"}</div>
          <div className="pdf-sheet-role">{tesoreroCargo.trim() || t("rol.tesorero")}</div>

          <div className="pdf-sheet-cards">
            <div className="pdf-sheet-card">
              <div className="k">{t("pdfPreview.ingresos")}</div>
              <div className="v" />
            </div>
            <div className="pdf-sheet-card">
              <div className="k">{t("pdfPreview.gastos")}</div>
              <div className="v" />
            </div>
            <div className="pdf-sheet-card">
              <div className="k">{t("pdfPreview.balance")}</div>
              <div className="v" />
            </div>
          </div>

          <div className="pdf-sheet-rule" />

          <div className="pdf-sheet-foot">{t("pdfPreview.reporteFolio", { folio: previewFolio() })}</div>
          <div className="pdf-sheet-foot">{previewFecha()}</div>
        </div>
      </div>
    </div>
  );
}
