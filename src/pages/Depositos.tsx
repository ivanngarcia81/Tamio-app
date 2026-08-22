import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  countDepositos, currentMonth, currentYear, fmtFechaCorta, fmtMoney, listDepositos,
  mesLegible, monthDepositos,
  type Church, type Deposito,
} from "../db";
import { EmptyState } from "../components/TxList";
import DepositoTable from "../components/DepositoTable";
import DepositoModal from "../components/DepositoModal";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { IconBank, IconClock, IconPlus } from "../icons";
import CountUp from "../components/CountUp";
import { CERO, sumar, type Centavos } from "../dinero";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";
import { esIPad, esIPhone, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleDeposito from "../components/DetalleDeposito";
import ComprobantePreview from "../components/ComprobantePreview";
import ConfirmDialog from "../components/ConfirmDialog";
import { deleteDeposito, undeleteDeposito } from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconSearch } from "../icons";

const PAGE_SIZE = 40;

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Depositos({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [totalMes, setTotalMes] = useState<Centavos>(CERO);
  const [conteoMes, setConteoMes] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  /* ---- Maestro-detalle del iPad ----
     Mismos dos umbrales que Ingresos y Aportantes, y por la misma razón: a
     partir de 700px la pantalla se parte, y a partir de 1150 las dos columnas
     conviven en vez de empujarse. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1150px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  /* El detalle es un ID que se re-busca en cada recarga, no una copia
     congelada: así una edición refresca el panel en sitio y un borrado lo
     cierra solo. Es el patrón de `Movimientos.tsx`. */
  const [selId, setSelId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [previewSel, setPreviewSel] = useState<string | null>(null);
  const [pendingDeleteSel, setPendingDeleteSel] = useState<Deposito | null>(null);

  /* Pie de ventana (solo Mac): los del mes y su suma. `conteoMes` y
     `totalMes` ya venían calculados para las tarjetas de arriba. */
  useBarraEstado(t("barraEstado.depositos", {
    count: conteoMes,
    mes: mesLegible(mes),
    total: `${fmtMoney(totalMes)} ${church.moneda}`,
  }));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listDepositos(church.id),
      monthDepositos(church.id, mes),
      countDepositos(church.id, mes),
    ])
      .then(([nuevosDepositos, nuevoTotal, nuevoConteo]) => {
        if (cancelado) return;
        setDepositos(nuevosDepositos);
        setTotalMes(nuevoTotal);
        setConteoMes(nuevoConteo);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, mes]);

  useEffect(() => setPage(1), [refreshKey]);

  // La fila tenía una sola tarjeta y tres cuartos vacíos. Estos dos derivados
  // salen de `depositos`, que ya se carga entero: no hacen falta consultas
  // nuevas. El año se mide por PERÍODO, igual que el resto de los totales.
  const anio = currentYear();
  const totalAnio = sumar(
    ...depositos.filter((d) => d.periodo.startsWith(anio)).map((d) => d.monto),
  );
  const ultimo = depositos.reduce<Deposito | null>(
    (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor),
    null,
  );

  function abrirNuevo() {
    setEditing(null);
    setModalOpen(true);
  }
  useAbrirCrearDesdeMas(abrirNuevo);

  function abrirEditar(dep: Deposito) {
    setEditing(dep);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditing(null);
  }

  /* ---- Piezas del maestro-detalle ---- */

  const sel = selId == null ? null : depositos.find((d) => d.id === selId) ?? null;
  /* En el modo de empuje el panel conserva el último detalle mientras se
     desliza fuera; en columnas, sin animación de salida, cerrar vuelve
     directo al estado vacío. */
  const ultimoSel = useRef<Deposito | null>(null);
  if (sel) ultimoSel.current = sel;

  const q = query.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      depositos.filter(
        (d) =>
          !q ||
          d.cuenta_banco.toLowerCase().includes(q) ||
          (d.referencia ?? "").toLowerCase().includes(q) ||
          (d.notas ?? "").toLowerCase().includes(q) ||
          fmtFechaCorta(d.fecha).toLowerCase().includes(q),
      ),
    [depositos, q],
  );

  /* Agrupados por PERÍODO y no por fecha: es como suman los totales de esta
     pantalla y como agrupan los reportes, así que la lista se lee con el
     mismo criterio con el que se cuadran las cifras de arriba. */
  const gruposPeriodo = useMemo(() => {
    const mapa = new Map<string, Deposito[]>();
    for (const d of visibles) {
      const g = mapa.get(d.periodo);
      if (g) g.push(d);
      else mapa.set(d.periodo, [d]);
    }
    return [...mapa.entries()].map(([periodo, items]) => ({ periodo, items }));
  }, [visibles]);

  const totalVisible = sumar(...visibles.map((d) => d.monto));

  /** Borra ya, con "Deshacer" — el mismo trato que da `DepositoTable`, para
   *  que borrar desde el panel y borrar desde la fila hagan lo mismo. */
  async function borrarSel(borrado: Deposito) {
    await deleteDeposito(borrado.id, borrado.church_id);
    setPendingDeleteSel(null);
    if (selId === borrado.id) setSelId(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.depositoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        await undeleteDeposito(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  /* Las tres tarjetas del mes, extraídas a una constante: el maestro-detalle
     las pinta en DOS sitios —en el panel sin fila abierta y, en el modo de
     empuje, a la cabeza de la lista— y tienen que ser los mismos nodos, no
     una copia que se desviaría al primer cambio. Mismo trato que el resumen
     del mes de Ingresos. */
  const resumenEscritorio = (
    <div className="summary-4 enter">
      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.depositosDelMes")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">
          {t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}
        </div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.totalAnio")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">{anio}</div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.ultimoDeposito")}</span>
          <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          {ultimo
            ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
            : <span style={{ color: "var(--text-3)" }}>—</span>}
        </div>
        <div className="stat-foot">
          {ultimo
            ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
            : t("depositos.sinDepositos")}
        </div>
      </div>
    </div>
  );

  const estadoVacio = (
    <EmptyState
      pagina
      titulo={t("depositos.emptyTitulo")}
      sub={t("depositos.emptySub")}
      icon={<IconBank size={22} strokeWidth={1.6} />}
      accion={{ label: t("depositos.nuevoDeposito"), onClick: abrirNuevo }}
      duplicaCrear
    />
  );

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("depositos.titulo")}</div>
            {/* En Mac el subtítulo comparte renglón con los botones, así que
                lleva un DATO corto y no la frase que explica la pantalla —esa
                se fue al pie de la ventana, junto al recuento (BarraEstado).
                Mismo criterio que las otras nueve pantallas convertidas. */}
            <div className="page-sub">{esMac() ? mesLegible(mes) : t("depositos.sub")}</div>
          </div>
        )}
        {/* El botón se queda: `.btn-nuevo-cabecera` ya lo oculta en el
            teléfono, donde crear un depósito lo cubre el "+" flotante — el
            `useAbrirCrearDesdeMas(abrirNuevo)` de arriba es justo lo que
            conecta ese "+" con este mismo modal. */}
        <div className="header-actions">
          <button className="btn primary btn-nuevo-cabecera" onClick={abrirNuevo}>
            <IconPlus size={14} /> {t("depositos.nuevoDeposito")}
          </button>
        </div>
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          El handoff parte esta pantalla en una lista de 378px y un panel.
          En columnas conviven; en el modo de empuje —todo iPad en vertical y
          el mini en horizontal— la lista ocupa el ancho y el resumen del mes
          baja a su cabeza, para que no quede inalcanzable detrás del panel. */}
      {partido ? (
        <div className={`md-split md-depositos${selId != null ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                <div className="md-filtros">
                  <label className="md-buscar">
                    <IconSearch size={15} strokeWidth={2} />
                    <input
                      value={query}
                      placeholder={t("depositos.buscarPlaceholder")}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("depositos.buscarPlaceholder")}
                    />
                  </label>
                </div>

                <div className="md-filas">
                  {angosto && <div className="md-extra">{resumenEscritorio}</div>}
                  {visibles.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposPeriodo.map((g) => (
                      <div key={g.periodo}>
                        <div className="md-grupo">{mesLegible(g.periodo)}</div>
                        {g.items.map((d) => (
                          <div
                            key={d.id}
                            className={`md-fila${selId === d.id ? " sel" : ""}`}
                            onClick={() => setSelId(d.id)}
                          >
                            <div className="md-fila-textos">
                              <div className="md-fila-titular">{fmtFechaCorta(d.fecha)}</div>
                              <div className="md-fila-sub">
                                {[d.cuenta_banco, d.referencia].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <div className="md-fila-monto">{fmtMoney(d.monto)}</div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* El pie cuenta y suma lo VISIBLE, no lo que hay: con una
                    búsqueda puesta, el total del historial contradiría a la
                    lista que tienes delante. Mismo trato que en Ingresos. */}
                {visibles.length > 0 && (
                  <div className="md-pie">
                    <span>{t("depositos.conteoVisible", { count: visibles.length })}</span>
                    <span className="md-pie-total">{fmtMoney(totalVisible)} {church.moneda}</span>
                  </div>
                )}
              </div>

              <div className="md-detalle">
                {(() => {
                  const det = angosto ? sel ?? ultimoSel.current : sel;
                  if (det) {
                    return (
                      <DetalleDeposito
                        dep={det}
                        tituloLista={t("depositos.titulo")}
                        onVolver={() => setSelId(null)}
                        onEditar={abrirEditar}
                        onEliminar={setPendingDeleteSel}
                        onVerComprobante={setPreviewSel}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("depositos.eligeDeposito")}</h3>
                        <p>{t("depositos.eligeDepositoSub")}</p>
                      </div>
                      {resumenEscritorio}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content content-lienzo">
        {enIPhone ? (
          /* Sin la franja de color de `.stat-card accent` ni el icono en
             recuadro: en una tarjeta de la mitad del ancho compiten con la
             cifra, que es lo único que se viene a leer. Las tres siguen
             llevando su pie —cuántos y de qué mes, qué año, cuándo y a qué
             cuenta fue el último— porque sin él la cifra no dice de qué
             período habla. Tres tarjetas en dos columnas dejan un hueco en
             la última fila; es lo que ya hace Servicios, que también tiene
             tres. */
          <div className="ios-panel">
            <div className="ios-panel-head"><h2>{t("depositos.seccionResumen")}</h2></div>
            <div className="ios-panel-grid">
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.depositosDelMes")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <div className="stat-pct">{t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}</div>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.totalAnio")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <div className="stat-pct">{anio}</div>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.ultimoDeposito")}</span></div>
                <span className="ios-stat-num money">
                  {ultimo
                    ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
                    : <span style={{ color: "var(--text-3)" }}>—</span>}
                </span>
                <div className="stat-pct">
                  {ultimo
                    ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
                    : t("depositos.sinDepositos")}
                </div>
              </div>
            </div>
          </div>
        ) : (
          resumenEscritorio
        )}

        {enIPhone ? (
          <div className="ios-panel-head"><h2>{t("depositos.historial")}</h2></div>
        ) : (
          <div className="tx-head">
            <div className="tx-title">{t("depositos.historial")}</div>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : depositos.length === 0 ? (
          estadoVacio
        ) : (
          <>
            <DepositoTable
              depositos={depositos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
              onEdit={abrirEditar}
              onChanged={onChanged}
            />
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(depositos.length / PAGE_SIZE))}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}

      {pendingDeleteSel && (
        <ConfirmDialog
          title={t("depositos.eliminarTitulo")}
          message={t("depositos.eliminarMensaje", {
            monto: `${fmtMoney(pendingDeleteSel.monto)} ${pendingDeleteSel.moneda}`,
            cuenta: pendingDeleteSel.cuenta_banco,
          })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={() => void borrarSel(pendingDeleteSel)}
          onCancel={() => setPendingDeleteSel(null)}
        />
      )}

      {modalOpen && (
        <DepositoModal
          church={church}
          editing={editing}
          onClose={cerrarModal}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
