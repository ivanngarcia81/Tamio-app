import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import { fmtMoney } from "../db";

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

const axisTick = { fontSize: 11, fill: "var(--text-3)" };

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
        fontSize: 12.5,
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

  return (
    <div className="charts enter">
      <div className="card">
        <div className="card-head">
          <span className="card-title">{t("charts.ingresosVsGastos")}</span>
          <span className="card-meta">{t("charts.porSemana")}</span>
        </div>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} barGap={4} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line-soft)" strokeDasharray="3 4" />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipCard moneda={moneda} />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="ingresos" name={t("charts.ingresos")} fill="var(--accent-1)" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={600} animationEasing="ease-out" />
              <Bar dataKey="gastos" name={t("charts.gastos")} fill="var(--accent-2)" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={600} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <span><span className="dot" style={{ background: "var(--accent-1)" }} /> {t("charts.ingresos")}</span>
          <span><span className="dot" style={{ background: "var(--accent-2)" }} /> {t("charts.gastos")}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{t("charts.evolucionBalance")}</span>
          <span className="card-meta">{t("charts.ultimos30")}</span>
        </div>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balanceSeries} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-3)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line-soft)" strokeDasharray="3 4" />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={40} />
              <Tooltip content={<TooltipCard moneda={moneda} />} />
              <Area
                type="monotone"
                dataKey="balance"
                name={t("charts.balanceAcumulado")}
                stroke="var(--accent-3)"
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 4 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
