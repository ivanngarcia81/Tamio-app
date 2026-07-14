import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteCarta, fmtFechaCorta, listCartas, listMembersRegistro, updateCarta,
  type Carta, type Church, type Member, type NewCarta,
} from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import CartaEditor, { ESTADOS_CARTA, TIPOS_CARTA } from "../components/CartaEditor";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { buildCartaHtml, abrirCartaParaImprimir, parseFirmas } from "../services/cartas/cartaDoc";
import { IconMail, IconPlus, IconPrinter, IconSearch } from "../icons";

const COLS = "130px 1.8fr 110px 150px 130px 70px";
const PAGE_SIZE = 25;

type Tab = "resumen" | "nueva" | "archivo";

const BADGE_ESTADO: Record<string, string> = {
  borrador: "administracion",
  preparacion: "servicios",
  revision: "musicos",
  firma: "eventos",
  aprobada: "donacion",
  lista: "diezmo",
  entregada: "activo",
  archivada: "baja",
  cancelada: "pastores",
};

function accent(color: string): CSSProperties {
  // Las tarjetas del resumen son <button> clicables: heredan la tipografía
  // y pierden los bordes por defecto del navegador.
  return { "--accent-color": color, textAlign: "left", cursor: "pointer", font: "inherit" } as CSSProperties;
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Cartas({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resumen");
  const [editando, setEditando] = useState<Carta | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Carta | null>(null);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todas");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const editorDirtyRef = useRef(false);
  const [refrescoLocal, setRefrescoLocal] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([listCartas(church.id), listMembersRegistro(church.id)])
      .then(([nuevasCartas, nuevosMembers]) => {
        if (cancelado) return;
        setCartas(nuevasCartas);
        setMembers(nuevosMembers);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, refrescoLocal]);

  useEffect(() => setPage(1), [query, filtroEstado, filtroTipo, desde, hasta]);

  // Cambiar de pestaña con cambios sin guardar en el editor pide confirmación.
  const cambiarTab = useCallback((destino: Tab) => {
    if (tab === "nueva" && destino !== "nueva" && editorDirtyRef.current) {
      setPendingTab(destino);
      return;
    }
    if (destino === "nueva" && tab !== "nueva") setEditando(null);
    setTab(destino);
  }, [tab]);

  function abrirCarta(c: Carta) {
    if (tab === "nueva" && editorDirtyRef.current) {
      setPendingTab(null);
      // Cambios sin guardar y quieren abrir otra carta: misma confirmación.
      setPendingAbrir(c);
      return;
    }
    setEditando(c);
    setTab("nueva");
  }
  const [pendingAbrir, setPendingAbrir] = useState<Carta | null>(null);

  async function imprimir(c: Carta) {
    try {
      const html = await buildCartaHtml(church, c, parseFirmas(c.firmas));
      await abrirCartaParaImprimir(html, c.folio);
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    }
  }

  async function archivarCarta(c: Carta) {
    const payload: NewCarta = {
      tipo: c.tipo, fecha_emision: c.fecha_emision, lugar_emision: c.lugar_emision,
      destinatario_tipo: c.destinatario_tipo, member_id: c.member_id,
      destinatario_nombre: c.destinatario_nombre, destinatario_direccion: c.destinatario_direccion,
      asunto: c.asunto, saludo: c.saludo, cuerpo_html: c.cuerpo_html, despedida: c.despedida,
      firmas: parseFirmas(c.firmas), observaciones: c.observaciones,
      estado: "archivada", entregada_a: c.entregada_a, fecha_entrega: c.fecha_entrega,
    };
    await updateCarta(c.id, church.id, payload, c.estado);
    playSound("guardado");
    showToast(t("cartas.toastArchivada"));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteCarta(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("cartas.toastEliminada"));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  // ----- Datos derivados para Resumen y Archivo -----
  const mesActual = new Date().toISOString().slice(0, 7);
  const resumen = useMemo(() => ({
    enPreparacion: cartas.filter((c) => ["borrador", "preparacion", "revision"].includes(c.estado)).length,
    esperandoFirma: cartas.filter((c) => c.estado === "firma").length,
    listas: cartas.filter((c) => ["aprobada", "lista"].includes(c.estado)).length,
    emitidasMes: cartas.filter((c) => c.estado === "entregada" && c.fecha_emision.startsWith(mesActual)).length,
  }), [cartas, mesActual]);

  const q = query.trim().toLowerCase();
  const visibles = cartas
    .filter((c) => (filtroEstado === "todas" ? true : c.estado === filtroEstado))
    .filter((c) => (filtroTipo === "todos" ? true : c.tipo === filtroTipo))
    .filter((c) => (!desde || c.fecha_emision >= desde) && (!hasta || c.fecha_emision <= hasta))
    .filter(
      (c) =>
        !q ||
        c.folio.toLowerCase().includes(q) ||
        c.destinatario_nombre.toLowerCase().includes(q) ||
        (c.asunto ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function irAArchivoFiltrado(estado: string) {
    setFiltroEstado(estado);
    cambiarTab("archivo");
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.cartas.titulo")}</div>
          <div className="page-sub">{t("secretaria.cartas.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => { cambiarTab("nueva"); }}>
            <IconPlus size={14} /> {t("cartas.nuevaCarta")}
          </button>
        </div>
      </div>

      <div className="content">
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["resumen", "nueva", "archivo"] as Tab[]).map((tb) => (
            <button key={tb} className={`chip${tab === tb ? " active" : ""}`} onClick={() => cambiarTab(tb)}>
              {t(`cartas.tab.${tb}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : tab === "resumen" ? (
          <>
            <div className="summary-4 enter">
              <button className="stat-card accent" style={accent("var(--accent-4)")} onClick={() => irAArchivoFiltrado("borrador")}>
                <div className="stat-head"><span className="stat-label">{t("cartas.cardPreparacion")}</span></div>
                <div className="stat-value md">{resumen.enPreparacion}</div>
              </button>
              <button className="stat-card accent" style={accent("var(--accent-3)")} onClick={() => irAArchivoFiltrado("firma")}>
                <div className="stat-head"><span className="stat-label">{t("cartas.cardFirma")}</span></div>
                <div className="stat-value md">{resumen.esperandoFirma}</div>
              </button>
              <button className="stat-card accent" style={accent("var(--accent-1)")} onClick={() => irAArchivoFiltrado("lista")}>
                <div className="stat-head"><span className="stat-label">{t("cartas.cardListas")}</span></div>
                <div className="stat-value md">{resumen.listas}</div>
              </button>
              <button className="stat-card accent" style={accent("var(--accent-2)")} onClick={() => irAArchivoFiltrado("entregada")}>
                <div className="stat-head"><span className="stat-label">{t("cartas.cardEmitidasMes")}</span></div>
                <div className="stat-value md">{resumen.emitidasMes}</div>
              </button>
            </div>

            <div className="card enter" style={{ marginTop: 18 }}>
              <div className="card-head"><span className="card-title">{t("cartas.actividadReciente")}</span></div>
              {cartas.length === 0 ? (
                <EmptyState
                  titulo={t("cartas.aunNoHay")}
                  sub={t("cartas.agregaPrimera")}
                  icon={<IconMail size={20} strokeWidth={1.8} />}
                />
              ) : (
                cartas.slice(0, 5).map((c) => (
                  <div key={c.id} className="roster-row" style={{ cursor: "pointer" }} onClick={() => abrirCarta(c)}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, width: 120, flex: "none", fontVariantNumeric: "tabular-nums" }}>{c.folio}</span>
                    <span className="roster-name">{c.destinatario_nombre} — {t(`cartas.tipoDoc.${c.tipo}`)}</span>
                    <span className={`tag ${BADGE_ESTADO[c.estado] ?? "otros"}`}>{t(`cartas.estado.${c.estado}`)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : tab === "nueva" ? (
          <CartaEditor
            key={editando?.id ?? "nueva"}
            church={church}
            carta={editando}
            members={members}
            dirtyRef={editorDirtyRef}
            onSaved={(creada) => {
              setRefrescoLocal((k) => k + 1);
              onChanged();
              if (creada) setEditando(creada);
            }}
          />
        ) : (
          <>
            <div className="tx-head" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="search-input-wrap" style={{ flex: 1, minWidth: 220, maxWidth: 340 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input
                  className="form-input"
                  placeholder={t("cartas.buscarPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select className="form-input" style={{ width: "auto" }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label={t("membresia.colEstado")}>
                <option value="todas">{t("cartas.filtroTodosEstados")}</option>
                {ESTADOS_CARTA.map((es) => (
                  <option key={es} value={es}>{t(`cartas.estado.${es}`)}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: "auto" }} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label={t("cartas.tipoCarta")}>
                <option value="todos">{t("cartas.filtroTodosTipos")}</option>
                {TIPOS_CARTA.map((ti) => (
                  <option key={ti} value={ti}>{t(`cartas.tipoDoc.${ti}`)}</option>
                ))}
              </select>
              <input type="date" className="form-input" style={{ width: "auto" }} value={desde} onChange={(e) => setDesde(e.target.value)} aria-label={t("cartas.fechaDesde")} title={t("cartas.fechaDesde")} />
              <input type="date" className="form-input" style={{ width: "auto" }} value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label={t("cartas.fechaHasta")} title={t("cartas.fechaHasta")} />
            </div>

            {visibles.length === 0 ? (
              <EmptyState
                titulo={cartas.length === 0 ? t("cartas.aunNoHay") : t("cartas.sinResultados")}
                sub={cartas.length === 0 ? t("cartas.agregaPrimera") : t("cartas.sinResultadosSub")}
                icon={<IconMail size={20} strokeWidth={1.8} />}
              />
            ) : (
              <div className="data-table roomy">
                <div className="thead" style={{ gridTemplateColumns: COLS }}>
                  <div className="th">{t("actas.colFolio")}</div>
                  <div className="th">{t("cartas.colDocumento")}</div>
                  <div className="th">{t("tx.colFecha")}</div>
                  <div className="th">{t("membresia.colEstado")}</div>
                  <div className="th">{t("cartas.colModificada")}</div>
                  <div className="th"></div>
                </div>
                {pagina.map((c) => (
                  <div
                    className="tr"
                    key={c.id}
                    style={{ gridTemplateColumns: COLS, cursor: "pointer" }}
                    onClick={() => abrirCarta(c)}
                  >
                    <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{c.folio}</div>
                    <div className="td" style={{ minWidth: 0 }}>
                      <div className="p-name truncate">{c.destinatario_nombre}</div>
                      <div className="p-mail truncate">{t(`cartas.tipoDoc.${c.tipo}`)}{c.asunto ? ` · ${c.asunto}` : ""}</div>
                    </div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(c.fecha_emision)}</div>
                    <div className="td"><span className={`tag ${BADGE_ESTADO[c.estado] ?? "otros"}`}>{t(`cartas.estado.${c.estado}`)}</span></div>
                    <div className="td" style={{ fontSize: 12, color: "var(--text-3)" }}>{c.modificado_en.slice(0, 10)}</div>
                    <div className="td" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      <span className="row-actions">
                        <span className="row-icon-btn" title={t("cartas.imprimirPdf")} onClick={() => imprimir(c)}>
                          <IconPrinter size={13} strokeWidth={2} />
                        </span>
                      </span>
                      <RowMenu
                        onEdit={() => abrirCarta(c)}
                        onDelete={() => (c.estado === "borrador" ? setPendingDelete(c) : archivarCarta(c))}
                        deleteLabel={c.estado === "borrador" ? t("common.eliminar") : t("cartas.archivar")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={t("cartas.eliminarTitulo", { folio: pendingDelete.folio })}
          message={t("cartas.eliminarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {(pendingTab !== null || pendingAbrir !== null) && (
        <ConfirmDialog
          title={t("servicios.cambiosSinGuardarTitulo")}
          message={t("cartas.cambiosSinGuardarMensaje")}
          confirmLabel={t("servicios.descartarCambios")}
          danger
          onConfirm={() => {
            editorDirtyRef.current = false;
            if (pendingAbrir) {
              setEditando(pendingAbrir);
              setTab("nueva");
              setPendingAbrir(null);
            } else if (pendingTab) {
              if (pendingTab !== "nueva") setEditando(null);
              setTab(pendingTab);
              setPendingTab(null);
            }
          }}
          onCancel={() => { setPendingTab(null); setPendingAbrir(null); }}
        />
      )}
    </>
  );
}
