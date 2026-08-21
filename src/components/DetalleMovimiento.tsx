import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, fmtFecha, fmtFechaCorta, fmtMoney, metodoNombre, METODOS_PAGO, type Tx,
} from "../db";
import { IconChevronLeft, IconClip, IconEdit, IconRepeat, IconTrash } from "../icons";

interface Props {
  tx: Tx;
  /** Título de la lista de la que se vino ("Ingresos"/"Gastos"): es el texto
   *  del botón de volver, como hace Mail con el buzón. El botón solo se pinta
   *  en el modo de empuje (iPad angosto); en columnas lo esconde el CSS. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (tx: Tx) => void;
  onEliminar: (tx: Tx) => void;
  onVerComprobante: (path: string) => void;
  /** Sustituye la fila de botones por otra. Lo usa la Bandeja, donde el
   *  mismo movimiento se mira para APROBARLO, no para editarlo o borrarlo:
   *  ahí las acciones son "Marcar revisado" y "Editar", y "Eliminar" no
   *  pinta nada. La ficha —importe, campos, comprobante— es la misma, que
   *  es justo el motivo de reutilizar este componente en vez de escribir un
   *  segundo panel que enseñe lo mismo con otro código. */
  acciones?: ReactNode;
}

/**
 * DetalleMovimiento — la columna derecha del maestro-detalle del iPad.
 *
 * Es la pantalla que en el Mac y el iPhone no existe: ahí tocar un movimiento
 * abre directamente el formulario de edición. En un iPad en horizontal hay
 * sitio para MIRAR antes de editar — el importe grande, la ficha de campos y
 * el comprobante — y editar pasa a ser un botón, no el único destino posible.
 *
 * Solo enseña datos que existen. El diseño de referencia traía además un
 * "Rastro de auditoría" (creado por, editado a las…) que NO se construye:
 * `transactions` no guarda quién creó ni un historial de cambios, y una ficha
 * que inventa datos es peor que una que no está (docs/ipad-rediseno.md §4).
 */
export default function DetalleMovimiento({ tx, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante, acciones }: Props) {
  const { t } = useTranslation();
  const esIngreso = tx.tipo === "ingreso";
  const cat = categoriaInfo(tx.tipo, tx.categoria);
  const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
  const metodoTexto = metodo ? metodoNombre(metodo.id) : tx.metodo_pago;
  const hora = fmtFecha(tx.fecha).hora;
  const persona = esIngreso ? tx.member_nombre ?? tx.beneficiario : tx.beneficiario;

  /** Una fila etiqueta·valor de la ficha; con valor vacío no se pinta, para
   *  que un gasto sin notas no enseñe una fila que dice "Notas: —". */
  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo">
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  return (
    <div className="dm">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <div className="dm-chips">
          <span className={`tag ${cat.tagClass}`}>{cat.nombre}</span>
          <span className={`status-pill ${tx.estado}`}>
            {tx.estado === "aprobado" ? t("tx.aprobado") : tx.estado === "pendiente" ? t("tx.pendiente") : t("tx.rechazado")}
          </span>
          {tx.recurrente_id != null && (
            <span className="dm-chip-rec" title={t("recurrente.marcaEnTabla")}>
              <IconRepeat size={12} strokeWidth={2.2} /> {t("recurrente.titulo")}
            </span>
          )}
        </div>
        <h2 className={`dm-monto ${esIngreso ? "positive" : "negative"}`}>
          {esIngreso ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
          <span className="dm-moneda">{tx.moneda}</span>
        </h2>
        <p className="dm-sub">
          {[fmtFechaCorta(tx.fecha), hora || null, metodoTexto].filter(Boolean).join(" · ")}
        </p>
        <div className="dm-acciones">
          {tx.comprobante_path && (
            <button type="button" className="btn secondary" onClick={() => onVerComprobante(tx.comprobante_path!)}>
              <IconClip size={14} strokeWidth={2} /> {t("tx.verComprobante")}
            </button>
          )}
          {acciones ?? (
            <>
              <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(tx)}>
                <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
              </button>
              <button type="button" className="btn primary" onClick={() => onEditar(tx)}>
                <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dm-ficha">
        {fila(t("recordModal.fecha"), [fmtFechaCorta(tx.fecha), hora || null].filter(Boolean).join(", "))}
        {fila(esIngreso ? t("recordModal.aportante") : t("recordModal.beneficiario"), persona)}
        {fila(t("recordModal.rfc"), tx.beneficiario_rfc)}
        {fila(t("recordModal.metodoPago"), metodoTexto)}
        {fila(t("recordModal.categoria"), tx.subcategoria ? `${cat.nombre} · ${tx.subcategoria}` : cat.nombre)}
        {fila(t("recordModal.concepto"), tx.concepto)}
        {fila(t("recordModal.notas"), tx.detalle)}
        {tx.emitir_constancia ? fila(t("recordModal.constanciaCorta"), t("common.si")) : null}
      </div>
    </div>
  );
}
