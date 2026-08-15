import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  catNombre, categoriaInfo, currentMonth, currentYear, dailyTotals, getCategoriasGasto, getCategoriasIngreso,
  fmtFechaCorta, fmtMoney, fmtRelativo, lastActivityAt, listTx, mesLegible, monthDepositos,
  monthTotals, pctChange, prevMonth, yearTotals,
  type Church, type DailyPoint, type MonthTotals, type Tx, type YearTotals,
} from "../db";
import TxList, { EmptyState } from "../components/TxList";
import Sparkline from "../components/Sparkline";
import Delta from "../components/Delta";
import CountUp from "../components/CountUp";
import DashboardCharts from "../components/DashboardCharts";
import { printDashboard } from "../services/print/printDashboard";
import { IconArrowDown, IconArrowUp, IconClock, IconMiembros, IconPlus, IconPrinter } from "../icons";
import { CERO, restar } from "../dinero";

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

/** Franja del día según la hora local, para el saludo del encabezado. */
function franjaDelDia(): "manana" | "tarde" | "noche" {
  const h = new Date().getHours();
  if (h < 12) return "manana";
  if (h < 19) return "tarde";
  return "noche";
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
  const { t } = useTranslation();
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

  const ingresos = totales?.ingresos ?? CERO;
  const gastos = totales?.gastos ?? CERO;
  const balance = restar(ingresos, gastos);

  // Refleja el balance del mes en el menú de la barra de menús de macOS,
  // para verlo de un vistazo sin abrir la ventana.
  useEffect(() => {
    if (!totales) return;
    invoke("tray_balance", {
      texto: `${t("dashboard.balanceDelMes", { mes: mesLegible(mes) })}: ${fmtMoney(balance)} ${church.moneda}`,
    }).catch(() => {});
  }, [totales, balance, church.moneda, mes, t]);
  const ingresosAnt = totalesAnt?.ingresos ?? CERO;
  const gastosAnt = totalesAnt?.gastos ?? CERO;
  const balanceAnt = restar(ingresosAnt, gastosAnt);
  const balanceAnio = restar(anio?.ingresos ?? CERO, anio?.gastos ?? CERO);

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
        const cat = getCategoriasGasto().find((c) => c.id === id);
        return { id, nombre: cat ? catNombre(cat.id) : id, color: cat?.color ?? "#64748b", monto };
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
      getCategoriasIngreso()
        .map((c) => ({ nombre: catNombre(c.id), monto: totales?.porCategoriaIngreso[c.id] ?? CERO }))
        .filter((c) => c.monto > 0),
    [totales]
  );
  const categoriasGasto = useMemo(
    () =>
      getCategoriasGasto()
        .map((c) => ({ nombre: catNombre(c.id), monto: totales?.porCategoriaGasto[c.id] ?? CERO }))
        .filter((c) => c.monto > 0)
        .sort((a, b) => b.monto - a.monto),
    [totales]
  );

  const chartsRef = useRef<HTMLDivElement>(null);
  const categoryChartRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  async function handlePrint() {
    setPrintError(null);
    setPrinting(true);
    try {
      const depositosBancarios = await monthDepositos(church.id, mes);

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
          diezmos: totales?.porCategoriaIngreso["diezmo"] ?? CERO,
          ofrendas: totales?.porCategoriaIngreso["ofrenda"] ?? CERO,
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
          // En un PDF archivado no va tiempo relativo ("hace un momento"):
          // se usa la fecha absoluta de la última actividad.
          ultimaActualizacion: ultimaActividad ? fmtFechaCorta(ultimaActividad) : "—",
        },
        categoriasIngreso,
        categoriasGasto,
      });
    } catch (e) {
      setPrintError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="dash-saludo">{t(`dashboard.saludo.${franjaDelDia()}`)}</div>
          <div className="balance">
            {/* La cifra que el tesorero mira primero también comunica el signo,
                con la misma semántica de color que las tarjetas de abajo. */}
            <div className={`amount ${balance >= 0 ? "pos" : "neg"}`}>
              <CountUp value={balance} format={fmtMoney} paso={100} />
            </div>
            <div className="currency">{church.moneda}</div>
          </div>
          <div className="balance-sub">{t("dashboard.balanceDelMes", { mes: mesLegible(mes) })}</div>
        </div>
        <div className="header-actions">
          <button className="btn secondary" onClick={handlePrint} disabled={printing}>
            <IconPrinter size={14} /> {printing ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button className="btn primary" onClick={onNew} title={`${t("dashboard.nuevoRegistro")}  ⌘N`}>
            <IconPlus size={14} /> {t("dashboard.nuevoRegistro")}
          </button>
        </div>
      </div>

      {printError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{printError}</div>
        </div>
      )}

      <div className="content">
        {/* Lienzo único: gráficas, métricas y desglose comparten un solo panel
            gris claro para verse como un dashboard unificado. */}
        <div className="dash-canvas">
        <div ref={chartsRef}>
          <DashboardCharts weekly={weekly} balanceSeries={balanceSeries} moneda={church.moneda} />
        </div>

        <div className="summary-4 enter">
          <div className="stat-card accent" style={accentStyle("var(--accent-1)")}>
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.ingresosDelMes")}</span>
              <div className="stat-icon up"><IconArrowUp size={16} strokeWidth={2.2} /></div>
            </div>
            <div className="stat-row">
              <div className="stat-value md">
                <CountUp value={ingresos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
              </div>
              <Sparkline data={dias.map((d) => d.ingresos)} color="var(--accent-1)" />
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(ingresos, ingresosAnt)} /> {t("dashboard.vsMesAnterior")}
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle("var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.gastosDelMes")}</span>
              <div className="stat-icon down"><IconArrowDown size={16} strokeWidth={2.2} /></div>
            </div>
            <div className="stat-row">
              <div className="stat-value md">
                <CountUp value={gastos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
              </div>
              <Sparkline data={dias.map((d) => d.gastos)} color="var(--accent-2)" />
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(gastos, gastosAnt)} invert /> {t("dashboard.vsMesAnterior")}
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle(balance >= 0 ? "var(--accent-1)" : "var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.balanceDelMesLabel")}</span>
              {/* El icono sigue el signo, igual que el color de acento de la
                  tarjeta. Antes era una flecha hacia arriba fija: con saldo
                  negativo la tarjeta decía "sube" mientras el pie decía ↓. */}
              <div className={`stat-icon ${balance >= 0 ? "up" : "down"}`}>
                {balance >= 0
                  ? <IconArrowUp size={16} strokeWidth={2.2} />
                  : <IconArrowDown size={16} strokeWidth={2.2} />}
              </div>
            </div>
            <div className="stat-value md">
              <CountUp value={balance} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              <Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}
            </div>
          </div>

          <div className="stat-card accent" style={accentStyle(balanceAnio >= 0 ? "var(--accent-3)" : "var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.balanceDelAnio")}</span>
              <div className={`stat-icon ${balanceAnio >= 0 ? "up" : "down"}`}>
                {balanceAnio >= 0
                  ? <IconArrowUp size={16} strokeWidth={2.2} />
                  : <IconArrowDown size={16} strokeWidth={2.2} />}
              </div>
            </div>
            <div className="stat-value md">
              <CountUp value={balanceAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              {t("dashboard.anioResumen", { anio: currentYear(), ingresos: fmtMoney(anio?.ingresos ?? CERO), gastos: fmtMoney(anio?.gastos ?? CERO) })}
            </div>
          </div>
        </div>

        <div className="summary-4 enter">
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.mayorGasto")}</span>
            </div>
            {categoriaTopGasto ? (
              <>
                <span className={`tag ${categoriaTopGasto.info.tagClass}`} style={{ justifySelf: "start" }} title={categoriaTopGasto.info.nombre}>
                  {categoriaTopGasto.info.nombre}
                </span>
                <div className="stat-value md">
                  <CountUp value={categoriaTopGasto.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${categoriaTopGasto.pct}%`, background: "var(--accent-2)" }} />
                </div>
                <div className="stat-pct">{t("dashboard.pctDelGasto", { pct: categoriaTopGasto.pct })}</div>
              </>
            ) : (
              <div className="stat-pct">{t("dashboard.sinGastosEsteMes")}</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.ingresoMasFrecuente")}</span>
            </div>
            {ingresoMasFrecuente ? (
              <>
                <span className={`tag ${ingresoMasFrecuente.info.tagClass}`} style={{ justifySelf: "start" }} title={ingresoMasFrecuente.info.nombre}>
                  {ingresoMasFrecuente.info.nombre}
                </span>
                <div className="stat-value md">
                  {ingresoMasFrecuente.cnt}<span className="stat-cur">{t("dashboard.movimientosUnidad")}</span>
                </div>
              </>
            ) : (
              <div className="stat-pct">{t("dashboard.sinIngresosEsteMes")}</div>
            )}
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.miembrosActivos")}</span>
              <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={2} /></div>
            </div>
            <div className="stat-value md">{memberCount}</div>
            <Link to="/miembros" className="stat-foot" style={{ textDecoration: "underline" }}>
              {t("dashboard.verMiembros")}
            </Link>
          </div>

          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">{t("dashboard.ultimaActualizacion")}</span>
              <div className="stat-icon neutral"><IconClock size={14} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{fmtRelativo(ultimaActividad)}</div>
            <div className="stat-pct">
              {ultimaActividad ? fmtFechaCorta(ultimaActividad) : t("dashboard.sinMovimientosRegistrados")}
            </div>
          </div>
        </div>

        <div className="card enter" ref={categoryChartRef}>
          <div className="card-head">
            <span className="card-title">{t("dashboard.distribucionGastos")}</span>
            <span className="card-meta">{mesLegible(mes)}</span>
          </div>
          {topGastos.length === 0 ? (
            <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>{t("dashboard.sinGastosEsteMesPunto")}</div>
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
          <div className="tx-title">{t("dashboard.movimientosRecientes")}</div>
        </div>

        {txs.length === 0 ? (
          <EmptyState
            titulo={t("dashboard.emptyTitulo")}
            sub={t("dashboard.emptySub")}
            accion={{ label: t("dashboard.nuevoRegistro"), onClick: onNew }}
            duplicaCrear
          />
        ) : (
          <TxList txs={txs} onEdit={onEditTx} onChanged={onChanged} />
        )}
      </div>
    </>
  );
}
