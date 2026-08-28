/**
 * recurrente.ts — el estado y el guardado de un movimiento recurrente ya
 * activo, sin una sola línea de pintura.
 *
 * Vivía dentro de `EditRecurrenteModal.tsx`. Se saca aquí por el mismo motivo
 * que se sacaron los de la solicitud, la actividad y el depósito: el teléfono
 * deja de usar el modal de escritorio y pasa a una hoja de iOS, y con la
 * lógica duplicada la segunda copia se habría quedado atrás a la primera
 * corrección.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, sus tres validaciones y lo
 * que se escribe en la base son los de siempre, movidos tal cual.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  countTxDeSerie, getCategoriasGasto, getCategoriasIngreso,
  updateMontoDeSerie, updateMovimientoRecurrente, type MovimientoRecurrente,
} from "../db";
import { aTextoTecleado, deTextoTecleado, type Centavos } from "../dinero";

/** Igual que en Nuevo movimiento: `deTextoTecleado` parsea —con el separador
 *  decimal del país del aparato—, y aquí solo queda la regla de la pantalla
 *  (un importe mayor que cero). */
export function parseMonto(s: string): Centavos | null {
  const c = deTextoTecleado(s);
  return c !== null && c > 0 ? c : null;
}

export interface PropsRecurrente {
  church_id: number;
  recurrente: MovimientoRecurrente;
  onClose: () => void;
  onSaved: () => void;
}

export function useRecurrente({ church_id, recurrente, onClose, onSaved }: PropsRecurrente) {
  const { t } = useTranslation();
  const esIngreso = recurrente.tipo === "ingreso";
  const categorias = esIngreso ? getCategoriasIngreso() : getCategoriasGasto();

  const [categoria, setCategoria] = useState(recurrente.categoria);
  const [concepto, setConcepto] = useState(recurrente.concepto);
  const [monto, setMonto] = useState(aTextoTecleado(recurrente.monto));
  const [dia, setDia] = useState(String(recurrente.dia));
  const [metodo, setMetodo] = useState(recurrente.metodo_pago);
  const [beneficiario, setBeneficiario] = useState(recurrente.beneficiario ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Corrección retroactiva: cuántos movimientos ya generó la serie y si el
     nuevo monto debe aplicarse también a ellos (un monto mal capturado se
     arregla en un solo guardado, sin tocar fila por fila). */
  const [generados, setGenerados] = useState(0);
  const [aplicarRetro, setAplicarRetro] = useState(false);

  useEffect(() => {
    countTxDeSerie(recurrente.id, church_id).then(setGenerados).catch(() => {});
  }, [recurrente.id, church_id]);

  const montoCambio = parseMonto(monto) !== null && parseMonto(monto) !== recurrente.monto;
  /** Solo tiene sentido preguntar por la corrección retroactiva si el monto
   *  cambió Y la serie ya generó algo. */
  const ofreceRetro = montoCambio && generados > 0;

  async function guardar() {
    setError(null);
    const m = parseMonto(monto);
    if (!concepto.trim()) { setError(t("common.conceptoObligatorio")); return; }
    if (m === null) { setError(t("common.montoInvalido")); return; }
    const d = Number(dia);
    if (!Number.isInteger(d) || d < 1 || d > 31) { setError(t("common.montoInvalido")); return; }
    setSaving(true);
    try {
      await updateMovimientoRecurrente(recurrente.id, church_id, {
        categoria,
        subcategoria: null,
        concepto: concepto.trim(),
        detalle: recurrente.detalle,
        monto: m,
        metodo_pago: metodo,
        beneficiario: esIngreso ? null : beneficiario.trim() || null,
        beneficiario_rfc: recurrente.beneficiario_rfc,
        dia: d,
      });
      if (aplicarRetro && ofreceRetro) {
        await updateMontoDeSerie(recurrente.id, church_id, m);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return {
    esIngreso, categorias,
    categoria, setCategoria,
    concepto, setConcepto,
    monto, setMonto,
    dia, setDia,
    metodo, setMetodo,
    beneficiario, setBeneficiario,
    saving, error,
    generados, ofreceRetro, aplicarRetro, setAplicarRetro,
    guardar,
  };
}
