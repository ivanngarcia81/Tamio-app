import { useTranslation } from "react-i18next";
import { catNombre, colorCategoria, fmtMoney, type MonthSummary } from "../db";
import { aDecimal, type Centavos } from "../dinero";

/**
 * Las dos gráficas del Inicio del iPad, tal como las dibuja el handoff:
 * barras pareadas por mes a la izquierda (1.55fr) y dona de ingresos por
 * categoría a la derecha (1fr).
 *
 * **Por qué no recharts aquí.** El resto de la app usa recharts, y en Mac y
 * en el teléfono sigue haciéndolo (`DashboardCharts`). Pero lo que dibuja el
 * handoff no es una gráfica con ejes: son doce barras de 13px sin rejilla,
 * sin eje Y y sin tooltip, y una dona que es un `conic-gradient`. Montar eso
 * sobre recharts es pelearse con su layout para acabar escondiéndole todo lo
 * que trae. Aquí son divs, que es exactamente lo que el handoff dibuja.
 *
 * **Lo que sí se conserva del criterio de `DashboardCharts`:** sin eje Y no
 * se sabe si una barra son 13 mil o 130 mil (está apuntado allí, y se puso a
 * propósito). El diseño no tiene sitio para ese eje, así que el dato va donde
 * no cambia el dibujo: cada columna lleva su `title` y su etiqueta accesible
 * con las dos cifras del mes. Se lee al posarse encima y lo dice VoiceOver.
 */

export interface ParteCategoria {
  id: string;
  monto: Centavos;
}

interface Props {
  /** Los meses del histórico, ya recortados y en orden ascendente. */
  meses: MonthSummary[];
  /** El mes "YYYY-MM" que va en negrita: el que se está viviendo. */
  mesActual: string;
  /** Ingresos por categoría del periodo elegido, sin ordenar ni filtrar. */
  categorias: ParteCategoria[];
  /** Rótulo del centro de la dona: el periodo ("Agosto 2026", "2026"…). */
  periodoLegible: string;
  moneda: string;
}

/** "2026-08" → "ago" / "Aug", el rótulo corto del eje de meses. */
function mesCorto(yyyyMm: string, lang: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { month: "short" }).replace(".", "");
}

/** "$48.3k" — el total del centro de la dona, que no cabe con centavos. */
function compacto(c: Centavos): string {
  const n = aDecimal(c);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export default function InicioGraficasIPad({ meses, mesActual, categorias, periodoLegible, moneda }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "es";

  /* La escala de las barras. El máximo se toma sobre las DOS series juntas y
     no sobre cada una por su lado: con escalas separadas, un mes de 40 mil en
     ingresos y 4 mil en gastos dibujaría las dos barras a la misma altura, que
     es justo la mentira que una gráfica no debe contar. 140px es el alto útil
     del diseño; el mínimo de 2px es para que un mes con movimiento pequeño se
     vea como una raya y no como nada. */
  const tope = meses.reduce((max, m) => Math.max(max, m.ingresos, m.gastos), 0);
  const alto = (v: number) => (tope > 0 && v > 0 ? Math.max(2, Math.round((v / tope) * 140)) : 0);

  const totalCat = categorias.reduce((s, c) => s + c.monto, 0) as Centavos;
  /* De mayor a menor, y solo lo que tiene monto: una categoría en cero no
     pinta arco ni merece una fila de leyenda. */
  const partes = categorias
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto)
    .map((c) => ({
      ...c,
      nombre: catNombre(c.id),
      color: colorCategoria("ingreso", c.id),
      pct: totalCat > 0 ? (c.monto / totalCat) * 100 : 0,
    }));

  /* El `conic-gradient` se arma con los cortes acumulados. El último tramo se
     cierra en 100% a mano y no en su acumulado: los redondeos de coma flotante
     dejaban una rendija de fondo al final del anillo. */
  const tramos: string[] = [];
  let acc = 0;
  partes.forEach((p, i) => {
    const desde = acc;
    acc += p.pct;
    const hasta = i === partes.length - 1 ? 100 : acc;
    tramos.push(`${p.color} ${desde.toFixed(3)}% ${hasta.toFixed(3)}%`);
  });
  const anillo = partes.length > 0
    ? `conic-gradient(${tramos.join(",")})`
    : "conic-gradient(var(--line) 0 100%)";

  const conMovimiento = meses.some((m) => m.ingresos + m.gastos > 0);

  return (
    <div className="dash-graficas">
      <div className="dash-graf">
        <div className="dash-graf-cab">
          <span className="dash-graf-titulo">{t("dashboard.ingresosGastosPorMes")}</span>
          <span className="dash-graf-leyenda">
            <span><span className="dash-punto" style={{ background: "var(--pos)" }} />{t("charts.ingresos")}</span>
            <span><span className="dash-punto dash-punto--gasto" style={{ background: "var(--neg)" }} />{t("charts.gastos")}</span>
          </span>
        </div>
        {conMovimiento ? (
          <div className="dash-barras">
            {meses.map((m) => {
              const rotulo = `${mesCorto(m.mes, lang)} · ${t("charts.ingresos")} ${fmtMoney(m.ingresos)} ${moneda} · ${t("charts.gastos")} ${fmtMoney(m.gastos)} ${moneda}`;
              return (
                <div className="dash-barra-col" key={m.mes} title={rotulo} aria-label={rotulo}>
                  <div className="dash-barra-par">
                    <div className="dash-barra ing" style={{ height: alto(m.ingresos) }} />
                    <div className="dash-barra gas" style={{ height: alto(m.gastos) }} />
                  </div>
                  <span className={`dash-barra-mes${m.mes === mesActual ? " actual" : ""}`}>
                    {mesCorto(m.mes, lang)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dash-graf-vacia">{t("dashboard.sinMovimientosPeriodo")}</div>
        )}
      </div>

      <div className="dash-graf">
        <span className="dash-graf-titulo dash-graf-titulo--solo">{t("dashboard.ingresosPorCategoria")}</span>
        {partes.length > 0 ? (
          <div className="dash-dona-fila">
            <div className="dash-dona" style={{ background: anillo }}>
              <div className="dash-dona-centro">
                <span className="dash-dona-total">{compacto(totalCat)}</span>
                <span className="dash-dona-periodo">{periodoLegible}</span>
              </div>
            </div>
            <div className="dash-dona-leyenda">
              {partes.map((p) => (
                <span key={p.id} title={`${p.nombre} · ${fmtMoney(p.monto)} ${moneda}`}>
                  <span className="dash-punto" style={{ background: p.color }} />
                  <span className="truncate">{p.nombre}</span>
                  <b>{Math.round(p.pct)}%</b>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="dash-graf-vacia">{t("dashboard.sinIngresosEsteMes")}</div>
        )}
      </div>
    </div>
  );
}
