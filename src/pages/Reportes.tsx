import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone, esMac } from "../movil";
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
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import { CSV_TEMPLATE, MOVIMIENTOS_FIELDS, validarFilaMovimiento } from "../services/importCsv";
import { IconChevronLeft, IconChevronRight, IconClose, IconFileText, IconMonitor, IconMore, IconPrinter, IconSparkles, IconUpload } from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import HeaderMenu from "../components/HeaderMenu";
import Asamblea from "../components/Asamblea";
import { iaHabilitada, preguntarDatos, resumirReporte } from "../ia";
import { showToast } from "../toast";
import CountUp from "../components/CountUp";
import { CERO, porcentaje, restar, sumar, type Centavos } from "../dinero";
import ActionSheet from "../components/ActionSheet";
import { useHojaDeslizable } from "../hooks/useHojaDeslizable";

const RESUMEN_COLS = "1fr 150px 150px 150px 130px";

/** Color de la fila "Otras", el mismo gris pizarra que ya usa el agrupado de
 *  Movimientos: no se inventa una convención nueva para lo mismo. */
const COLOR_OTRAS = "#64748b";

interface FilaCat { id: string; color: string; total: Centavos }

/**
 * Hasta cinco categorías más una fila "Otras" con la suma del resto.
 *
 * Va SEPARADO de `filasIngreso`/`filasGasto`, que son las que alimentan
 * `buildReportData()` y por tanto el PDF: agrupar ahí habría cambiado el
 * documento, que es justo lo que esta tarea no debe tocar. Esto solo lo lee
 * la leyenda del teléfono.
 *
 * Cada porcentaje se calcula de SU PROPIO monto, incluido el de "Otras"
 * (suma de los agrupados). Es la misma regla del resto de la pantalla y del
 * agrupado de Movimientos.
 */
function conOtras(filas: FilaCat[], nombreOtras: (n: number) => string): { id: string; nombre: string; color: string; total: Centavos }[] {
  const ordenadas = [...filas].sort((a, b) => b.total - a.total);
  if (ordenadas.length <= 5) {
    return ordenadas.map((c) => ({ id: c.id, nombre: catNombre(c.id), color: c.color, total: c.total }));
  }
  const resto = ordenadas.slice(5);
  return [
    ...ordenadas.slice(0, 5).map((c) => ({ id: c.id, nombre: catNombre(c.id), color: c.color, total: c.total })),
    {
      id: "__otras",
      nombre: nombreOtras(resto.length),
      color: COLOR_OTRAS,
      total: sumar(...resto.map((c) => c.total)),
    },
  ];
}

/** Un porcentaje entero legible; "—" cuando no hay base con que dividir. */
function pctTexto(parte: Centavos, total: Centavos, decimales = 0): string {
  if (total <= 0) return "—";
  return `${((parte / total) * 100).toFixed(decimales)}%`;
}

/** Tarjeta de distribución del teléfono: donut arriba y leyenda DEBAJO.
 *
 *  En Mac los dos donuts van lado a lado con su leyenda al costado; en 390 px
 *  eso deja el donut minúsculo o la leyenda en dos caracteres, así que aquí
 *  van uno debajo del otro, cada uno a todo el ancho. */
