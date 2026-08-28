import { useTranslation } from "react-i18next";
import {
  catNombre, fmtMoney, metodoNombre, METODOS_PAGO, type MovimientoRecurrente,
} from "../db";
import { IconClose, IconWarn } from "../icons";
import { esMovil } from "../movil";
import EditarRecurrenteIOS from "./EditarRecurrenteIOS";
import { parseMonto, useRecurrente } from "./recurrente";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { CERO } from "../dinero";

interface Props {
  church_id: number;
  recurrente: MovimientoRecurrente;
  onClose: () => void;
  onSaved: () => void;
}

/** Edita monto, categoría, día, método y demás datos de un movimiento
 *  recurrente ya activo. No toca los meses ya generados — solo cambia lo
 *  que se registre de aquí en adelante (p. ej. subir el monto de la renta).
 *
 *  En todo lo táctil —iPhone e iPad— no se pinta nada de aquí: la hoja de iOS
 *  (`EditarRecurrenteIOS`) se lleva el formulario entero. Lo que comparten es
 *  `useRecurrente`, así que las validaciones y el guardado son los mismos en
 *  las dos formas. */
export default function EditRecurrenteModal({ church_id, recurrente, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const h = useRecurrente({ church_id, recurrente, onClose, onSaved });
  const {
    esIngreso, categorias, categoria, setCategoria, concepto, setConcepto,
    monto, setMonto, dia, setDia, metodo, setMetodo, beneficiario, setBeneficiario,
    saving, error, generados, ofreceRetro, aplicarRetro, setAplicarRetro, guardar,
  } = h;

  if (esMovil()) return <EditarRecurrenteIOS onClose={onClose} h={h} />;

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

          {ofreceRetro && (
            <label className="roster-followup" style={{ fontSize: "calc(12.5px * var(--fs-escala))", marginTop: 4 }}>
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
