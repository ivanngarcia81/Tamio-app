import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, fmtFecha, fmtMoney, listArchivedMembers, listPendingTx,
  markTxReviewed, restoreMember, type Church, type Member, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";

interface Props {
  church: Church;
  refreshKey: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

export default function Bandeja({ church, refreshKey, onEditTx, onChanged }: Props) {
  const { t } = useTranslation();
  const [pendientes, setPendientes] = useState<Tx[]>([]);
  const [archivados, setArchivados] = useState<Member[]>([]);

  useEffect(() => {
    listPendingTx(church.id).then(setPendientes).catch(console.error);
    listArchivedMembers(church.id).then(setArchivados).catch(console.error);
  }, [church.id, refreshKey]);

  async function handleReviewed(tx: Tx) {
    await markTxReviewed(tx.id, church.id);
    onChanged();
  }

  async function handleRestore(m: Member) {
    await restoreMember(m.id, church.id);
    onChanged();
  }

  const total = pendientes.length + archivados.length;

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("bandeja.titulo")}</div>
          <div className="page-sub">
            {total === 0
              ? t("bandeja.sinPendientes")
              : `${t("bandeja.porRevisar", { count: pendientes.length })} · ${t("bandeja.archivados", { count: archivados.length })}`}
          </div>
        </div>
      </div>

      <div className="content">
        {total === 0 ? (
          <EmptyState
            titulo={t("bandeja.sinPendientes")}
            sub={t("bandeja.emptySub")}
          />
        ) : (
          <>
            <div className="inbox-section-label">{t("bandeja.pendientesRevision")}</div>
            {pendientes.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 20 }}>
                {t("bandeja.noMovsRevisar")}
              </div>
            ) : (
              <div className="inbox-list" style={{ marginBottom: 28 }}>
                {pendientes.map((tx) => {
                  const cat = categoriaInfo(tx.tipo, tx.categoria);
                  const f = fmtFecha(tx.fecha);
                  return (
                    <div className="inbox-item" key={tx.id}>
                      <div className="inbox-icon warn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <div className="inbox-body">
                        <div className="inbox-title-row">
                          <span className="inbox-type-tag warn">
                            {tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto")} · {cat.nombre}
                          </span>
                          <span className="inbox-time">{f.dia} {f.mesAnio} · {f.hora}</span>
                        </div>
                        <div className="inbox-desc"><strong>{tx.concepto}</strong></div>
                        {(tx.member_nombre || tx.beneficiario || tx.detalle) && (
                          <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-2)" }}>
                            {tx.member_nombre ?? tx.beneficiario ?? tx.detalle}
                          </div>
                        )}
                      </div>
                      <div className="inbox-side">
                        <div className="inbox-amount">
                          {tx.tipo === "ingreso" ? "+" : "−"}
                          {fmtMoney(tx.monto).replace("−", "")}
                          <span className="cur">{tx.moneda}</span>
                        </div>
                        <div className="inbox-actions">
                          <button className="btn secondary sm" onClick={() => onEditTx(tx)}>{t("common.editar")}</button>
                          <button className="btn primary sm" onClick={() => handleReviewed(tx)}>{t("bandeja.marcarRevisado")}</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="inbox-section-label">{t("bandeja.miembrosArchivadosLabel")}</div>
            {archivados.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                {t("bandeja.noMiembrosArchivados")}
              </div>
            ) : (
              <div className="inbox-list">
                {archivados.map((m) => (
                  <div className="inbox-item resolved" key={m.id}>
                    <div className="inbox-icon done">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="inbox-body">
                      <div className="inbox-title-row">
                        <span className="inbox-type-tag done">{t("bandeja.archivado")}</span>
                      </div>
                      <div className="inbox-desc"><strong>{m.nombre}</strong></div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-2)" }}>
                        {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                      </div>
                    </div>
                    <div className="inbox-side">
                      <div className="inbox-actions">
                        <button className="btn secondary sm" onClick={() => handleRestore(m)}>{t("bandeja.restaurar")}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
