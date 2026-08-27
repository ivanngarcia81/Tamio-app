import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBarraEstado } from "../components/BarraEstado";
import { invoke } from "@tauri-apps/api/core";
import {
  catNombre, categoriaInfo, countPendingTx, currentMonth, currentYear, dailyTotals, efectivoDisponibleHasta, mesCorto,
  getCategoriasGasto, getCategoriasIngreso,
  fmtFecha, fmtFechaCorta, fmtMoney, fmtRelativo, hoyISO, lastActivityAt, listActividades, listTx, mesLegible,
  metodoNombre, monthDepositos, monthTotals, monthlySummary, pctChange, prevMonth, yearTotals,
  type Church, type DailyPoint, type MonthSummary, type MonthTotals, type Tx, type YearTotals,
} from "../db";
import { expandirTodas, type OcurrenciaVista } from "../services/agenda/recurrencia";
import {
  familiaDeActividad, juntarTotales, mesesDePeriodo, mesesDePeriodoAnterior, ultimoDiaDe,
  type Periodo,
} from "../services/inicio/periodo";
import InicioGraficasIPad from "../components/InicioGraficasIPad";
import TxList, { EmptyState } from "../components/TxList";
import Delta from "../components/Delta";
import CountUp from "../components/CountUp";
import DashboardCharts from "../components/DashboardCharts";
import SeccionIOS from "../components/ios/SeccionIOS";
import { printDashboard } from "../services/print/printDashboard";
import { IconArrowDown, IconArrowUp, IconClock, IconMiembros, IconPlus, IconPrinter } from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import { CERO, restar, sumar, type Centavos } from "../dinero";
import { esIPad, esIPhone, esMac } from "../movil";

