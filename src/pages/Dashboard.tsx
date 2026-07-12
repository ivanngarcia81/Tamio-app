import { useEffect, useState } from "react";
import {
  currentMonth, fmtMoney, listTx, mesLegible, monthTotals,
  type Church, type MonthTotals, type Tx,
} from "../db";
import TxList, { EmptyState } from "../components/TxList";
import { IconArrowDown, IconArrowUp, IconPlus } from "../icons";

interface Props {
  church: Church;
  refreshKey: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  onNew: () => void;
}

export default function Dashboard({ church, refreshKey, onEditTx, onChanged, onNew }: Props) {
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const mes = currentMonth();

  useEffect(() => {
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
    listTx(church.id, { limit: 30 }).then(setTxs).catch(console.error);
  }, [church.id, refreshKey, mes]);

  const ingresos = totales?.ingresos ?? 0;
  const gastos = totales?.gastos ?? 0;
  const balance = ingresos - gastos;

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
        <div className="summary">
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Ingresos del mes</span>
              <div className="stat-icon up"><IconArrowUp size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-value">
              {fmtMoney(ingresos)}<span className="stat-cur">{church.moneda}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Gastos del mes</span>
              <div className="stat-icon down"><IconArrowDown size={16} strokeWidth={2.4} /></div>
            </div>
            <div className="stat-value">
              {fmtMoney(gastos)}<span className="stat-cur">{church.moneda}</span>
            </div>
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
