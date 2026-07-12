import { useEffect, useState } from "react";
import {
  CATEGORIAS_GASTO, CATEGORIAS_INGRESO, currentMonth, fmtMoney,
  mesLegible, monthTotals, type Church, type MonthTotals,
} from "../db";
import { exportReportExcel, exportReportPdf } from "../export";

const COLOR_INGRESO: Record<string, string> = {
  ofrenda: "#22c55e",
  diezmo: "#7c3aed",
  donacion: "#06b6d4",
  otros: "#64748b",
};

interface Props {
  church: Church;
  refreshKey: number;
}

export default function Reportes({ church, refreshKey }: Props) {
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const mes = currentMonth();
  const mesStr = mesLegible(mes);

  useEffect(() => {
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
  }, [church.id, refreshKey, mes]);

  const ingresos = totales?.ingresos ?? 0;
  const gastos = totales?.gastos ?? 0;
  const balance = ingresos - gastos;

  const filasIngreso = CATEGORIAS_INGRESO
    .map((c) => ({ ...c, total: totales?.porCategoriaIngreso[c.id] ?? 0 }))
    .filter((c) => c.total > 0);
  const filasGasto = CATEGORIAS_GASTO
    .map((c) => ({ ...c, total: totales?.porCategoriaGasto[c.id] ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  async function handleExport(kind: "excel" | "pdf") {
    setExportError(null);
    setExporting(kind);
    try {
      const data = {
        church,
        mesLegibleStr: mesStr,
        filasIngreso: filasIngreso.map((c) => ({ nombre: c.nombre, total: c.total })),
        filasGasto: filasGasto.map((c) => ({ nombre: c.nombre, total: c.total })),
        ingresos,
        gastos,
        balance,
      };
      if (kind === "excel") await exportReportExcel(data);
      else await exportReportPdf(data);
    } catch (e) {
      setExportError(`No se pudo exportar: ${e}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">Reportes</div>
          <div className="page-sub">Estado financiero mensual · {mesStr}</div>
        </div>
        <div className="header-actions">
          <button className="btn secondary" onClick={() => window.print()}>Imprimir</button>
          <button className="btn secondary" onClick={() => handleExport("excel")} disabled={exporting !== null}>
            {exporting === "excel" ? "Generando…" : "Excel"}
          </button>
          <button className="btn primary" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? "Generando…" : "PDF"}
          </button>
        </div>
      </div>
      {exportError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{exportError}</div>
        </div>
      )}

      <div className="content">
        <div className="report-preview">
          <div className="r-head">
            <div>
              <div className="r-title-lg">Estado financiero mensual</div>
              <div className="r-church">{church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""}</div>
              <div className="r-period">Periodo: {mesLegible(mes)}</div>
            </div>
          </div>

          <div className="r-section-title">Ingresos del periodo</div>
          {filasIngreso.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
              Sin ingresos registrados este mes.
            </div>
          )}
          {filasIngreso.map((c) => (
            <div className="r-row" key={c.id}>
              <span className="r-color" style={{ background: COLOR_INGRESO[c.id] ?? "#64748b" }} />
              <span>{c.nombre}</span>
              <span className="r-amt">{fmtMoney(c.total)}</span>
              <span className="r-pct">{ingresos > 0 ? `${((c.total / ingresos) * 100).toFixed(1)}%` : "—"}</span>
            </div>
          ))}
          <div className="r-row total">
            <span></span>
            <span>Total ingresos</span>
            <span className="r-amt" style={{ color: "#059669" }}>{fmtMoney(ingresos)}</span>
            <span className="r-pct" style={{ color: "var(--text)" }}>100%</span>
          </div>

          <div className="r-section-title">Gastos del periodo</div>
          {filasGasto.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
              Sin gastos registrados este mes.
            </div>
          )}
          {filasGasto.map((c) => (
            <div className="r-row" key={c.id}>
              <span className="r-color" style={{ background: c.color }} />
              <span>{c.nombre}</span>
              <span className="r-amt">{fmtMoney(c.total)}</span>
              <span className="r-pct">{gastos > 0 ? `${((c.total / gastos) * 100).toFixed(1)}%` : "—"}</span>
            </div>
          ))}
          <div className="r-row total">
            <span></span>
            <span>Total gastos</span>
            <span className="r-amt" style={{ color: "#dc2626" }}>{fmtMoney(gastos)}</span>
            <span className="r-pct" style={{ color: "var(--text)" }}>100%</span>
          </div>

          <div className="r-summary">
            <div>
              <div className="k">Total ingresos</div>
              <div className="v" style={{ color: "#059669" }}>{fmtMoney(ingresos)}</div>
            </div>
            <div>
              <div className="k">Total gastos</div>
              <div className="v" style={{ color: "#dc2626" }}>{fmtMoney(gastos)}</div>
            </div>
            <div>
              <div className="k">Balance neto</div>
              <div className="v">{fmtMoney(balance)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
