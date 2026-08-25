import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { IOSPickerInput } from "./ios/IOSPickerField";
import {
  catNombre, categoriaInfo, currentYear, fmtFechaCorta, fmtMoney, listMemberAportes,
  memberAporteYears, metodoNombre, METODOS_PAGO, type Church, type Member, type Tx,
} from "../db";
import { exportConstanciaPdf, printConstanciaPdf } from "../services/print/printConstancia";
import { IconClose, IconFileText, IconMail, IconPrinter, IconIdBadge, IconWarn, IconIngreso } from "../icons";
import CountUp from "./CountUp";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { sumar } from "../dinero";

const COLS = "104px 130px 1fr 120px 120px";

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];

function inicialesDe(nombre: string): string {
  return nombre
    .split(" ").filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();
}

/** Ícono de teléfono en línea (no hay uno en icons.tsx). */
function IconPhoneSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

/* La ficha de un miembro vive en DOS cascarones: este modal (Mac y iPhone) y
   el panel derecho del maestro-detalle del iPad (DetalleMiembro.tsx). Para
   que sean la MISMA ficha y no dos copias, el estado es un hook y las dos
   piezas grandes —la identidad y el cuerpo— son componentes exportados; cada
   cascarón solo decide dónde ponerlos y qué botones los acompañan. El mismo
   trato que useNuevoMovimiento con sus dos pieles. */

/** Estado y acciones de la ficha: años con aportes, año elegido, el listado
 *  de ese año, y exportar/imprimir la constancia. */
export function useFichaMiembro(church: Church, member: Member) {
  const { t } = useTranslation();
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState(currentYear());
  const [aportes, setAportes] = useState<Tx[]>([]);
  const [exporting, setExporting] = useState<"pdf" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    memberAporteYears(member.id, church.id)
      .then((ys) => setYears(ys.length > 0 ? ys : [currentYear()]))
      .catch(console.error);
  }, [member.id, church.id]);

  // Cambiar de miembro (en el panel del iPad la ficha se re-usa sin
  // desmontarse) vuelve al año en curso: el año elegido era del otro.
  useEffect(() => setYear(currentYear()), [member.id]);

  useEffect(() => {
    listMemberAportes(member.id, church.id, year).then(setAportes).catch(console.error);
  }, [member.id, church.id, year]);

  async function handleConstancia() {
    setError(null);
    setExporting("pdf");
    try {
      await exportConstanciaPdf({ church, member, year, aportes });
    } catch (e) {
      setError(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setExporting(null);
    }
  }

  async function handlePrint() {
    setError(null);
    setExporting("print");
    try {
      await printConstanciaPdf({ church, member, year, aportes });
    } catch (e) {
      setError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setExporting(null);
    }
  }

  return {
    years, year, setYear, aportes, exporting, error,
    total: sumar(...aportes.map((a) => a.monto)),
    ultimo: aportes[0]?.fecha ?? null,
    handleConstancia, handlePrint,
  };
}

export type FichaMiembro = ReturnType<typeof useFichaMiembro>;

