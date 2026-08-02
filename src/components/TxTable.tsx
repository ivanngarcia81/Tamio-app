import { useState } from "react";
import { useTranslation } from "react-i18next";
import { categoriaInfo, deleteTx, fmtFecha, fmtFechaCorta, fmtMoney, undeleteTx, metodoAbr, metodoNombre, METODOS_PAGO, type Tx } from "../db";
import { IconArrowDown, IconArrowUp, IconClip, IconEdit, IconRepeat } from "../icons";
import RowMenu from "./RowMenu";
import { useContextMenu, type CtxMenuItem } from "./ContextMenu";
import ComprobantePreview from "./ComprobantePreview";
import { showToast } from "../toast";
import { playSound } from "../sound";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  tipo: "ingreso" | "gasto";
  txs: Tx[];
  onEdit: (tx: Tx) => void;
  onChanged: () => void;
}

const COLS_INGRESO = "110px 1fr 140px 170px 150px 168px 110px 104px";
const COLS_GASTO = "110px 140px 1fr 170px 150px 168px 110px 104px";

export default function TxTable({ tipo, txs, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { abrirMenu, menu } = useContextMenu();
  const esIngreso = tipo === "ingreso";
  const cols = esIngreso ? COLS_INGRESO : COLS_GASTO;

  function itemsDe(tx: Tx): CtxMenuItem[] {
    const items: CtxMenuItem[] = [{ label: t("common.editar"), onClick: () => onEdit(tx) }];
    if (tx.comprobante_path) {
      items.push({ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) });
    }
    items.push({ label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(tx) });
    return items;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const borrado = pendingDelete;
    await deleteTx(borrado.id, borrado.church_id);
    setPendingDelete(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.movimientoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        // Borrado suave: se restaura la MISMA fila (mismo uid), no una nueva.
        await undeleteTx(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  return (
    <>
      <div className="data-table roomy tabla-tx">
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

          const celdaConcepto = (
            <div className="td">
              <div className="truncate" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }} title={tx.concepto}>
                {tx.recurrente_id != null && (
                  <span style={{ color: "var(--text-3)", flexShrink: 0, display: "inline-flex" }} title={t("recurrente.marcaEnTabla")}>
                    <IconRepeat size={11} strokeWidth={2.2} />
                  </span>
                )}
                <span className="truncate">{tx.concepto}</span>
              </div>
              {tx.detalle && (
                <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }} title={tx.detalle}>
                  {tx.detalle}
                </div>
              )}
            </div>
          );
          const celdaFecha = (
            <div className="td">
              <div style={{ fontWeight: 600 }}>{fmtFechaCorta(tx.fecha)}</div>
              <div className="solo-escritorio" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{hora}</div>
            </div>
          );
          const celdaCategoria = (
            <div className="td">
              <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
            </div>
          );

          return (
            <div className="tr" key={tx.id} style={{ gridTemplateColumns: cols }} onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}>
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
                  {metodo && <span className={`m-badge ${metodo.id}`}>{metodoAbr(metodo.id)}</span>}
                  <span className="truncate" style={{ display: "inline-block" }}>{metodo ? metodoNombre(metodo.id) : tx.metodo_pago}</span>
                </span>
              </div>
              <div className="td td-monto" style={{ textAlign: "right" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <span
                    className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`}
                    style={{ width: 20, height: 20 }}
                  >
                    {tx.tipo === "ingreso" ? <IconArrowUp size={10} strokeWidth={2.2} /> : <IconArrowDown size={10} strokeWidth={2.2} />}
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
              <div className="td td-acciones">
                <span className="row-actions">
                  {tx.comprobante_path && (
                    <span className="row-icon-btn" title={t("tx.verComprobante")} onClick={() => setPreview(tx.comprobante_path!)}>
                      <IconClip size={13} strokeWidth={2} />
                    </span>
                  )}
                  <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(tx)}>
                    <IconEdit size={13} strokeWidth={2} />
                  </span>
                </span>
                <RowMenu
                  onEdit={() => onEdit(tx)}
                  onDelete={() => setPendingDelete(tx)}
                  extraItems={tx.comprobante_path
                    ? [{ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) }]
                    : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>

      {menu}
      {preview && <ComprobantePreview path={preview} onClose={() => setPreview(null)} />}

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
