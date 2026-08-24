import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  countDepositos, countPendingTx, currentMonth, currentYear, efectivoDisponibleHasta, fmtFechaCorta, fmtMoney,
  hoyISO, listDepositos, listTx, mesLegible, monthDepositos,
  type Church, type Deposito, type Tx,
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
import PendientesDeposito, { type Corte } from "../components/PendientesDeposito";
import NuevoCorteIOS from "../components/NuevoCorteIOS";
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
     partir de 700px la pantalla se parte, y a partir de 1000 las dos columnas
     conviven en vez de empujarse. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  /* El detalle es un ID que se re-busca en cada recarga, no una copia
     congelada: así una edición refresca el panel en sitio y un borrado lo
     cierra solo. Es el patrón de `Movimientos.tsx`. */
  const [selId, setSelId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  /* El segmentado Pendientes · Depositados del handoff. "Depositados" es lo
     que la app tiene: un depósito registrado ES un depósito hecho.
     "Pendientes" —preparar el corte antes de ir al banco— es el paso que
     falta; la pestaña se construye y explica qué le falta, con la cifra REAL
     de efectivo por depositar, que sí se sabe calcular. */
  const [vista, setVista] = useState<"pendientes" | "depositados">("depositados");
  const [porDepositar, setPorDepositar] = useState<Centavos | null>(null);
  useEffect(() => {
    /* Apertura + aprobados − ya depositado: la misma cuenta que usa el Inicio
       para su "Saldo en caja". Es el número que la pestaña Pendientes SÍ
       puede dar aunque no sepa repartirlo en cortes. */
    efectivoDisponibleHasta(church, hoyISO()).then(setPorDepositar).catch(console.error);
  }, [church, refreshKey]);

  /* ---- Pendientes: el dinero en caja, agrupado por día (handoff 3) ----
     Los movimientos son reales: ingresos aprobados cobrados en efectivo o en
     cheque. Lo que NO existe es saber cuál de ellos ya fue al banco —ni
     `transactions` ni `depositos_bancarios` guardan ese vínculo—, así que la
     lista no puede esconder lo ya depositado y lo dice en su propio aviso.
     Ver `PendientesDeposito.tsx`. */
  const navigate = useNavigate();
  const [enCaja, setEnCaja] = useState<Tx[]>([]);
  const [porRevisar, setPorRevisar] = useState(0);
  const [corteSel, setCorteSel] = useState<string | null>(null);
  /** Ids marcados. Empieza con TODO el corte marcado, que es el caso normal:
   *  se lleva al banco lo que hay, y se desmarca la excepción. */
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [hojaCorte, setHojaCorte] = useState(false);
  const [prefill, setPrefill] = useState<{ monto: Centavos; cuenta: string; fecha: string; periodo: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([listTx(church.id, { tipo: "ingreso", limit: 400 }), countPendingTx(church.id)])
      .then(([txs, n]) => {
        if (cancelado) return;
        setEnCaja(txs.filter((x) => x.estado === "aprobado"
          && (x.metodo_pago === "efectivo" || x.metodo_pago === "cheque")));
        setPorRevisar(n);
      })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  /** Un corte por día con dinero en caja, del más reciente al más viejo. */
  const cortes = useMemo<Corte[]>(() => {
    const mapa = new Map<string, Tx[]>();
    for (const m of enCaja) {
      const dia = m.fecha.slice(0, 10);
      const g = mapa.get(dia);
      if (g) g.push(m); else mapa.set(dia, [m]);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([fecha, movs]) => ({
        fecha,
        titulo: t("depositos.corteDel", { fecha: fmtFechaCorta(fecha) }),
        movs,
      }));
  }, [enCaja, t]);

  const corte = cortes.find((c) => c.fecha === corteSel) ?? null;

  /* Al cambiar de corte se marca todo lo suyo. Se hace en un efecto y no al
     pulsar la fila porque el corte también puede llegar elegido de vuelta de
     una recarga. */
  useEffect(() => {
    if (!corte) return;
    setMarcados(new Set(corte.movs.map((m) => m.id)));
  }, [corte?.fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarMov(id: number) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  /** La cuenta del último depósito: es la que se va a proponer. */
  const cuentaSugerida = useMemo(() => {
    const ult = depositos.reduce<Deposito | null>(
      (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor), null);
    return ult?.cuenta_banco ?? "";
  }, [depositos]);

  const totalMarcado = useMemo(
    () => sumar(...(corte?.movs ?? []).filter((m) => marcados.has(m.id)).map((m) => m.monto)),
    [corte, marcados],
  );

  /* Entrar en Pendientes sin nada elegido abre el corte más reciente: es el
     que se viene a revisar, y un panel vacío en una pantalla de dos columnas
     es medio iPad desperdiciado. */
  useEffect(() => {
    if (vista === "pendientes" && corteSel == null && cortes.length > 0) setCorteSel(cortes[0].fecha);
  }, [vista, corteSel, cortes]);

  /** "Marcar depositado": abre el formulario con lo que el corte ya sabe. */
  function marcarDepositado() {
    setPrefill({
      monto: totalMarcado,
      cuenta: cuentaSugerida,
      fecha: hoyISO(),
      periodo: currentMonth(),
    });
    setEditing(null);
    setModalOpen(true);
  }
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
    setPrefill(null);
    setModalOpen(true);
  }
  useAbrirCrearDesdeMas(abrirNuevo);

  function abrirEditar(dep: Deposito) {
    setEditing(dep);
    setPrefill(null);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditing(null);
    setPrefill(null);
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
            {/* El subtítulo del handoff 3: cuántos cortes esperan y a qué
                cuenta van. Es dato real —los cortes son días con dinero en
                caja, la cuenta es la del último depósito— y dice más que la
                frase fija que explicaba la pantalla. En Mac sigue el mes,
                que es donde comparte renglón con los botones. */}
            <div className="page-sub">
              {esMac()
                ? mesLegible(mes)
                : cortes.length > 0
                  ? [t("depositos.cortesPendientes", { count: cortes.length }), cuentaSugerida]
                      .filter(Boolean).join(" · ")
                  : t("depositos.sub")}
            </div>
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
                  {/* El segmentado del handoff, encima del buscador. */}
                  <div className="md-seg-tipo" role="group" aria-label={t("depositos.vistaAria")}>
                    {(["pendientes", "depositados"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={vista === v ? "sel" : ""}
                        aria-pressed={vista === v}
                        onClick={() => setVista(v)}
                      >
                        {t(`depositos.filtro_${v}`)}
                      </button>
                    ))}
                  </div>
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
                  {vista === "pendientes" ? (
                    /* Los cortes: un día con dinero en caja es una fila. El
                       monto y el conteo son reales; "Sin depositar" es lo que
                       el diseño pide y lo que el esquema NO puede confirmar
                       movimiento a movimiento — el panel lo explica. */
                    cortes.length === 0 ? (
                      <div className="fm-vacio fm-vacio--pendiente dep-pendientes">
                        <span className="fm-vacio-titulo">{t("depositos.sinCortesTitulo")}</span>
                        <span className="fm-vacio-sub">
                          {t("depositos.sinCortesSub", {
                            monto: `${fmtMoney(porDepositar ?? CERO)} ${church.moneda}`,
                          })}
                        </span>
                      </div>
                    ) : (
                      <>
                        {cortes.map((c) => (
                          <div
                            key={c.fecha}
                            className={`md-fila${corteSel === c.fecha ? " sel" : ""}`}
                            onClick={() => setCorteSel(c.fecha)}
                          >
                            <div className="md-fila-textos">
                              <div className="md-fila-titular">{c.titulo}</div>
                              <div className="md-fila-sub truncate">
                                {t("depositos.movsDelCorte", { count: c.movs.length })}
                                {cuentaSugerida ? ` · ${cuentaSugerida}` : ""}
                              </div>
                            </div>
                            <span className="md-fila-cola">
                              <span className="md-fila-monto">
                                {fmtMoney(sumar(...c.movs.map((m) => m.monto)))}
                              </span>
                              <span className="dep-estado dep-estado--pendiente">{t("depositos.sinDepositar")}</span>
                            </span>
                          </div>
                        ))}
                        <div className="dep-lista-pie">
                          {t("depositos.cortesPie", { monto: `${fmtMoney(porDepositar ?? CERO)} ${church.moneda}` })}
                        </div>
                      </>
                    )
                  ) : visibles.length === 0 ? (
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
                              <div className="md-fila-titular">
                                {t("depositos.corteDel", { fecha: fmtFechaCorta(d.fecha) })}
                              </div>
                              <div className="md-fila-sub truncate">
                                {[d.cuenta_banco, d.referencia].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            {/* Monto y estado, como el diseño. Aquí el estado
                                es siempre "Depositado": una fila de esta tabla
                                es un depósito ya hecho. El "Sin depositar" del
                                handoff vive en la pestaña Pendientes, que es
                                la que espera motor. */}
                            <span className="md-fila-cola">
                              <span className="md-fila-monto">{fmtMoney(d.monto)}</span>
                              <span className="dep-estado">{t("depositos.filtro_depositados")}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* El pie cuenta y suma lo VISIBLE, no lo que hay: con una
                    búsqueda puesta, el total del historial contradiría a la
                    lista que tienes delante. Mismo trato que en Ingresos. */}
                {vista === "depositados" && visibles.length > 0 && (
                  <div className="md-pie">
                    <span>{t("depositos.conteoVisible", { count: visibles.length })}</span>
                    <span className="md-pie-total">{fmtMoney(totalVisible)} {church.moneda}</span>
                  </div>
                )}
              </div>

              <div className="md-detalle">
                {(() => {
                  /* Pendientes tiene su propio panel: no es un depósito lo que
                     se mira, es el dinero que todavía no lo es. */
                  if (vista === "pendientes") {
                    if (!corte) {
                      if (angosto) return null;
                      return (
                        <div className="md-vacio">
                          <div className="md-vacio-hint">
                            <h3>{t("depositos.eligeCorte")}</h3>
                            <p>{t("depositos.eligeCorteSub")}</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <PendientesDeposito
                        church={church}
                        corte={corte}
                        sel={marcados}
                        onToggle={alternarMov}
                        porRevisar={porRevisar}
                        efectivoEnCaja={porDepositar ?? CERO}
                        cuenta={cuentaSugerida}
                        fechaRegistro={fmtFechaCorta(hoyISO())}
                        periodo={mes}
                        tituloLista={t("depositos.titulo")}
                        onVolver={() => setCorteSel(null)}
                        onIrPorRevisar={() => navigate("/bandeja")}
                        onNuevoCorte={() => setHojaCorte(true)}
                        onMarcarDepositado={marcarDepositado}
                      />
                    );
                  }
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

      {hojaCorte && corte && (
        <NuevoCorteIOS
          church={church}
          movs={corte.movs}
          sel={marcados}
          onToggle={alternarMov}
          nombre={corte.titulo}
          cuenta={cuentaSugerida}
          fecha={hoyISO()}
          onClose={() => setHojaCorte(false)}
        />
      )}

      {modalOpen && (
        <DepositoModal
          church={church}
          editing={editing}
          prefill={prefill}
          onClose={cerrarModal}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
