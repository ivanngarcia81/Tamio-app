import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { currentMonth, deleteServicio, fmtFechaCorta, listServicios, type Church, type Servicio } from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import ServicioModal from "../components/ServicioModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconBookOpen, IconMiembros, IconPlus, IconSearch } from "../icons";

const COLS = "110px 1.8fr 1fr 130px 40px";
const PAGE_SIZE = 25;

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

function totalPresentes(s: Servicio): number {
  return s.ninos + s.jovenes + s.adultos;
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Servicios({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ open: boolean; servicio: Servicio | null }>({ open: false, servicio: null });
  const [pendingDelete, setPendingDelete] = useState<Servicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listServicios(church.id)
      .then((nuevos) => { if (!cancelado) setServicios(nuevos); })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => setPage(1), [query, refreshKey]);

  const statsMes = useMemo(() => {
    const delMes = servicios.filter((s) => s.fecha.startsWith(mes));
    const conAsistencia = delMes.filter((s) => totalPresentes(s) > 0);
    const promedio = conAsistencia.length > 0
      ? Math.round(conAsistencia.reduce((sum, s) => sum + totalPresentes(s), 0) / conAsistencia.length)
      : 0;
    const visitantes = delMes.reduce((sum, s) => {
      try {
        const v = JSON.parse(s.visitantes);
        return sum + (Array.isArray(v) ? v.length : 0);
      } catch {
        return sum;
      }
    }, 0);
    return { servicios: delMes.length, promedio, visitantes };
  }, [servicios, mes]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteServicio(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("servicios.toastEliminado"));
    onChanged();
  }

  const q = query.trim().toLowerCase();
  const visibles = servicios.filter(
    (s) =>
      !q ||
      (s.predica ?? "").toLowerCase().includes(q) ||
      (s.titulo_mensaje ?? "").toLowerCase().includes(q) ||
      (s.dirige ?? "").toLowerCase().includes(q) ||
      t(`servicios.tipo.${s.tipo}`).toLowerCase().includes(q)
  );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.servicios.titulo")}</div>
          <div className="page-sub">{t("secretaria.servicios.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => setModal({ open: true, servicio: null })}>
            <IconPlus size={14} /> {t("servicios.nuevoServicio")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div className="stat-card accent" style={accent("var(--accent-4)")}>
            <div className="stat-head">
              <span className="stat-label">{t("servicios.statServiciosMes")}</span>
              <div className="stat-icon neutral"><IconBookOpen size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{statsMes.servicios}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">{t("servicios.statAsistenciaPromedio")}</span>
              <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{statsMes.promedio || "—"}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-1)")}>
            <div className="stat-head">
              <span className="stat-label">{t("servicios.statVisitantesMes")}</span>
              <div className="stat-icon neutral"><IconPlus size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{statsMes.visitantes}</div>
          </div>
        </div>

        <div className="tx-head">
          <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={t("servicios.buscarPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            titulo={servicios.length === 0 ? t("servicios.aunNoHay") : t("servicios.sinResultados")}
            sub={servicios.length === 0 ? t("servicios.agregaPrimero") : t("servicios.sinResultadosSub")}
            icon={<IconBookOpen size={20} strokeWidth={1.8} />}
          />
        ) : (
          <div className="data-table roomy">
            <div className="thead" style={{ gridTemplateColumns: COLS }}>
              <div className="th">{t("tx.colFecha")}</div>
              <div className="th">{t("servicios.colServicio")}</div>
              <div className="th">{t("servicios.colPredica")}</div>
              <div className="th" style={{ textAlign: "right" }}>{t("servicios.colAsistencia")}</div>
              <div className="th"></div>
            </div>
            {pagina.map((s) => (
              <div
                className="tr"
                key={s.id}
                style={{ gridTemplateColumns: COLS, cursor: "pointer" }}
                onClick={() => setModal({ open: true, servicio: s })}
              >
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(s.fecha)}</div>
                <div className="td" style={{ minWidth: 0 }}>
                  <div className="p-name truncate">{t(`servicios.tipo.${s.tipo}`)}</div>
                  <div className="p-mail truncate" title={s.titulo_mensaje ?? undefined}>
                    {s.titulo_mensaje ?? "—"}
                  </div>
                </div>
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  <div className="truncate">{s.predica ?? "—"}</div>
                </div>
                <div className="td" style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {totalPresentes(s) || "—"}
                </div>
                <div className="td" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    onEdit={() => setModal({ open: true, servicio: s })}
                    onDelete={() => setPendingDelete(s)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {modal.open && (
        <ServicioModal
          church={church}
          servicio={modal.servicio}
          onClose={() => setModal({ open: false, servicio: null })}
          onSaved={onChanged}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("servicios.eliminarTitulo")}
          message={t("servicios.eliminarMensaje", { fecha: fmtFechaCorta(pendingDelete.fecha) })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
