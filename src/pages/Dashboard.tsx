import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBarraEstado } from "../components/BarraEstado";
import { invoke } from "@tauri-apps/api/core";
import {
  catNombre, categoriaInfo, countPendingTx, currentMonth, currentYear, dailyTotals, getCategoriasGasto, getCategoriasIngreso,
  fmtFecha, fmtFechaCorta, fmtMoney, fmtRelativo, hoyISO, lastActivityAt, listActividades, listTx, mesLegible,
  metodoNombre, monthDepositos, monthTotals, pctChange, prevMonth, yearTotals,
  type Church, type DailyPoint, type MonthTotals, type Tx, type YearTotals,
} from "../db";
import { expandirTodas, type OcurrenciaVista } from "../services/agenda/recurrencia";
import TxList, { EmptyState } from "../components/TxList";
import Delta from "../components/Delta";
import CountUp from "../components/CountUp";
import DashboardCharts from "../components/DashboardCharts";
import { printDashboard } from "../services/print/printDashboard";
import { IconArrowDown, IconArrowUp, IconClock, IconMiembros, IconPlus, IconPrinter } from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import { CERO, restar } from "../dinero";
import { esIPad, esIPhone, esMac } from "../movil";

interface Props {
  church: Church;
  refreshKey: number;
  memberCount: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  onNew: () => void;
}

const IosChevron = () => (
  <span className="ios-chevron" aria-hidden="true">
    <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
  </span>
);

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

/** "15 ago" / "Aug 15" — la fecha del eje, sin año.
 *
 *  BUG: antes se quedaba con los dos primeros trozos separados por espacio, y
 *  en inglés `fmtFechaCorta` devuelve "Aug 15, 2026" —la coma separa el día
 *  del año—, así que el eje salía "Aug 15," con una coma colgando. En español
 *  ("15 ago 2026") no se notaba, y por eso duró. Ahora se quita el año con su
 *  coma, que es lo que de verdad sobra, en vez de contar palabras. */
