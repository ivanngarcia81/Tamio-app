import { useEffect, useState, type CSSProperties } from "react";
import {
  CATEGORIAS_GASTO, CATEGORIAS_INGRESO, currentMonth, fmtMoney,
  mesLegible, monthDepositos, monthlySummary, monthTotals, pctChange, prevMonth,
  type Church, type MonthSummary, type MonthTotals,
} from "../db";
import { exportReportPdf, printMonthlyReportPdf } from "../export";
import Delta from "../components/Delta";
import Donut from "../components/Donut";
import ImportCsvModal from "../components/ImportCsvModal";
import { IconPrinter, IconUpload } from "../icons";

const RESUMEN_COLS = "1fr 150px 150px 150px 130px";

const COLOR_INGRESO: Record<string, string> = {
  ofrenda: "#22c55e",
  diezmo: "#7c3aed",
  donacion: "#06b6d4",
  otros: "#64748b",
};

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Reportes({ church, refreshKey, onChanged }: Props) {
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [totalesAnt, setTotalesAnt] = useState<MonthTotals | null>(null);
  const [historial, setHistorial] = useState<MonthSummary[]>([]);
  const [depositosMes, setDepositosMes] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const mes = currentMonth();
  const mesStr = mesLegible(mes);
  const mesAnterior = prevMonth(mes);

  useEffect(() => {
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
    monthTotals(church.id, mesAnterior).then(setTotalesAnt).catch(console.error);
    monthlySummary(church.id, 6).then(setHistorial).catch(console.error);
    monthDepositos(church.id, mes).then(setDepositosMes).catch(console.error);
  }, [church.id, refreshKey, mes, mesAnterior]);

  const ingresos = totales?.ingresos ?? 0;
  const gastos = totales?.gastos ?? 0;
  const balance = ingresos - gastos;
  const balanceAnt = (totalesAnt?.ingresos ?? 0) - (totalesAnt?.gastos ?? 0);

  const filasIngreso = CATEGORIAS_INGRESO
    .map((c) => ({ ...c, total: totales?.porCategoriaIngreso[c.id] ?? 0 }))
    .filter((c) => c.total > 0);
  const filasGasto = CATEGORIAS_GASTO
    .map((c) => ({ ...c, total: totales?.porCategoriaGasto[c.id] ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  function buildReportData() {
    return {
      church,
      mesLegibleStr: mesStr,
      periodoISO: mes,
      filasIngreso: filasIngreso.map((c) => ({ nombre: c.nombre, total: c.total })),
      filasGasto: filasGasto.map((c) => ({ nombre: c.nombre, total: c.total })),
      ingresos,
      gastos,
      balance,
      depositosBancarios: depositosMes,
      generatedBy: church.tesorero_nombre
        ? { nombre: church.tesorero_nombre, rol: church.tesorero_cargo ?? undefined }
        : undefined,
      firmaPath: church.tesorero_firma_path,
    };
  }

  async function handleExport(kind: "pdf") {
    setExportError(null);
    setExporting(kind);
    try {
      await exportReportPdf(buildReportData());
    } catch (e) {
      setExportError(`No se pudo exportar: ${e}`);
    } finally {
      setExporting(null);
    }
  }

  async function handlePrint() {
    setExportError(null);
    setExporting("print");
    try {
      await printMonthlyReportPdf(buildReportData());
    } catch (e) {
      setExportError(`No se pudo imprimir: ${e}`);
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
          <button className="btn secondary" onClick={() => setImportOpen(true)}>
            <IconUpload size={13} /> Importar CSV
          </button>
          <button className="btn secondary" onClick={handlePrint} disabled={exporting !== null}>
            <IconPrinter size={14} /> {exporting === "print" ? "Preparando…" : "Imprimir"}
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
        <div className="summary-4 enter">
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">Ingresos del mes</span></div>
            <div className="stat-value md">{fmtMoney(ingresos)}<span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(ingresos, totalesAnt?.ingresos ?? 0)} /> vs. mes anterior</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">Gastos del mes</span></div>
            <div className="stat-value md">{fmtMoney(gastos)}<span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(gastos, totalesAnt?.gastos ?? 0)} invert /> vs. mes anterior</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": balance >= 0 ? "var(--accent-1)" : "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">Balance neto</span></div>
            <div className="stat-value md">{fmtMoney(balance)}<span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(balance, balanceAnt)} /> vs. mes anterior</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">Mes anterior</span></div>
            <div className="stat-value md">{fmtMoney(balanceAnt)}<span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot">{mesLegible(mesAnterior)}</div>
          </div>
        </div>

        <div className="charts enter">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Distribución de gastos</span>
              <span className="card-meta">{mesStr}</span>
            </div>
            {filasGasto.length === 0 ? (
              <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>Sin gastos este mes.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div className="donut-wrap" style={{ flexShrink: 0 }}>
                  <Donut
                    segments={filasGasto.map((c) => ({ color: c.color, pct: gastos > 0 ? (c.total / gastos) * 100 : 0 }))}
                    delayMs={0}
                  />
                  <div className="donut-center">
                    <div className="val">{fmtMoney(gastos)}</div>
                    <div className="lbl">{church.moneda}</div>
                  </div>
                </div>
                <div className="donut-legend" style={{ flex: 1 }}>
                  {filasGasto.slice(0, 5).map((c) => (
                    <div className="donut-legend-row" key={c.id}>
                      <span className="sw" style={{ background: c.color }} />
                      <span className="name">{c.nombre}</span>
                      <span className="pct">{gastos > 0 ? `${((c.total / gastos) * 100).toFixed(0)}%` : "0%"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Distribución de ingresos</span>
              <span className="card-meta">{mesStr}</span>
            </div>
            {filasIngreso.length === 0 ? (
              <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>Sin ingresos este mes.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div className="donut-wrap" style={{ flexShrink: 0 }}>
                  <Donut
                    segments={filasIngreso.map((c) => ({ color: COLOR_INGRESO[c.id] ?? "#64748b", pct: ingresos > 0 ? (c.total / ingresos) * 100 : 0 }))}
                    delayMs={150}
                  />
                  <div className="donut-center">
                    <div className="val">{fmtMoney(ingresos)}</div>
                    <div className="lbl">{church.moneda}</div>
                  </div>
                </div>
                <div className="donut-legend" style={{ flex: 1 }}>
                  {filasIngreso.map((c) => (
                    <div className="donut-legend-row" key={c.id}>
                      <span className="sw" style={{ background: COLOR_INGRESO[c.id] ?? "#64748b" }} />
                      <span className="name">{c.nombre}</span>
                      <span className="pct">{ingresos > 0 ? `${((c.total / ingresos) * 100).toFixed(0)}%` : "0%"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

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
            <div>
              <div className="k">Depósitos bancarios</div>
              <div className="v">{fmtMoney(depositosMes)}</div>
            </div>
          </div>
        </div>

        {historial.length > 0 && (
          <>
            <div className="tx-head">
              <div className="tx-title">Resumen mensual</div>
            </div>
            <div className="data-table roomy">
              <div className="thead" style={{ gridTemplateColumns: RESUMEN_COLS }}>
                <div className="th">Mes</div>
                <div className="th" style={{ textAlign: "right" }}>Ingresos</div>
                <div className="th" style={{ textAlign: "right" }}>Gastos</div>
                <div className="th" style={{ textAlign: "right" }}>Balance</div>
                <div className="th" style={{ textAlign: "right" }}>Variación</div>
              </div>
              {historial.map((h, i) => {
                const bal = h.ingresos - h.gastos;
                const anterior = historial[i - 1];
                const balAnt = anterior ? anterior.ingresos - anterior.gastos : null;
                const variacion = balAnt === null ? null : pctChange(bal, balAnt);
                return (
                  <div className="tr" key={h.mes} style={{ gridTemplateColumns: RESUMEN_COLS }}>
                    <div className="td" style={{ fontWeight: 600 }}>{mesLegible(h.mes)}</div>
                    <div className="td" style={{ textAlign: "right", color: "#059669", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(h.ingresos)}
                    </div>
                    <div className="td" style={{ textAlign: "right", color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(h.gastos)}
                    </div>
                    <div className="td" style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(bal)}
                    </div>
                    <div className="td" style={{ textAlign: "right" }}>
                      {variacion === null ? (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      ) : (
                        <span className={`delta ${variacion >= 0 ? "good" : "bad"}`}>
                          {variacion >= 0 ? "+" : ""}{variacion}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {importOpen && (
        <ImportCsvModal
          church={church}
          onClose={() => setImportOpen(false)}
          onImported={onChanged}
        />
      )}
    </>
  );
}