function DonutIOS({
  titulo, filas, total, moneda, vacio, delayMs, nombreOtras,
}: {
  titulo: string;
  filas: FilaCat[];
  total: Centavos;
  moneda: string;
  vacio: string;
  delayMs: number;
  nombreOtras: (n: number) => string;
}) {
  const leyenda = conOtras(filas, nombreOtras);
  return (
    <div className="ios-panel">
      <div className="ios-panel-head"><h2>{titulo}</h2></div>
      {filas.length === 0 ? (
        <div className="ios-panel-empty">{vacio}</div>
      ) : (
        <div className="ios-listcard donut-ios">
          <div className="donut-wrap">
            <Donut segments={filas.map((c) => ({ color: c.color, pct: porcentaje(c.total, total) }))} delayMs={delayMs} />
            <div className="donut-center">
              <div className="val">{fmtMoney(total)}</div>
              <div className="lbl">{moneda}</div>
            </div>
          </div>
          <div className="donut-legend">
            {leyenda.map((c) => (
              <div className="donut-legend-row" key={c.id}>
                <span className="sw" style={{ background: c.color }} />
                <span className="name">{c.nombre}</span>
                <span className="monto">{fmtMoney(c.total)}</span>
                <span className="pct">{pctTexto(c.total, total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fila del estado financiero en el teléfono: dos líneas —nombre con su punto
 *  de color y el monto a la derecha; debajo, el porcentaje—. Las cuatro
 *  columnas de escritorio no caben en 390 px sin cortar el nombre. */
function FilaFinancieraIOS({ nombre, color, monto, pct }: { nombre: string; color?: string; monto: string; pct: string }) {
  return (
    <div className="ios-txrow rep-fila">
      <div className="ios-txrow-main">
        <div className="ios-txrow-title">
          {color && <span className="rep-punto" style={{ background: color }} aria-hidden="true" />}
          <span className="truncate">{nombre}</span>
        </div>
        <div className="tx-secundaria-movil">{pct}</div>
      </div>
      <div className="ios-txrow-trailing"><span className="rep-monto">{monto}</span></div>
    </div>
  );
}

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
  const [depositosMes, setDepositosMes] = useState<Centavos>(CERO);
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
  const [pregConfirmarDescartar, setPregConfirmarDescartar] = useState(false);

  const { refHoja: refHojaPreg, refVelo: refVeloPreg } = useHojaDeslizable(
    pregOpen && !pregGenerando,
    () => setPregOpen(false),
    {
      hayCambiosSinGuardar: () => pregTexto.trim().length > 0,
      onIntentoConCambios: () => setPregConfirmarDescartar(true),
    },
  );
  const { refHoja: refHojaResumen, refVelo: refVeloResumen } = useHojaDeslizable(
    !!iaResumen,
    () => setIaResumen(null),
  );

  const esMesActual = mes >= currentMonth();
  const mesStr = mesLegible(mes);

  /* Pie de ventana (solo Mac): el mes del reporte y cuánta historia hay
     detrás, que es lo que decide si el resumen mensual tiene algo que
     comparar. */
  useBarraEstado(t("barraEstado.reportes", { mes: mesStr, meses: historial.length }));
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
        `Balance del mes: ${fmtMoney(restar(totales.ingresos, totales.gastos))}`,
      ];
      if (totalesAnt) {
        lineas.push(
          `Mes anterior (${mesLegible(mesAnterior)}): ingresos ${fmtMoney(totalesAnt.ingresos)}, gastos ${fmtMoney(totalesAnt.gastos)}`,
        );
      }
      const cats = (m: Record<string, Centavos>) =>
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
      // El depósito NO es un subconjunto del ingreso del mes: son dos tablas
      // sin relación (`depositos_bancarios.periodo` lo elige el tesorero a
      // mano y el depósito puede llevar efectivo guardado de meses
      // anteriores). Sin esta aclaración la IA ponía las dos cifras en la
      // misma frase y el lector deducía que faltaba dinero.
      if (depositosMes > 0) {
        lineas.push(
          `Depositado al banco en el mes: ${fmtMoney(depositosMes)} ` +
            `(dinero llevado al banco durante el mes; puede incluir efectivo de meses ` +
            `anteriores, así que NO forma parte de los ingresos del mes ni se suma con ellos)`,
        );
      }
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
      const ingAnio = sumar(...meses.map((m) => m.ingresos));
      const gasAnio = sumar(...meses.map((m) => m.gastos));
      const lineas: string[] = [
        `Hoy: ${nowLocalIso().slice(0, 10)} · Moneda: ${church.moneda}`,
        `Año ${anio} — ingresos: ${fmtMoney(ingAnio)}, gastos: ${fmtMoney(gasAnio)}, balance: ${fmtMoney(restar(ingAnio, gasAnio))}`,
        // Misma aclaración que en el resumen del mes: el depósito no es un
        // subconjunto del ingreso, es dinero llevado al banco.
        `Depositado al banco en ${anio}: ${fmtMoney(depAnio)} (dinero llevado al banco; ` +
          `puede incluir efectivo de periodos anteriores, así que NO forma parte de los ` +
          `ingresos ni se suma con ellos)`,
      ];
      const listaCats = (m: Record<string, number>) =>
        Object.entries(m as Record<string, Centavos>).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${catNombre(c)}: ${fmtMoney(v)}`).join("; ");
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
              : `Aportes de ${m.nombre} en ${anio}: ${fmtMoney(CERO)}`,
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

  const ingresos = totales?.ingresos ?? CERO;
  const gastos = totales?.gastos ?? CERO;
  const balance = restar(ingresos, gastos);
  const balanceAnt = restar(totalesAnt?.ingresos ?? CERO, totalesAnt?.gastos ?? CERO);

  const enIPhone = esIPhone();
  const nombreOtras = (n: number) => t("mov.otrasCategorias", { count: n });

  const filasIngreso = getCategoriasIngreso()
    .map((c) => ({ ...c, color: colorCategoria("ingreso", c.id), total: totales?.porCategoriaIngreso[c.id] ?? CERO }))
    .filter((c) => c.total > 0);
  const filasGasto = getCategoriasGasto()
    .map((c) => ({ ...c, color: colorCategoria("gasto", c.id), total: totales?.porCategoriaGasto[c.id] ?? CERO }))
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
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {/* En el teléfono el carrusel de secciones ya dice dónde estás, y el
            mes lo lleva el navegador de `.periodo-selector` de más abajo:
            título y subtítulo solo repetirían. Igual que en las otras quince
            pantallas convertidas. */}
        {!enIPhone && (
          <div>
            <div className="page-title">{t("reportes.titulo")}</div>
            <div className="page-sub">{t("reportes.sub", { mes: mesStr })}</div>
          </div>
        )}
        <div className="header-actions solo-escritorio">
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
        <div className="header-actions solo-movil">
          <button
            type="button"
            className="btn-compartir-cabecera"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            aria-label={t("reportes.titulo") + " — " + t("common.imprimir")}
          >
            <ShareIcon size={22} />
          </button>
          <HeaderMenu
            icon={<IconMore size={20} />}
            ariaLabel={t("common.masAcciones")}
            sections={[
              {
                items: [
                  { label: t("reportes.asamblea.boton"), icon: <IconMonitor size={13} />, disabled: loading || !totales, onClick: () => setAsambleaOpen(true) },
                  ...(iaHabilitada ? [
                    { label: t("reportes.pregunta.boton"), icon: <IconSparkles size={13} />, onClick: () => setPregOpen(true) },
                    { label: iaGenerando ? t("cartas.ia.generando") : t("reportes.ia.boton"), icon: <IconSparkles size={13} />, disabled: iaGenerando || loading || !totales, onClick: resumirIA },
                  ] : []),
                ],
              },
              {
                items: [
                  { label: t("miembros.importarCsv"), icon: <IconUpload size={13} />, onClick: () => setImportOpen(true) },
                  /* El reporte anual vive AQUÍ, con Imprimir, porque es lo
                     mismo que hace: producir un documento. Antes era la mitad
                     derecha de un control segmentado "Mensual | Reporte
                     anual" cuya mitad izquierda estaba `active` y `disabled`
                     para siempre — o sea, un adorno. Un segmentado promete
                     dos formas de ver lo mismo, y tocarlo sacaba una hoja de
                     compartir. En Mac ya estaba en el menú de "Más". */
                  { label: exporting === "anual" ? t("common.generando") : t("anual.boton"), icon: <IconFileText size={13} />, disabled: exporting !== null, onClick: handleAnnual },
                  { label: exporting === "print" ? t("common.preparando") : t("common.imprimir"), icon: <IconPrinter size={14} />, disabled: exporting !== null, onClick: handlePrint },
                ],
              },
            ]}
          />
        </div>
        <div className="periodo-selector solo-movil">
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
        </div>
      </div>
      {exportError && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning">{exportError}</div>
        </div>
      )}

      <div className="content">
        {loading ? <LoadingState /> : <>
        {enIPhone ? (
          <>
            {/* Las cuatro cifras del mes, en dos columnas y SIN la franja de
                color de arriba: en el teléfono el color lo lleva el punto de
                la leyenda y el signo del balance, no un filete decorativo. */}
            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("reportes.seccionResumen")}</h2></div>
              <div className="ios-panel-grid">
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.ingresosDelMes")}</span></div>
                  <span className="ios-stat-num money">
                    <CountUp value={ingresos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                  </span>
                  <div className="stat-pct"><Delta pct={pctChange(ingresos, totalesAnt?.ingresos ?? 0)} /> {t("dashboard.vsMesAnterior")}</div>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("dashboard.gastosDelMes")}</span></div>
                  <span className="ios-stat-num money">
                    <CountUp value={gastos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                  </span>
                  <div className="stat-pct"><Delta pct={pctChange(gastos, totalesAnt?.gastos ?? 0)} invert /> {t("dashboard.vsMesAnterior")}</div>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.balanceNeto")}</span></div>
                  <span className={`ios-stat-num money${balance >= 0 ? " pos" : " neg"}`}>
                    <CountUp value={balance} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                  </span>
                  <div className="stat-pct"><Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}</div>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.mesAnterior")}</span></div>
                  <span className="ios-stat-num money">
                    <CountUp value={balanceAnt} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                  </span>
                  <div className="stat-pct">{mesLegible(mesAnterior)}</div>
                </div>
              </div>
            </div>

            {/* Uno debajo del otro, cada uno a todo el ancho. */}
            <DonutIOS
              titulo={t("reportes.distGastos")}
              filas={filasGasto}
              total={gastos}
              moneda={church.moneda}
              vacio={t("reportes.sinGastosEsteMes")}
              delayMs={0}
              nombreOtras={nombreOtras}
            />
            <DonutIOS
              titulo={t("reportes.distIngresos")}
              filas={filasIngreso}
              total={ingresos}
              moneda={church.moneda}
              vacio={t("reportes.sinIngresosEsteMes")}
              delayMs={150}
              nombreOtras={nombreOtras}
            />
          </>
        ) : (
        <>
        <div className="dash-canvas">
        <div className="summary-4 enter">
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("dashboard.ingresosDelMes")}</span></div>
            <div className="stat-value md"><CountUp value={ingresos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(ingresos, totalesAnt?.ingresos ?? 0)} /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("dashboard.gastosDelMes")}</span></div>
            <div className="stat-value md"><CountUp value={gastos} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(gastos, totalesAnt?.gastos ?? 0)} invert /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": balance >= 0 ? "var(--accent-1)" : "var(--accent-2)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("reportes.balanceNeto")}</span></div>
            <div className="stat-value md"><CountUp value={balance} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
            <div className="stat-foot"><Delta pct={pctChange(balance, balanceAnt)} /> {t("dashboard.vsMesAnterior")}</div>
          </div>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
            <div className="stat-head"><span className="stat-label">{t("reportes.mesAnterior")}</span></div>
            <div className="stat-value md"><CountUp value={balanceAnt} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
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
                    segments={filasGasto.map((c) => ({ color: c.color, pct: porcentaje(c.total, gastos) }))}
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
                    segments={filasIngreso.map((c) => ({ color: c.color, pct: porcentaje(c.total, ingresos) }))}
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
        </>
        )}

        {enIPhone ? (
          <>
            {/* Estado financiero. Las cuatro columnas de escritorio (color,
                nombre, monto, porcentaje) no caben en 390 px sin cortar el
                nombre, así que cada fila pasa a dos líneas dentro de una
                tarjeta de lista. El encabezado con iglesia y periodo se
                queda: es lo que convierte esto en un documento y no en una
                pantalla más. */}
            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("reportes.estadoFinanciero")}</h2></div>
              <div className="rep-cabecera">
                <div className="rep-iglesia">{church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""}</div>
                <div className="rep-periodo">{t("reportes.periodo", { mes: mesLegible(mes) })}</div>
              </div>
            </div>

            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("reportes.ingresosPeriodo")}</h2></div>
              {filasIngreso.length === 0 ? (
                <div className="ios-panel-empty">{t("reportes.sinIngresosRegistrados")}</div>
              ) : (
                <div className="ios-listcard">
                  {filasIngreso.map((c) => (
                    <FilaFinancieraIOS
                      key={c.id}
                      nombre={catNombre(c.id)}
                      color={c.color}
                      monto={fmtMoney(c.total)}
                      pct={pctTexto(c.total, ingresos, 1)}
                    />
                  ))}
                  <div className="ios-txrow rep-fila rep-total">
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{t("reportes.totalIngresos")}</div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span className="rep-monto pos">{fmtMoney(ingresos)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("reportes.gastosPeriodo")}</h2></div>
              {filasGasto.length === 0 ? (
                <div className="ios-panel-empty">{t("reportes.sinGastosRegistrados")}</div>
              ) : (
                <div className="ios-listcard">
                  {filasGasto.map((c) => (
                    <FilaFinancieraIOS
                      key={c.id}
                      nombre={catNombre(c.id)}
                      color={c.color}
                      monto={fmtMoney(c.total)}
                      pct={pctTexto(c.total, gastos, 1)}
                    />
                  ))}
                  <div className="ios-txrow rep-fila rep-total">
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{t("reportes.totalGastos")}</div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span className="rep-monto neg">{fmtMoney(gastos)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Los cuatro totales del pie, en la misma cuadrícula de dos
                columnas que el resumen de arriba. La nota de depósitos se
                queda: es información contable, no adorno. */}
            <div className="ios-panel">
              <div className="ios-panel-grid">
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.totalIngresos")}</span></div>
                  <span className="ios-stat-num money pos">{fmtMoney(ingresos)}</span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.totalGastos")}</span></div>
                  <span className="ios-stat-num money neg">{fmtMoney(gastos)}</span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.balanceNeto")}</span></div>
                  <span className="ios-stat-num money">{fmtMoney(balance)}</span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("reportes.depositosBancarios")}</span></div>
                  <span className="ios-stat-num money">{fmtMoney(depositosMes)}</span>
                </div>
              </div>
              {depositosMes > 0 && (
                <p className="ios-panel-note">{t("reportes.depositosNota")}</p>
              )}
            </div>
          </>
        ) : (
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

        )}

        {historial.length > 0 && (
          <>
            <div className="tx-head">
              <div className="tx-title">{t("reportes.resumenMensual")}</div>
            </div>
            {enIPhone ? (
              /* Cinco columnas de cifras no caben en 390 px: la fila pasa a
                 dos líneas —el mes y su balance arriba; ingresos, gastos y la
                 variación abajo—. Los nombres salen de los `data-label` que
                 la tabla ya llevaba, no de claves nuevas. */
              <div className="ios-listcard">
                {historial.map((h, i) => {
                  const bal = restar(h.ingresos, h.gastos);
                  const anterior = historial[i - 1];
                  const balAnt = anterior ? anterior.ingresos - anterior.gastos : null;
                  const variacion = balAnt === null ? null : pctChange(bal, balAnt);
                  return (
                    <div className="ios-txrow rep-fila" key={h.mes}>
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title">{mesLegible(h.mes)}</div>
                        <div className="tx-secundaria-movil">
                          {t("charts.ingresos")} {fmtMoney(h.ingresos)} · {t("charts.gastos")} {fmtMoney(h.gastos)}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing rep-trailing">
                        <span className="rep-monto">{fmtMoney(bal)}</span>
                        {variacion === null ? (
                          <span className="rep-var vacia">—</span>
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
            ) : (
            <div className="data-table roomy tabla-resumen-mes">
              <div className="thead" style={{ gridTemplateColumns: RESUMEN_COLS }}>
                <div className="th">{t("reportes.colMes")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("charts.ingresos")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("charts.gastos")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("pdfPreview.balance")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("reportes.colVariacion")}</div>
              </div>
              {historial.map((h, i) => {
                const bal = restar(h.ingresos, h.gastos);
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
            )}
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
            { label: t("movImport.colMonto"), align: "right", render: (tx) => fmtMoney(tx.monto) },
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
        <div className="modal-overlay hoja-ia" ref={refVeloPreg} onClick={(e) => { if (e.target === e.currentTarget && !pregGenerando) setPregOpen(false); }}>
          <div className="modal-card hoja-ia" ref={refHojaPreg} style={{ width: 560 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title modal-title-ia"><IconSparkles size={17} /> {t("reportes.pregunta.titulo")}</div>
                <div className="modal-sub">{t("reportes.pregunta.sub")}</div>
              </div>
              <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={() => { if (!pregGenerando) setPregOpen(false); }}><IconClose /></button>
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

      {pregConfirmarDescartar && (
        <ActionSheet
          title={t("common.descartarCambiosTitulo")}
          message={t("common.descartarCambiosMensaje")}
          options={[{
            label: t("common.descartarCambiosBtn"),
            danger: true,
            onClick: () => { setPregConfirmarDescartar(false); setPregOpen(false); },
          }]}
          onCancel={() => setPregConfirmarDescartar(false)}
        />
      )}

      {iaResumen && (
        <div className="modal-overlay hoja-ia" ref={refVeloResumen} onClick={(e) => { if (e.target === e.currentTarget) setIaResumen(null); }}>
          <div className="modal-card hoja-ia" ref={refHojaResumen} style={{ width: 560 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title modal-title-ia"><IconSparkles size={17} /> {t("reportes.ia.titulo", { mes: mesStr })}</div>
                <div className="modal-sub">{t("reportes.ia.nota")}</div>
              </div>
              <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={() => setIaResumen(null)}><IconClose /></button>
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
