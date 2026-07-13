import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, categoriaInfo, currentYear, fmtFechaCorta, fmtMoney, listMemberAportes,
  memberAporteYears, metodoNombre, METODOS_PAGO, type Church, type Member, type Tx,
} from "../db";
import { exportConstanciaPdf } from "../services/print/printConstancia";
import { IconClose, IconFileText, IconWarn } from "../icons";

const COLS = "104px 130px 1fr 120px 120px";

interface Props {
  church: Church;
  member: Member;
  onClose: () => void;
}

/** Detalle de un miembro: historial de aportes por año + constancia anual. */
export default function MemberDetailModal({ church, member, onClose }: Props) {
  const { t } = useTranslation();
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState(currentYear());
  const [aportes, setAportes] = useState<Tx[]>([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    memberAporteYears(member.id, church.id)
      .then((ys) => setYears(ys.length > 0 ? ys : [currentYear()]))
      .catch(console.error);
  }, [member.id, church.id]);

  useEffect(() => {
    listMemberAportes(member.id, church.id, year).then(setAportes).catch(console.error);
  }, [member.id, church.id, year]);

  const total = aportes.reduce((s, a) => s + a.monto, 0);
  const ultimo = aportes[0]?.fecha ?? null;
  const contacto = [member.email, member.telefono, member.rfc].filter(Boolean).join(" · ");

  async function handleConstancia() {
    setError(null);
    setExporting(true);
    try {
      await exportConstanciaPdf({ church, member, year, aportes });
    } catch (e) {
      setError(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{member.nombre}</div>
            <div className="modal-sub">{contacto || t("detalleMiembro.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "stretch" }}>
            <div className="stat-card" style={{ flex: 1, padding: "14px 16px" }}>
              <div className="stat-label">{t("detalleMiembro.totalAnio", { anio: year })}</div>
              <div className="stat-value md">
                {fmtMoney(total)}<span className="stat-cur">{church.moneda}</span>
              </div>
            </div>
            <div className="stat-card" style={{ flex: 1, padding: "14px 16px" }}>
              <div className="stat-label">{t("detalleMiembro.ultimoAporte")}</div>
              <div className="stat-value md">{ultimo ? fmtFechaCorta(ultimo) : "—"}</div>
              <div className="stat-pct">{t("detalleMiembro.aportes", { count: aportes.length })}</div>
            </div>
            <div className="stat-card" style={{ padding: "14px 16px", minWidth: 130 }}>
              <div className="stat-label">{t("detalleMiembro.anio")}</div>
              <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)} style={{ marginTop: 6 }}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {aportes.length === 0 ? (
            <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>
              {t("detalleMiembro.sinAportes", { anio: year })}
            </div>
          ) : (
            <div className="data-table roomy">
              <div className="thead" style={{ gridTemplateColumns: COLS }}>
                <div className="th">{t("tx.colFecha")}</div>
                <div className="th">{t("tx.colCategoria")}</div>
                <div className="th">{t("tx.colConcepto")}</div>
                <div className="th">{t("tx.colMetodo")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("tx.colMonto")}</div>
              </div>
              {aportes.map((a) => {
                const cat = categoriaInfo("ingreso", a.categoria);
                const metodo = METODOS_PAGO.some((m) => m.id === a.metodo_pago)
                  ? metodoNombre(a.metodo_pago)
                  : a.metodo_pago;
                return (
                  <div className="tr" key={a.id} style={{ gridTemplateColumns: COLS }}>
                    <div className="td" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtFechaCorta(a.fecha)}</div>
                    <div className="td">
                      <span className={`tag ${cat.tagClass}`} title={catNombre(a.categoria)}>{catNombre(a.categoria)}</span>
                    </div>
                    <div className="td truncate" style={{ fontSize: 12.5 }} title={a.concepto}>{a.concepto}</div>
                    <div className="td truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{metodo}</div>
                    <div className="td" style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(a.monto)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">{t("detalleMiembro.hint")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cerrar")}</button>
            <button className="btn primary" onClick={handleConstancia} disabled={exporting || aportes.length === 0}>
              <IconFileText size={13} /> {exporting ? t("common.generando") : t("detalleMiembro.constanciaPdf")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
