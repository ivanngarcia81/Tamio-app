import { useState } from "react";
import { useTranslation } from "react-i18next";
import { categoriaInfo, deleteTx, fmtFecha, fmtFechaCorta, fmtMoney, metodoNombre, METODOS_PAGO, type Tx } from "../db";
import { IconArrowDown, IconArrowUp, IconEdit } from "../icons";
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
  const { t } = useTranslation();
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
          <div className="th">{t("tx.colFecha")}</div>
          <div className="th">{esIngreso ? t("tx.colConcepto") : t("tx.colCategoria")}</div>
          <div className="th">{esIngreso ? t("tx.colCategoria") : t("tx.colDescripcion")}</div>
          <div className="th">{esIngreso ? t("tx.colMiembro") : t("tx.colBeneficiario")}</div>
          <div className="th">{t("tx.colMetodo")}</div>
          <div className="th" style={{ textAlign: "right" }}>{t("tx.colMonto")}</div>
          <div className="th">{t("tx.colEstado")}</div>
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
              <div className="truncate" style={{ fontWeight: 600 }} title={tx.concepto}>{tx.concepto}</div>
              {tx.detalle && (
                <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }} title={tx.detalle}>
                  {tx.detalle}
                </div>
              )}
            </div>
          );
          const celdaCategoria = (
            <div className="td">
              <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
            </div>
          );

          return (
            <div className="tr" key={tx.id} style={{ gridTemplateColumns: cols }}>
              {celdaFecha}
              {esIngreso ? celdaConcepto : celdaCategoria}
              {esIngreso ? celdaCategoria : celdaConcepto}
              <div className="td">
                {tx.member_nombre ? (
                  <div className="person" style={{ minWidth: 0 }}>
                    <div className="mini-avatar c1" style={{ width: 26, height: 26, fontSize: 10 }}>
                      {tx.member_nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate" style={{ fontSize: 12.5, minWidth: 0, flex: "1 1 auto" }} title={tx.member_nombre}>
                      {tx.member_nombre}
                    </span>
                  </div>
                ) : (
                  <span className="truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }} title={persona}>
                    {persona}
                  </span>
                )}
              </div>
              <div className="td">
                <span className="method" style={{ justifySelf: "start" }} title={metodo ? metodoNombre(metodo.id) : tx.metodo_pago}>
                  {metodo && <span className={`m-badge ${metodo.id}`}>{metodo.badge}</span>}
                  <span className="truncate" style={{ display: "inline-block" }}>{metodo ? metodoNombre(metodo.id) : tx.metodo_pago}</span>
                </span>
              </div>
              <div className="td" style={{ textAlign: "right" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <span
                    className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`}
                    style={{ width: 20, height: 20 }}
                  >
                    {tx.tipo === "ingreso" ? <IconArrowUp size={10} strokeWidth={2.6} /> : <IconArrowDown size={10} strokeWidth={2.6} />}
                  </span>
                  <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                    {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                    <span className="cur">{tx.moneda}</span>
                  </span>
                </span>
              </div>
              <div className="td">
                <span className={`status-pill ${tx.estado}`}>
                  {tx.estado === "aprobado" ? t("tx.aprobado") : tx.estado === "pendiente" ? t("tx.pendiente") : t("tx.rechazado")}
                </span>
              </div>
              <div className="td" style={{ textAlign: "center" }}>
                <span className="row-actions">
                  <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(tx)}>
                    <IconEdit size={13} strokeWidth={2} />
                  </span>
                </span>
                <RowMenu onEdit={() => onEdit(tx)} onDelete={() => setPendingDelete(tx)} />
              </div>
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={t("tx.eliminarTitulo")}
          message={t("tx.eliminarMensaje", { concepto: pendingDelete.concepto, monto: `${fmtMoney(pendingDelete.monto)} ${pendingDelete.moneda}` })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