function fechaCortaSinAnio(fecha: string): string {
  return fmtFechaCorta(fecha).replace(/,?\s*\d{4}$/, "");
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
  // Igual que en Miembros.tsx: el carrusel/la barra ya sitúan la pantalla, y
  // en el teléfono manda el idioma de panel. Mac no cambia.
  const enIPhone = esIPhone();
  const enMac = esMac();
  /* El Inicio del iPad tiene diseño propio (handoff, docs/ipad-rediseno.md):
     saludo grande en el contenido, fila de cuatro KPI con "Por revisar", y
     "Últimos movimientos" y "Esta semana" a dos columnas. */
  const enIPad = esIPad();
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

  /* Lo que solo pide el Inicio del iPad: el conteo de la bandeja (la misma
     consulta del badge del sidebar) y lo de la próxima semana de la Agenda
     — las mismas ocurrencias reales de `expandirTodas`, no una copia. */
  const [pendientes, setPendientes] = useState(0);
  const [semana, setSemana] = useState<OcurrenciaVista[]>([]);
  useEffect(() => {
    if (!enIPad) return;
    countPendingTx(church.id).then(setPendientes).catch(console.error);
    listActividades(church.id)
      .then((acts) => {
        const desde = hoyISO();
        const [y, m, d] = desde.split("-").map(Number);
        const fin = new Date(y, m - 1, d + 6);
        const p = (x: number) => String(x).padStart(2, "0");
        const hasta = `${fin.getFullYear()}-${p(fin.getMonth() + 1)}-${p(fin.getDate())}`;
        const ocurrencias = expandirTodas(acts, desde, hasta)
          .filter((o) => o.estado !== "cancelada")
          .sort((a, b) => (a.fecha === b.fecha
            ? (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
            : a.fecha.localeCompare(b.fecha)));
        setSemana(ocurrencias.slice(0, 4));
      })
      .catch(console.error);
    // `enIPad` es constante durante la sesión (clase puesta antes de montar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, refreshKey]);

  const ingresos = totales?.ingresos ?? CERO;
  const gastos = totales?.gastos ?? CERO;
  const balance = restar(ingresos, gastos);

  /* Pie de ventana (solo Mac). El conteo de movimientos del mes sale de
     `conteoCategoria*`, que `monthTotals` ya trae: `txs` de arriba está
     limitado a 30 para la lista de recientes y contarlo daría 30 siempre. */
  const movimientosMes = useMemo(() => {
    const suma = (r?: Record<string, number>) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);
    return suma(totales?.conteoCategoriaIngreso) + suma(totales?.conteoCategoriaGasto);
  }, [totales]);
  useBarraEstado(t("barraEstado.inicio", {
    miembros: memberCount,
    movimientos: movimientosMes,
    mes: mesLegible(mes),
  }));

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

  // Proporción de la barra ingresos/gastos de la tarjeta "Balance del mes":
  // cuánto del movimiento total del mes fue ingreso vs. gasto. Sin
  // movimientos, la barra se queda vacía en vez de partirse 50/50 (que
  // insinuaría datos que no existen).
  const movimientoTotalMes = ingresos + gastos;
  const pctBarraIngreso = movimientoTotalMes > 0 ? (ingresos / movimientoTotalMes) * 100 : 0;
  const pctBarraGasto = movimientoTotalMes > 0 ? (gastos / movimientoTotalMes) * 100 : 0;

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

  /* ---- Piezas compartidas entre el layout de siempre y el Inicio del iPad,
     extraídas para no ser dos copias. ---- */
  const graficas = (
    <div ref={chartsRef}>
      <DashboardCharts weekly={weekly} balanceSeries={balanceSeries} moneda={church.moneda} />
    </div>
  );

  const distribucionEscritorio = (
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
  );

  /* ---- Lo propio del Inicio del iPad (diseño del handoff) ---- */
  const fHoy = fmtFecha(hoyISO());
  const hoyDate = new Date();
  const diasParaCorte = new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0).getDate() - hoyDate.getDate();
  const registrosIngresoMes = Object.values(totales?.conteoCategoriaIngreso ?? {}).reduce((a, b) => a + b, 0);
  const diezmosMes = totales?.conteoCategoriaIngreso?.["diezmo"] ?? 0;

  const heroIPad = (
    <div className="dash-hero">
      <h1>{t(`dashboard.saludo.${franjaDelDia()}`)}</h1>
      <p>
        {`${fHoy.nombreDia} ${fHoy.dia}`} · {diasParaCorte === 0
          ? t("dashboard.corteHoy")
          : t("dashboard.corteDias", { count: diasParaCorte })}
      </p>
    </div>
  );

  const kpiIPad = (
    <div className="summary-4 enter dash-kpi">
      <div className="stat-card accent" style={accentStyle(balance >= 0 ? "var(--accent-1)" : "var(--accent-2)")}>
        <div className="stat-head"><span className="stat-label">{t("dashboard.balanceDelMesLabel")}</span></div>
        <div className="stat-value md">
          <CountUp value={balance} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {pctChange(balance, balanceAnt) !== null && (
          <div className="stat-foot"><Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}</div>
        )}
      </div>
      <div className="stat-card accent" style={accentStyle("var(--accent-1)")}>
        <div className="stat-head"><span className="stat-label">{t("dashboard.ingresosDelMes")}</span></div>
        <div className="stat-value md">
          <CountUp value={ingresos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {/* El pie del diseño: cuántos registros son y cuántos diezmos —
            los conteos que `monthTotals` ya trae. */}
        <div className="stat-foot">{t("dashboard.subIngresos", { count: registrosIngresoMes, diezmos: diezmosMes })}</div>
      </div>
      <div className="stat-card accent" style={accentStyle("var(--accent-2)")}>
        <div className="stat-head"><span className="stat-label">{t("dashboard.gastosDelMes")}</span></div>
        <div className="stat-value md">
          <CountUp value={gastos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {pctChange(gastos, gastosAnt) !== null && (
          <div className="stat-foot"><Delta pct={pctChange(gastos, gastosAnt)} invert /> {t("dashboard.vsMesAnterior")}</div>
        )}
      </div>
      {/* La cuarta tarjeta es una COLA de trabajo, no una cifra: lo que
          espera en la bandeja, con su salto. El conteo es el mismo del
          badge del sidebar (countPendingTx). */}
      <Link to="/bandeja" className="stat-card accent stat-card--enlace" style={accentStyle("var(--accent-5)")}>
        <div className="stat-head"><span className="stat-label">{t("nav.porRevisar")}</span></div>
        <div className="stat-value md">
          {pendientes}<span className="stat-cur">{t("dashboard.movimientosUnidad")}</span>
        </div>
        <div className="stat-foot dash-abrir-bandeja">{t("dashboard.abrirBandeja")}</div>
      </Link>
    </div>
  );

  const dosListasIPad = (
    <div className="dash-dos-listas">
      <div>
        <div className="dash-lista-cab">
          <span>{t("dashboard.ultimosMovimientos")}</span>
          {txs.length > 0 && <Link to="/ingresos">{t("common.verTodo")}</Link>}
        </div>
        <div className="dash-lista-card">
          {txs.length === 0 ? (
            <div className="dash-lista-vacia">{t("dashboard.sinMovimientosRegistrados")}</div>
          ) : (
            txs.slice(0, 4).map((tx) => {
              const esIng = tx.tipo === "ingreso";
              const cat = categoriaInfo(tx.tipo, tx.categoria);
              const persona = esIng ? tx.member_nombre ?? tx.beneficiario : tx.beneficiario;
              /* El mismo titular que la lista del maestro-detalle de
                 Ingresos/Gastos: la categoría abre porque es lo que agrupa. */
              const conceptoRedundante = tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
              const titular = esIng
                ? persona ? `${cat.nombre} · ${persona}` : tx.concepto
                : conceptoRedundante ? cat.nombre : `${cat.nombre} · ${tx.concepto}`;
              return (
                <div className="dash-fila" key={tx.id}>
                  <span className={`dash-fila-icono ${esIng ? "ing" : "gas"}`}>{cat.nombre[0]?.toUpperCase()}</span>
                  <span className="dash-fila-textos">
                    <span className="dash-fila-titular truncate">{titular}</span>
                    <span className="dash-fila-sub truncate">
                      {[fmtFechaCorta(tx.fecha), metodoNombre(tx.metodo_pago)].join(" · ")}
                    </span>
                  </span>
                  <span className={`dash-fila-monto ${esIng ? "pos" : "neg"}`}>
                    {esIng ? "+" : "−"}{fmtMoney(tx.monto)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div>
        <div className="dash-lista-cab">
          <span>{t("dashboard.estaSemana")}</span>
          <Link to="/agenda">{t("nav.agendaCorto")}</Link>
        </div>
        <div className="dash-lista-card">
          {semana.length === 0 ? (
            <div className="dash-lista-vacia">{t("dashboard.semanaVacia")}</div>
          ) : (
            semana.map((o) => {
              const f = fmtFecha(o.fecha);
              const hora = o.dia_completo ? "" : o.hora_inicio ?? "";
              return (
                <div className="dash-fila" key={`${o._master.id}:${o._fechaOriginal}`}>
                  <span className="md-fila-fecha">
                    <span className="md-fila-fecha-dow">{f.nombreDia.slice(0, 3)}</span>
                    <span className="md-fila-fecha-num">{f.dia}</span>
                  </span>
                  <span className="dash-fila-textos">
                    <span className="dash-fila-titular truncate">{o.nombre}</span>
                    <span className="dash-fila-sub truncate">{[hora, o.lugar].filter(Boolean).join(" · ")}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* En Mac la cabecera es la toolbar de la ventana: "Inicio" en 13
          semibold, la cifra del saldo a su lado e Imprimir / Nuevo registro a
          la derecha. La cifra se queda AQUÍ y no baja al contenido: es el dato
          que el tesorero mira primero, y en la toolbar está siempre a la vista
          aunque se desplace la página. Es la única cifra de la pantalla en
          `--mac-fs-large-title` — las cuatro tarjetas KPI usan 15. El saludo
          se va: en una barra de 52 px no cabe y no dice nada del dinero. */}
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {enIPad ? (
          /* En el iPad la cabecera es la barra de 56px de las demás páginas:
             título y un DATO corto. El saludo grande baja al contenido (el
             h1 de 34px del diseño) y la cifra del mes se queda a la vista
             aquí, como subtítulo — antes el bloque del saludo + saldo de
             34px hinchaba la barra a ~110px, un Large Title disfrazado. */
          <div>
            <div className="page-title">{t("nav.inicio")}</div>
            <div className="page-sub">
              {t("dashboard.balanceDelMes", { mes: mesLegible(mes) })}: {fmtMoney(balance)} {church.moneda}
            </div>
          </div>
        ) : (
        <div>
          {enMac && <div className="page-title">{t("nav.inicio")}</div>}
          <div className="balance">
            {/* La cifra que el tesorero mira primero también comunica el signo,
                con la misma semántica de color que las tarjetas de abajo. */}
            <div className={`amount ${balance >= 0 ? "pos" : "neg"}`}>
              <CountUp value={balance} format={fmtMoney} paso={100} />
            </div>
            <div className="currency">{church.moneda}</div>
          </div>
          <div className="balance-sub">
            {enIPhone
              ? t("dashboard.saldoDelMes", { mes: mesLegible(mes) })
              : t("dashboard.balanceDelMes", { mes: mesLegible(mes) })}
          </div>
        </div>
        )}
        <div className="header-actions">
          <button className="btn secondary btn-compartir-cabecera" onClick={handlePrint} disabled={printing}>
            <span className="solo-escritorio"><IconPrinter size={14} /></span>
            <span className="solo-movil"><ShareIcon size={22} /></span>
            <span className="btn-compartir-texto">{printing ? t("common.preparando") : t("common.imprimir")}</span>
          </button>
          <button className="btn primary btn-nuevo-cabecera" onClick={onNew} title={`${t("dashboard.nuevoRegistro")}  ⌘N`}>
            <IconPlus size={14} /> {t("dashboard.nuevoRegistro")}
          </button>
        </div>
      </div>

      {printError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{printError}</div>
        </div>
      )}

      {/* `content-inicio`: única pantalla de Mac con fondo gris leve. Va por
          pantalla y NUNCA como valor global — en Mac el contenido es blanco y
          lo que separa las tarjetas es su borde de 1 px; el gris solo se
          justifica aquí, donde se juntan dos gráficas y cuatro KPI. */}
      <div className="content content-inicio">
        {/* El saludo del diseño de iPad: h1 de 34px EN el contenido, con la
            fecha y cuánto falta para el corte de mes. En Mac y iPhone no
            existe — ahí la cabecera ya dice lo suyo. */}
        {enIPad && heroIPad}
        {/* Lienzo único: gráficas, métricas y desglose comparten un solo panel
            gris claro para verse como un dashboard unificado. En el iPad el
            orden es el del diseño: KPI primero, gráficas después. */}
        <div className="dash-canvas">
        {enIPad && kpiIPad}
        {graficas}

        {enIPad ? null : enIPhone ? (
          /* Los ocho indicadores en dos columnas. En Mac siguen siendo las
             dos filas de tarjetas de siempre; aquí la tarjeta consolidada
             "Balance del mes" se abre en sus tres cifras (saldo, ingresos,
             gastos) porque en dos columnas ya no hace falta apretarlas en
             una sola tarjeta con barra y desglose. */
          <div className="ios-panel">
            <div className="ios-panel-grid">
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.balanceDelMesLabel")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={balance} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                {pctChange(balance, balanceAnt) !== null && <Delta pct={pctChange(balance, balanceAnt)} />}
              </div>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("charts.ingresos")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={ingresos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <Delta pct={pctChange(ingresos, ingresosAnt)} />
              </div>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("charts.gastos")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={gastos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <Delta pct={pctChange(gastos, gastosAnt)} invert />
              </div>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.balanceDelAnio")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={balanceAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
              </div>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.mayorGasto")}</span></div>
                {categoriaTopGasto ? (
                  <>
                    <span className="ios-stat-num money">
                      <CountUp value={categoriaTopGasto.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                    </span>
                    <div className="ios-panel-note" style={{ margin: 0 }}>
                      {categoriaTopGasto.info.nombre} · {t("dashboard.pctDelGasto", { pct: categoriaTopGasto.pct })}
                    </div>
                  </>
                ) : (
                  <div className="ios-panel-note" style={{ margin: 0 }}>{t("dashboard.sinGastosEsteMes")}</div>
                )}
              </div>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.ingresoMasFrecuente")}</span></div>
                {ingresoMasFrecuente ? (
                  <>
                    <span className="ios-stat-num sm">
                      {ingresoMasFrecuente.cnt}<span className="stat-cur">{t("dashboard.movimientosUnidad")}</span>
                    </span>
                    <div className="ios-panel-note" style={{ margin: 0 }}>{ingresoMasFrecuente.info.nombre}</div>
                  </>
                ) : (
                  <div className="ios-panel-note" style={{ margin: 0 }}>{t("dashboard.sinIngresosEsteMes")}</div>
                )}
              </div>

              {/* Ya era un enlace a Miembros; en el teléfono la tarjeta
                  entera es el objetivo táctil, con su chevron. */}
              <Link to="/miembros" className="ios-stat ios-stat--link">
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.miembrosActivos")}</span></div>
                <span className="ios-stat-num sm">{memberCount}</span>
                <IosChevron />
              </Link>

              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.ultimaActualizacion")}</span></div>
                <span className="ios-stat-num sm">{fmtRelativo(ultimaActividad)}</span>
                <div className="ios-panel-note" style={{ margin: 0 }}>
                  {ultimaActividad ? fmtFechaCorta(ultimaActividad) : t("dashboard.sinMovimientosRegistrados")}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        <div className="summary-4 enter">
          {/* Ingresos, Gastos y Balance del mes eran tres tarjetas separadas
              con los mismos datos que ya se resumen aquí. Se consolidan en
              una sola (inspirada en Copilot): el balance manda arriba, la
              barra muestra qué proporción del movimiento del mes fue
              ingreso vs. gasto, y el desglose de abajo conserva las mismas
              cifras y comparativas de antes — nada se pierde, solo ocupa
              menos alto en móvil. */}
          <div className="stat-card accent resumen-mes" style={accentStyle(balance >= 0 ? "var(--accent-1)" : "var(--accent-2)")}>
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
            {/* "vs. mes anterior" sin porcentaje no dice nada: cuando no hay
                mes anterior con que comparar (pctChange devuelve null) se
                omite la línea entera, no solo el número. */}
            {pctChange(balance, balanceAnt) !== null && (
              <div className="stat-foot">
                <Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}
              </div>
            )}

            <div className="resumen-bar" title={`${t("charts.ingresos")} ${Math.round(pctBarraIngreso)}% · ${t("charts.gastos")} ${Math.round(pctBarraGasto)}%`}>
              <span className="seg ingreso" style={{ width: `${pctBarraIngreso}%` }} />
              <span className="seg gasto" style={{ width: `${pctBarraGasto}%` }} />
            </div>

            {/* Etiquetas cortas ("Ingresos", no "Ingresos del mes"): el título
                de la tarjeta ya dice "Balance del mes", repetirlo en cada fila
                era lo que dejaba tan poco ancho que "Ingresos del mes" se
                truncaba a "Ingresos del …" en el teléfono. */}
            <div className="resumen-desglose">
              <div className="resumen-item">
                <span className="dot" style={{ background: "var(--accent-1)" }} />
                <div className="resumen-item-texto">
                  <span className="resumen-item-label">{t("charts.ingresos")}</span>
                  <span className="resumen-item-valor">
                    <CountUp value={ingresos} format={fmtMoney} paso={100} /> {church.moneda}
                  </span>
                </div>
                <Delta pct={pctChange(ingresos, ingresosAnt)} />
              </div>
              <div className="resumen-item">
                <span className="dot" style={{ background: "var(--accent-2)" }} />
                <div className="resumen-item-texto">
                  <span className="resumen-item-label">{t("charts.gastos")}</span>
                  <span className="resumen-item-valor">
                    <CountUp value={gastos} format={fmtMoney} paso={100} /> {church.moneda}
                  </span>
                </div>
                <Delta pct={pctChange(gastos, gastosAnt)} invert />
              </div>
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
          </>
        )}

        {enIPhone && !enIPad ? (
          <div className="ios-panel" ref={categoryChartRef}>
            <div className="ios-panel-head">
              <h2>{t("dashboard.distribucionGastos")}</h2>
              {/* `topGastos` ya viene recortado a 5; si el mes tuvo más
                  categorías, el resto se ve en Gastos. */}
              {categoriasGasto.length > topGastos.length && (
                <Link to="/gastos" className="ios-panel-action">{t("common.verTodo")}</Link>
              )}
            </div>
            {topGastos.length === 0 ? (
              <div className="ios-panel-empty">{t("dashboard.sinGastosEsteMesPunto")}</div>
            ) : (
              <div className="ios-listcard">
                {topGastos.map((g) => (
                  <div className="ios-txrow" key={g.id}>
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{g.nombre}</div>
                      <div className="stat-bar" style={{ marginTop: 6 }}>
                        <div className="stat-bar-fill" style={{ width: `${g.barPct}%`, background: g.color }} />
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(g.monto)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : distribucionEscritorio}
        </div>

        {/* En el iPad las dos listas del diseño (Últimos movimientos · Esta
            semana) sustituyen a la lista larga de recientes; el "Ver todo"
            lleva a Ingresos, que las tiene todas con sus filtros. */}
        {enIPad ? dosListasIPad : (
          <>
        <div className="tx-head">
          <div className="tx-title">{t("dashboard.movimientosRecientes")}</div>
          {/* La lista trae hasta 30; con más de 5 se ofrece el salto a la
              pantalla que los tiene todos con sus filtros. */}
          {txs.length > 5 && (
            <Link to="/ingresos" className={enIPhone ? "ios-panel-action" : "btn secondary"} style={enIPhone ? undefined : { textDecoration: "none" }}>
              {t("common.verTodo")}
            </Link>
          )}
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
          </>
        )}
      </div>
    </>
  );
}
