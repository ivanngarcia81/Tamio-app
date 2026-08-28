/**
 * EditarRecurrenteIOS.tsx — editar un movimiento recurrente en el teléfono.
 *
 * Era el ÚLTIMO formulario de la app que salía en el iPhone tal cual se
 * dibuja en el Mac: una `.modal-card` con su rejilla de dos columnas, las
 * categorías como pastillas envueltas en tres renglones, los métodos de pago
 * como cuatro cajas y una casilla de verificación al final. Se llegaba por el
 * lápiz de una fila de la tarjeta de recurrentes, que sí se pinta en el
 * teléfono (`{tarjetaRecurrentes}` está fuera de la rama `enIPhone` en
 * `Movimientos.tsx`).
 *
 * No hay lógica aquí: todo sale de `useRecurrente`, el mismo hook que
 * alimenta el modal de escritorio, así que las tres validaciones y lo que se
 * escribe en la base son idénticos.
 *
 * Dos decisiones que conviene saber:
 *
 * - **Las categorías y los métodos pasan a selector.** En el Mac son rejillas
 *   de pastillas —se ven todas a la vez, que en una pantalla ancha es una
 *   ventaja—; a 393 px eran tres renglones de pastillas que empujaban el
 *   resto del formulario fuera de la vista. El método conserva su punto de
 *   color, que es como se reconoce de un vistazo.
 * - **La corrección retroactiva es un interruptor con explicación**, no una
 *   casilla con una frase al lado (la fila A de la lámina S11 de Ajustes).
 *   Es la decisión más cara de esta pantalla —reescribe movimientos ya
 *   guardados—, así que la frase que dice cuántos toca no puede ir en la
 *   columna del valor, donde se trunca.
 */
import { useTranslation } from "react-i18next";
import { catNombre, fmtMoney, metodoNombre, METODOS_PAGO } from "../db";
import { CERO } from "../dinero";
import { IconWarn } from "../icons";
import IOSFormSheet from "./ios/IOSFormSheet";
import { Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { parseMonto, type PropsRecurrente, type useRecurrente } from "./recurrente";

export default function EditarRecurrenteIOS({
  onClose, h,
}: Pick<PropsRecurrente, "onClose"> & { h: ReturnType<typeof useRecurrente> }) {
  const { t } = useTranslation();

  return (
    <IOSFormSheet
      title={t("recurrente.editarTitulo")}
      onCancel={onClose}
      onSave={h.guardar}
      canSave={!h.saving}
    >
      <Section header={t("recurrente.label")} footer={t("recurrente.editarSub")}>
        <TextField
          label={t("recordModal.concepto")}
          value={h.concepto}
          onChange={h.setConcepto}
        />
        <IOSPickerField
          label={h.esIngreso ? t("recordModal.tipoIngreso") : t("recordModal.categoria")}
          sheetTitle={h.esIngreso ? t("recordModal.tipoIngreso") : t("recordModal.categoria")}
          options={h.categorias.map((c) => ({ value: c.id, label: catNombre(c.id) }))}
          value={h.categoria}
          onSelect={h.setCategoria}
        />
        <TextField
          label={t("recordModal.monto")}
          value={h.monto}
          onChange={h.setMonto}
          inputMode="decimal"
        />
        {/* El día es 1–31, no una fecha: un selector de fecha aquí pediría un
            mes y un año que esta serie no tiene. */}
        <TextField
          label={t("recurrente.diaLabel")}
          value={h.dia}
          onChange={h.setDia}
          inputMode="numeric"
        />
        <IOSPickerField
          label={t("recordModal.metodoPago")}
          sheetTitle={t("recordModal.metodoPago")}
          options={METODOS_PAGO.map((mp) => ({ value: mp.id, label: metodoNombre(mp.id), color: mp.color }))}
          value={h.metodo}
          onSelect={h.setMetodo}
        />
        {!h.esIngreso && (
          <TextField
            label={t("recordModal.beneficiario")}
            value={h.beneficiario}
            onChange={h.setBeneficiario}
            placeholder={t("recordModal.beneficiarioPlaceholder")}
            optional
            stacked
          />
        )}
      </Section>

      {/* Solo cuando el monto cambió Y la serie ya generó movimientos: si no,
          es una pregunta sobre algo que no existe. */}
      {h.ofreceRetro && (
        <Section header={t("recurrente.correccion")}>
          <SwitchField
            label={t("recurrente.aplicarRetroLabel")}
            sub={t("recurrente.aplicarRetro", {
              count: h.generados,
              monto: fmtMoney(parseMonto(h.monto) ?? CERO),
            })}
            checked={h.aplicarRetro}
            onChange={h.setAplicarRetro}
          />
        </Section>
      )}

      {h.error && (
        <p className="ios-section-footer ios-error-pie">
          <IconWarn size={13} /> {h.error}
        </p>
      )}
    </IOSFormSheet>
  );
}
