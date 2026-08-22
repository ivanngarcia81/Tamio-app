import { useTranslation } from "react-i18next";
import { fmtFechaCorta, fmtMoney, mesLegible, type Deposito } from "../db";
import { IconChevronLeft, IconClip, IconEdit, IconTrash } from "../icons";

interface Props {
  dep: Deposito;
  /** Título de la lista ("Depósitos"): el texto del botón de volver del modo
   *  de empuje. En columnas el CSS lo esconde, igual que en movimientos. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (dep: Deposito) => void;
  onEliminar: (dep: Deposito) => void;
  onVerComprobante: (path: string) => void;
}

/**
 * DetalleDeposito — la columna derecha del maestro-detalle de Depósitos.
 *
 * La misma anatomía que DetalleMovimiento (importe grande, ficha de campos,
 * comprobante como botón), porque un depósito ES un movimiento de dinero:
 * quien ya miró un ingreso en el iPad no aprende nada nuevo aquí. El importe
 * va en color neutro — la lista es de un solo tipo y el signo no distingue
 * nada, el mismo criterio que las filas de Ingresos/Gastos.
 *
 * El diseño de referencia traía además el segmentado Pendientes/Depositados,
 * "Marcar depositado" y la lista de movimientos incluidos en el corte. Nada
 * de eso existe: `depositos_bancarios` no guarda estado ni vínculos con
 * `transactions` — un depósito aquí se registra cuando ya se hizo. Se toma la
 * estructura (lista de 378px + panel), no los datos inventados
 * (docs/ipad-rediseno.md §4).
 */
export default function DetalleDeposito({ dep, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante }: Props) {
  const { t } = useTranslation();
  const periodoDistinto = dep.periodo !== dep.fecha.slice(0, 7);

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
        {periodoDistinto && (
          <div className="dm-chips">
            <span className="tag servicios" title={t("depositos.correspondeATitulo")}>
              {t("depositos.correspondeA", { periodo: mesLegible(dep.periodo) })}
            </span>
          </div>
        )}
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
        {fila(t("depositos.fechaDeposito"), fmtFechaCorta(dep.fecha))}
        {fila(t("depositos.periodoCorrespondiente"), mesLegible(dep.periodo))}
        {fila(t("depositos.cuentaBancaria"), dep.cuenta_banco)}
        {fila(t("depositos.colReferencia"), dep.referencia)}
        {fila(t("depositos.colNotas"), dep.notas)}
      </div>
    </div>
  );
}
