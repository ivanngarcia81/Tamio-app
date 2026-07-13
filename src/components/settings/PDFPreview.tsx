const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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
 *  una vista previa visual con la misma información. */
export default function PDFPreview({ churchNombre, tesoreroNombre, tesoreroCargo }: Props) {
  return (
    <div className="card pad-lg" style={{ position: "sticky", top: 20 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Vista previa del reporte</div>
      <div className="form-hint" style={{ marginBottom: 16 }}>
        Así se verá el encabezado de tus reportes en PDF.
      </div>

      <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "28px 24px" }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Estado financiero mensual
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>
          {churchNombre.trim() || "Mi Iglesia"}
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />

        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", marginBottom: 4 }}>
          Generado por
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {tesoreroNombre.trim() || "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>
          {tesoreroCargo.trim() || "Tesorero"}
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />

        <div style={{ fontSize: 11, color: "var(--text-3)" }}>Reporte {previewFolio()}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{previewFecha()}</div>
      </div>
    </div>
  );
}
