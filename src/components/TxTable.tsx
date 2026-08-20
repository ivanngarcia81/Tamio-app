import { useState } from "react";
import { useTranslation } from "react-i18next";
import { categoriaInfo, deleteTx, fmtFecha, fmtFechaCorta, fmtMoney, undeleteTx, metodoAbr, metodoNombre, METODOS_PAGO, type Tx } from "../db";
import { IconArrowDown, IconArrowUp, IconClip, IconEdit, IconRepeat } from "../icons";
import { esIPhone, esMac } from "../movil";
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

/* Ingresos y Gastos son páginas gemelas y comparten reparto: el concepto ocupa
   la columna elástica y la categoría una fija. Antes iban al revés en Gastos,
   así que las dos tablas se leían distinto sin motivo. */
const COLS_INGRESO = "110px 1fr 140px 170px 150px 168px 110px 104px";
const COLS_GASTO = COLS_INGRESO;

/* En el Mac, columnas más estrechas — y esto NO es cosmético.
   Las de arriba suman 952 px de ancho FIJO. Medido con Playwright: en una
   ventana de 1240 px la tabla mide 954, así que a la columna elástica —el
   concepto, que es lo que identifica la fila— le quedan 2 px, y el texto se
   dibuja con CERO. La app te decía que hubo un gasto de $3,450 y nunca de
   qué. Solo se recupera por encima de ~1400 px de ventana.
   Es el mismo fallo que ya se corrigió en la Agenda del iPhone, donde el
   nombre del evento salía a 0 px.
   Con este reparto (780 px fijos) el concepto se queda en 176 px a 1240.
   El mínimo de 160 px es el que impide que el fallo vuelva en ventanas más
   chicas: por debajo de ~1210 px ya no hay holgura que repartir, y sin suelo
   la columna volvería a cerrarse a cero. Con él, la tabla se desplaza en
   horizontal —que para eso lleva `overflow-x: auto` desde siempre— en vez de
   esconder el dato. 160 y no 180 porque a 1240, que es una ventana muy
   corriente, 176 px de holgura entran justos y así no aparece una barra de
   desplazamiento que no hace falta. */
const COLS_MAC = "92px minmax(160px, 1fr) 124px 148px 126px 128px 86px 76px";

