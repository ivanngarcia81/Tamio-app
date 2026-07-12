import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CATEGORIAS_GASTO, categoriaInfo, currentMonth, currentYear, dailyTotals, fmtFechaCorta,
  fmtMoney, fmtRelativo, lastActivityAt, listTx, mesLegible, monthTotals, pctChange, prevMonth,
  yearTotals,
  type Church, type DailyPoint, type MonthTotals, type Tx, type YearTotals,
} from "../db";
import TxList, { EmptyState } from "../components/TxList";
import Sparkline from "../components/Sparkline";
import { IconArrowDown, IconArrowUp, IconMiembros, IconPlus } from "../icons";

interface Props {
  church: Church;
  refreshKey: number;
  memberCount: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  onNew: () => void;
}

function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return null;
  const rising = pct >= 0;
  const good = invert ? !rising : rising;
  return (
    <span className={`delta ${good ? "good" : "bad"}`}>
      {rising ? <IconArrowUp size={10} strokeWidth={3} /> : <IconArrowDown size={10} strokeWidth={3} />}
      {Math.abs(pct)}%
    </span>
  );
}

function buildDualLine(dias: DailyPoint[]) {
  if (dias.length < 2) return null;
  const width = 600;
  const height = 170;
  const max = Math.max(...dias.flatMap((d) => [d.ingresos, d.gastos]), 1);
  const stepX = width / (dias.length - 1);
  const toY = (v: number) => height - (v / max) * height;
  const pathFor = (key: "ingresos" | "gastos") =>
    dias.map((d, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${toY(d[key]).toFixed(1)}`).join(" ");
  return {
    ingresoPath: pathFor("ingresos"),
    gastoPath: pathFor("gastos"),
    width,
    height,
    labelInicio: fmtFechaCorta(dias[0].fecha),
    labelMedio: fmtFechaCorta(dias[Math.floor(dias.length / 2)].fecha),
    labelFin: fmtFechaCorta(dias[dias.length - 1].fecha),
  };
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

  const lineChart = useMemo(() => buildDualLine(dias), [dias]);

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
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> Nuevo registro
          </button>
        </div>
      </div>

      <div className="content">
        <div className="summary-4 enter">
          <div className="stat-card">
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

          <div className="stat-card">
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

          <div className="stat-card">
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

          <div className="stat-card">
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
                <span className={`tag ${categoriaTopGasto.info.tagClass}`} style={{ justifySelf: "start" }}>
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
                <span className={`tag ${ingresoMasFrecuente.info.tagClass}`} style={{ justifySelf: "start" }}>
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
            </div>
            <div className="stat-value md">{fmtRelativo(ultimaActividad)}</div>
            <div className="stat-pct">
              {ultimaActividad ? fmtFechaCorta(ultimaActividad) : "Sin movimientos registrados"}
            </div>
          </div>
        </div>

        <div className="charts enter">
          <div className="card">
            <div className="card-head">
              <span className="card-title">Ingresos vs. gastos</span>
              <span className="card-meta">Últimos 30 días</span>
            </div>
            <div className="line-wrap">
              {lineChart && (
                <svg className="line-chart" viewBox={`0 0 ${lineChart.width} ${lineChart.height}`} preserveAspectRatio="none">
                  <path d={lineChart.gastoPath} fill="none" stroke="var(--accent-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={lineChart.ingresoPath} fill="none" stroke="var(--accent-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {lineChart && (
              <div className="line-axis">
                <span>{lineChart.labelInicio}</span>
                <span>{lineChart.labelMedio}</span>
                <span>{lineChart.labelFin}</span>
              </div>
            )}
            <div className="legend">
              <span><span className="dot" style={{ background: "var(--accent-1)" }} /> Ingresos</span>
              <span><span className="dot" style={{ background: "var(--accent-2)" }} /> Gastos</span>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Distribución de gastos</span>
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
