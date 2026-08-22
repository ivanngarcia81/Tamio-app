import { useTranslation } from "react-i18next";
import { fmtFechaCorta, fmtMoney, mesLegible, type Deposito } from "../db";
import { IconChevronLeft, IconClip, IconEdit, IconTrash } from "../icons";

interface Props {
  dep: Deposito;
  /** Título de la lista de la que se vino: es el texto del botón de volver,
   *  como hace Mail con el buzón. Solo se pinta en el modo de empuje. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (dep: Deposito) => void;
  onEliminar: (dep: Deposito) => void;
  onVerComprobante: (path: string) => void;
}

/**
 * DetalleDeposito — la columna derecha del maestro-detalle de Depósitos.
 *
 * El mismo cascarón que `DetalleMovimiento` (cabecera con la cifra grande,
 * ficha de campos, acciones) porque es la misma idea: en un iPad hay sitio
 * para MIRAR un corte antes de editarlo, y editar pasa a ser un botón en vez
 * del único destino posible al tocar la fila.
 *
 * **Lo que el handoff dibuja aquí y no existe.** Su panel trae "14
 * movimientos en efectivo y cheque", un desglose Efectivo/Cheques y una lista
 * de los movimientos incluidos con sus palomitas. En Tamio un depósito es una
 * FILA —fecha, monto, cuenta, referencia, comprobante—: no guarda qué
 * movimientos lo componen ni en qué forma venía el dinero. Enseñar esas
 * secciones pidiendo los datos a la nada sería inventarlas, así que se toma
 * la ESTRUCTURA del panel y no su contenido (docs/ipad-rediseno.md §4, el
 * mismo criterio del "Rastro de auditoría" y de la taxonomía de alertas de
 * la Bandeja).
 *
 * Lo que sí cruza entero es la última sección: "Ficha de depósito", la foto
 * del papel del banco. Eso es `comprobante_path`, y existe.
 */
export default function DetalleDeposito({ dep, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante }: Props) {
  const { t } = useTranslation();

  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo">
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  /* El período solo se canta cuando NO coincide con el mes de la fecha. Si
     coincide, repetirlo haría pensar que son dos datos distintos — es el
     mismo criterio que ya usa la fila de `DepositoTable`. */
  const periodoDistinto = dep.periodo !== dep.fecha.slice(0, 7);

  return (
    <div className="dm">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <h2 className="dm-monto">
          {fmtMoney(dep.monto)}
          <span className="dm-moneda">{dep.moneda}</span>
        </h2>
        <p className="dm-sub">
          {[fmtFechaCorta(dep.fecha), dep.cuenta_banco].filter(Boolean).join(" · ")}
        </p>
        <div className="dm-acciones">
          {dep.comprobante_path && (
            <button type="button" className="btn secondary" onClick={() => onVerComprobante(dep.comprobante_path!)}>
              <IconClip size={14} strokeWidth={2} /> {t("tx.verComprobante")}
            </button>
          )}
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(dep)}>
            <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(dep)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      <div className="dm-ficha">
        {fila(t("tx.colFecha"), fmtFechaCorta(dep.fecha))}
        {periodoDistinto ? fila(t("depositos.periodoCorrespondiente"), mesLegible(dep.periodo)) : null}
        {fila(t("depositos.colCuenta"), dep.cuenta_banco)}
        {fila(t("depositos.colReferencia"), dep.referencia)}
        {fila(t("depositos.colNotas"), dep.notas)}
        {dep.comprobante_path ? null : (
          <div className="dm-campo">
            <span className="dm-campo-etiqueta">{t("depositos.ficha")}</span>
            <span className="dm-campo-valor" style={{ color: "var(--text-3)", fontWeight: 400 }}>
              {t("depositos.sinFicha")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
