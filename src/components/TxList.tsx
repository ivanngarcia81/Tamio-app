import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { categoriaInfo, deleteTx, fmtFecha, fmtMoney, undeleteTx, metodoAbr, metodoNombre, METODOS_PAGO, type Tx } from "../db";
import { IconArrowDown, IconArrowUp, IconPlus, IconReportes, IconRepeat } from "../icons";
import RowMenu from "./RowMenu";
import { useContextMenu, type CtxMenuItem } from "./ContextMenu";
import ComprobantePreview from "./ComprobantePreview";
import { showToast } from "../toast";
import { playSound } from "../sound";
import ConfirmDialog from "./ConfirmDialog";

export function EmptyState({ titulo, sub, icon, accion, pagina, duplicaCrear }: {
  titulo: string;
  sub: string;
  icon?: ReactNode;
  /** Acción principal ("Registrar gasto"): solo se pasa cuando el vacío es
   *  real (aún no hay datos), no cuando es resultado de un filtro/búsqueda. */
  accion?: { label: string; onClick: () => void };
  /** El vacío es TODO el contenido de la pantalla (Bandeja, Mensajes). Sin
   *  esto la tarjeta queda corta y pegada arriba de una pantalla en blanco, y
   *  parece que la página no terminó de cargar. */
  pagina?: boolean;
  /** true cuando `accion` crea algo que TAMBIÉN está en la hoja de "¿Qué
   *  desea crear?" del botón flotante (ingreso, gasto, depósito, acta,
   *  servicio…) — en el teléfono ese botón ya está siempre a mano, así que
   *  el de aquí sobra y se oculta. En Mac/iPad no hay botón flotante, así
   *  que ahí se queda igual. Ojo: no todo lo que crea EmptyState tiene
   *  atajo — Miembros en /miembros, por ejemplo, no lo tiene, y no debe
   *  llevar esta marca. */
  duplicaCrear?: boolean;
}) {
  return (
    <div className={`empty-state${pagina ? " pagina" : ""}`}>
      <div className="empty-icon">{icon ?? <IconReportes size={22} strokeWidth={1.6} />}</div>
      <div className="empty-title">{titulo}</div>
      <div className="empty-sub">{sub}</div>
      {accion && (
        <button
          className={`btn primary empty-accion${duplicaCrear ? " duplica-crear" : ""}`}
          onClick={accion.onClick}
        >
          <IconPlus size={14} /> {accion.label}
        </button>
      )}
    </div>
  );
}

interface Props {
  txs: Tx[];
  onEdit: (tx: Tx) => void;
  onChanged: () => void;
}

