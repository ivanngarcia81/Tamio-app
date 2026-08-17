import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteDeposito, fmtFechaCorta, fmtMoney, mesLegible, undeleteDeposito, type Deposito } from "../db";
import { IconEdit } from "../icons";
import RowMenu from "./RowMenu";
import { useContextMenu } from "./ContextMenu";
import { showToast } from "../toast";
import { playSound } from "../sound";
import ConfirmDialog from "./ConfirmDialog";
import { esIPhone } from "../movil";

interface Props {
  depositos: Deposito[];
  onEdit: (dep: Deposito) => void;
  onChanged: () => void;
}

const COLS = "100px 1fr 140px 1fr 150px 72px";

export default function DepositoTable({ depositos, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Deposito | null>(null);
  const { abrirMenu, menu } = useContextMenu();

  function confirmDelete() {
    if (pendingDelete) void borrarConDeshacer(pendingDelete);
  }

  /** Borra ya, con "Deshacer". Lo llaman el diálogo y el deslizamiento completo
   *  de la fila en el móvil (ver `onBorrarDirecto` en RowMenu). */
  async function borrarConDeshacer(borrado: Deposito) {
    await deleteDeposito(borrado.id, borrado.church_id);
    setPendingDelete(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.depositoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        // Borrado suave: se restaura la MISMA fila (mismo uid), no una nueva.
        await undeleteDeposito(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  /* Misma fila que ya usan Movimientos y las demás tablas convertidas: un
     `<div data-fila>` con RowMenu dentro, no un tercer patrón. La fila en sí
     no es tocable (no lleva `--clickable`) porque las acciones viven en el
     deslizamiento y en el "···", igual que en Movimientos; el lápiz de la
     columna de acciones se va porque en el teléfono duplicaba la primera
     entrada del propio menú. Las notas no caben en dos líneas y se quedan
     solo en Mac: son el campo más largo y el menos consultado. */
  if (esIPhone()) {
    return (
      <>
        <div className="ios-listcard">
          {depositos.map((dep) => {
            // El período solo se canta cuando NO coincide con el mes de la
            // fecha; si no, un depósito parecería no contar en ningún lado.
            // Va ANTES de la referencia, no después: la línea se recorta a
            // unos 150 px y puesto al final no llegaba a verse nunca —
            // justo en las filas donde es lo único que hay que leer.
            const secundaria = [
              fmtFechaCorta(dep.fecha),
              dep.periodo !== dep.fecha.slice(0, 7)
                ? t("depositos.correspondeA", { periodo: mesLegible(dep.periodo) })
                : null,
              dep.referencia,
            ].filter(Boolean).join(" · ");
            return (
              <div
                className="ios-txrow" data-fila
                key={dep.id}
                onContextMenu={(e) =>
                  abrirMenu(e, [
                    { label: t("common.editar"), onClick: () => onEdit(dep) },
                    { label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(dep) },
                  ])}
              >
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title" title={dep.cuenta_banco}>
                    <span className="truncate">{dep.cuenta_banco}</span>
                  </div>
                  <div className="tx-secundaria-movil" title={secundaria}>{secundaria}</div>
                </div>
                <div className="ios-txrow-trailing">
                  <span className="tx-amount negative">
                    {fmtMoney(dep.monto)}<span className="cur">{dep.moneda}</span>
                  </span>
                </div>
                <RowMenu
                  onEdit={() => onEdit(dep)}
                  onDelete={() => setPendingDelete(dep)}
                  onBorrarDirecto={() => void borrarConDeshacer(dep)}
                />
              </div>
            );
          })}
        </div>

        {menu}

        {pendingDelete && (
          <ConfirmDialog
            title={t("depositos.eliminarTitulo")}
            message={t("depositos.eliminarMensaje", { monto: `${fmtMoney(pendingDelete.monto)} ${pendingDelete.moneda}`, cuenta: pendingDelete.cuenta_banco })}
            confirmLabel={t("common.eliminar")}
            danger
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="data-table roomy tabla-depositos">
        <div className="thead" style={{ gridTemplateColumns: COLS }}>
          <div className="th">{t("tx.colFecha")}</div>
          <div className="th">{t("depositos.colCuenta")}</div>
          <div className="th">{t("depositos.colReferencia")}</div>
          <div className="th">{t("depositos.colNotas")}</div>
          <div className="th" style={{ textAlign: "right" }}>{t("tx.colMonto")}</div>
          <div className="th"></div>
        </div>
        {depositos.map((dep) => (
          <div
            className="tr" data-fila
            key={dep.id}
            style={{ gridTemplateColumns: COLS }}
            onContextMenu={(e) =>
              abrirMenu(e, [
                { label: t("common.editar"), onClick: () => onEdit(dep) },
                { label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(dep) },
              ])}
          >
            <div className="td">
              <div style={{ fontWeight: 600 }}>{fmtFechaCorta(dep.fecha)}</div>
              {/* Los totales suman por período. Cuando coincide con el mes de la
                  fecha no hace falta decir nada; cuando NO coincide hay que
                  cantarlo, porque si no el depósito parece no contar en ningún
                  lado. Sin `solo-escritorio` a propósito: esa clase lo ocultaba
                  en el iPhone por redundante, y aquí ya nunca lo es. */}
              {dep.periodo !== dep.fecha.slice(0, 7) && (
                <div
                  style={{ fontSize: 11.5, color: "var(--accent-4)", fontWeight: 600 }}
                  title={t("depositos.correspondeATitulo")}
                >
                  {t("depositos.correspondeA", { periodo: mesLegible(dep.periodo) })}
                </div>
              )}
            </div>
            <div className="td">
              <div className="truncate" style={{ fontWeight: 600 }} title={dep.cuenta_banco}>{dep.cuenta_banco}</div>
            </div>
            <div className="td">
              <span className="truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }} title={dep.referencia ?? undefined}>
                {dep.referencia ?? "—"}
              </span>
            </div>
            <div className="td">
              <span className="truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }} title={dep.notas ?? undefined}>
                {dep.notas ?? "—"}
              </span>
            </div>
            <div className="td" style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(dep.monto)}<span className="cur" style={{ color: "var(--text-3)", fontWeight: 600, fontSize: 11, marginLeft: 3 }}>{dep.moneda}</span>
            </div>
            <div className="td td-acciones">
              <span className="row-actions">
                <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(dep)}>
                  <IconEdit size={13} strokeWidth={2} />
                </span>
              </span>
              <RowMenu
                onEdit={() => onEdit(dep)}
                onDelete={() => setPendingDelete(dep)}
                onBorrarDirecto={() => void borrarConDeshacer(dep)}
              />
            </div>
          </div>
        ))}
      </div>

      {menu}

      {pendingDelete && (
        <ConfirmDialog
          title={t("depositos.eliminarTitulo")}
          message={t("depositos.eliminarMensaje", { monto: `${fmtMoney(pendingDelete.monto)} ${pendingDelete.moneda}`, cuenta: pendingDelete.cuenta_banco })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
