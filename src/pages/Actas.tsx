import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone, textoCorto, esMac } from "../movil";
import { MacBuscador } from "../components/mac/MacFiltros";
import { deleteActa, fmtFechaCorta, listActas, type Acta, type Church } from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import ActaModal from "../components/ActaModal";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { printActaPdf } from "../services/print/printActa";
import { IconFileText, IconPlus, IconPrinter, IconSearch } from "../icons";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";

const COLS = "110px 1.8fr 110px 1fr 130px 72px";
/* En Mac, la columna de Estado sube de 130 a 168 px. Medido: "Pendiente de
   aprobación" no cabe en 130 con la letra de 13 px, así que se partía en dos
   renglones y esa fila crecía 20 px — una tabla en la que unas filas miden más
   que otras según lo largo que sea su estado. Los estados del diseño son de
   una palabra ("Pendiente"); los nuestros son la frase completa, que es la que
   de verdad se entiende. */
const COLS_MAC = "110px minmax(160px, 1.8fr) 104px minmax(0, 1fr) 184px 60px";
const PAGE_SIZE = 25;

/** El orden del ciclo de vida del acta; los chips lo respetan. Incluye
 *  "corregida" (Enmendada), que la lista fija anterior omitía: un acta
 *  enmendada solo se encontraba con el chip Todas. */
const ESTADOS_FILTRO = ["borrador", "pendiente", "aprobada", "corregida", "archivada"] as const;

type FiltroEstado = "todas" | (typeof ESTADOS_FILTRO)[number];

const BADGE_ESTADO: Record<string, string> = {
  borrador: "baja",
  pendiente: "servicios",
  aprobada: "activo",
  corregida: "donacion",
  archivada: "administracion",
};

/** "Pendiente de aprobación" es lo único que espera una acción; "aprobada"
 *  es el destino final feliz. Borrador/corregida/archivada se quedan en
 *  gris neutro — son etapas normales, no una alerta. */