export default function TxTable({ tipo, txs, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { abrirMenu, menu } = useContextMenu();
  const esIngreso = tipo === "ingreso";
  const enIPhone = esIPhone();
  const cols = esMac() ? COLS_MAC : esIngreso ? COLS_INGRESO : COLS_GASTO;

  function itemsDe(tx: Tx): CtxMenuItem[] {
    const items: CtxMenuItem[] = [{ label: t("common.editar"), onClick: () => onEdit(tx) }];
    if (tx.comprobante_path) {
      items.push({ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) });
    }
    items.push({ label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(tx) });
    return items;
  }

  /** Borra ya, con "Deshacer". Lo llaman el diálogo de confirmación y el
   *  deslizamiento completo de la fila en el móvil (ver `onBorrarDirecto`
   *  en RowMenu): ese gesto no pasa por diálogo a propósito. */
  async function borrarConDeshacer(borrado: Tx) {
    await deleteTx(borrado.id, borrado.church_id);
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    const borrado = pendingDelete;
    setPendingDelete(null);
    await borrarConDeshacer(borrado);
  }

  return (
    <>
      <div className={enIPhone ? "ios-listcard" : "data-table roomy tabla-tx"}>
        {!enIPhone && (
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            <div className="th">{t("tx.colFecha")}</div>
            <div className="th">{esIngreso ? t("tx.colConcepto") : t("tx.colDescripcion")}</div>
            <div className="th">{t("tx.colCategoria")}</div>
            <div className="th">{esIngreso ? t("tx.colMiembro") : t("tx.colBeneficiario")}</div>
            <div className="th">{t("tx.colMetodo")}</div>
            <div className="th" style={{ textAlign: "right" }}>{t("tx.colMonto")}</div>
            <div className="th">{t("tx.colEstado")}</div>
            <div className="th"></div>
          </div>
        )}
        {txs.map((tx) => {
          const cat = categoriaInfo(tx.tipo, tx.categoria);
          const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
          const persona = tx.member_nombre ?? tx.beneficiario ?? "—";
          const hora = fmtFecha(tx.fecha).hora;

          const metodoTexto = metodo ? metodoNombre(metodo.id) : tx.metodo_pago;
          /* En el teléfono el titular de la fila pasa a ser la PERSONA
             (miembro o beneficiario), no el concepto: en altas rápidas el
             concepto suele ser literalmente el nombre de la categoría
             ("Tithe"/"Diezmo"), que ya se lee en la secundaria — repetirlo
             en negrita no informa nada, y de paso enterraba el nombre (el
             dato que de verdad identifica la fila) al final de una línea
             que se corta con "…" antes de llegar a él. En Mac no cambia:
             concepto y persona ya viven en columnas separadas, sin eco. */
          const personaTitular = persona !== "—" ? persona : null;
          const conceptoRedundante = tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
          const secundariaMovil = [
            fmtFechaCorta(tx.fecha),
            personaTitular && !conceptoRedundante ? tx.concepto : null,
            cat.nombre,
            metodoTexto,
          ].filter(Boolean).join(" · ");

          if (enIPhone) {
            return (
              <div
                className="ios-txrow"
                data-fila
                key={tx.id}
                onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}
              >
                <span className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`} aria-hidden="true">
                  {tx.tipo === "ingreso" ? <IconArrowUp size={13} strokeWidth={2.2} /> : <IconArrowDown size={13} strokeWidth={2.2} />}
                </span>
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title" title={personaTitular ?? tx.concepto}>
                    {tx.recurrente_id != null && (
                      <span style={{ color: "var(--text-3)", flexShrink: 0, display: "inline-flex", marginRight: 4 }} title={t("recurrente.marcaEnTabla")}>
                        <IconRepeat size={12} strokeWidth={2.2} />
                      </span>
                    )}
                    <span className="truncate">{personaTitular ?? tx.concepto}</span>
                    {tx.estado === "pendiente" && <span className="tx-punto-pendiente" title={t("tx.pendiente")} />}
                  </div>
                  <div className="tx-secundaria-movil" title={secundariaMovil}>{secundariaMovil}</div>
                </div>
                <div className="ios-txrow-trailing">
                  {tx.comprobante_path && (
                    <span className="row-icon-btn" title={t("tx.verComprobante")} onClick={() => setPreview(tx.comprobante_path!)}>
                      <IconClip size={13} strokeWidth={2} />
                    </span>
                  )}
                  <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                    {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                    <span className="cur">{tx.moneda}</span>
                  </span>
                </div>
                <RowMenu
                  onEdit={() => onEdit(tx)}
                  onDelete={() => setPendingDelete(tx)}
                  onBorrarDirecto={() => void borrarConDeshacer(tx)}
                  extraItems={tx.comprobante_path
                    ? [{ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) }]
                    : undefined}
                />
              </div>
            );
          }

          const celdaConcepto = (
            <div className="td">
              <div className="truncate" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }} title={personaTitular ?? tx.concepto}>
                <span
                  className={`tx-icon tx-concepto-icono ${tx.tipo === "ingreso" ? "income" : "expense"}`}
                  aria-hidden="true"
                >
                  {tx.tipo === "ingreso" ? <IconArrowUp size={10} strokeWidth={2.2} /> : <IconArrowDown size={10} strokeWidth={2.2} />}
                </span>
                {tx.recurrente_id != null && (
                  <span style={{ color: "var(--text-3)", flexShrink: 0, display: "inline-flex" }} title={t("recurrente.marcaEnTabla")}>
                    <IconRepeat size={11} strokeWidth={2.2} />
                  </span>
                )}
                <span className="truncate solo-escritorio">{tx.concepto}</span>
                <span className="truncate solo-movil">{personaTitular ?? tx.concepto}</span>
                {tx.estado === "pendiente" && <span className="tx-punto-pendiente" title={t("tx.pendiente")} />}
              </div>
              {tx.detalle && (
                <div className="truncate solo-escritorio" style={{ fontSize: 11.5, color: "var(--text-3)" }} title={tx.detalle}>
                  {tx.detalle}
                </div>
              )}
              <div className="tx-secundaria-movil solo-movil" title={secundariaMovil}>{secundariaMovil}</div>
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
            <div className="tr" data-fila key={tx.id} style={{ gridTemplateColumns: cols }} onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}>
              {celdaFecha}
              {celdaConcepto}
              {celdaCategoria}
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
                  {/* En el teléfono esta flecha se duplica junto al concepto
                      (arriba, .tx-concepto-icono) y esta copia se oculta: la
                      columna de importe queda con cifras puras, alineadas a
                      la derecha, sin nada que le reste ancho útil. En Mac se
                      queda igual que siempre, junto al importe. */}
                  <span
                    className={`tx-icon solo-escritorio ${tx.tipo === "ingreso" ? "income" : "expense"}`}
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
                  <span className="row-icon-btn solo-escritorio" title={t("common.editar")} onClick={() => onEdit(tx)}>
                    <IconEdit size={13} strokeWidth={2} />
                  </span>
                </span>
                <RowMenu
                  onEdit={() => onEdit(tx)}
                  onDelete={() => setPendingDelete(tx)}
                  onBorrarDirecto={() => void borrarConDeshacer(tx)}
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
