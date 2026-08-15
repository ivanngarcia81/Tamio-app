import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, countTxDeSerie, fmtMoney, getCategoriasGasto, getCategoriasIngreso,
  metodoNombre, METODOS_PAGO, updateMontoDeSerie, updateMovimientoRecurrente,
  type MovimientoRecurrente,
} from "../db";
import { IconClose, IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { CERO, deTexto, type Centavos } from "../dinero";
import { aTextoEditable } from "../dinero";

interface Props {
  church_id: number;
  recurrente: MovimientoRecurrente;
  onClose: () => void;
  onSaved: () => void;
}

/** Igual que en Nuevo movimiento: `deTexto` parsea, y aquí solo queda
 *  la regla de la pantalla (un importe mayor que cero). */
function parseMonto(s: string): Centavos | null {
  const c = deTexto(s);
  return c !== null && c > 0 ? c : null;
}

/** Edita monto, categoría, día, método y demás datos de un movimiento
 *  recurrente ya activo. No toca los meses ya generados — solo cambia lo
 *  que se registre de aquí en adelante (p. ej. subir el monto de la renta). */
export default function EditRecurrenteModal({ church_id, recurrente, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const esIngreso = recurrente.tipo === "ingreso";
  const categorias = esIngreso ? getCategoriasIngreso() : getCategoriasGasto();

  const [categoria, setCategoria] = useState(recurrente.categoria);
  const [concepto, setConcepto] = useState(recurrente.concepto);
  const [monto, setMonto] = useState(aTextoEditable(recurrente.monto));
  const [dia, setDia] = useState(String(recurrente.dia));
  const [metodo, setMetodo] = useState(recurrente.metodo_pago);
  const [beneficiario, setBeneficiario] = useState(recurrente.beneficiario ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corrección retroactiva: cuántos movimientos ya generó la serie y si el
  // nuevo monto debe aplicarse también a ellos (un monto mal capturado se
  // arregla en un solo guardado, sin tocar fila por fila).
  const [generados, setGenerados] = useState(0);
  const [aplicarRetro, setAplicarRetro] = useState(false);

  useEffect(() => {
    countTxDeSerie(recurrente.id, church_id).then(setGenerados).catch(() => {});
  }, [recurrente.id, church_id]);

  const montoCambio = parseMonto(monto) !== null && parseMonto(monto) !== recurrente.monto;

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
      if (aplicarRetro && montoCambio && generados > 0) {
        await updateMontoDeSerie(recurrente.id, church_id, m);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{t("recurrente.editarTitulo")}</div>
            <div className="modal-sub">{t("recurrente.editarSub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <div className="form-group full">
            <label className="form-label">{esIngreso ? t("recordModal.tipoIngreso") : t("recordModal.categoria")}</label>
            <div className={esIngreso ? "type-grid" : "category-grid"}>
              {categorias.map((c) => (
                <span
                  key={c.id}
                  className={`tag ${c.tagClass} cat-pill${categoria === c.id ? " is-selected" : ""}`}
                  onClick={() => setCategoria(c.id)}
                >
                  {catNombre(c.id)}
                </span>
              ))}
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">{t("recordModal.concepto")}</label>
            <input className="form-input" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("recordModal.monto")}</label>
              <input className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
            </div>
            <div className="form-group">
              <label className="form-label">{t("recurrente.diaLabel")}</label>
              <input className="form-input" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">{t("recordModal.metodoPago")}</label>
            <div className="method-group">
              {METODOS_PAGO.map((mp) => (
                <div
                  key={mp.id}
                  className={`method-choice${metodo === mp.id ? " is-selected" : ""}`}
                  onClick={() => setMetodo(mp.id)}
                >
                  <span className="m-dot" style={{ background: mp.color }} />
                  {metodoNombre(mp.id)}
                </div>
              ))}
            </div>
          </div>

          {!esIngreso && (
            <div className="form-group full">
              <label className="form-label">{t("recordModal.beneficiario")}</label>
              <input className="form-input" value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder={t("recordModal.beneficiarioPlaceholder")} />
            </div>
          )}

          {montoCambio && generados > 0 && (
            <label className="roster-followup" style={{ fontSize: 12.5, marginTop: 4 }}>
              <input type="checkbox" checked={aplicarRetro} onChange={(e) => setAplicarRetro(e.target.checked)} />
              {t("recurrente.aplicarRetro", { count: generados, monto: fmtMoney(parseMonto(monto) ?? CERO) })}
            </label>
          )}

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">{t("recurrente.editarSub")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardarCambios")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