function badgeClaseActa(estado: string): string {
  if (estado === "pendiente") return "ios-badge--pending";
  if (estado === "aprobada") return "ios-badge--ok";
  return "";
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Actas({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Actas" como pastilla activa (ver
  // Cartas.tsx/Movimientos.tsx/Miembros.tsx) — el título grande sobra ahí.
  const enIPhone = esIPhone();
  const cols = esMac() ? COLS_MAC : COLS;
  const [actas, setActas] = useState<Acta[]>([]);
  const [query, setQuery] = useState("");
  /* Enfoque del buscador del teléfono: en reposo la lupa y el texto van
     centrados, y al entrar se van a la izquierda y sale "Cancelar". Es estado
     de React y no `:focus-within` a secas porque "Cancelar" tiene que seguir
     existiendo mientras se toca —si el campo pierde el foco al pulsarlo, el
     botón desaparece antes del clic. */
  const [buscando, setBuscando] = useState(false);
  const refBuscar = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [modal, setModal] = useState<{ open: boolean; acta: Acta | null }>({ open: false, acta: null });
  useAbrirCrearDesdeMas(() => setModal({ open: true, acta: null }));
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

  /* Pie de ventana (solo Mac). Con un filtro puesto se dicen los DOS números:
     un "3 actas" a secas, con seis en la base, se lee como que se perdieron
     tres. */
  useBarraEstado(visibles.length === actas.length
    ? t("barraEstado.actas", { count: actas.length })
    : t("barraEstado.actasFiltradas", { count: visibles.length, total: actas.length }));

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("secretaria.actas.titulo")}</div>
            {!esMac() && <div className="page-sub">{t("secretaria.actas.sub")}</div>}
          </div>
        )}
        <div className="header-actions">
          {/* El buscador vive en la toolbar; en táctil se queda dentro del
              contenido, al alcance del pulgar. */}
          {esMac() && <MacBuscador value={query} onChange={setQuery} placeholder={t("actas.buscarPlaceholder")} />}
          <button className="btn primary btn-nuevo-cabecera" onClick={() => setModal({ open: true, acta: null })}>
            <IconPlus size={14} /> {t("actas.nuevaActa")}
          </button>
        </div>
      </div>

      <div className="content content-lienzo">
        {/* Mismo criterio que en Movimientos, y NO se toca: solo los estados
            que tienen documentos, más el activo aunque se haya quedado en cero
            (para poder salir de él). Con dos actas, cinco chips en cero eran
            ruido. Se calcula una vez y lo consumen las dos plataformas. */}
        {(() => {
          const estados = ["todas", ...ESTADOS_FILTRO.filter((f) => f === filtro || actas.some((a) => a.estado === f))] as FiltroEstado[];
          const etiqueta = (f: FiltroEstado) => (f === "todas" ? t("actas.filtroTodas") : t(`actas.estado.${f}`));

          if (!enIPhone) {
            return (
              <div className="tx-head">
                <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
                  <IconSearch size={15} strokeWidth={2} />
                  <input
                    className="form-input"
                    placeholder={textoCorto(t("common.buscarCorto"), t("actas.buscarPlaceholder"))}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {estados.map((f) => (
                    <button key={f} className={`chip${filtro === f ? " active" : ""}`} onClick={() => setFiltro(f)}>
                      {etiqueta(f)}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div className="ios-buscar-bloque">
              {/* Campo arriba y categorías DEBAJO, a todo el ancho: el patrón
                  de la barra de alcance de Mail. Al lado del campo, "Todas"
                  quedaba como un círculo negro y el otro estado como una
                  pastilla de distinto ancho. */}
              <div className={`ios-buscar${buscando ? " es-activo" : ""}`}>
                <label className="ios-buscar-campo">
                  <IconSearch size={15} strokeWidth={2} />
                  <input
                    ref={refBuscar}
                    value={query}
                    placeholder={t("common.buscarCorto")}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setBuscando(true)}
                    aria-label={t("actas.buscarPlaceholder")}
                  />
                </label>
                {buscando && (
                  <button
                    type="button"
                    className="ios-buscar-cancelar"
                    onClick={() => { setQuery(""); setBuscando(false); refBuscar.current?.blur(); }}
                  >
                    {t("common.cancelar")}
                  </button>
                )}
              </div>

              {/* Con dos o menos no se enseña nada: una sola categoría además
                  de "Todas" no es una elección. A partir de cinco el
                  segmentado no cabe en 390 px y se vuelve a una fila que se
                  desliza — ahí sí, porque la alternativa es texto ilegible. */}
              {estados.length >= 3 && (
                estados.length <= 4 ? (
                  <div className="ios-alcance" role="tablist">
                    <span
                      className="ios-alcance-pulgar"
                      style={{ width: `calc((100% - 4px) / ${estados.length})`, transform: `translateX(${estados.indexOf(filtro) * 100}%)` }}
                    />
                    {estados.map((f) => (
                      <button
                        key={f}
                        type="button"
                        role="tab"
                        aria-selected={filtro === f}
                        className="ios-alcance-opcion"
                        onClick={() => setFiltro(f)}
                      >
                        {etiqueta(f)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="ios-filtros">
                    {estados.map((f) => (
                      <button key={f} className={`chip${filtro === f ? " active" : ""}`} onClick={() => setFiltro(f)}>
                        {etiqueta(f)}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })()}

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            pagina
            titulo={actas.length === 0 ? t("actas.aunNoHay") : t("actas.sinResultados")}
            sub={actas.length === 0 ? t("actas.agregaPrimera") : t("actas.sinResultadosSub")}
            icon={<IconFileText size={20} strokeWidth={1.8} />}
            accion={actas.length === 0
              ? { label: t("actas.nuevaActa"), onClick: () => setModal({ open: true, acta: null }) }
              : undefined}
            duplicaCrear
          />
        ) : enIPhone ? (
          <div className="ios-listcard">
            {pagina.map((a) => (
              <div
                className="ios-txrow ios-txrow--clickable"
                data-fila
                key={a.id}
                onClick={() => setModal({ open: true, acta: a })}
              >
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title" title={a.titulo}>
                    {a.confidencial === 1 && (
                      <span title={t("actas.confidencial")} style={{ marginRight: 4 }}>🔒</span>
                    )}
                    <span className="truncate">{a.titulo}</span>
                  </div>
                  <div className="tx-secundaria-movil">
                    {t(`actas.tipo.${a.tipo}`)}{a.preside ? ` · ${a.preside}` : ""} · {fmtFechaCorta(a.fecha)}
                  </div>
                </div>
                <div className="ios-txrow-trailing">
                  <span className={`ios-badge ${badgeClaseActa(a.estado)}`}>{t(`actas.estado.${a.estado}`)}</span>
                </div>
                <RowMenu
                  onEdit={() => setModal({ open: true, acta: a })}
                  /* En el teléfono NO se pasa: imprimir vive ahora en el modal
                      del acta, así que RowMenu esconde los "···". */
                  extraItems={enIPhone ? undefined : [{ label: t("common.imprimir"), onClick: () => { if (imprimiendo === null) imprimir(a); } }]}
                  onDelete={() => setPendingDelete(a)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="data-table roomy tabla-actas">
            <div className="thead" style={{ gridTemplateColumns: cols }}>
              <div className="th">{t("actas.colFolio")}</div>
              <div className="th">{t("actas.colTitulo")}</div>
              <div className="th">{t("tx.colFecha")}</div>
              <div className="th">{t("actas.preside")}</div>
              <div className="th">{t("actas.estadoActa")}</div>
              <div className="th"></div>
            </div>
            {pagina.map((a) => (
              <div
                className="tr" data-fila
                key={a.id}
                style={{ gridTemplateColumns: cols, cursor: "pointer" }}
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
                <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
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
                    extraItems={[{ label: t("common.imprimir"), onClick: () => { if (imprimiendo === null) imprimir(a); } }]}
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
          /* Solo en el teléfono: en Mac imprimir sigue en el menú de la fila. */
          onImprimir={enIPhone && modal.acta ? () => { if (imprimiendo === null) imprimir(modal.acta!); } : undefined}
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
