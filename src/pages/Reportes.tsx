import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, colorCategoria, currentMonth, fmtMoney, getCategoriasGasto, getCategoriasIngreso, insertTx, nowLocalIso,
  listMembers, memberStats,
  listDepositosPeriodo, mesLegible, monthDepositos, monthlySummary, monthTotals, nextMonth, pctChange, prevMonth,
  saldoAnteriorDe,
  yearCategoriaTotals, yearDepositos, yearMonthlySummary,
  type Church, type MonthSummary, type MonthTotals, type NewTx,
} from "../db";
import { exportReportPdf, printMonthlyReportPdf } from "../export";
import { exportAnnualReportPdf } from "../services/print/printAnnual";
import Delta from "../components/Delta";
import Donut from "../components/Donut";
import GenericCsvImportModal from "../components/GenericCsvImportModal";
import LoadingState from "../components/LoadingState";
import { CSV_TEMPLATE, MOVIMIENTOS_FIELDS, validarFilaMovimiento } from "../services/importCsv";
import { IconChevronLeft, IconChevronRight, IconClose, IconFileText, IconMonitor, IconPrinter, IconSparkles, IconUpload } from "../icons";
import HeaderMenu from "../components/HeaderMenu";
import Asamblea from "../components/Asamblea";
import { iaHabilitada, preguntarDatos, resumirReporte } from "../ia";
import { showToast } from "../toast";
import CountUp from "../components/CountUp";

