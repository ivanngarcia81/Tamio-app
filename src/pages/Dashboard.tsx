import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import {
  CATEGORIAS_GASTO, CATEGORIAS_INGRESO, categoriaInfo, currentMonth, currentYear, dailyTotals,
  fmtFechaCorta, fmtMoney, fmtRelativo, lastActivityAt, listTx, mesLegible, monthIngresosTransferencia,
  monthTotals, pctChange, prevMonth, yearTotals,
  type Church, type DailyPoint, type MonthTotals, type Tx, type YearTotals,
} from "../db";
import TxList, { EmptyState } from "../components/TxList";
import Sparkline from "../components/Sparkline";
import Delta from "../components/Delta";
import DashboardCharts from "../components/DashboardCharts";
import { printDashboard } from "../services/print/printDashboard";
import { IconArrowDown, IconArrowUp, IconClock, IconMiembros, IconPlus, IconPrinter } from "../icons";

interface Props {
  church: Church;
  refreshKey: number;
  memberCount: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  onNew: () => void;
}

function accentStyle(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

function fechaCortaSinAnio(fecha: string): string {
  return fmtFechaCorta(fecha).split(" ").slice(0, 2).join(" ");
}

function toWeeklyBuckets(dias: DailyPoint[]) {
  const buckets: { label: string; ingresos: number; gastos: number }[] = [];
  for (let i = 0; i < dias.length; i += 7) {
    const slice = dias.slice(i, i + 7);
    buckets.push({
      label: fechaCortaSinAnio(slice[0].fecha),
      ingresos: slice.reduce((s, d) => s + d.ingresos, 0),
      gastos: slice.reduce((s, d) => s + d.gastos, 0),
    });
  }
  return buckets;
}

function toCumulativeBalance(dias: DailyPoint[]) {
  let acc = 0;
  return dias.map((d) => {
    acc += d.ingresos - d.gastos;
    return { label: fechaCortaSinAnio(d.fecha), balance: acc };
  });
}

export default function Dashboard({ church, refreshKey, memberCount, onEditTx, onChanged, onNew }: Props) {
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [totalesAnt, setTotalesAnt] = useState<MonthTotals | null>(null);
  const [anio, setAnio] = useState<YearTotals | null>(null);
  const [dias, setDias] = useState<DailyPoint[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [ultimaActividad, setUltimaActividad] = useState<string | null>(null);
  const mes = currentMonth();
  const mesAnterior = prevMonth(mes);

  useEffect(() => {
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
    monthTotals(church.id, mesAnterior).then(setTotalesAnt).catch(console.error);
    yearTotals(church.id, currentYear()).then(setAnio).catch(console.error);
    dailyTotals(church.id, 30).then(setDias).catch(console.error);
    listTx(church.id, { limit: 30 }).then(setTxs).catch(console.error);
    lastActivityAt(church.id).then(setUltimaActividad).catch(console.error);
  }, [church.id, refreshKey, mes, mesAnterior]);

  const ingresos = totales?.ingresos ?? 0;
  const gastos = totales?.gastos ?? 0;
  const balance = ingresos - gastos;
  const ingresosAnt = totalesAnt?.ingresos ?? 0;
  const gastosAnt = totalesAnt?.gastos ?? 0;
  const balanceAnt = ingresosAnt - gastosAnt;
  const balanceAnio = (anio?.ingresos ?? 0) - (anio?.gastos ?? 0);

  const categoriaTopGasto = useMemo(() => {
    const entries = Object.entries(totales?.porCategoriaGasto ?? {});
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const [id, monto] = entries[0];
    return { info: categoriaInfo("gasto", id), monto, pct: gastos > 0 ? Math.round((monto / gastos) * 100) : 0 };
  }, [totales, gastos]);

  const ingresoMasFrecuente = useMemo(() => {
    const entries = Object.entries(totales?.conteoCategoriaIngreso ?? {});
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const [id, cnt] = entries[0];
    return { info: categoriaInfo("ingreso", id), cnt };
  }, [totales]);

  const topGastos = useMemo(() => {
    const entries = Object.entries(totales?.porCategoriaGasto ?? {})
      .map(([id, monto]) => {
        const cat = CATEGORIAS_GASTO.find((c) => c.id === id);
        return { id, nombre: cat?.nombre ?? id, color: cat?.color ?? "#64748b", monto };
      })
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);
    const max = entries[0]?.monto ?? 0;
    return entries.map((e) => ({ ...e, barPct: max > 0 ? Math.round((e.monto / max) * 100) : 0 }));
  }, [totales]);

  const weekly = useMemo(() => toWeeklyBuckets(dias), [dias]);
  const balanceSeries = useMemo(() => toCumulativeBalance(dias), [dias]);

  const categoriasIngreso = useMemo(
    () =>
      CATEGORIAS_INGRESO
        .map((c) => ({ nombre: c.nombre, monto: totales?.porCategoriaIngreso[c.id] ?? 0 }))
        .filter((c) => c.monto > 0),
    [totales]
  );
  const categoriasGasto = useMemo(
    () =>
      CATEGORIAS_GASTO
        .map((c) => ({ nombre: c.nombre, monto: totales?.porCategoriaGasto[c.id] ?? 0 }))
        .filter((c) => c.monto > 0)
        .sort((a, b) => b.monto - a.monto),
    [totales]
  );

  const chartsRef = useRef<HTMLDivElement>(null);
  const categoryChartRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  async function captureChart(el: HTMLElement | null, caption: string) {
    if (!el) return null;
    try {
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 });
      return { dataUrl: canvas.toDataURL("image/png"), caption };
    } catch {
      return null;
    }
  }

  async function handlePrint() {
    setPrintError(null);
    setPrinting(true);
    try {
      const depositosBancarios = await monthIngresosTransferencia(church.id, mes);
      const charts = (
        await Promise.all([
          captureChart(chartsRef.current, "Ingresos vs. gastos y evolución del balance"),
          captureChart(categoryChartRef.current, "Distribución de gastos por categoría"),
        ])
      ).filter((c): c is { dataUrl: string; caption: string } => c !== null);

      await printDashboard({
        church,
        mesLegibleStr: mesLegible(mes),
        periodoISO: mes,
        generatedBy: church.tesorero_nombre
          ? { nombre: church.tesorero_nombre, rol: church.tesorero_cargo ?? undefined }
          : undefined,
        firmaPath: church.tesorero_firma_path,
        logoPath: church.logo_path,
        resumen: {
          balanceInicial: balanceAnt,
          ingresos,
          gastos,
          balanceFinal: balance,
          depositosBancarios,
          diezmos: totales?.porCategoriaIngreso["diezmo"] ?? 0,
          ofrendas: totales?.porCategoriaIngreso["ofrenda"] ?? 0,
        },
        indicadores: {
          ingresosDelMes: ingresos,
          gastosDelMes: gastos,
          balanceDelMes: balance,
          balanceDelAnio: balanceAnio,
          mayorGasto: categoriaTopGasto
            ? { nombre: categoriaTopGasto.info.nombre, monto: categoriaTopGasto.monto }
            : null,
          ingresoMasFrecuente: ingresoMasFrecuente
            ? { nombre: ingresoMasFrecuente.info.nombre, conteo: ingresoMasFrecuente.cnt }
            : null,
          miembrosActivos: memberCount,
          ultimaActualizacion: `${fmtRelativo(ultimaActividad)}${ultimaActividad ? " · " + fmtFechaCorta(ultimaActividad) : ""}`,
        },
        categoriasIngreso,
        categoriasGasto,
        charts,
      });
    } catch (e) {
      setPrintError(`No se pudo imprimir: ${e}`);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="balance">
            <div className="amount">{fmtMoney(balance)}</div>
            <div className="currency">{church.moneda}</div>
          </div>
          <div className="balance-sub">Balance del mes · {mesLegible(mes)}</div>
        </div>
        <div className="header-actions">
          <button className="btn secondary" onClick={handlePrint} disabled={printing}>
            <IconPrinter size={14} /> {printing ? "Preparando…" : "Imprimir"}
          </button>
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> Nuevo registro
          </button>
        </div>
      </div>

      {printError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{printError}</div>
        </div>
      )}

      <div className="content">
        <div ref={chartsRef}>
          <DashboardCharts weekly={weekly} balanceSeries={balanceSeries} moneda={church.moneda} />
        </div>

        <div className="summary-4 enter">
          <div className="stat-card accent" style={accentStyle("var(--accent-1)")}>
            <div className="stat-head">
              <span className="stat-label">Ingresos del mes</span>
              <div className="stat-icon up"><IconArrowUp size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-row">
              <div className="stat-value md">
                {fmtMoney(ingresos)}<span className="stat-cur">{church.moneda}</span>
              </div>
              <Sparkline data={dias.map((d) => d.ingresos)} color="var(--accent-1)" />
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(ingresos, ingresosAnt)} /> vs. mes anterior
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle("var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">Gastos del mes</span>
              <div className="stat-icon down"><IconArrowDown size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-row">
              <div className="stat-value md">
                {fmtMoney(gastos)}<span className="stat-cur">{church.moneda}</span>
              </div>
              <Sparkline data={dias.map((d) => d.gastos)} color="var(--accent-2)" />
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(gastos, gastosAnt)} invert /> vs. mes anterior
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle(balance >= 0 ? "var(--accent-1)" : "var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">Balance del mes</span>
              <div className="stat-icon neutral"><IconArrowUp size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-value md">
              {fmtMoney(balance)}<span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(balance, balanceAnt)} /> vs. mes anterior
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle(balanceAnio >= 0 ? "var(--accent-3)" : "var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">Balance del año</span>
              <div className="stat-icon neutral"><IconArrowUp size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-value md">
              {fmtMoney(balanceAnio)}<span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              {currentYear()} · Ingresos {fmtMoney(anio?.ingresos ?? 0)} · Gastos {fmtMoney(anio?.gastos ?? 0)}
            </div>
          </div>
        </div>

        <div className="summary-4 enter">
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Mayor gasto</span>
            </div>
            {categoriaTopGasto ? (
              <>
                <span className={`tag ${categoriaTopGasto.info.tagClass}`} style={{ justifySelf: "start" }} title={categoriaTopGasto.info.nombre}>
                  {categoriaTopGasto.info.nombre}
                </span>
                <div className="stat-value md">
                  {fmtMoney(categoriaTopGasto.monto)}<span className="stat-cur">{church.moneda}</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${categoriaTopGasto.pct}%`, background: "var(--accent-2)" }} />
                </div>
                <div className="stat-pct">{categoriaTopGasto.pct}% del gasto del mes</div>
              </>
            ) : (
              <div className="stat-pct">Sin gastos este mes</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Ingreso más frecuente</span>
            </div>
            {ingresoMasFrecuente ? (
              <>
                <span className={`tag ${ingresoMasFrecuente.info.tagClass}`} style={{ justifySelf: "start" }} title={ingresoMasFrecuente.info.nombre}>
                  {ingresoMasFrecuente.info.nombre}
                </span>
                <div className="stat-value md">
                  {ingresoMasFrecuente.cnt}<span className="stat-cur">movimientos</span>
                </div>
              </>
            ) : (
              <div className="stat-pct">Sin ingresos este mes</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Miembros activos</span>
              <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={2} /></div>
            </div>
            <div className="stat-value md">{memberCount}</div>
            <Link to="/miembros" className="stat-foot" style={{ textDecoration: "underline" }}>
              Ver miembros
            </Link>
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Última actualización</span>
              <div className="stat-icon neutral"><IconClock size={14} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{fmtRelativo(ultimaActividad)}</div>
            <div className="stat-pct">
              {ultimaActividad ? fmtFechaCorta(ultimaActividad) : "Sin movimientos registrados"}
            </div>
          </div>
        </div>

        <div className="card enter" ref={categoryChartRef}>
          <div className="card-head">
            <span className="card-title">Distribución de gastos por categoría</span>
            <span className="card-meta">{mesLegible(mes)}</span>
          </div>
          {topGastos.length === 0 ? (
            <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>Sin gastos este mes.</div>
          ) : (
            topGastos.map((g) => (
              <div className="hbar-row" key={g.id}>
                <span className="hbar-label">{g.nombre}</span>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${g.barPct}%`, background: g.color }} />
                </div>
                <span className="hbar-val">{fmtMoney(g.monto)}</span>
              </div>
            ))
          )}
        </div>

        <div className="tx-head">
          <div className="tx-title">Movimientos recientes</div>
        </div>

        {txs.length === 0 ? (
          <EmptyState
            titulo="Aún no hay movimientos"
            sub="Usa el botón 'Nuevo registro' para registrar tu primer ingreso o gasto."
          />
        ) : (
          <TxList txs={txs} onEdit={onEditTx} onChanged={onChanged} />
        )}
      </div>
    </>
  );
}