export default function TxList({ txs, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { abrirMenu, menu } = useContextMenu();

  if (txs.length === 0) return null;

  function itemsDe(tx: Tx): CtxMenuItem[] {
    const items: CtxMenuItem[] = [{ label: t("common.editar"), onClick: () => onEdit(tx) }];
    if (tx.comprobante_path) {
      items.push({ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) });
    }
    items.push({ label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(tx) });
    return items;
  }

  /** El diálogo confirma; el borrado real lo hace borrarConDeshacer. */
  function confirmDelete() {
    if (pendingDelete) void borrarConDeshacer(pendingDelete);
  }

  /** Borra ya, con "Deshacer". Lo llaman el diálogo y el deslizamiento
   *  completo de la fila en el móvil; el gesto no pasa por el diálogo a
   *  propósito (ver `onBorrarDirecto` en RowMenu). */
  async function borrarConDeshacer(borrado: Tx) {
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
                  /* En el teléfono, `quien`, categoría y método dejan de ser
                     tres elementos sueltos de la rejilla y pasan a UNA sola
                     línea de texto corrido — el mismo `secundariaMovil` que ya
                     usa TxTable en Ingresos/Gastos. Como elementos separados,
                     `método` caía en la columna del importe (132px) y quedaba
                     a media fila del `·` que lo precedía: el hueco horizontal
                     enorme entre concepto y cifra. Aquí NO va la fecha (sí en
                     TxTable) porque esta lista ya viene agrupada por día.

                     Mismo ajuste que TxTable: el titular pasa a ser la
                     PERSONA, no el concepto — en altas rápidas el concepto
                     suele ser literalmente el nombre de la categoría
                     ("Tithe"/"Diezmo"), que ya se lee en la secundaria.
                     Repetirlo en negrita no informaba nada y enterraba el
                     nombre (el dato que de verdad identifica la fila) al
                     final de una línea que se corta con "…" antes de llegar
                     a él. Sin persona, el titular sigue siendo el concepto. */
                  const personaTitular = quien || null;
                  const conceptoRedundante = tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
                  const metodoTexto = metodo ? metodoNombre(metodo.id) : tx.metodo_pago;
                  const secundariaMovil = [
                    personaTitular && !conceptoRedundante ? tx.concepto : null,
                    cat.nombre,
                    metodoTexto,
                  ].filter(Boolean).join(" · ");
                  return (
                    <div className="tx-row" data-fila key={tx.id} onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}>
                      {/* La hora es opcional al registrar, así que hay filas
                          guardadas solo como YYYY-MM-DD. Sin nada que pintar, la
                          columna quedaba en blanco y la fila parecía a medio
                          renderizar; un guion la deja como "sin hora anotada". */}
                      <span className="tx-time solo-escritorio">
                        {fmtFecha(tx.fecha).hora || <span style={{ color: "var(--text-3)" }}>—</span>}
                      </span>
                      <div className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`}>
                        {tx.tipo === "ingreso" ? <IconArrowUp /> : <IconArrowDown />}
                      </div>
                      <div className="tx-desc">
                        {tx.recurrente_id != null && (
                          <span style={{ color: "var(--text-3)", marginRight: 5, display: "inline-flex", verticalAlign: "middle" }} title={t("recurrente.marcaEnTabla")}>
                            <IconRepeat size={11} strokeWidth={2.2} />
                          </span>
                        )}
                        <span className="solo-escritorio">{tx.concepto}</span>
                        <span className="solo-movil">{personaTitular ?? tx.concepto}</span>
                        {tx.estado === "pendiente" && (
                          <span
                            /* Tokens y no hex: con los colores a mano esta
                               insignia quedaba como un parche amarillo sobre el
                               fondo oscuro. */
                            style={{
                              display: "inline-block",
                              marginLeft: 8,
                              fontSize: 10,
                              fontWeight: 700,
                              color: "var(--warn)",
                              background: "var(--warn-bg)",
                              padding: "2px 8px",
                              borderRadius: 999,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              verticalAlign: "middle",
                            }}
                          >
                            {t("tx.pendiente")}
                          </span>
                        )}
                        {quien && <span className="who solo-escritorio">{quien}</span>}
                        {tx.comprobante_path && (
                          <span
                            title={t("tx.verComprobante")}
                            onClick={(e) => { e.stopPropagation(); setPreview(tx.comprobante_path!); }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              marginLeft: 8, fontSize: 11, color: "var(--text-2)", cursor: "pointer",
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            {t("tx.comprobante")}
                          </span>
                        )}
                      </div>
                      <div className="tx-secundaria-movil solo-movil" title={secundariaMovil}>{secundariaMovil}</div>
                      <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
                      <span className="method">
                        {metodo && (
                          <span className={`m-badge ${metodo.id}`}>{metodoAbr(metodo.id)}</span>
                        )}
                        {metodo ? metodoNombre(metodo.id) : tx.metodo_pago}
                      </span>
                      <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                        {tx.tipo === "ingreso" ? "+" : "−"}
                        {fmtMoney(tx.monto).replace("−", "")}
                        <span className="cur">{tx.moneda}</span>
                      </span>
                      <RowMenu
                        onBorrarDirecto={() => void borrarConDeshacer(tx)}
                        onEdit={() => onEdit(tx)}
                        onDelete={() => setPendingDelete(tx)}
                        extraItems={tx.comprobante_path
                          ? [{ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) }]
                          : undefined}
                      />
                    </div>
                  );
                })}
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