const RESUMEN_COLS = "1fr 150px 150px 150px 130px";

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Reportes({ church, refreshKey, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [totalesAnt, setTotalesAnt] = useState<MonthTotals | null>(null);
  const [historial, setHistorial] = useState<MonthSummary[]>([]);
  const [depositosMes, setDepositosMes] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "print" | "anual" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mes, setMes] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [iaResumen, setIaResumen] = useState<string | null>(null);
  const [iaGenerando, setIaGenerando] = useState(false);
  const [pregOpen, setPregOpen] = useState(false);
  const [asambleaOpen, setAsambleaOpen] = useState(false);
  const [pregTexto, setPregTexto] = useState("");
  const [pregRespuesta, setPregRespuesta] = useState<string | null>(null);
  const [pregGenerando, setPregGenerando] = useState(false);
  const esMesActual = mes >= currentMonth();
  const mesStr = mesLegible(mes);
  const mesAnterior = prevMonth(mes);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      monthTotals(church.id, mes),
      monthTotals(church.id, mesAnterior),
      monthlySummary(church.id, 6),
      monthDepositos(church.id, mes),
    ])
      .then(([nuevosTotales, nuevosTotalesAnt, nuevoHistorial, nuevoDepositos]) => {
        if (cancelado) return;
        setTotales(nuevosTotales);
        setTotalesAnt(nuevosTotalesAnt);
        setHistorial(nuevoHistorial);
        setDepositosMes(nuevoDepositos);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, mes, mesAnterior]);

  /** Resumen del mes con IA. Regla de oro: la app CALCULA (aquí se arman las
   *  cifras ya listas) y la IA solo las narra — jamás inventa números. */
  async function resumirIA() {
    if (!totales) return;
    setIaGenerando(true);
    try {
      const lineas: string[] = [
        `Mes: ${mesStr}`,
        `Moneda: ${church.moneda}`,
        `Ingresos del mes: ${fmtMoney(totales.ingresos)}`,
        `Gastos del mes: ${fmtMoney(totales.gastos)}`,
        `Balance del mes: ${fmtMoney(totales.ingresos - totales.gastos)}`,
      ];
      if (totalesAnt) {
        lineas.push(
          `Mes anterior (${mesLegible(mesAnterior)}): ingresos ${fmtMoney(totalesAnt.ingresos)}, gastos ${fmtMoney(totalesAnt.gastos)}`,
        );
      }
      const cats = (m: Record<string, number>) =>
        Object.entries(m)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([c, v]) => `${catNombre(c)}: ${fmtMoney(v)}`)
          .join("; ");
      if (Object.keys(totales.porCategoriaIngreso).length) {
        lineas.push(`Ingresos por categoría: ${cats(totales.porCategoriaIngreso)}`);
      }
      if (Object.keys(totales.porCategoriaGasto).length) {
        lineas.push(`Gastos por categoría: ${cats(totales.porCategoriaGasto)}`);
      }
      if (depositosMes > 0) lineas.push(`Depositado al banco en el mes: ${fmtMoney(depositosMes)}`);
      const texto = await resumirReporte({
        datos: lineas.join("\n"),
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      setIaResumen(texto);
    } catch (e) {
      showToast(t("cartas.ia.error", { error: String((e as { message?: string })?.message ?? e) }));
    } finally {
      setIaGenerando(false);
    }
  }

  /** Pregunta sobre los datos. La app CALCULA todas las cifras (año, meses,
   *  categorías, depósitos y — solo si la pregunta menciona a un miembro —
   *  los aportes de ese miembro) y la IA responde únicamente con ellas. */
  async function preguntarIA() {
    const pregunta = pregTexto.trim();
    if (!pregunta) return;
    setPregGenerando(true);
    setPregRespuesta(null);
    try {
      const anio = mes.slice(0, 4);
      const [meses, catsAnio, depAnio] = await Promise.all([
        yearMonthlySummary(church.id, anio),
        yearCategoriaTotals(church.id, anio),
        yearDepositos(church.id, anio),
      ]);
      const ingAnio = meses.reduce((s, m) => s + m.ingresos, 0);
      const gasAnio = meses.reduce((s, m) => s + m.gastos, 0);
      const lineas: string[] = [
        `Hoy: ${nowLocalIso().slice(0, 10)} · Moneda: ${church.moneda}`,
        `Año ${anio} — ingresos: ${fmtMoney(ingAnio)}, gastos: ${fmtMoney(gasAnio)}, balance: ${fmtMoney(ingAnio - gasAnio)}`,
        `Depositado al banco en ${anio}: ${fmtMoney(depAnio)}`,
      ];
      const listaCats = (m: Record<string, number>) =>
        Object.entries(m).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${catNombre(c)}: ${fmtMoney(v)}`).join("; ");
      if (Object.keys(catsAnio.porCategoriaIngreso).length) {
        lineas.push(`Ingresos ${anio} por categoría: ${listaCats(catsAnio.porCategoriaIngreso)}`);
      }
      if (Object.keys(catsAnio.porCategoriaGasto).length) {
        lineas.push(`Gastos ${anio} por categoría: ${listaCats(catsAnio.porCategoriaGasto)}`);
      }
      lineas.push(`Por mes en ${anio}: ` + meses.map((m) => `${m.mes}: +${fmtMoney(m.ingresos)} / -${fmtMoney(m.gastos)}`).join(" · "));
      if (totales) {
        lineas.push(`Mes actual (${mesStr}) — ingresos: ${fmtMoney(totales.ingresos)}, gastos: ${fmtMoney(totales.gastos)}`);
      }
      // Privacidad: los aportes por persona solo se incluyen si la pregunta
      // menciona a ese miembro por nombre (máximo 3 coincidencias).
      const preguntaLower = pregunta.toLowerCase();
      const miembros = await listMembers(church.id);
      const mencionados = miembros.filter((m) =>
        m.nombre.toLowerCase().split(/\s+/).some((p) => p.length >= 4 && preguntaLower.includes(p)),
      ).slice(0, 3);
      if (mencionados.length) {
        const stats = await memberStats(church.id, anio);
        for (const m of mencionados) {
          const st = stats[m.id];
          lineas.push(
            st
              ? `Aportes de ${m.nombre} en ${anio}: ${fmtMoney(st.totalAnio)} (último: ${st.ultimoAporte ?? "—"})`
              : `Aportes de ${m.nombre} en ${anio}: ${fmtMoney(0)}`,
          );
        }
      }
      const texto = await preguntarDatos({
        pregunta,
        datos: lineas.join("\n"),
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      setPregRespuesta(texto);
    } catch (e) {
      showToast(t("cartas.ia.error", { error: String((e as { message?: string })?.message ?? e) }));
    } finally {
      setPregGenerando(false);
    }
  }

  const ingresos = totales?.ingresos ?? 0;
  const gastos = totales?.gastos ?? 0;
  const balance = ingresos - gastos;
  const balanceAnt = (totalesAnt?.ingresos ?? 0) - (totalesAnt?.gastos ?? 0);

  const filasIngreso = getCategoriasIngreso()
    .map((c) => ({ ...c, color: colorCategoria("ingreso", c.id), total: totales?.porCategoriaIngreso[c.id] ?? 0 }))
    .filter((c) => c.total > 0);
  const filasGasto = getCategoriasGasto()
    .map((c) => ({ ...c, color: colorCategoria("gasto", c.id), total: totales?.porCategoriaGasto[c.id] ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  /** Datos del estado financiero mensual. Es async porque el saldo anterior y
   *  el detalle de depósitos se consultan al momento de exportar/imprimir, no
   *  en cada render de la página. */
  async function buildReportData() {
    const [saldoAnterior, depositosDetalle] = await Promise.all([
      // saldo de apertura (Configuración → Iglesia) + acumulado de movimientos
      saldoAnteriorDe(church, mes),
      listDepositosPeriodo(church.id, mes),
    ]);
    return {
      church,
      mesLegibleStr: mesStr,
      periodoISO: mes,
      filasIngreso: filasIngreso.map((c) => ({ nombre: catNombre(c.id), total: c.total })),
      filasGasto: filasGasto.map((c) => ({ nombre: catNombre(c.id), total: c.total })),
      ingresos,
      gastos,
      balance,
      saldoAnterior,
      depositosBancarios: depositosMes,
      depositosDetalle,
      generatedBy: church.tesorero_nombre
        ? { nombre: church.tesorero_nombre, rol: church.tesorero_cargo ?? undefined }
        : undefined,
      firmaPath: church.tesorero_firma_path,
      firmaPastorPath: church.pastor_firma_path,
      logoPath: church.logo_path,
    };
  }

  async function handleExport(kind: "pdf") {
    setExportError(null);
    setExporting(kind);
    try {
      await exportReportPdf(await buildReportData());
    } catch (e) {
      setExportError(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setExporting(null);
    }
  }

  async function handleAnnual() {
    setExportError(null);
    setExporting("anual");
    try {
      const year = mes.slice(0, 4);
      const [meses, categorias, depositosBancarios] = await Promise.all([
        yearMonthlySummary(church.id, year),
        yearCategoriaTotals(church.id, year),
        yearDepositos(church.id, year),
      ]);
      await exportAnnualReportPdf({ church, year, meses, categorias, depositosBancarios });
    } catch (e) {
      setExportError(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setExporting(null);
    }
  }

  async function handlePrint() {
    setExportError(null);
    setExporting("print");
    try {
      await printMonthlyReportPdf(await buildReportData());
    } catch (e) {
      setExportError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("reportes.titulo")}</div>
          <div className="page-sub">{t("reportes.sub", { mes: mesStr })}</div>
        </div>
        <div className="header-actions">
          <div className="month-nav">
            <span className="icon-btn" title={t("mov.mesAnterior")} onClick={() => setMes(prevMonth(mes))}>
              <IconChevronLeft size={16} />
            </span>
            <span className="month-nav-label">{mesStr}</span>
            <span
              className={`icon-btn${esMesActual ? " disabled" : ""}`}
              title={t("mov.mesSiguiente")}
              onClick={() => !esMesActual && setMes(nextMonth(mes))}
            >
              <IconChevronRight size={16} />
            </span>
          </div>
          <button className="btn secondary" onClick={() => setAsambleaOpen(true)} disabled={loading || !totales}>
            <IconMonitor size={14} /> {t("reportes.asamblea.boton")}
          </button>
          {iaHabilitada && (
            <button className="btn ia" onClick={() => setPregOpen(true)}>
              <IconSparkles size={14} /> {t("reportes.pregunta.boton")}
            </button>
          )}
          {iaHabilitada && (
            <button className="btn ia" onClick={resumirIA} disabled={iaGenerando || loading || !totales}>
              <IconSparkles size={14} /> {iaGenerando ? t("cartas.ia.generando") : t("reportes.ia.boton")}
            </button>
          )}
          <HeaderMenu
            label={t("common.mas")}
            items={[
              { label: t("miembros.importarCsv"), icon: <IconUpload size={13} />, onClick: () => setImportOpen(true) },
              { label: exporting === "anual" ? t("common.generando") : t("anual.boton"), icon: <IconFileText size={13} />, disabled: exporting !== null, onClick: handleAnnual },
              { label: exporting === "print" ? t("common.preparando") : t("common.imprimir"), icon: <IconPrinter size={14} />, disabled: exporting !== null, onClick: handlePrint },
            ]}
          />
          <button className="btn primary" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? t("common.generando") : "PDF"}
          </button>
        </div>
      </div>
      {exportError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{exportError}</div>
        </div>
      )}

      <div className="content">
        {loading ? <LoadingState /> : <>
        <div className="dash-canvas">
        <div className="summary-4 enter">
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("dashboard.ingresosDelMes")}</span></div>
            <div className="stat-value md"><CountUp value={ingresos} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(ingresos, totalesAnt?.ingresos ?? 0)} /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("dashboard.gastosDelMes")}</span></div>
            <div className="stat-value md"><CountUp value={gastos} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(gastos, totalesAnt?.gastos ?? 0)} invert /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": balance >= 0 ? "var(--accent-1)" : "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("reportes.balanceNeto")}</span></div>
            <div className="stat-value md"><CountUp value={balance} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("reportes.mesAnterior")}</span></div>
            <div className="stat-value md"><CountUp value={balanceAnt} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot">{mesLegible(mesAnterior)}</div>
          </div>
        </div>

        <div className="charts enter">
          <div className="card">
            <div className="card-head">
              <span className="card-title">{t("reportes.distGastos")}</span>
              <span className="card-meta">{mesStr}</span>
            </div>
            {filasGasto.length === 0 ? (
              <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>{t("reportes.sinGastosEsteMes")}</div>
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
                      <span className="name">{catNombre(c.id)}</span>
                      <span className="pct">{gastos > 0 ? `${((c.total / gastos) * 100).toFixed(0)}%` : "0%"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">{t("reportes.distIngresos")}</span>
              <span className="card-meta">{mesStr}</span>
            </div>
            {filasIngreso.length === 0 ? (
              <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>{t("reportes.sinIngresosEsteMes")}</div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <div className="donut-wrap" style={{ flexShrink: 0 }}>
                  <Donut
                    segments={filasIngreso.map((c) => ({ color: c.color, pct: ingresos > 0 ? (c.total / ingresos) * 100 : 0 }))}
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
                      <span className="sw" style={{ background: c.color }} />
                      <span className="name">{catNombre(c.id)}</span>
                      <span className="pct">{ingresos > 0 ? `${((c.total / ingresos) * 100).toFixed(0)}%` : "0%"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="report-preview">
          <div className="r-head">
            <div>
              <div className="r-title-lg">{t("reportes.estadoFinanciero")}</div>
              <div className="r-church">{church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""}</div>
              <div className="r-period">{t("reportes.periodo", { mes: mesLegible(mes) })}</div>
            </div>
          </div>

          <div className="r-section-title">{t("reportes.ingresosPeriodo")}</div>
          {filasIngreso.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
              {t("reportes.sinIngresosRegistrados")}
            </div>
          )}
          {filasIngreso.map((c) => (
            <div className="r-row" key={c.id}>
              <span className="r-color" style={{ background: c.color }} />
              <span>{catNombre(c.id)}</span>
              <span className="r-amt">{fmtMoney(c.total)}</span>
              <span className="r-pct">{ingresos > 0 ? `${((c.total / ingresos) * 100).toFixed(1)}%` : "—"}</span>
            </div>
          ))}
          <div className="r-row total">
            <span></span>
            <span>{t("reportes.totalIngresos")}</span>
            <span className="r-amt" style={{ color: "var(--pos)" }}>{fmtMoney(ingresos)}</span>
            <span className="r-pct solo-escritorio" style={{ color: "var(--text)" }}>100%</span>
          </div>

          <div className="r-section-title">{t("reportes.gastosPeriodo")}</div>
          {filasGasto.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
              {t("reportes.sinGastosRegistrados")}
            </div>
          )}
          {filasGasto.map((c) => (
            <div className="r-row" key={c.id}>
              <span className="r-color" style={{ background: c.color }} />
              <span>{catNombre(c.id)}</span>
              <span className="r-amt">{fmtMoney(c.total)}</span>
              <span className="r-pct">{gastos > 0 ? `${((c.total / gastos) * 100).toFixed(1)}%` : "—"}</span>
            </div>
          ))}
          <div className="r-row total">
            <span></span>
            <span>{t("reportes.totalGastos")}</span>
            <span className="r-amt" style={{ color: "var(--neg)" }}>{fmtMoney(gastos)}</span>
            <span className="r-pct solo-escritorio" style={{ color: "var(--text)" }}>100%</span>
          </div>

          <div className="r-summary">
            <div className="r-dup">
              <div className="k">{t("reportes.totalIngresos")}</div>
              <div className="v" style={{ color: "var(--pos)" }}>{fmtMoney(ingresos)}</div>
            </div>
            <div className="r-dup">
              <div className="k">{t("reportes.totalGastos")}</div>
              <div className="v" style={{ color: "var(--neg)" }}>{fmtMoney(gastos)}</div>
            </div>
            <div>
              <div className="k">{t("reportes.balanceNeto")}</div>
              <div className="v">{fmtMoney(balance)}</div>
            </div>
            <div>
              <div className="k">{t("reportes.depositosBancarios")}</div>
              <div className="v">{fmtMoney(depositosMes)}</div>
              {depositosMes > 0 && (
                <div className="r-nota">{t("reportes.depositosNota")}</div>
              )}
            </div>
          </div>
        </div>

        {historial.length > 0 && (
          <>
            <div className="tx-head">
              <div className="tx-title">{t("reportes.resumenMensual")}</div>
            </div>
            <div className="data-table roomy tabla-resumen-mes">
              <div className="thead" style={{ gridTemplateColumns: RESUMEN_COLS }}>
                <div className="th">{t("reportes.colMes")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("charts.ingresos")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("charts.gastos")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("pdfPreview.balance")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("reportes.colVariacion")}</div>
              </div>
              {historial.map((h, i) => {
                const bal = h.ingresos - h.gastos;
                const anterior = historial[i - 1];
                const balAnt = anterior ? anterior.ingresos - anterior.gastos : null;
                const variacion = balAnt === null ? null : pctChange(bal, balAnt);
                return (
                  <div className="tr" key={h.mes} style={{ gridTemplateColumns: RESUMEN_COLS }}>
                    <div className="td" style={{ fontWeight: 600 }}>{mesLegible(h.mes)}</div>
                    <div className="td" data-label={t("charts.ingresos")} style={{ textAlign: "right", color: "var(--pos)", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(h.ingresos)}
                    </div>
                    <div className="td" data-label={t("charts.gastos")} style={{ textAlign: "right", color: "var(--neg)", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(h.gastos)}
                    </div>
                    <div className="td" data-label={t("pdfPreview.balance")} style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(bal)}
                    </div>
                    <div className="td" data-label={t("reportes.colVariacion")} style={{ textAlign: "right" }}>
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
        </>}
      </div>

      {importOpen && (
        <GenericCsvImportModal<NewTx>
          titulo={t("movImport.titulo")}
          subtitulo={t("movImport.sub")}
          instrucciones={t("movImport.instrucciones")}
          fields={MOVIMIENTOS_FIELDS}
          templateCsv={CSV_TEMPLATE}
          templateFileName="plantilla-movimientos.csv"
          validarFila={(row) => validarFilaMovimiento(row, nowLocalIso().slice(0, 10))}
          previewColsTemplate="104px 68px 1fr 110px"
          previewColumns={[
            { label: t("movImport.colFecha"), render: (tx) => tx.fecha.slice(0, 10) },
            { label: t("movImport.colTipo"), render: (tx) => (tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto")) },
            { label: t("movImport.colConcepto"), render: (tx) => tx.concepto, title: (tx) => tx.concepto },
            { label: t("movImport.colMonto"), align: "right", render: (tx) => `$${tx.monto.toLocaleString("en-US")}` },
          ]}
          etiquetaItem={(n) => t("movImport.items", { count: n })}
          onConfirmar={async (items) => {
            for (const tx of items) await insertTx(church.id, church.moneda, tx);
          }}
          onClose={() => setImportOpen(false)}
          onImportado={onChanged}
        />
      )}

      {asambleaOpen && totales && (
        <Asamblea church={church} mesStr={mesStr} totales={totales} onClose={() => setAsambleaOpen(false)} />
      )}

      {pregOpen && (
        <div className="modal-overlay hoja-ia" onClick={(e) => { if (e.target === e.currentTarget && !pregGenerando) setPregOpen(false); }}>
          <div className="modal-card hoja-ia" style={{ width: 560 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title modal-title-ia"><IconSparkles size={17} /> {t("reportes.pregunta.titulo")}</div>
                <div className="modal-sub">{t("reportes.pregunta.sub")}</div>
              </div>
              <div className="modal-close" onClick={() => { if (!pregGenerando) setPregOpen(false); }}><IconClose /></div>
            </div>
            <div className="ia-cuerpo">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  autoFocus
                  placeholder={t("reportes.pregunta.placeholder")}
                  value={pregTexto}
                  onChange={(e) => setPregTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") preguntarIA(); }}
                  disabled={pregGenerando}
                />
                <button className="btn ia-primary" onClick={preguntarIA} disabled={pregGenerando || !pregTexto.trim()}>
                  <IconSparkles size={14} /> {pregGenerando ? t("reportes.pregunta.pensando") : t("reportes.pregunta.preguntar")}
                </button>
              </div>
              {pregRespuesta && (
                <div className="form-subcard" style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 14.5, padding: "12px 14px" }}>
                  {pregRespuesta}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>{t("reportes.ia.nota")}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button className="btn secondary" onClick={() => setPregOpen(false)} disabled={pregGenerando}>{t("common.cerrar")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {iaResumen && (
        <div className="modal-overlay hoja-ia" onClick={(e) => { if (e.target === e.currentTarget) setIaResumen(null); }}>
          <div className="modal-card hoja-ia" style={{ width: 560 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title modal-title-ia"><IconSparkles size={17} /> {t("reportes.ia.titulo", { mes: mesStr })}</div>
                <div className="modal-sub">{t("reportes.ia.nota")}</div>
              </div>
              <div className="modal-close" onClick={() => setIaResumen(null)}><IconClose /></div>
            </div>
            <div className="ia-cuerpo" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 14.5 }}>
              {iaResumen}
            </div>
            <div className="ia-acciones">
              <button className="btn secondary" onClick={() => setIaResumen(null)}>{t("common.cerrar")}</button>
              <button
                className="btn primary"
                onClick={() => {
                  navigator.clipboard.writeText(iaResumen).then(
                    () => showToast(t("reportes.ia.copiado")),
                    () => {},
                  );
                }}
              >
                {t("reportes.ia.copiar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
