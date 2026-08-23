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
 * **Lo que el handoff dibuja aquí y todavía no tiene motor.** Su panel trae
 * un desglose Efectivo / Cheques y una lista de los movimientos incluidos con
 * sus palomitas. En Tamio un depósito es una FILA —fecha, monto, cuenta,
 * referencia, comprobante—: **no guarda qué movimientos lo componen** ni en
 * qué forma venía el dinero.
 *
 * Por decisión de Iván (23 ago) esas secciones **se construyen igual**, con
 * su forma del diseño y diciendo qué les falta; el motor viene después, con
 * la relación depósito↔movimientos. La regla es la misma que en la pestaña
 * Familia de Aportantes: una sección sin datos todavía no es lo mismo que una
 * que no aplica.
 *
 * Lo que sí cruza entero es "Ficha de depósito", la foto del papel del banco:
 * eso es `comprobante_path` y existe desde la migración 5.
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
        {/* El titular del handoff: el corte se nombra por su fecha. */}
        <h1 className="dm-titular">{t("depositos.corteDel", { fecha: fmtFechaCorta(dep.fecha) })}</h1>
        <h2 className="dm-monto">
          {fmtMoney(dep.monto)}
          <span className="dm-moneda">{dep.moneda}</span>
        </h2>
        <p className="dm-sub">
          {[dep.cuenta_banco, dep.referencia].filter(Boolean).join(" · ")}
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
      </div>

      {/* Las tres cifras del corte. "Total" es real —es el monto—; el reparto
          entre efectivo y cheques necesita saber QUÉ movimientos entraron, y
          eso todavía no se guarda. Se dibuja el hueco en su sitio. */}
      <div className="dep-cifras">
        <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinDesgloseAyuda")}>
          <span className="dep-cifra-et">{t("depositos.efectivo")}</span>
          <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
        </div>
        <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinDesgloseAyuda")}>
          <span className="dep-cifra-et">{t("depositos.cheques")}</span>
          <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
        </div>
        <div className="dep-cifra">
          <span className="dep-cifra-et">{t("depositos.totalDepositado")}</span>
          <span className="dep-cifra-val dep-cifra-val--total">{fmtMoney(dep.monto)}</span>
        </div>
      </div>

      <div className="dep-cuerpo">
        {/* "Movimientos incluidos": la sección del diseño que espera la
            relación depósito↔movimientos. Con ella, cada fila trae su
            palomita y el corte se arma marcando. */}
        <div className="dm-tarjeta">
          <span className="dm-tarjeta-titulo">{t("depositos.movsIncluidos")}</span>
          <div className="fm-vacio fm-vacio--pendiente dep-vacio">
            <span className="fm-vacio-titulo">{t("depositos.sinMovsTitulo")}</span>
            <span className="fm-vacio-sub">{t("depositos.sinMovsSub")}</span>
          </div>
        </div>

        {/* "Ficha de depósito": esta sí es real. Con foto se ve y se
            reemplaza; sin ella, el recuadro punteado del diseño invita a
            usar la cámara — que es lo que hace el formulario de edición. */}
        <div className="dm-tarjeta dm-tarjeta--comp">
          <span className="dm-tarjeta-titulo">{t("depositos.ficha")}</span>
          {dep.comprobante_path ? (
            <div className="dm-comp-hay">
              <span className="dm-comp-icono"><IconClip size={20} strokeWidth={1.7} /></span>
              <span className="dm-comp-archivo">{dep.comprobante_path.split(/[\\/]/).pop()}</span>
              <span className="dm-comp-enlaces">
                <button type="button" onClick={() => onVerComprobante(dep.comprobante_path!)}>{t("common.ver")}</button>
                <button type="button" onClick={() => onEditar(dep)}>{t("dm.reemplazar")}</button>
              </span>
            </div>
          ) : (
            <div className="dm-comp-falta dep-ficha-falta">
              <span className="dm-comp-falta-texto">{t("depositos.sinFicha")}</span>
              <button type="button" className="dm-comp-adjuntar" onClick={() => onEditar(dep)}>
                {t("depositos.adjuntarFicha")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
