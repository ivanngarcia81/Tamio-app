import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteActa, fmtFechaCorta, listActas, type Acta, type Church } from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import ActaModal from "../components/ActaModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { printActaPdf } from "../services/print/printActa";
import { IconFileText, IconPlus, IconPrinter, IconSearch } from "../icons";

const COLS = "110px 1.8fr 110px 1fr 130px 70px";
const PAGE_SIZE = 25;

type FiltroEstado = "todas" | "borrador" | "pendiente" | "aprobada" | "archivada";

const BADGE_ESTADO: Record<string, string> = {
  borrador: "baja",
  pendiente: "servicios",
  aprobada: "activo",
  corregida: "donacion",
  archivada: "administracion",
};

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Actas({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [actas, setActas] = useState<Acta[]>([]);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [modal, setModal] = useState<{ open: boolean; acta: Acta | null }>({ open: false, acta: null });
  const [pendingDelete, setPendingDelete] = useState<Acta | null>(null);
  const [imprimiendo, setImprimiendo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listActas(church.id)
      .then((nuevas) => { if (!cancelado) setActas(nuevas); })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => setPage(1), [query, filtro, refreshKey]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteActa(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("actas.toastEliminada"));
    onChanged();
  }

  async function imprimir(acta: Acta) {
    setImprimiendo(acta.id);
    try {
      await printActaPdf(church, acta);
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setImprimiendo(null);
    }
  }

  const q = query.trim().toLowerCase();
  const visibles = actas
    .filter((a) => (filtro === "todas" ? true : a.estado === filtro))
    .filter(
      (a) =>
        !q ||
        a.titulo.toLowerCase().includes(q) ||
        a.folio.toLowerCase().includes(q) ||
        (a.preside ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.actas.titulo")}</div>
          <div className="page-sub">{t("secretaria.actas.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => setModal({ open: true, acta: null })}>
            <IconPlus size={14} /> {t("actas.nuevaActa")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="tx-head">
          <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={t("actas.buscarPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["todas", "borrador", "pendiente", "aprobada", "archivada"] as FiltroEstado[]).map((f) => (
              <button key={f} className={`chip${filtro === f ? " active" : ""}`} onClick={() => setFiltro(f)}>
                {f === "todas" ? t("actas.filtroTodas") : t(`actas.estado.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            titulo={actas.length === 0 ? t("actas.aunNoHay") : t("actas.sinResultados")}
            sub={actas.length === 0 ? t("actas.agregaPrimera") : t("actas.sinResultadosSub")}
            icon={<IconFileText size={20} strokeWidth={1.8} />}
            accion={actas.length === 0
              ? { label: t("actas.nuevaActa"), onClick: () => setModal({ open: true, acta: null }) }
              : undefined}
          />
        ) : (
          <div className="data-table roomy">
            <div className="thead" style={{ gridTemplateColumns: COLS }}>
              <div className="th">{t("actas.colFolio")}</div>
              <div className="th">{t("actas.colTitulo")}</div>
              <div className="th">{t("tx.colFecha")}</div>
              <div className="th">{t("actas.preside")}</div>
              <div className="th">{t("actas.estadoActa")}</div>
              <div className="th"></div>
            </div>
            {pagina.map((a) => (
              <div
                className="tr"
                key={a.id}
                style={{ gridTemplateColumns: COLS, cursor: "pointer" }}
                onClick={() => setModal({ open: true, acta: a })}
              >
                <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>
                  {a.folio}
                </div>
                <div className="td" style={{ minWidth: 0 }}>
                  <div className="p-name truncate" title={a.titulo}>
                    {a.confidencial === 1 && (
                      <span title={t("actas.confidencial")} style={{ marginRight: 6 }}>🔒</span>
                    )}
                    {a.titulo}
                  </div>
                  <div className="p-mail truncate">{t(`actas.tipo.${a.tipo}`)}</div>
                </div>
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(a.fecha)}</div>
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  <div className="truncate">{a.preside ?? "—"}</div>
                </div>
                <div className="td">
                  <span className={`tag ${BADGE_ESTADO[a.estado] ?? "otros"}`}>{t(`actas.estado.${a.estado}`)}</span>
                </div>
                <div className="td" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                  <span className="row-actions">
                    <span
                      className="row-icon-btn"
                      title={t("common.imprimir")}
                      onClick={() => { if (imprimiendo === null) imprimir(a); }}
                    >
                      <IconPrinter size={13} strokeWidth={2} />
                    </span>
                  </span>
                  <RowMenu
                    onEdit={() => setModal({ open: true, acta: a })}
                    onDelete={() => setPendingDelete(a)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {modal.open && (
        <ActaModal
          church={church}
          acta={modal.acta}
          onClose={() => setModal({ open: false, acta: null })}
          onSaved={onChanged}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("actas.eliminarTitulo", { folio: pendingDelete.folio })}
          message={t("actas.eliminarMensaje", { titulo: pendingDelete.titulo })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
