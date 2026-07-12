import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { categoriaInfo, deleteTx, fmtFecha, fmtMoney, METODOS_PAGO, type Tx } from "../db";
import { IconArrowDown, IconArrowUp } from "../icons";
import RowMenu from "./RowMenu";
import ConfirmDialog from "./ConfirmDialog";

export function EmptyState({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div
      className="card"
      style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-2)" }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 13 }}>{sub}</div>
    </div>
  );
}

interface Props {
  txs: Tx[];
  onEdit: (tx: Tx) => void;
  onChanged: () => void;
}

export default function TxList({ txs, onEdit, onChanged }: Props) {
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);

  if (txs.length === 0) return null;

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteTx(pendingDelete.id, pendingDelete.church_id);
    setPendingDelete(null);
    onChanged();
  }

  // Agrupar por día (YYYY-MM-DD)
  const grupos: { dia: string; items: Tx[] }[] = [];
  for (const tx of txs) {
    const dia = tx.fecha.slice(0, 10);
    const last = grupos[grupos.length - 1];
    if (last && last.dia === dia) last.items.push(tx);
    else grupos.push({ dia, items: [tx] });
  }

  return (
    <>
      <div className="tx-list">
        {grupos.map((g) => {
          const f = fmtFecha(g.items[0].fecha);
          return (
            <div className="tx-day" key={g.dia}>
              <div className="day-label">
                <span className="day-num">{f.dia}</span>
                <span className="day-month">{f.mesAnio}</span>
                <span className="day-name">{f.nombreDia}</span>
              </div>
              <div className="day-rows">
                {g.items.map((tx) => {
                  const cat = categoriaInfo(tx.tipo, tx.categoria);
                  const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
                  const quien =
                    tx.member_nombre ?? tx.beneficiario ?? tx.detalle ?? tx.subcategoria ?? "";
                  return (
                    <div className="tx-row" key={tx.id}>
                      <span className="tx-time">{fmtFecha(tx.fecha).hora}</span>
                      <div className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`}>
                        {tx.tipo === "ingreso" ? <IconArrowUp /> : <IconArrowDown />}
                      </div>
                      <div className="tx-desc">
                        {tx.concepto}
                        {tx.estado === "pendiente" && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 8,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#b45309",
                              background: "#fef3c7",
                              padding: "2px 8px",
                              borderRadius: 999,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              verticalAlign: "middle",
                            }}
                          >
                            Pendiente
                          </span>
                        )}
                        {quien && <span className="who">{quien}</span>}
                        {tx.comprobante_path && (
                          <span
                            title="Ver comprobante"
                            onClick={(e) => { e.stopPropagation(); openPath(tx.comprobante_path!); }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              marginLeft: 8, fontSize: 11, color: "var(--text-2)", cursor: "pointer",
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            Comprobante
                          </span>
                        )}
                      </div>
                      <span className={`tag ${cat.tagClass}`}>{cat.nombre}</span>
                      <span className="method">
                        {metodo && (
                          <span className={`m-badge ${metodo.id}`}>{metodo.badge}</span>
                        )}
                        {metodo?.nombre ?? tx.metodo_pago}
                      </span>
                      <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                        {tx.tipo === "ingreso" ? "+" : "−"}
                        {fmtMoney(tx.monto).replace("−", "")}
                        <span className="cur">{tx.moneda}</span>
                      </span>
                      <RowMenu onEdit={() => onEdit(tx)} onDelete={() => setPendingDelete(tx)} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={`¿Eliminar "${pendingDelete.concepto}" por ${fmtMoney(pendingDelete.monto)} ${pendingDelete.moneda}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
