import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtMoney } from "../db";
import { aDecimal, type Centavos } from "../dinero";
import { esIPhone, esMac } from "../movil";
import { EmptyState } from "./TxList";
import { IconReportes } from "../icons";

interface WeekPoint {
  label: string;
  ingresos: number;
  gastos: number;
}

interface BalancePoint {
  label: string;
  balance: number;
}

interface Props {
  weekly: WeekPoint[];
  balanceSeries: BalancePoint[];
  moneda: string;
}

/* El color del eje sale de un token para que Mac pueda usar su propio gris
   (--mac-tertiary) sin tocar el teléfono. 11 px en las dos plataformas: la
   gráfica es el dato, no el texto. */
const axisTick = { fontSize: "calc(11px * var(--fs-escala))", fill: "var(--chart-axis)" };

/** Etiqueta corta para el eje Y: "13k", "1.4M". Los importes vienen en
 *  centavos, así que primero se pasan a la unidad de la moneda. Sin eje Y
 *  no había forma de saber si una barra son 13 mil o 130 mil. */
function tickCompacto(centavos: number): string {
  // El valor que entrega recharts SÍ son centavos (viene de los mismos datos
  // que ya pasan por fmtMoney), pero llega tipado como `number` pelado: el
  // molde recupera la marca de `Centavos` sin cambiar nada en tiempo de
  // ejecución. Ver la nota sobre el tipo marcado en dinero.ts.
  const n = aDecimal(centavos as Centavos);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/**
 * ¿Hay bastante para que una gráfica signifique algo?
 *
 * Con dos movimientos, las barras salen una al 100 % de alto y el resto a
 * cero, y la línea sale plana con un escalón: las dos **sugieren una
 * tendencia que no existe**. Vale más decir que aún no hay datos.
 *
 * El umbral se aplica también en Mac, no solo en el teléfono: ahí desinforma
 * igual.
 */
function hayTendenciaSemanal(weekly: WeekPoint[]): boolean {
  return weekly.filter((w) => w.ingresos + w.gastos > 0).length >= 3;
}
function hayTendenciaBalance(serie: BalancePoint[]): boolean {
  if (serie.length < 7) return false;
  // Se cuentan MOVIMIENTOS (días en que el acumulado cambia), no valores
  // distintos.
  //
  // La regla de la tarea era "3 valores distintos", pero esta serie es
  // ACUMULADA: dos movimientos dan siempre exactamente tres valores (0 →
  // tras el primero → tras el segundo), así que ese umbral dejaba pasar
  // justo el caso que se quería excluir — y en agosto, con dos
  // movimientos, la gráfica seguía dibujando su línea plana con un
  // escalón. Contando movimientos el umbral dice lo que se quería decir, y
  // queda alineado con el de las barras (3 semanas con movimiento).
  const movimientos = serie.filter((p, i) =>
    i === 0 ? p.balance !== 0 : p.balance !== serie[i - 1].balance
  ).length;
  return movimientos >= 3;
}

function TooltipCard({ active, payload, label, moneda }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,.12)",
        fontSize: "calc(12.5px * var(--fs-escala))",
      }}
    >
      <div style={{ color: "var(--text-2)", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{fmtMoney(p.value)} {moneda}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardCharts({ weekly, balanceSeries, moneda }: Props) {
  const { t } = useTranslation();
  const gradId = `bal-grad-${useId().replace(/:/g, "")}`;
  const enIPhone = esIPhone();
  const enMac = esMac();
  // 104 en el teléfono, 180 en Mac, 210 en el iPad.
  //
  // En Mac una gráfica de panel va entre 160 y 200: a 210, con las dos
  // gráficas más las cuatro tarjetas KPI, se perdía la mitad inferior de una
  // ventana de 900×600.
  //
  // Los 104 del teléfono son del rediseño de iOS 26 (handoff, GUIA §4): ahí
  // la gráfica deja de ser el objeto principal de la pantalla y pasa a ser
  // una tarjeta como las de Salud o Bolsa —un vistazo, no un panel—, del
  // mismo alto que las tres filas de la lista agrupada que tiene encima. A
  // 180 se comía la pantalla antes de llegar a los movimientos recientes.
  const alto = enIPhone ? 104 : enMac ? 180 : 210;
  // Barras de macOS: radio 2 y 10 px de ancho máximo. Las de 18 con radio 4
  // son de dashboard web; a esa anchura, además, cuatro semanas de dos series
  // llenaban el panel de bloques. En el teléfono, 11 con radio 3: es lo que
  // deja las cuatro semanas de dos series legibles en 393px sin que las
  // barras se toquen.
  const radioBarra: [number, number, number, number] = enIPhone ? [3, 3, 0, 0] : enMac ? [2, 2, 0, 0] : [4, 4, 0, 0];
  const anchoBarra = enIPhone ? 11 : enMac ? 10 : 18;
  // Tres marcas de eje en el teléfono (0 / mitad / tope) en vez de cuatro: a
  // 104px de alto, cuatro dejaban 26px entre marca y marca y las etiquetas se
  // tocaban entre sí.
  const marcasEjeY = enIPhone ? 3 : 4;
  // En el teléfono no hay hover, así que el tooltip se abre al TOCAR.
  //
  // La guía del handoff pedía quitarlo del teléfono ("en táctil no hay
  // hover"). No se quitó: el repo ya había resuelto justo ese problema con
  // `trigger="click"`, y sin tooltip la única forma de saber cuánto fue una
  // semana concreta sería irse a Reportes. Una maqueta nunca dibuja un
  // tooltip —es transitorio—, así que su ausencia ahí no es una decisión de
  // diseño en contra, es que no había nada que dibujar.
  const disparoTooltip = enIPhone ? "click" : "hover";

  const SinDatos = () => (
    <EmptyState
      titulo={t("charts.sinTendenciaTitulo")}
      sub={t("charts.sinTendenciaSub")}
      icon={<IconReportes size={22} strokeWidth={1.6} />}
    />
  );

  return (
    <div className="charts enter">
      <div className="card">
        <div className="card-head">
          <span className="card-title">{t("charts.ingresosVsGastos")}</span>
          <span className="card-meta">{t("charts.porSemana")}</span>
        </div>
        {hayTendenciaSemanal(weekly) ? (
          <>
            <div style={{ height: alto }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} barGap={4} barCategoryGap="28%" margin={{ top: enIPhone ? 4 : 8, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line-soft)" />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} tickCount={marcasEjeY} width={enIPhone ? 30 : 38} tickFormatter={tickCompacto} />
                  <Tooltip content={<TooltipCard moneda={moneda} />} cursor={{ fill: "var(--surface-2)" }} trigger={disparoTooltip} />
                  <Bar dataKey="ingresos" name={t("charts.ingresos")} fill="var(--accent-1)" fillOpacity={0.9} radius={radioBarra} maxBarSize={anchoBarra} animationDuration={600} animationEasing="ease-out" />
                  <Bar dataKey="gastos" name={t("charts.gastos")} fill="var(--accent-2)" fillOpacity={0.9} radius={radioBarra} maxBarSize={anchoBarra} animationDuration={600} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span><span className="dot" style={{ background: "var(--accent-1)" }} /> {t("charts.ingresos")}</span>
              <span><span className="dot" style={{ background: "var(--accent-2)" }} /> {t("charts.gastos")}</span>
            </div>
          </>
        ) : (
          <SinDatos />
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{t("charts.evolucionBalance")}</span>
          <span className="card-meta">{t("charts.ultimos30")}</span>
        </div>
        {hayTendenciaBalance(balanceSeries) ? (
          <div style={{ height: alto }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceSeries} margin={{ top: enIPhone ? 4 : 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-balance)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-balance)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line-soft)" />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} tickCount={marcasEjeY} width={enIPhone ? 30 : 38} tickFormatter={tickCompacto} />
                <Tooltip content={<TooltipCard moneda={moneda} />} trigger={disparoTooltip} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name={t("charts.balanceAcumulado")}
                  stroke="var(--chart-balance)"
                  strokeWidth={1.5}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <SinDatos />
        )}
      </div>
    </div>
  );
}
