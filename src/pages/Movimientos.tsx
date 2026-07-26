import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { textoCorto } from "../movil";
import {
  catNombre, categoriaInfo, colorCategoria, currentMonth, countTxDeSerie, deleteMovimientoRecurrente, deleteTxDeSerie, fmtMoney,
  getCategoriasGasto, getCategoriasIngreso, listMovimientosRecurrentes,
  listTx, mesLegible, metodoNombre, monthTotals, nextMonth, prevMonth,
  type Church, type MovimientoRecurrente, type MonthTotals, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";
import ConfirmDialog from "../components/ConfirmDialog";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import EditRecurrenteModal from "../components/EditRecurrenteModal";
import { showToast } from "../toast";
import { playSound } from "../sound";
import TxTable from "../components/TxTable";
import {
  IconChevronLeft, IconChevronRight, IconClose, IconEdit, IconGasto, IconIngreso,
  IconPlus, IconPrinter, IconRepeat, IconSearch, IconWarn,
} from "../icons";
import { printRegister } from "../services/print/printRegister";
import CountUp from "../components/CountUp";

interface Props {
  church: Church;
  tipo: "ingreso" | "gasto";
  refreshKey: number;
  onNew: () => void;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

const PAGE_SIZE = 40;

export default function Movimientos({ church, tipo, refreshKey, onNew, onEditTx, onChanged }: Props) {
  const { t } = useTranslation();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recurrentes, setRecurrentes] = useState<MovimientoRecurrente[]>([]);
  const [pendingDeleteRec, setPendingDeleteRec] = useState<MovimientoRecurrente | null>(null);
  const [pendingDeleteSerie, setPendingDeleteSerie] = useState<{ def: MovimientoRecurrente; generados: number } | null>(null);
  const [editingRec, setEditingRec] = useState<MovimientoRecurrente | null>(null);
  const [mes, setMes] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const esMesActual = mes >= currentMonth();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listTx(church.id, { tipo, mes, limit: 1000 }),
      monthTotals(church.id, mes),
      listMovimientosRecurrentes(church.id, tipo),
    ])
      .then(([nuevosTxs, nuevosTotales, nuevosRecurrentes]) => {
        if (cancelado) return;
        setTxs(nuevosTxs);
        setTotales(nuevosTotales);
        setRecurrentes(nuevosRecurrentes);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, tipo, refreshKey, mes]);

  // El filtro/búsqueda o el cambio de mes siempre regresan a la página 1.
  useEffect(() => setPage(1), [tipo, mes, filtroCat, query]);

  async function confirmDeleteRecurrente() {
    if (!pendingDeleteRec) return;
    // Si la serie ya generó movimientos, se pregunta qué hacer con ellos
    // ANTES de borrar la definición (al borrarla pierden su recurrente_id).
    const generados = await countTxDeSerie(pendingDeleteRec.id, church.id);
    if (generados > 0) {
      setPendingDeleteSerie({ def: pendingDeleteRec, generados });
      setPendingDeleteRec(null);
      return;
    }
    await deleteMovimientoRecurrente(pendingDeleteRec.id, church.id);
    setPendingDeleteRec(null);
    showToast(t("recurrente.toastEliminado"));
    playSound("eliminar");
    listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
  }

  /** Segundo paso del borrado: conServie=true borra también los movimientos
   *  generados (suave, para que el sync lo propague). */
  async function eliminarSerie(conMovimientos: boolean) {
    if (!pendingDeleteSerie) return;
    const { def } = pendingDeleteSerie;
    if (conMovimientos) await deleteTxDeSerie(def.id, church.id);
    await deleteMovimientoRecurrente(def.id, church.id);
    setPendingDeleteSerie(null);
    showToast(conMovimientos ? t("recurrente.toastSerieEliminada") : t("recurrente.toastEliminado"));
    playSound("eliminar");
    listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
    onChanged();
  }

  const esIngreso = tipo === "ingreso";
  const titulo = esIngreso ? t("nav.ingresos") : t("nav.gastos");
  const categorias = esIngreso ? getCategoriasIngreso() : getCategoriasGasto();
  const porCategoria = esIngreso
    ? totales?.porCategoriaIngreso ?? {}
    : totales?.porCategoriaGasto ?? {};
  const totalMes = esIngreso ? totales?.ingresos ?? 0 : totales?.gastos ?? 0;

  // Las tarjetas de resumen muestran las categorías CON movimiento, de mayor
  // a menor. Antes tomaban las tres primeras del catálogo, así que podían
  // enseñar dos categorías en cero mientras escondían una con gasto real.
  // Solo hay tres huecos: si hay más categorías con movimiento se muestran
  // las dos mayores y el resto se agrupa, para que lo visible siga sumando
  // el total del mes.
  const tarjetasCategoria = useMemo(() => {
    const conMovimiento = categorias
      .map((c) => ({
        id: c.id,
        nombre: catNombre(c.id),
        color: colorCategoria(tipo, c.id),
        monto: porCategoria[c.id] ?? 0,
      }))
      .filter((c) => c.monto > 0)
      .sort((a, b) => b.monto - a.monto);
    if (conMovimiento.length <= 3) return conMovimiento;
    const resto = conMovimiento.slice(2);
    return [
      ...conMovimiento.slice(0, 2),
      {
        id: "__otras",
        nombre: t("mov.otrasCategorias", { count: resto.length }),
        color: "#64748b",
        monto: resto.reduce((s, c) => s + c.monto, 0),
      },
    ];
  }, [categorias, porCategoria, tipo, t]);

  const q = query.trim().toLowerCase();
  const coincide = (tx: Tx) =>
    !q ||
    tx.concepto.toLowerCase().includes(q) ||
    (tx.detalle ?? "").toLowerCase().includes(q) ||
    (tx.beneficiario ?? "").toLowerCase().includes(q) ||
    (tx.member_nombre ?? "").toLowerCase().includes(q);
  const buscados = txs.filter(coincide);
  const visibles = filtroCat ? buscados.filter((t) => t.categoria === filtroCat) : buscados;
  const conteo = (id: string) => buscados.filter((t) => t.categoria === id).length;

  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printEmpty, setPrintEmpty] = useState(false);

  async function handlePrint() {
    setPrintError(null);
    if (visibles.length === 0) {
      setPrintEmpty(true);
      return;
    }
    setPrintEmpty(false);
    setPrinting(true);
    try {
      const catLabel = filtroCat ? catNombre(filtroCat) : t("mov.todasCategorias");
      await printRegister({
        church,
        titulo,
        filtroDescripcion: `${mesLegible(mes)} · ${catLabel}`,
        periodoISO: mes,
        movimientos: visibles,
      });
    } catch (e) {
      setPrintError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-sub">{t("mov.registrados", { count: txs.length })}</div>
        </div>
        <div className="header-actions">
          <div className="month-nav">
            <span className="icon-btn" title={t("mov.mesAnterior")} onClick={() => setMes(prevMonth(mes))}>
              <IconChevronLeft size={16} />
            </span>
            <span className="month-nav-label">{mesLegible(mes)}</span>
            <span
              className={`icon-btn${esMesActual ? " disabled" : ""}`}
              title={t("mov.mesSiguiente")}
              onClick={() => !esMesActual && setMes(nextMonth(mes))}
            >
              <IconChevronRight size={16} />
            </span>
          </div>
          <button className="btn secondary" onClick={handlePrint} disabled={printing}>
            <IconPrinter size={14} /> {printing ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> {esIngreso ? t("mov.nuevoIngreso") : t("mov.nuevoGasto")}
          </button>
        </div>
      </div>

      {(printError || printEmpty) && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconWarn size={13} /> {printError ?? t("mov.noHayRegistros")}
          </div>
        </div>
      )}

      <div className="content">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="dash-canvas">
            <div className="summary-4 enter">
              <div className="stat-card">
                <div className="stat-head">
                  <span className="stat-label">{t("mov.totalDelMes")}</span>
                </div>
                <div className="stat-value md">
                  <CountUp value={totalMes} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span>
                </div>
              </div>
              {tarjetasCategoria.map((c) => {
                const pct = totalMes > 0 ? Math.round((c.monto / totalMes) * 1000) / 10 : 0;
                return (
                  <div className="stat-card" key={c.id}>
                    <div className="stat-head">
                      <span className="stat-label">{c.nombre}</span>
                      <span className="cat-dot" style={{ background: c.color }} aria-hidden="true" />
                    </div>
                    <div className="stat-value md">
                      <CountUp value={c.monto} format={fmtMoney} /><span className="stat-cur">{church.moneda}</span>
                    </div>
                    <div className="stat-bar">
                      <div className="stat-bar-fill" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                    <div className="stat-pct">{t("mov.pctDelTotal", { pct })}</div>
                  </div>
                );
              })}
            </div>
            </div>

            {recurrentes.length > 0 && (
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-head">
                  <span className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <IconRepeat size={14} strokeWidth={2} /> {t("recurrente.titulo")}
                  </span>
                  <span className="card-meta">{t("recurrente.sub")}</span>
                </div>
                {recurrentes.map((r) => {
                  const cat = categoriaInfo(tipo, r.categoria);
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "9px 0", borderTop: "1px solid var(--line)",
                      }}
                    >
                      <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
                      <span className="truncate" style={{ flex: 1, fontWeight: 600, fontSize: 13 }} title={r.concepto}>
                        {r.concepto}
                        {r.beneficiario && (
                          <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 8, fontSize: 12 }}>{r.beneficiario}</span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{t("recurrente.diaDeCadaMes", { dia: r.dia })}</span>
                      <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{metodoNombre(r.metodo_pago)}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                        {t("recurrente.porMes", { monto: fmtMoney(r.monto) })}
                      </span>
                      <span
                        className="row-icon-btn"
                        title={t("common.editar")}
                        onClick={() => setEditingRec(r)}
                      >
                        <IconEdit size={12} strokeWidth={2.2} />
                      </span>
                      <span
                        className="row-icon-btn"
                        title={t("recurrente.eliminarTitulo")}
                        onClick={() => setPendingDeleteRec(r)}
                      >
                        <IconClose size={12} strokeWidth={2.2} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="tx-head" style={{ marginBottom: 10 }}>
              <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input
                  className="form-input"
                  placeholder={textoCorto(t("common.buscarCorto"), t("mov.buscarPlaceholder"))}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="tx-head">
              <div className="tx-title">{esIngreso ? t("mov.todosIngresos") : t("mov.todosGastos")}</div>
              <div className="tx-filters">
                <div
                  className={`chip${filtroCat === null ? " active" : ""}`}
                  onClick={() => setFiltroCat(null)}
                >
                  {t("common.todos")} <span className="count">{buscados.length}</span>
                </div>
                {categorias.map((c) => {
                  // "vacia" marca las categorías sin movimientos en el mes:
                  // en escritorio siguen visibles (sirven para confirmar que
                  // están en cero), en teléfono el CSS las oculta para no
                  // gastar cuatro filas de chips en nada.
                  const n = conteo(c.id);
                  const activa = filtroCat === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`chip${activa ? " active" : ""}${n === 0 && !activa ? " vacia" : ""}`}
                      onClick={() => setFiltroCat(activa ? null : c.id)}
                    >
                      {catNombre(c.id)} <span className="count">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {visibles.length === 0 ? (
              <EmptyState
                titulo={
                  q && buscados.length === 0
                    ? t("mov.sinResultadosBusqueda")
                    : txs.length > 0
                    ? t("mov.sinResultadosFiltro")
                    : esMesActual
                      ? (esIngreso ? t("mov.aunNoHayIngresos") : t("mov.aunNoHayGastos"))
                      : t(esIngreso ? "mov.sinIngresosEn" : "mov.sinGastosEn", { mes: mesLegible(mes) })
                }
                sub={
                  q && buscados.length === 0
                    ? t("mov.pruebaOtroTermino")
                    : txs.length > 0
                    ? t("mov.pruebaOtraCategoria")
                    : esMesActual
                      ? (esIngreso ? t("mov.registraPrimerIngreso") : t("mov.registraPrimerGasto"))
                      : t("mov.pruebaOtroMes")
                }
                icon={esIngreso ? <IconIngreso size={22} strokeWidth={1.6} /> : <IconGasto size={22} strokeWidth={1.6} />}
                accion={txs.length === 0 && esMesActual
                  ? { label: esIngreso ? t("mov.nuevoIngreso") : t("mov.nuevoGasto"), onClick: onNew }
                  : undefined}
              />
            ) : (
              <>
                <TxTable tipo={tipo} txs={pagina} onEdit={onEditTx} onChanged={onChanged} />
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </>
        )}
      </div>

      {pendingDeleteRec && (
        <ConfirmDialog
          title={t("recurrente.eliminarTitulo")}
          message={t("recurrente.eliminarMensaje", { concepto: pendingDeleteRec.concepto })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDeleteRecurrente}
          onCancel={() => setPendingDeleteRec(null)}
        />
      )}

      {pendingDeleteSerie && (
        <ConfirmDialog
          title={t("recurrente.serieTitulo")}
          message={t("recurrente.serieMensaje", { concepto: pendingDeleteSerie.def.concepto, count: pendingDeleteSerie.generados })}
          confirmLabel={t("recurrente.serieBorrarTodo", { count: pendingDeleteSerie.generados })}
          danger
          onConfirm={() => void eliminarSerie(true)}
          onCancel={() => void eliminarSerie(false)}
        />
      )}

      {editingRec && (
        <EditRecurrenteModal
          church_id={church.id}
          recurrente={editingRec}
          onClose={() => setEditingRec(null)}
          onSaved={() => {
            showToast(t("recurrente.toastActualizado"));
            playSound("guardado");
            listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
          }}
        />
      )}
    </>
  );
}
