import { useState } from "react";
import { categoriaInfo, deleteTx, fmtFecha, fmtFechaCorta, fmtMoney, METODOS_PAGO, type Tx } from "../db";
import RowMenu from "./RowMenu";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  tipo: "ingreso" | "gasto";
  txs: Tx[];
  onEdit: (tx: Tx) => void;
  onChanged: () => void;
}

const COLS_INGRESO = "110px 1fr 140px 170px 150px 130px 110px 40px";
const COLS_GASTO = "110px 140px 1fr 170px 150px 130px 110px 40px";

export default function TxTable({ tipo, txs, onEdit, onChanged }: Props) {
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);
  const esIngreso = tipo === "ingreso";
  const cols = esIngreso ? COLS_INGRESO : COLS_GASTO;

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteTx(pendingDelete.id, pendingDelete.church_id);
    setPendingDelete(null);
    onChanged();
  }

  return (
    <>
      <div className="data-table roomy">
        <div className="thead" style={{ gridTemplateColumns: cols }}>
          <div className="th">Fecha</div>
          <div className="th">{esIngreso ? "Concepto" : "Categoría"}</div>
          <div className="th">{esIngreso ? "Categoría" : "Descripción"}</div>
          <div className="th">{esIngreso ? "Miembro" : "Beneficiario"}</div>
          <div className="th">Método</div>
          <div className="th" style={{ textAlign: "right" }}>Monto</div>
          <div className="th">Estado</div>
          <div className="th"></div>
        </div>
        {txs.map((tx) => {
          const cat = categoriaInfo(tx.tipo, tx.categoria);
          const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
          const persona = tx.member_nombre ?? tx.beneficiario ?? "—";
          const hora = fmtFecha(tx.fecha).hora;

          const celdaFecha = (
            <div className="td">
              <div style={{ fontWeight: 600 }}>{fmtFechaCorta(tx.fecha)}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hora}</div>
            </div>
          );
          const celdaConcepto = (
            <div className="td">
              <div style={{ fontWeight: 600 }}>{tx.concepto}</div>
              {tx.detalle && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{tx.detalle}</div>}
            </div>
          );
          const celdaCategoria = (
            <div className="td">
              <span className={`tag ${cat.tagClass}`}>{cat.nombre}</span>
            </div>
          );

          return (
            <div className="tr" key={tx.id} style={{ gridTemplateColumns: cols }}>
              {celdaFecha}
              {esIngreso ? celdaConcepto : celdaCategoria}
              {esIngreso ? celdaCategoria : celdaConcepto}
              <div className="td">
                {tx.member_nombre ? (
                  <div className="person">
                    <div className="mini-avatar c1" style={{ width: 26, height: 26, fontSize: 10 }}>
                      {tx.member_nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12.5 }}>{tx.member_nombre}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{persona}</span>
                )}
              </div>
              <div className="td">
                <span className="method" style={{ justifySelf: "start" }}>
                  {metodo && <span className={`m-badge ${metodo.id}`}>{metodo.badge}</span>}
                  {metodo?.nombre ?? tx.metodo_pago}
                </span>
              </div>
              <div className="td" style={{ textAlign: "right" }}>
                <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                  {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                  <span className="cur">{tx.moneda}</span>
                </span>
              </div>
              <div className="td">
                <span className={`status-pill ${tx.estado}`}>
                  {tx.estado === "aprobado" ? "Aprobado" : tx.estado === "pendiente" ? "Pendiente" : "Rechazado"}
                </span>
              </div>
              <div className="td" style={{ textAlign: "center" }}>
                <RowMenu onEdit={() => onEdit(tx)} onDelete={() => setPendingDelete(tx)} />
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