/** Avatar, nombre, pastilla de activo y los chips de contacto/etiquetas. */
export function IdentidadMiembro({ member }: { member: Member }) {
  const { t } = useTranslation();
  const activo = member.activo === 1;
  let etiquetas: string[] = [];
  try { etiquetas = JSON.parse(member.etiquetas); } catch { /* noop */ }
  return (
    <div className="member-detail-id">
      <div className={`mini-avatar ${AVATAR_COLORS[member.id % AVATAR_COLORS.length]} member-detail-avatar`}>
        {inicialesDe(member.nombre)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="member-detail-name">
          <span className="truncate">{member.nombre}</span>
          <span className={`status-pill ${activo ? "aprobado" : "rechazado"}`}>
            {activo ? t("detalleMiembro.activo") : t("detalleMiembro.inactivo")}
          </span>
        </div>
        <div className="member-chips">
          {member.email && (
            <span className="member-chip" title={member.email}><IconMail size={12} /> <span className="truncate">{member.email}</span></span>
          )}
          {member.telefono && (
            <span className="member-chip"><IconPhoneSm /> {member.telefono}</span>
          )}
          {member.rfc && (
            <span className="member-chip"><IconIdBadge size={12} /> {member.rfc}</span>
          )}
          {etiquetas.map((et) => (
            <span key={et} className="member-chip etq">{t(`etiqueta.${et}`, { defaultValue: et })}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tarjetas del año + selector + tabla de aportes + error de exportación. */
export function CuerpoFichaMiembro({ church, f }: { church: Church; f: FichaMiembro }) {
  const { t } = useTranslation();
  const { years, year, setYear, aportes, total, ultimo, error } = f;
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "stretch" }}>
        <div className="stat-card accent" style={{ flex: 1, padding: "14px 16px", "--accent-color": "var(--accent-1)" } as CSSProperties}>
          <div className="stat-label">{t("detalleMiembro.totalAnio", { anio: year })}</div>
          <div className="stat-value md">
            <CountUp value={total} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
          </div>
        </div>
        <div className="stat-card" style={{ flex: 1, padding: "14px 16px" }}>
          <div className="stat-label">{t("detalleMiembro.ultimoAporte")}</div>
          <div className="stat-value md">{ultimo ? fmtFechaCorta(ultimo) : "—"}</div>
          <div className="stat-pct">{t("detalleMiembro.aportes", { count: aportes.length })}</div>
        </div>
        <div className="stat-card" style={{ padding: "14px 16px", minWidth: 130 }}>
          <div className="stat-label">{t("detalleMiembro.anio")}</div>
          {esIPhone() ? (
            <div style={{ marginTop: 6 }}>
              <IOSPickerInput
                ariaLabel={t("detalleMiembro.anio")}
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                value={String(year)}
                onSelect={setYear}
              />
            </div>
          ) : (
            <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)} style={{ marginTop: 6 }}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {aportes.length === 0 ? (
        <div className="member-detail-vacio">
          <div className="empty-icon"><IconIngreso size={20} strokeWidth={1.7} /></div>
          <div>{t("detalleMiembro.sinAportes", { anio: year })}</div>
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
                <div className="td" style={{ fontSize: "calc(12.5px * var(--fs-escala))", fontWeight: 600 }}>{fmtFechaCorta(a.fecha)}</div>
                <div className="td">
                  <span className={`tag ${cat.tagClass}`} title={catNombre(a.categoria)}>{catNombre(a.categoria)}</span>
                </div>
                <div className="td truncate" style={{ fontSize: "calc(12.5px * var(--fs-escala))" }} title={a.concepto}>{a.concepto}</div>
                <div className="td truncate" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>{metodo}</div>
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
    </>
  );
}

interface Props {
  church: Church;
  member: Member;
  onClose: () => void;
}

/** Detalle de un miembro: historial de aportes por año + constancia anual. */
export default function MemberDetailModal({ church, member, onClose }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const f = useFichaMiembro(church, member);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header member-detail-head">
          <IdentidadMiembro member={member} />
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <CuerpoFichaMiembro church={church} f={f} />
        </div>

        <div className="modal-footer">
          <div className="form-hint">{t("detalleMiembro.hint")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cerrar")}</button>
            <button className="btn secondary" onClick={f.handlePrint} disabled={f.exporting !== null || f.aportes.length === 0}>
              <IconPrinter size={14} /> {f.exporting === "print" ? t("common.preparando") : t("common.imprimir")}
            </button>
            <button className="btn primary" onClick={f.handleConstancia} disabled={f.exporting !== null || f.aportes.length === 0}>
              <IconFileText size={13} /> {f.exporting === "pdf" ? t("common.generando") : t("detalleMiembro.constanciaPdf")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