interface Props {
  church: Church;
  refreshKey: number;
  memberCount: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  onNew: () => void;
  /** Permiso de la iglesia (migración 49): sin él la lista de movimientos
   *  recientes no ofrece Eliminar. */
  puedeEliminar?: boolean;
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

export default function Dashboard({ church, refreshKey, memberCount, onEditTx, onChanged, onNew, puedeEliminar = true }: Props) {
  const { t, i18n } = useTranslation();
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

  /* ---- El periodo del Inicio del iPad (segmentado Mes · Trimestre · Año) ----

     Vive APARTE del estado del mes de arriba y no lo sustituye. Ese sigue
     alimentando lo que no tiene periodo elegible: el pie de ventana del Mac,
     el balance de la barra de menús, la impresión del estado financiero y los
     ocho indicadores del teléfono. Aquí solo se calcula lo que el segmentado
     del handoff manda cambiar, y solo en el iPad, que es donde ese segmentado
     existe.

     Se pide `monthTotals` mes a mes y se junta con `juntarTotales` en vez de
     escribir tres consultas por rango: una sola forma de contar es una sola
     forma de equivocarse, y sobre un SQLite local doce SELECT agrupados por
     un índice no se notan. */
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [totPer, setTotPer] = useState<MonthTotals | null>(null);
  const [totPerAnt, setTotPerAnt] = useState<MonthTotals | null>(null);
  const [saldoCaja, setSaldoCaja] = useState<Centavos | null>(null);
  const [saldoCajaAnt, setSaldoCajaAnt] = useState<Centavos | null>(null);
  const [histMeses, setHistMeses] = useState<MonthSummary[]>([]);

  useEffect(() => {
    /* También en el teléfono desde que el segmentado bajó a él. Sin esto,
       `totPer` no se cargaba nunca en el iPhone y las cifras de la tarjeta
       caían al `?? totales` del mes: el mando se movía y los números no. Se
       veía trabajando —el botón cambiaba de sitio— y decía siempre lo mismo,
       que es peor que no tenerlo. */
    if (!enIPad && !enIPhone) return;
    const dentro = mesesDePeriodo(periodo, mes);
    const antes = mesesDePeriodoAnterior(periodo, mes);
    Promise.all(dentro.map((m) => monthTotals(church.id, m)))
      .then((r) => setTotPer(juntarTotales(r))).catch(console.error);
    Promise.all(antes.map((m) => monthTotals(church.id, m)))
      .then((r) => setTotPerAnt(juntarTotales(r))).catch(console.error);
    /* Saldo en caja: un SALDO, no un flujo. Es lo que hay hoy —apertura más
       movimientos aprobados menos lo ya depositado en el banco—, así que no
       se recorta al periodo: se compara contra lo que había al cierre del
       periodo anterior. Es `efectivoDisponibleHasta`, la misma cuenta que ya
       usa Depósitos para saber cuánto queda por depositar. */
    efectivoDisponibleHasta(church, hoyISO()).then(setSaldoCaja).catch(console.error);
    efectivoDisponibleHasta(church, ultimoDiaDe(antes[antes.length - 1]))
      .then(setSaldoCajaAnt).catch(console.error);
    // 24 meses de histórico para poder recortar la ventana de 6 del diseño
    // aunque haya huecos sin movimiento por medio.
    monthlySummary(church.id, 24).then(setHistMeses).catch(console.error);
    // `enIPad`/`enIPhone` son constantes durante la sesión (la clase se pone
    // antes de montar), así que no entran en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, church.saldo_inicial, refreshKey, mes, periodo]);

  /* La ventana de SEIS meses del diseño, terminando en el mes en curso.
     `monthlySummary` solo devuelve meses CON movimiento; si se pintara tal
     cual, un mes en blanco desaparecería y los cinco vecinos se juntarían
     como si hubieran sido consecutivos. Aquí el hueco se rellena en cero y se
     ve como lo que es: un mes sin movimiento. */
  const seisMeses = useMemo<MonthSummary[]>(() => {
    const porMes = new Map(histMeses.map((m) => [m.mes, m]));
    const [y, m] = mes.split("-").map(Number);
    const out: MonthSummary[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push(porMes.get(clave) ?? { mes: clave, ingresos: CERO, gastos: CERO });
    }
    return out;
  }, [histMeses, mes]);

  /* Las cifras que el segmentado gobierna. Mientras el periodo es "mes" son
     exactamente las de siempre; con el periodo cargando, se cae al mes para
     no parpadear a cero. */
  const ingresosPer = totPer?.ingresos ?? totales?.ingresos ?? CERO;
  const gastosPer = totPer?.gastos ?? totales?.gastos ?? CERO;
  const gastosPerAnt = totPerAnt?.gastos ?? CERO;
  /* El balance del periodo elegido. `balance` a secas es siempre el del
     MES; con el segmentado ya en el teléfono hacía falta el que sigue al
     mando. */
  const balancePer = restar(ingresosPer, gastosPer);

  /* Las barras de la tarjeta (maqueta H1). Una pareja por tramo del periodo:
     lo que entró y lo que salió. El balance de arriba dice cómo TERMINÓ; esto
     dice cómo llegó ahí — si fue parejo o si una semana se comió el mes.

     Los tramos cambian con el segmentado, que es lo que pide el handoff
     («cambia el periodo: las barras pasan de semanas a meses»), y cada uno
     sale de la serie que ya se consulta, sin una consulta nueva:

     · Mes       → semanas, de `dias` (`dailyTotals`, 30 días). Inicio siempre
                   mira el mes en curso —`mes` es `currentMonth()` y no hay
                   selector—, así que 30 días lo cubren; los días que caen en
                   el mes anterior se descartan, o la primera barra mezclaría
                   dos meses.
     · Trimestre → meses del trimestre, de `histMeses` (`monthlySummary`).
     · Año       → los doce meses, de la misma serie. Los meses sin movimiento
                   se dejan a la vista, en cero: un hueco dice tanto como una
                   barra, y saltárselos haría que "julio" y "septiembre"
                   parecieran consecutivos. */
  const barrasPeriodo = useMemo(() => {
    if (periodo === "mes") {
      const delMes = dias.filter((d) => d.fecha.slice(0, 7) === mes);
      const semanas = new Map<number, { ingresos: Centavos; gastos: Centavos }>();
      for (const d of delMes) {
        const semana = Math.floor((Number(d.fecha.slice(8, 10)) - 1) / 7);
        const acc = semanas.get(semana) ?? { ingresos: CERO, gastos: CERO };
        semanas.set(semana, { ingresos: sumar(acc.ingresos, d.ingresos), gastos: sumar(acc.gastos, d.gastos) });
      }
      return [...semanas.entries()]
        .sort((a2, b2) => a2[0] - b2[0])
        .map(([n, v]) => ({ etiqueta: t("dashboard.semanaN", { n: n + 1 }), ...v }));
    }
    const porMes = new Map(histMeses.map((m) => [m.mes, m]));
    return mesesDePeriodo(periodo, mes).map((m) => {
      const v = porMes.get(m);
      return {
        etiqueta: mesCorto(m),
        ingresos: v?.ingresos ?? CERO,
        gastos: v?.gastos ?? CERO,
      };
    });
  }, [periodo, mes, dias, histMeses, t]);

  /* El alto de cada barra es relativo al tramo MÁS ALTO del periodo, no al
     total: lo que se compara es un mes contra otro, y con el total de
     referencia todas las barras saldrían enanas en un año bueno. */
  const topeBarra = Math.max(1, ...barrasPeriodo.flatMap((b) => [b.ingresos, b.gastos]));
  const registrosIngresoPer = useMemo(
    () => Object.values(totPer?.conteoCategoriaIngreso ?? {}).reduce((a, b) => a + b, 0),
    [totPer]
  );
  const diezmosPer = totPer?.conteoCategoriaIngreso?.["diezmo"] ?? 0;
  const catIngresoPer = useMemo(
    () => Object.entries(totPer?.porCategoriaIngreso ?? {}).map(([id, monto]) => ({ id, monto })),
    [totPer]
  );
  /* TRES rótulos del periodo, no uno, porque van a tres huecos de anchura muy
     distinta y el mismo texto no cabe en los tres:

       largo  → subtítulo de la barra ....... "Agosto 2026" · "3.º trimestre 2026"
       medio  → etiqueta de las KPI ......... "agosto" · "3.º trimestre" · "2026"
       corto  → centro de la dona (78px) .... "ago" · "T3" · "2026"

     El corto existe porque "3.º trimestre 2026" se salía del agujero del
     anillo y se leía ENCIMA de los tramos de color. */
  const trimestreN = Math.floor((Number(mes.slice(5, 7)) - 1) / 3) + 1;
  const anioStr = mes.slice(0, 4);
  const localeMes = i18n.language.startsWith("en") ? "en-US" : "es-ES";
  const fechaMes = new Date(Number(anioStr), Number(mes.slice(5, 7)) - 1, 1);
  const periodoLargo = periodo === "mes"
    ? mesLegible(mes)
    : periodo === "anio" ? anioStr : t("dashboard.trimestreN", { n: trimestreN, anio: anioStr });
  const periodoMedio = periodo === "mes"
    ? fechaMes.toLocaleDateString(localeMes, { month: "long" })
    : periodo === "anio" ? anioStr : t("dashboard.trimestreSolo", { n: trimestreN });
  const periodoCorto = periodo === "mes"
    ? fechaMes.toLocaleDateString(localeMes, { month: "short" }).replace(".", "")
    : periodo === "anio" ? anioStr : t("dashboard.trimestreCorto", { n: trimestreN });

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
        <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: "calc(13px * var(--fs-escala))" }}>{t("dashboard.sinGastosEsteMesPunto")}</div>
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
  /* "Buenas tardes, Iván" — con el nombre, como el handoff. El nombre sale de
     `tesorero_nombre` (Configuración → Iglesia), que es de quien es esta
     pantalla; solo el primero, porque un "Buenas tardes, Iván García Ramírez"
     no es un saludo. Sin nombre configurado, el saludo va solo: mejor eso que
     una coma colgando o un "Buenas tardes, undefined". */
  const saludoBase = t(`dashboard.saludo.${franjaDelDia()}`);
  const primerNombre = church.tesorero_nombre?.trim().split(/\s+/)[0];
  const saludo = primerNombre
    ? t("dashboard.saludoCon", { saludo: saludoBase, nombre: primerNombre })
    : saludoBase;

  /* El saludo del diseño y, a su derecha, el segmentado del periodo. Van en
     la MISMA fila (align-items:flex-end) porque el handoff los alinea por
     abajo: el segmentado se apoya en la línea base de la fecha, no en la del
     h1 de 34px. */
  const heroIPad = (
    <div className="dash-hero-fila">
      <div className="dash-hero">
        <h1>{saludo}</h1>
        <p>
          {`${fHoy.nombreDia} ${fHoy.dia}`} · {diasParaCorte === 0
            ? t("dashboard.corteHoy")
            : t("dashboard.corteDias", { count: diasParaCorte })}
        </p>
      </div>
      <div className="dash-seg" role="group" aria-label={t("dashboard.periodo")}>
        {(["mes", "trimestre", "anio"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            className={periodo === p ? "sel" : ""}
            aria-pressed={periodo === p}
            onClick={() => setPeriodo(p)}
          >
            {t(`dashboard.periodo_${p}`)}
          </button>
        ))}
      </div>
    </div>
  );

  const kpiIPad = (
    <div className="summary-4 enter dash-kpi">
      {/* 1ª tarjeta: SALDO EN CAJA, que es lo que pide el handoff y no el
          balance del mes que había antes. No es un cambio de rótulo: son dos
          cifras distintas. El balance dice cuánto se movió este mes; el saldo
          en caja dice cuánto hay AHORA —apertura + aprobados − depositado—,
          que es la pregunta con la que un tesorero abre la app. El balance
          del mes no se pierde: sigue en la barra de menús del Mac, en el pie
          de ventana, en el estado financiero impreso y en los indicadores del
          teléfono. */}
      <div className="stat-card accent" style={accentStyle((saldoCaja ?? CERO) >= 0 ? "var(--accent-1)" : "var(--accent-2)")}>
        <div className="stat-head"><span className="stat-label">{t("dashboard.saldoEnCaja")}</span></div>
        <div className="stat-value md">
          <CountUp value={saldoCaja ?? CERO} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {/* El porcentaje solo cuando el punto de partida es positivo. Un saldo
            que va de −400 a 5.000 da "▲ 1350%", que no significa nada: sobre
            base cero o negativa el cambio relativo no está definido, y una
            cifra de cuatro dígitos en el pie de una tarjeta solo hace ruido.
            Se piden las DOS positivas: si el saldo cruzó el cero en cualquiera
            de los dos sentidos, el porcentaje tampoco dice nada (−400 → 5.000
            da "▲ 1350%"; 5.000 → −400, "▼ 108%"). Cuando no se puede, la
            tarjeta se queda con su cifra, que es la que importa. */}
        {saldoCaja !== null && saldoCajaAnt !== null && saldoCaja > 0 && saldoCajaAnt > 0 && pctChange(saldoCaja, saldoCajaAnt) !== null && (
          <div className="stat-foot"><Delta pct={pctChange(saldoCaja, saldoCajaAnt)} /> {t(`dashboard.vsAnterior_${periodo}`)}</div>
        )}
      </div>
      <div className="stat-card accent" style={accentStyle("var(--accent-1)")}>
        <div className="stat-head"><span className="stat-label">{t(`dashboard.ingresosDe_${periodo}`, { periodo: periodoMedio })}</span></div>
        <div className="stat-value md">
          <CountUp value={ingresosPer} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {/* El pie del diseño: cuántos registros son y cuántos diezmos —
            los conteos que `monthTotals` ya trae. */}
        <div className="stat-foot">{t("dashboard.subIngresos", { count: registrosIngresoPer, diezmos: diezmosPer })}</div>
      </div>
      <div className="stat-card accent" style={accentStyle("var(--accent-2)")}>
        <div className="stat-head"><span className="stat-label">{t(`dashboard.gastosDe_${periodo}`, { periodo: periodoMedio })}</span></div>
        <div className="stat-value md">
          <CountUp value={gastosPer} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        {pctChange(gastosPer, gastosPerAnt) !== null && (
          <div className="stat-foot"><Delta pct={pctChange(gastosPer, gastosPerAnt)} invert /> {t(`dashboard.vsAnterior_${periodo}`)}</div>
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
                  {/* El punto del diseño. El handoff lo pinta de cuatro colores
                      sin decir qué los separa (en el prototipo son cuatro filas
                      fijas); aquí lo decide `tipo`, que es un campo real de la
                      agenda, agrupado en cuatro familias — ver
                      services/inicio/periodo.ts. */}
                  <span
                    className={`dash-fila-punto fam-${familiaDeActividad(o.tipo)}`}
                    title={t(`agenda.tipos.${o.tipo}`)}
                    aria-hidden="true"
                  />
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
            {/* "Resumen de agosto 2026", el subtítulo del handoff. Antes aquí
                iba el balance del mes en cifra; se movió porque la cifra que
                el diseño quiere primero —el saldo en caja— ya está en la
                tarjeta de al lado, y repetir dinero en la barra hacía que dos
                números distintos compitieran por ser "el" número. */}
            <div className="page-sub">{t("dashboard.resumenDe", { mes: periodoLargo })}</div>
          </div>
        ) : enIPhone ? (
          /* Rediseño de iOS 26: en el teléfono la cabecera es SOLO el Large
             Title, y la cifra baja al contenido (`.ios-hero`, justo debajo)
             como en Cartera o Salud. Antes el `.header` del teléfono no
             pintaba `.page-title` —empezaba directo por el saldo—, así que
             `.titulo-fijo` (la copia que se queda arriba al desplazar, ver
             App.tsx) se quedaba SIN texto que copiar: Inicio era la única
             pantalla de la app cuya barra no decía dónde estabas. */
          <div className="page-title">{t("nav.inicio")}</div>
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
          <div className="balance-sub">{t("dashboard.balanceDelMes", { mes: mesLegible(mes) })}</div>
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
        {/* Las dos gráficas del handoff SOLO en el iPad: barras por mes y dona
            de categorías. En Mac y en el teléfono no se toca nada — ahí siguen
            las de recharts (ingresos vs. gastos por semana y evolución del
            balance a 30 días), que son las que se imprimen en el estado
            financiero y las que esas dos pantallas llevan desde siempre. */}
        {enIPad ? (
          <InicioGraficasIPad
            meses={seisMeses}
            mesActual={mes}
            categorias={catIngresoPer}
            periodoLegible={periodoCorto}
            moneda={church.moneda}
          />
        ) : enIPhone ? null : graficas}

        {enIPad ? null : enIPhone ? (
          /* Rediseño de iOS 26. Los ocho indicadores estaban en una rejilla de
             2×4 tarjetas: es el patrón de un dashboard de escritorio metido en
             393px, y con ocho cifras del mismo tamaño ninguna era LA cifra.
             Ahora el saldo del mes es una cifra suelta bajo el título —el
             dato por el que se abre la pantalla— y los otros siete bajan a dos
             listas agrupadas. No se pierde ni uno: cambia el orden de lectura,
             no el contenido.

             La cifra vive AQUÍ y no en el `.header` (donde estaba en el
             teléfono hasta ahora) porque en iOS un Large Title no comparte
             barra con un dato: se desplaza con el contenido, y al llegar
             arriba lo que queda es el título, no el saldo. */
          <>
            {/* Rediseño v2 (maqueta H1): el segmentado del periodo deja de ser
                del iPad. Vivía tras `enIPad` desde el handoff anterior, pero
                el estado, las consultas y los tres rótulos ya estaban escritos
                para los tres periodos; lo único que faltaba era el mando. Es
                el mismo defecto que la bandeja: función encerrada tras una
                comprobación de plataforma. */}
            <div className="dash-seg dash-seg--movil" role="group" aria-label={t("dashboard.periodo")}>
              {(["mes", "trimestre", "anio"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={periodo === p ? "sel" : ""}
                  aria-pressed={periodo === p}
                  onClick={() => setPeriodo(p)}
                >
                  {t(`dashboard.periodo_${p}`)}
                </button>
              ))}
            </div>

            {/* «Las cuatro cifras en una sola tarjeta: el balance en grande con
                su variación, y abajo los tres números con su punto de color
                —incluido el saldo en caja, que va aparte porque no es del
                periodo, es de hoy—.»

                Lo que había: el balance suelto sobre el gris y, debajo, una
                lista agrupada con ingresos, gastos y balance del año en filas.
                Tres cifras del mismo peso en tres renglones no dicen cuál se
                consulta a diario; en la tarjeta, el balance manda y las otras
                tres lo explican.

                Las barras del periodo que la maqueta pone en medio NO están
                todavía: siguen siendo la gráfica de recharts de más abajo. Es
                lo único que falta de esta pantalla. */}
            <div className="ios-tarjeta-cifras">
              <div className="itc-cabeza">
                <span className="itc-bloque">
                  <span className="itc-rotulo">{t("dashboard.balanceDelPeriodo", { periodo: periodoLargo })}</span>
                  <span className="itc-num">
                    <CountUp value={balancePer} format={fmtMoney} paso={100} />
                  </span>
                </span>
                <Delta pct={pctChange(balancePer, balanceAnt)} />
              </div>
              {/* Las barras del periodo. Solo si hay más de un tramo: con
                  «Mes» en la primera semana del mes, una sola pareja de
                  barras no compara nada — dice lo mismo que las cifras de
                  abajo, ocupando 96 px. */}
              {barrasPeriodo.length > 1 && (
                <div className="itc-barras" aria-hidden="true">
                  {barrasPeriodo.map((b) => (
                    <span className="itc-barra" key={b.etiqueta}>
                      <span className="itc-barra-par">
                        <i className="itc-barra-in" style={{ height: `${Math.round((b.ingresos / topeBarra) * 100)}%` }} />
                        <i className="itc-barra-out" style={{ height: `${Math.round((b.gastos / topeBarra) * 100)}%` }} />
                      </span>
                      <span className="itc-barra-rot">{b.etiqueta}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="itc-pie">
                <span className="itc-cifra">
                  <span className="itc-etiqueta"><i className="itc-punto itc-punto--ingreso" />{t("charts.ingresos")}</span>
                  <span className="itc-valor">{fmtMoney(ingresosPer)}</span>
                </span>
                <span className="itc-cifra">
                  <span className="itc-etiqueta"><i className="itc-punto itc-punto--gasto" />{t("charts.gastos")}</span>
                  <span className="itc-valor">{fmtMoney(gastosPer)}</span>
                </span>
                <span className="itc-cifra itc-cifra--fin">
                  <span className="itc-etiqueta"><i className="itc-punto itc-punto--caja" />{t("dashboard.enCaja")}</span>
                  <span className="itc-valor">{fmtMoney(saldoCaja ?? CERO)}</span>
                </span>
              </div>
            </div>

            {/* Ingresos y gastos ya NO están aquí: los dice la tarjeta de
                arriba, con su punto de color. Repetirlos en una lista a diez
                píxeles de distancia era decir dos veces lo mismo y dejar al
                lector comparando dos cifras idénticas para ver si eran la
                misma. Se quedan las dos que la tarjeta no cubre —el balance
                del AÑO, que no depende del segmentado, y los aportantes—. */}
            {/* Sin encabezado: al quitarle ingresos y gastos, este grupo se
                quedó con el balance del AÑO y los aportantes, y ninguno de los
                dos es «del mes». Un título que no describe lo que hay debajo
                estorba más que la falta de título, y en iOS un grupo sin
                encabezado es corriente —las dos filas se explican solas—. */}
            <SeccionIOS>
              <div className="ios-txrow">
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("dashboard.balanceDelAnio")}</div></div>
                <div className="ios-txrow-trailing">
                  <span className={`tx-amount ${balanceAnio >= 0 ? "positive" : "negative"}`}>
                    <CountUp value={balanceAnio} format={fmtMoney} paso={100} />
                  </span>
                </div>
              </div>
              {/* Ya era un enlace a Miembros; la fila entera sigue siéndolo,
                  ahora con el galón a la derecha en vez de una tarjeta. */}
              <Link to="/miembros" className="ios-txrow ios-txrow--clickable">
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("dashboard.miembrosActivos")}</div></div>
                <div className="ios-txrow-trailing">
                  <span className="ios-fila-valor">{memberCount}</span>
                  <IosChevron />
                </div>
              </Link>
            </SeccionIOS>

            {/* Los tres indicadores que no son una cifra de dinero a secas:
                cada uno es un dato con su explicación, o sea exactamente una
                fila de dos líneas. En la rejilla vivían apretados en una
                tarjeta de media pantalla con la nota debajo cortada. */}
            <SeccionIOS titulo={t("dashboard.detalleDelMes")}>
              <div className="ios-txrow">
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title">{t("dashboard.mayorGasto")}</div>
                  <div className="tx-secundaria-movil">
                    {categoriaTopGasto
                      ? `${categoriaTopGasto.info.nombre} · ${t("dashboard.pctDelGasto", { pct: categoriaTopGasto.pct })}`
                      : t("dashboard.sinGastosEsteMes")}
                  </div>
                </div>
                {categoriaTopGasto && (
                  <div className="ios-txrow-trailing">
                    <span className="tx-amount negative">
                      <CountUp value={categoriaTopGasto.monto} format={fmtMoney} paso={100} />
                    </span>
                  </div>
                )}
              </div>
              <div className="ios-txrow">
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title">{t("dashboard.ingresoMasFrecuente")}</div>
                  <div className="tx-secundaria-movil">
                    {ingresoMasFrecuente ? ingresoMasFrecuente.info.nombre : t("dashboard.sinIngresosEsteMes")}
                  </div>
                </div>
                {ingresoMasFrecuente && (
                  <div className="ios-txrow-trailing">
                    <span className="ios-fila-valor">
                      {ingresoMasFrecuente.cnt} {t("dashboard.movimientosUnidad")}
                    </span>
                  </div>
                )}
              </div>
              <div className="ios-txrow">
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title">{t("dashboard.ultimaActualizacion")}</div>
                  <div className="tx-secundaria-movil">
                    {ultimaActividad ? fmtFechaCorta(ultimaActividad) : t("dashboard.sinMovimientosRegistrados")}
                  </div>
                </div>
                <div className="ios-txrow-trailing">
                  <span className="ios-fila-valor">{fmtRelativo(ultimaActividad)}</span>
                </div>
              </div>
            </SeccionIOS>

            {/* Aquí estaba la gráfica de «Ingresos vs. gastos» (recharts). Se
                retira del teléfono, y solo del teléfono: las barras que ahora
                viven DENTRO de la tarjeta de cifras cuentan la misma historia
                —cómo se repartió el movimiento a lo largo del periodo— pero
                sin repetirla, y con una diferencia que en el teléfono era un
                error de lectura: la gráfica ignoraba el segmentado de periodo
                y pintaba siempre las mismas semanas, así que al tocar
                «Trimestre» las cifras cambiaban y la curva de abajo no. Dos
                series contradictorias, una encima de la otra, en 393 px.

                En Mac y en iPad se conserva tal cual (ver el ternario del
                lienzo): ahí hay ancho de sobra, la gráfica no compite con la
                tarjeta y el iPad tiene además su propia `InicioGraficasIPad`.
                `graficas` sigue construyéndose para ellos. */}
          </>
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

        {/* La tarjeta de "Distribución de gastos por categoría" NO va en el
            Inicio del iPad: el handoff especifica esa pantalla entera —saludo,
            cuatro KPI, dos gráficas, dos listas— y ahí la única gráfica de
            categorías es la dona de INGRESOS. El desglose de gastos no se
            pierde: sigue en Mac, en el teléfono, en Reportes y en el estado
            financiero impreso, que es donde se consulta con calma. */}
        {enIPad ? null : enIPhone ? (
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
                      <span style={{ fontWeight: 700, fontSize: "calc(15px * var(--fs-escala))", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(g.monto)}</span>
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
          <TxList txs={txs} onEdit={onEditTx} onChanged={onChanged} puedeEliminar={puedeEliminar} />
        )}
          </>
        )}
      </div>
    </>
  );
}
