import { useId } from "react";
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
  const gradId = `bal-grad-${useId().replace(/:/g, "")}`;

  return (
    <div className="charts enter">
      <div className="card">
        <div className="card-head">
          <span className="card-title">Ingresos vs. gastos</span>
          <span className="card-meta">Por semana</span>
        </div>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} barGap={4} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipCard moneda={moneda} />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="var(--accent-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="gastos" name="Gastos" fill="var(--accent-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend">
          <span><span className="dot" style={{ background: "var(--accent-1)" }} /> Ingresos</span>
          <span><span className="dot" style={{ background: "var(--accent-2)" }} /> Gastos</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Evolución del balance</span>
          <span className="card-meta">Últimos 30 días</span>
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
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={40} />
              <Tooltip content={<TooltipCard moneda={moneda} />} />
              <Area
                type="monotone"
                dataKey="balance"
                name="Balance acumulado"
                stroke="var(--accent-3)"
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
