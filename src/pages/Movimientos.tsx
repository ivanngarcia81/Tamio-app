import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone, esMac, textoCorto } from "../movil";
import { MacBuscador, MacSegmentado } from "../components/mac/MacFiltros";
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
import { useBarraEstado } from "../components/BarraEstado";
import EditRecurrenteModal from "../components/EditRecurrenteModal";
import { showToast } from "../toast";
import { playSound } from "../sound";
import TxTable from "../components/TxTable";
import {
  IconChevronLeft, IconChevronRight, IconClose, IconEdit, IconGasto, IconIngreso,
  IconPlus, IconPrinter, IconRepeat, IconSearch, IconWarn,
} from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import { printRegister } from "../services/print/printRegister";
import CountUp from "../components/CountUp";
import { CERO, sumar } from "../dinero";

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
  // El carrusel de secciones ya muestra "Ingresos"/"Gastos" como pastilla
  // activa (ver Cartas.tsx) — el título grande de aquí abajo sobra ahí. El
  // resto de la cabecera (mes anterior/siguiente, compartir) se queda: no
  // tiene equivalente en el carrusel ni en la barra inferior.
  const enIPhone = esIPhone();
  const enMac = esMac();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Buscador de iPhone: en reposo lupa y texto van centrados; al enfocarlo se
  // van a la izquierda y aparece "Cancelar". Mismo bloque que Actas y
  // Membresía.
  const [buscando, setBuscando] = useState(false);
  const refBuscar = useRef<HTMLInputElement>(null);
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
  const totalMes = esIngreso ? totales?.ingresos ?? CERO : totales?.gastos ?? CERO;

  /* Pie de ventana (solo Mac): cuántos movimientos hay en el mes que se está
     mirando y cuánto suman. Es el dato que la toolbar de 52 px ya no puede
     enseñar entero — ahí solo cabe "18 registrados". */
  useBarraEstado(t(esIngreso ? "barraEstado.ingresos" : "barraEstado.gastos", {
    count: txs.length,
    mes: mesLegible(mes),
    total: `${fmtMoney(totalMes)} ${church.moneda}`,
  }));

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
        monto: porCategoria[c.id] ?? CERO,
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
        monto: sumar(...resto.map((c) => c.monto)),
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
  /* Las categorías que se ofrecen para filtrar: EXACTAMENTE la misma lista que
     ya calculaban los chips —solo las que tienen movimientos, más la activa
     aunque quede en cero, para que no desaparezca bajo el dedo al filtrar—.
     Aquí solo se le pone nombre para poder reutilizarla en las dos formas. */
  const catsVisibles = categorias.filter((c) => conteo(c.id) > 0 || filtroCat === c.id);

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
      {/* En Mac esta cabecera ES la toolbar de la ventana: el atributo la
          marca como tal (styles.css, bloque de Mac) y a la vez le da la zona
          de arrastre de la ventana. Solo en Mac: el manejador de arrastre que
          Tauri inyecta escucha `mousedown`, y en iOS el toque genera eventos
          de ratón sintéticos, así que en la tableta y el teléfono estaría
          pidiendo arrastrar una ventana que no existe. Por eso mismo
          `.titlebar-drag` se oculta en `:root.movil` (styles.css ~6422). */}
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{titulo}</div>
            <div className="page-sub">{t("mov.registrados", { count: txs.length })}</div>
          </div>
        )}
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
          {/* El buscador vive en la toolbar, que es donde va en cualquier app
              de Mac; en el teléfono y el iPad se queda dentro del contenido,
              al alcance del pulgar. */}
          {enMac && (
            <MacBuscador
              value={query}
              onChange={setQuery}
              placeholder={t("mov.buscarPlaceholder")}
            />
          )}
          <button className="btn secondary btn-compartir-cabecera" onClick={handlePrint} disabled={printing}>
            <span className="solo-escritorio"><IconPrinter size={14} /></span>
            <span className="solo-movil"><ShareIcon size={22} /></span>
            <span className="btn-compartir-texto">{printing ? t("common.preparando") : t("common.imprimir")}</span>
          </button>
          <button className="btn primary btn-nuevo-cabecera" onClick={onNew}>
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

      <div className="content content-lienzo">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {enIPhone ? (
              <div className="ios-panel">
                <div className="ios-panel-head"><h2>{t("mov.seccionResumen")}</h2></div>
                <div className="ios-panel-grid">
                  <div className="ios-stat" style={{ cursor: "default" }}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("mov.totalDelMes")}</span></div>
                    <span className="ios-stat-num money">
                      <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                    </span>
                  </div>
                  {tarjetasCategoria.map((c) => {
                    const pct = totalMes > 0 ? Math.round((c.monto / totalMes) * 1000) / 10 : 0;
                    return (
                      <div className="ios-stat" key={c.id} style={{ cursor: "default" }}>
                        <div className="ios-stat-top">
                          <span className="ios-stat-label">{c.nombre}</span>
                          <span className="cat-dot" style={{ background: c.color }} aria-hidden="true" />
                        </div>
                        <span className="ios-stat-num money">
                          <CountUp value={c.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                        </span>
                        <div className="stat-bar">
                          <div className="stat-bar-fill" style={{ width: `${pct}%`, background: c.color }} />
                        </div>
                        <div className="stat-pct">{t("mov.pctDelTotal", { pct })}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="dash-canvas">
              <div className="summary-4 enter">
                <div className="stat-card">
                  <div className="stat-head">
                    <span className="stat-label">{t("mov.totalDelMes")}</span>
                  </div>
                  <div className="stat-value md">
                    <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
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
                        <CountUp value={c.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
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
            )}

            {recurrentes.length > 0 && (
              <div className="card card-fijos">
                <div className="card-head">
                  <span className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <IconRepeat size={14} strokeWidth={2} /> {t("recurrente.titulo")}
                  </span>
                  <span className="card-meta">{t("recurrente.sub")}</span>
                </div>
                {recurrentes.map((r) => {
                  const cat = categoriaInfo(tipo, r.categoria);
                  return (
                    /* Las columnas se declaran en CSS y no aquí en línea: eran
                       un flexbox, así que cada celda medía lo que medía su
                       texto y "Transferencia" y "Cheque" no empezaban en el
                       mismo sitio de una fila a otra. Con una rejilla se
                       alinean, que es lo que hace que dos filas se lean como
                       una tabla y no como dos frases. */
                    <div key={r.id} className="recurrente-fila">
                      <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
                      <span className="truncate rec-concepto" title={r.concepto}>
                        {r.concepto}
                        {r.beneficiario && <span className="rec-quien">{r.beneficiario}</span>}
                      </span>
                      <span className="rec-dia">{t("recurrente.diaDeCadaMes", { dia: r.dia })}</span>
                      <span className="rec-metodo">{metodoNombre(r.metodo_pago)}</span>
                      <span className="rec-monto">
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

            {enIPhone ? (
              /* Campo de 36 px con relleno gris y sin borde, y las categorías
                 DEBAJO a todo el ancho: el patrón de la barra de alcance de
                 Mail. El borde de 1 px del campo de escritorio es lo que más
                 lo delataba como web, y los chips al lado dejaban el activo
                 como una pastilla negra. */
              <div className="ios-buscar-bloque">
                <div className={`ios-buscar${buscando ? " es-activo" : ""}`}>
                  <label className="ios-buscar-campo">
                    <IconSearch size={15} strokeWidth={2} />
                    <input
                      ref={refBuscar}
                      value={query}
                      placeholder={t("common.buscarCorto")}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => setBuscando(true)}
                      aria-label={t("mov.buscarPlaceholder")}
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

                {/* Mismo criterio que Actas: con dos casillas o menos —"Todos"
                    y una sola categoría— no hay elección que ofrecer; a partir
                    de cinco el segmentado no cabe en 390 px sin bajar el texto
                    de 13 px, y se vuelve a la fila que se desliza. La lista de
                    categorías es la MISMA que ya se calculaba, sin cambiar el
                    criterio de cuáles salen. */}
                {catsVisibles.length >= 2 && (
                  catsVisibles.length <= 3 ? (
                    <div className="ios-alcance" role="tablist">
                      <span
                        className="ios-alcance-pulgar"
                        style={{
                          width: `calc((100% - 4px) / ${catsVisibles.length + 1})`,
                          transform: `translateX(${(filtroCat === null ? 0 : catsVisibles.findIndex((c) => c.id === filtroCat) + 1) * 100}%)`,
                        }}
                      />
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtroCat === null}
                        className="ios-alcance-opcion"
                        onClick={() => setFiltroCat(null)}
                      >
                        {t("common.todos")}
                      </button>
                      {catsVisibles.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="tab"
                          aria-selected={filtroCat === c.id}
                          className="ios-alcance-opcion"
                          onClick={() => setFiltroCat(c.id)}
                        >
                          {catNombre(c.id)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="ios-filtros">
                      <button
                        type="button"
                        className={`chip${filtroCat === null ? " active" : ""}`}
                        onClick={() => setFiltroCat(null)}
                      >
                        {t("common.todos")}
                      </button>
                      {catsVisibles.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`chip${filtroCat === c.id ? " active" : ""}`}
                          onClick={() => setFiltroCat(filtroCat === c.id ? null : c.id)}
                        >
                          {catNombre(c.id)}
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : !enMac ? (
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
            ) : null}

            <div className="tx-head">
              <div className="tx-title">{esIngreso ? t("mov.todosIngresos") : t("mov.todosGastos")}</div>
              {/* Los contadores no son filtros de popover: son vistas de la
                  misma lista, y en macOS eso es un segmentado al lado del
                  encabezado de la tabla, no una fila de pastillas. */}
              {enMac ? (
                <MacSegmentado
                  value={filtroCat ?? ""}
                  onChange={(v) => setFiltroCat(v === "" ? null : v)}
                  aria={t("mov.filtrarCategoria")}
                  opciones={[
                    { id: "", label: <>{t("common.todos")} <span className="mac-seg-n">{buscados.length}</span></> },
                    ...categorias
                      .filter((c) => conteo(c.id) > 0 || filtroCat === c.id)
                      .map((c) => ({ id: c.id, label: <>{catNombre(c.id)} <span className="mac-seg-n">{conteo(c.id)}</span></> })),
                  ]}
                />
              ) : enIPhone ? (
                /* En el teléfono los filtros se mudaron ARRIBA, bajo el
                   buscador, como barra de alcance. Dejarlos también aquí
                   sería el mismo filtro dos veces. */
                null
              ) : (
              <div className="tx-filters">
                <div
                  className={`chip${filtroCat === null ? " active" : ""}`}
                  onClick={() => setFiltroCat(null)}
                >
                  {t("common.todos")} <span className="count">{buscados.length}</span>
                </div>
                {/* Solo las categorías con movimientos en el mes. Antes se
                    pintaban las doce y nueve marcaban 0, así que la fila se
                    comía todo el ancho y bajaba del título — de ahí que Gastos
                    e Ingresos parecieran maquetados distinto, cuando el marcado
                    es el mismo. La activa se conserva aunque quede en cero, para
                    que el chip no desaparezca bajo el cursor al filtrar. */}
                {categorias
                  .filter((c) => conteo(c.id) > 0 || filtroCat === c.id)
                  .map((c) => {
                    const n = conteo(c.id);
                    const activa = filtroCat === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`chip${activa ? " active" : ""}`}
                        onClick={() => setFiltroCat(activa ? null : c.id)}
                      >
                        {catNombre(c.id)} <span className="count">{n}</span>
                      </div>
                    );
                  })}
              </div>
              )}
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
                duplicaCrear
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
