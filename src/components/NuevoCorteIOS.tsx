/**
 * NuevoCorteIOS.tsx — la hoja "Nuevo corte" del handoff 3 (24 ago 2026).
 *
 * Un **corte** es, en el diseño, un grupo con nombre de los movimientos que
 * van juntos al banco: se le pone nombre, cuenta, fecha y responsable, se
 * marcan los movimientos que entran, y queda esperando a que alguien lo
 * deposite.
 *
 * **En el repo no existe.** No hay tabla de cortes, `transactions` no guarda
 * si un movimiento ya fue al banco y `depositos_bancarios` no guarda qué
 * movimientos lo componen. Así que la hoja se construye entera —por decisión
 * de Iván (23 ago): primero la plantilla, el motor después— y **"Crear" sale
 * apagado con su explicación**, el mismo trato que "Recopilar firmas" en
 * Actas.
 *
 * Lo que sí es real dentro de la hoja, y no es poco: los movimientos que
 * lista, sus montos, el desglose efectivo/cheques y el total, que se
 * recalculan al marcar igual que en el panel de Pendientes —salen de la misma
 * selección, así que la hoja y el panel no se pueden descuadrar—. Lo que no
 * se puede es GUARDARLO.
 *
 * "Pedir doble firma" es uno de los interruptores que el handoff 1 ya traía
 * inventados (§4): no existe en el esquema ni como ajuste. Va apagado con su
 * explicación, como los otros cuatro Controles de tesorería.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { ActionField, Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { fmtFechaCorta, fmtMoney, metodoAbr, type Church, type Tx } from "../db";
import { sumar, type Centavos } from "../dinero";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  church: Church;
  /** Los movimientos del corte abierto, con su selección viva. */
  movs: Tx[];
  sel: Set<number>;
  onToggle: (id: number) => void;
  /** Nombre propuesto ("Corte del 23 ago") y la cuenta del último depósito. */
  nombre: string;
  cuenta: string;
  fecha: string;
  onClose: () => void;
}

const esCheque = (t: Tx) => t.metodo_pago === "cheque";

export default function NuevoCorteIOS({ church, movs, sel, onToggle, nombre, cuenta, fecha, onClose }: Props) {
  const { t } = useTranslation();
  const titulo = t("depositos.nuevoCorte");
  /* El nombre se puede escribir aunque no se pueda guardar: un campo que
     ignora lo que tecleas es peor que uno apagado, y la hoja entera ya dice
     con todas las letras que no hay dónde guardarla. */
  const [nombreCorte, setNombreCorte] = useState(nombre);
  useEscapeClose(onClose);

  const marcados = movs.filter((m) => sel.has(m.id));
  const suma = (f: (x: Tx) => boolean): Centavos =>
    sumar(...marcados.filter(f).map((m) => m.monto));
  const efectivo = suma((m) => !esCheque(m));
  const cheques = suma(esCheque);
  const total = sumar(efectivo, cheques);
  const nCheques = marcados.filter(esCheque).length;

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              {/* Apagado a propósito: no hay dónde guardar un corte. Con su
                  `title`, para que el botón explique en vez de prometer. */}
              <button type="button" className="ios-nav-action" disabled title={t("depositos.corteSinMotorAyuda")}>
                {t("depositos.crearCorte")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <div className="nm-monto nm-monto--lectura">
              <span className="nm-monto-et">{t("depositos.totalADepositar")}</span>
              <span className="nm-monto-cifra">{fmtMoney(total)}</span>
              <span className="nm-monto-pie">
                {t("depositos.nDeMSeleccionados", { n: marcados.length, total: movs.length })}
              </span>
            </div>

            {/* El aviso que hace honesta a la hoja entera: se puede llenar,
                no se puede guardar. Va arriba, no al final, porque decidirlo
                después de rellenar cuatro campos es peor. */}
            <p className="nm-aviso nm-aviso--info" role="note">{t("depositos.corteSinMotorAyuda")}</p>

            <Section header={t("depositos.datosDelCorte")}>
              <TextField label={t("depositos.nombreCorte")} value={nombreCorte} onChange={setNombreCorte} stacked />
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.colCuenta")}</span>
                <span className="ios-field-value">{cuenta || t("depositos.sinCuentaAun")}</span>
              </div>
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.fechaDeposito")}</span>
                <span className="ios-field-value">{fmtFechaCorta(fecha)}</span>
              </div>
              {/* "Responsable" es el mismo dato que §4 ya marcó como
                  inexistente: no hay usuario en el registro. */}
              <div className="ios-field ios-field--apagado" title={t("depositos.responsableSinMotor")}>
                <span className="ios-field-label">{t("depositos.responsable")}</span>
                <span className="ios-field-value">{t("detalleMiembro.sinCapturar")}</span>
              </div>
            </Section>

            <Section header={t("depositos.movsSinDepositar")}>
              {movs.length === 0 ? (
                <div className="ios-field"><span className="ios-field-label">{t("depositos.sinMovsEnCaja")}</span></div>
              ) : movs.map((m) => {
                const marcado = sel.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`ios-field ios-field--marcar${marcado ? " sel" : ""}`}
                    aria-pressed={marcado}
                    onClick={() => onToggle(m.id)}
                  >
                    <span className="dep-mov-check" aria-hidden="true">{marcado ? "✓" : ""}</span>
                    <span className="ios-field-textos">
                      <span className="ios-field-label truncate">
                        {m.concepto}{m.member_nombre ? ` · ${m.member_nombre}` : ""}
                      </span>
                      <span className="ios-field-sub">{metodoAbr(m.metodo_pago)}</span>
                    </span>
                    <span className="ios-field-value">{fmtMoney(m.monto)}</span>
                  </button>
                );
              })}
            </Section>

            <Section header={t("depositos.desgloseYComprobante")}>
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.efectivo")}</span>
                <span className="ios-field-value">{fmtMoney(efectivo)}</span>
              </div>
              <div className="ios-field">
                <span className="ios-field-label">
                  {nCheques > 0 ? t("depositos.chequesConteo", { n: nCheques }) : t("depositos.cheques")}
                </span>
                <span className="ios-field-value">{fmtMoney(cheques)}</span>
              </div>
              {/* Adjuntar aquí tampoco tiene dónde caer: el comprobante vive
                  en el depósito, y el corte no es un depósito todavía. */}
              <ActionField label={t("depositos.adjuntarFotoFicha")} onPress={() => { }} disabled />
              <SwitchField
                label={t("controlesTesoreria.dobleFirma")}
                sub={t("controlesTesoreria.dobleFirmaSub")}
                checked={false}
                onChange={() => { }}
                disabled
                title={t("controlesTesoreria.dobleFirmaSub")}
              />
            </Section>

            <p className="dep-nota dep-nota--hoja">
              {t("depositos.corteMoneda", { moneda: church.moneda })}
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
