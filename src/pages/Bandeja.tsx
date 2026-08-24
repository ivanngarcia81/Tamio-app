import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, cortesSinSegundaFirma, currentMonth, fmtFecha, fmtFechaCorta, fmtMoney,
  listArchivedMembers, listMovimientosRecurrentes, listPendingTx, listTx, markTxRejected,
  markTxReviewed, restoreMember,
  type Church, type Corte, type Member, type MovimientoRecurrente, type Tx,
} from "../db";
import {
  calcularAlertas, conteoPorTipo, UMBRAL_COMPROBANTE,
  type Alerta, type TipoAlerta,
} from "../services/bandeja/alertas";
import PanelAlerta from "../components/PanelAlerta";
import { EmptyState } from "../components/TxList";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { esIPad, esIPhone, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleMovimiento from "../components/DetalleMovimiento";
import DetalleMiembro from "../components/DetalleMiembro";
import ComprobantePreview from "../components/ComprobantePreview";
import { IconCheck, IconEdit, IconRefreshCw } from "../icons";

interface Props {
  church: Church;
  refreshKey: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

const PAGE_SIZE = 15;

export default function Bandeja({ church, refreshKey, onEditTx, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  /* Maestro-detalle del iPad, los mismos dos umbrales que Movimientos y
     Aportantes (docs/ipad-rediseno.md): partido desde 700, columnas desde
     1000, y entre medias el detalle empuja. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [pendientes, setPendientes] = useState<Tx[]>([]);
  const [archivados, setArchivados] = useState<Member[]>([]);
  const [cortesSinFirma, setCortesSinFirma] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagPendientes, setPagPendientes] = useState(1);
  const [pagArchivados, setPagArchivados] = useState(1);
  const [recientes, setRecientes] = useState<Tx[]>([]);
  const [recurrentes, setRecurrentes] = useState<MovimientoRecurrente[]>([]);
  /* El chip de tipo del handoff: `null` = todas. */
  const [filtroTipo, setFiltroTipo] = useState<TipoAlerta | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listPendingTx(church.id),
      listArchivedMembers(church.id),
      /* Los movimientos recientes sobre los que se buscan las otras alertas.
         200 y no "todos": las cinco reglas miran duplicados, comprobantes y
         categorías de lo que se acaba de registrar, no del histórico entero —
         una bandeja que rescata un descuadre de hace tres años no es una
         bandeja, es una auditoría. */
      listTx(church.id, { limit: 200 }),
      listMovimientosRecurrentes(church.id),
      /* Los cortes que pidieron segunda firma y siguen sin ella (migración
         47). Sin techo de fecha, y a propósito: una firma que falta no
         caduca — el resto de las reglas miran lo reciente porque hablan de
         movimientos, y esto habla de un trámite abierto. */
      cortesSinSegundaFirma(church.id),
    ])
      .then(([nuevosPendientes, nuevosArchivados, nuevosRecientes, nuevosRec, nuevosCortes]) => {
        if (cancelado) return;
        setPendientes(nuevosPendientes);
        setArchivados(nuevosArchivados);
        setRecientes(nuevosRecientes);
        setRecurrentes(nuevosRec);
        setCortesSinFirma(nuevosCortes);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => { setPagPendientes(1); setPagArchivados(1); }, [refreshKey]);

  /* El asunto abierto. Aquí la lista es HETEROGÉNEA —un movimiento pendiente
     y un miembro archivado no son lo mismo— así que la selección guarda el
     tipo además del id, y de ahí sale qué panel se pinta. Como en las otras
     dos pantallas se guarda el ID y no el objeto: al resolver un asunto la
     recarga lo saca de su lista y el panel se cierra solo. */
  const [sel, setSel] = useState<{ tipo: "tx" | "miembro"; id: number } | null>(null);
  const selTx = sel?.tipo === "tx" ? pendientes.find((x) => x.id === sel.id) ?? null : null;
  const selMiembro = sel?.tipo === "miembro" ? archivados.find((m) => m.id === sel.id) ?? null : null;
  const ultimoSel = useRef<{ tx: Tx | null; miembro: Member | null }>({ tx: null, miembro: null });
  if (selTx) ultimoSel.current = { tx: selTx, miembro: null };
  if (selMiembro) ultimoSel.current = { tx: null, miembro: selMiembro };

  /* ---- Las alertas del handoff 2 ----
     El motor vive en `services/bandeja/alertas.ts`, puro y probado aparte;
     aquí solo se le dan las cuatro listas y se pinta lo que devuelve. La
     bandeja deja de ser "pendientes + archivados" y pasa a ser la lista de
     cosas que alguien tiene que mirar, que es lo que el diseño pide. */
  /* Los dos controles de tesorería (migración 45) salen de la iglesia, no de
     la constante: quien los apague en Ajustes deja de ver esas alertas aquí,
     que es justo lo que el interruptor promete. */
  const umbralIglesia = church.umbral_comprobante ?? UMBRAL_COMPROBANTE;
  const alertas: Alerta[] = useMemo(() => calcularAlertas({
    pendientes,
    recientes,
    archivados,
    recurrentes,
    hoyMes: currentMonth(),
    cortesSinFirma,
    umbralComprobante: umbralIglesia,
    avisarSinComprobante: church.avisar_sin_comprobante !== 0,
    avisarDuplicados: church.avisar_duplicados !== 0,
  }), [pendientes, recientes, archivados, recurrentes, cortesSinFirma, umbralIglesia,
       church.avisar_sin_comprobante, church.avisar_duplicados]);
  const conteos = useMemo(() => conteoPorTipo(alertas), [alertas]);
  const visiblesAl = filtroTipo ? alertas.filter((a) => a.tipo === filtroTipo) : alertas;

  /* La alerta abierta, por CLAVE y no por índice: al resolver una, la lista
     se recalcula y un índice apuntaría a la de al lado. */
  const [selAl, setSelAl] = useState<string | null>(null);
  const alertaSel = visiblesAl.find((a) => a.clave === selAl)
    ?? alertas.find((a) => a.clave === selAl)
    ?? null;
  const ultimaAl = useRef<Alerta | null>(null);
  if (alertaSel) ultimaAl.current = alertaSel;

  /**
   * Los botones del panel, distintos por alerta — es lo que el handoff pide
   * y lo que hace útil esta pantalla: la acción que resuelve ESTE caso, a un
   * toque, en vez de "editar" para todo.
   *
   * "Adjuntar", "Asignar categoría" y "Vincular miembro" llevan al formulario
   * de edición, que es donde esos tres campos se tocan; el nombre dice qué se
   * va a hacer allí, no cómo se llama la pantalla que abre.
   */
  function accionesDe(a: Alerta): ReactNode {
    const tx = a.tx;
    const aprobar = tx && (
      <button type="button" className="btn primary" onClick={() => void handleReviewed(tx)}>
        <IconCheck size={14} strokeWidth={2.4} /> {t("bandeja.aprobar")}
      </button>
    );
    const editar = (etiqueta: string) => tx && (
      <button type="button" className="btn secondary" onClick={() => onEditTx(tx)}>
        <IconEdit size={14} strokeWidth={2} /> {etiqueta}
      </button>
    );
    const devolver = tx && (
      <button type="button" className="btn secondary al-devolver" onClick={() => void handleRechazado(tx)}>
        {t("bandeja.devolver")}
      </button>
    );

    if (a.tipo === "miembroArchivado" && a.miembro) {
      const m = a.miembro;
      return (
        <button type="button" className="btn primary" onClick={() => void handleRestore(m)}>
          <IconRefreshCw size={14} strokeWidth={2.2} /> {t("bandeja.restaurar")}
        </button>
      );
    }
    if (a.tipo === "firmaPendiente" && a.corte) {
      /* Como el recurrente vencido: aquí no hay nada que firmar, la hoja vive
         en el corte. El botón lleva ahí en vez de fingir una acción local —y
         de paso, quien firma ve el corte entero antes de decidir. */
      return (
        <a className="btn primary" href="#/depositos">
          {t("bandeja.irAlCorte")}
        </a>
      );
    }
    if (a.tipo === "recurrenteVencido") {
      /* Aquí no hay movimiento sobre el que actuar: lo que falta es
         generarlo, y eso vive en la pantalla de Ingresos/Gastos con su
         serie. El botón lleva ahí en vez de fingir una acción local. */
      return (
        <a className="btn primary" href={`#/${a.recurrente?.tipo === "gasto" ? "gastos" : "ingresos"}`}>
          {t("bandeja.verRecurrentes")}
        </a>
      );
    }
    if (a.tipo === "sinComprobante") {
      return (<>{editar(t("bandeja.adjuntarYAprobar"))}{aprobar}{devolver}</>);
    }
    if (a.tipo === "categoriaVacia") return (<>{editar(t("bandeja.asignarCategoria"))}{devolver}</>);
    if (a.tipo === "miembroSinVincular") return (<>{editar(t("bandeja.vincularMiembro"))}{devolver}</>);
    if (a.tipo === "duplicado") return (<>{editar(t("common.editar"))}{devolver}</>);
    return (<>{aprobar}{editar(t("common.editar"))}{devolver}</>);
  }

  /** La inicial del círculo de la fila: la letra del tipo, como el diseño. */
  const inicialDe = (tipo: TipoAlerta) => t(`bandeja.inicial_${tipo}`);

  /** Lo que va bajo el titular de la fila: de qué objeto habla la alerta. */
  function subDeAlerta(a: Alerta): string {
    if (a.tx) {
      const cat = categoriaInfo(a.tx.tipo, a.tx.categoria);
      return [a.tx.concepto, cat.nombre, fmtMoney(a.tx.monto)].filter(Boolean).join(" · ");
    }
    if (a.miembro) return a.miembro.email ?? a.miembro.rfc ?? t("bandeja.sinCorreoRegistrado");
    if (a.recurrente) {
      return [a.recurrente.concepto, t("bandeja.mesesSinGenerar", { count: a.meses?.length ?? 0 })]
        .filter(Boolean).join(" · ");
    }
    if (a.corte) return [a.corte.nombre, fmtFechaCorta(a.corte.fecha)].filter(Boolean).join(" · ");
    return "";
  }

  async function handleRechazado(tx: Tx) {
    setSel(null);
    setSelAl(null);
    await markTxRejected(tx.id, church.id);
    showToast(t("toast.movimientoDevuelto"));
    playSound("guardado");
    onChanged();
  }

  /** "Aprobar todo" del handoff: solo sobre lo que de verdad se aprueba —los
   *  movimientos en estado pendiente—. Las otras cuatro alertas no son cosas
   *  que se aprueben (un duplicado no se "aprueba", se decide), así que el
   *  botón no las toca ni finge haberlas resuelto. */
  async function handleAprobarTodo() {
    const porAprobar = alertas.filter((a) => a.tipo === "pendiente" && a.tx).map((a) => a.tx!);
    if (porAprobar.length === 0) return;
    setSel(null);
    setSelAl(null);
    for (const tx of porAprobar) await markTxReviewed(tx.id, church.id);
    showToast(t("bandeja.aprobadosTodos", { count: porAprobar.length }));
    playSound("guardado");
    onChanged();
  }
  const [previewSel, setPreviewSel] = useState<string | null>(null);

  async function handleReviewed(tx: Tx) {
    // Resuelto el asunto, deja de estar en la bandeja: el panel se cierra.
    setSel((s) => (s?.tipo === "tx" && s.id === tx.id ? null : s));
    await markTxReviewed(tx.id, church.id);
    showToast(t("toast.marcadoRevisado"));
    playSound("guardado");
    onChanged();
  }

  async function handleRestore(m: Member) {
    setSel((s) => (s?.tipo === "miembro" && s.id === m.id ? null : s));
    await restoreMember(m.id, church.id);
    showToast(t("toast.miembroRestaurado"));
    playSound("guardado");
    onChanged();
  }

  /* Lo que la pantalla dice que hay tiene que ser lo que la lista enseña.
     Antes `total` sumaba pendientes + archivados, que son DOS de las siete
     reglas: con doce asuntos en la lista y ningún movimiento en estado
     pendiente, la cabecera decía "No tienes pendientes" encima de una lista
     llena. Ahora cuenta alertas, que es la unidad de esta pantalla. */
  const total = alertas.length;

  /* Pie de ventana (solo Mac): el mismo par que ya llevaba `page-sub`, que
     aquí sí cabe entero. */
  useBarraEstado(total === 0
    ? t("bandeja.sinPendientes")
    : `${t("bandeja.porRevisar", { count: total })} · ${t("bandeja.archivados", { count: archivados.length })}`);
  const totalPagPendientes = Math.max(1, Math.ceil(pendientes.length / PAGE_SIZE));
  const totalPagArchivados = Math.max(1, Math.ceil(archivados.length / PAGE_SIZE));
  const paginaPendientes = pendientes.slice((pagPendientes - 1) * PAGE_SIZE, pagPendientes * PAGE_SIZE);
  const paginaArchivados = archivados.slice((pagArchivados - 1) * PAGE_SIZE, pagArchivados * PAGE_SIZE);

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("bandeja.titulo")}</div>
            <div className="page-sub">
              {total === 0
                ? t("bandeja.sinPendientes")
                : `${t("bandeja.porRevisar", { count: total })} · ${t("bandeja.archivados", { count: archivados.length })}`}
            </div>
          </div>
        )}
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          La columna maestra junta los dos grupos que la página ya tenía
          —movimientos pendientes y miembros archivados— en una sola lista
          con dos cabeceras. El panel reutiliza los MISMOS componentes de
          Ingresos y Aportantes, cambiándoles solo los botones: aquí un
          movimiento se mira para aprobarlo, no para borrarlo.

          La taxonomía de alertas del handoff SÍ se calcula: las siete reglas
          viven en `services/bandeja/alertas.ts` y salen de columnas que ya
          existían —estado, comprobante_path, categoria, member_id, las
          fechas de los recurrentes—. Cuando se descartó (handoff 1) fue por
          no haber mirado el esquema, no porque faltara el dato. */}
      {partido ? (
        <div className={`md-split md-bandeja${sel ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                {/* La cabecera del handoff: cuántas hay y "Aprobar todo". */}
                <div className="al-cabecera">
                  <span className="al-conteo">{t("bandeja.nPendientes", { count: alertas.length })}</span>
                  {conteos.get("pendiente") ? (
                    <button type="button" className="chip" onClick={() => void handleAprobarTodo()}>
                      {t("bandeja.aprobarTodo")}
                    </button>
                  ) : null}
                </div>
                {/* Los chips por tipo. Solo salen los tipos que HAY: una
                    bandeja limpia no tiene por qué enseñar cinco filtros que
                    no encuentran nada. */}
                {conteos.size > 1 && (
                  <div className="md-chips al-chips">
                    <button
                      type="button"
                      className={`chip${filtroTipo === null ? " active" : ""}`}
                      onClick={() => setFiltroTipo(null)}
                    >
                      {t("common.todos")} <span className="count">{alertas.length}</span>
                    </button>
                    {[...conteos.entries()].map(([tipo, n]) => (
                      <button
                        key={tipo}
                        type="button"
                        className={`chip${filtroTipo === tipo ? " active" : ""}`}
                        onClick={() => setFiltroTipo(filtroTipo === tipo ? null : tipo)}
                      >
                        {t(`bandeja.alerta_${tipo}`)} <span className="count">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="md-filas">
                  {alertas.length === 0 ? (
                    <div className="md-filas-vacio">
                      <EmptyState pagina titulo={t("bandeja.sinPendientes")} sub={t("bandeja.emptySub")} />
                    </div>
                  ) : visiblesAl.length === 0 ? (
                    <div className="md-filas-vacio">{t("bandeja.sinDeEseTipo")}</div>
                  ) : (
                    visiblesAl.map((a) => (
                      <div
                        key={a.clave}
                        className={`md-fila al-fila${selAl === a.clave ? " sel" : ""}`}
                        onClick={() => {
                          setSelAl(a.clave);
                          /* La selección vieja se mantiene en paralelo porque
                             el panel reutiliza `DetalleMovimiento` y
                             `DetalleMiembro`, que reciben el objeto. */
                          if (a.tx) setSel({ tipo: "tx", id: a.tx.id });
                          else if (a.miembro) setSel({ tipo: "miembro", id: a.miembro.id });
                          else setSel(null);
                        }}
                      >
                        {/* El círculo de 34px del diseño con la inicial del
                            tipo. El de "pendiente" va en ámbar —es el que
                            pide decisión— y el resto en gris. */}
                        <span className={`al-marca${a.tipo === "pendiente" ? " urgente" : ""}`} aria-hidden="true">
                          {a.tipo === "pendiente" ? "!" : inicialDe(a.tipo)}
                        </span>
                        <span className="md-fila-textos">
                          <span className="md-fila-titular">
                            <span className="truncate">{t(`bandeja.alerta_${a.tipo}`)}</span>
                          </span>
                          <span className="md-fila-sub truncate">{subDeAlerta(a)}</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("bandeja.porRevisar", { count: alertas.length })}</span>
                  <span className="md-pie-total">{t("bandeja.archivados", { count: archivados.length })}</span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const a = angosto ? alertaSel ?? ultimaAl.current : alertaSel;
                  if (a) {
                    /* La cabecera del handoff —pastilla, titular, párrafo y
                       acciones— va ARRIBA, y debajo la ficha del objeto, que
                       ya la pintan bien `DetalleMovimiento` / `DetalleMiembro`.
                       No se duplica nada: cambia el encabezado según por qué
                       el asunto llegó a la bandeja. */
                    const cab = (
                      <PanelAlerta
                        alerta={a}
                        umbral={umbralIglesia}
                        moneda={church.moneda}
                        acciones={accionesDe(a)}
                      />
                    );
                    if (a.tx) {
                      return (
                        <div className="al-panel">
                          {cab}
                          <DetalleMovimiento
                            tx={a.tx}
                            tituloLista={t("bandeja.titulo")}
                            onVolver={() => { setSel(null); setSelAl(null); }}
                            onEditar={onEditTx}
                            onEliminar={() => {}}
                            onVerComprobante={setPreviewSel}
                            acciones={<></>}
                          />
                        </div>
                      );
                    }
                    if (a.miembro) {
                      return (
                        <div className="al-panel">
                          {cab}
                          <DetalleMiembro
                            church={church}
                            member={a.miembro}
                            tituloLista={t("bandeja.titulo")}
                            onVolver={() => { setSel(null); setSelAl(null); }}
                            onEditar={() => {}}
                            onEliminar={() => {}}
                            acciones={<></>}
                          />
                        </div>
                      );
                    }
                    /* Un recurrente vencido no tiene ficha que enseñar: el
                       movimiento todavía no existe, que es justo la alerta. */
                    return <div className="al-panel">{cab}</div>;
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{alertas.length === 0 ? t("bandeja.todoAlDia") : t("bandeja.eligeAsunto")}</h3>
                        <p>{alertas.length === 0 ? t("bandeja.emptySub") : t("bandeja.eligeAsuntoSub")}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content">
        {loading ? (
          <LoadingState />
        ) : total === 0 ? (
          <EmptyState
            pagina
            titulo={t("bandeja.sinPendientes")}
            sub={t("bandeja.emptySub")}
          />
        ) : (
          <>
            {/* El dato que llevaba `page-sub` ("N por revisar · M archivados")
                no se pierde al ocultar la cabecera: baja al encabezado de
                cada bloque, donde además dice a qué lista pertenece cada
                número. Se reutiliza la misma etiqueta de sección que Mac ya
                usa en vez de inventar una llave nueva. */}
            {enIPhone ? (
              <div className="ios-panel-head">
                <h2>{t("bandeja.pendientesRevision")} ({pendientes.length})</h2>
              </div>
            ) : (
              <div className="inbox-section-label">{t("bandeja.pendientesRevision")}</div>
            )}
            {pendientes.length === 0 ? (
              enIPhone ? (
                <div className="ios-panel-empty">{t("bandeja.noMovsRevisar")}</div>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 20 }}>
                  {t("bandeja.noMovsRevisar")}
                </div>
              )
            ) : enIPhone ? (
              <>
                <div className="ios-listcard" style={{ marginBottom: 8 }}>
                  {paginaPendientes.map((tx) => {
                    const cat = categoriaInfo(tx.tipo, tx.categoria);
                    const secundaria = [
                      tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto"),
                      cat.nombre,
                      fmtFechaCorta(tx.fecha),
                    ].join(" · ");
                    return (
                      /* Los dos botones de texto de Mac ("Editar" y "Marcar
                         revisado") no caben junto al concepto y el monto: el
                         gesto de editar pasa a la fila entera y solo la acción
                         positiva se queda visible, como botón redondo. */
                      <div
                        className="ios-txrow ios-txrow--clickable"
                        key={tx.id}
                        onClick={() => onEditTx(tx)}
                      >
                        <div className="ios-txrow-main">
                          <div className="ios-txrow-title" title={tx.concepto}>
                            <span className="truncate">{tx.concepto}</span>
                          </div>
                          <div className="tx-secundaria-movil" title={secundaria}>{secundaria}</div>
                        </div>
                        <div className="ios-txrow-trailing">
                          <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                            {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                            <span className="cur">{tx.moneda}</span>
                          </span>
                          <button
                            type="button"
                            className="ios-row-accion"
                            aria-label={t("bandeja.marcarRevisado")}
                            title={t("bandeja.marcarRevisado")}
                            onClick={(e) => { e.stopPropagation(); void handleReviewed(tx); }}
                          >
                            <span><IconCheck size={15} strokeWidth={2.6} /></span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination page={pagPendientes} totalPages={totalPagPendientes} onPageChange={setPagPendientes} />
              </>
            ) : (
              <>
                <div className="inbox-list" style={{ marginBottom: 8 }}>
                  {paginaPendientes.map((tx) => {
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
                <Pagination page={pagPendientes} totalPages={totalPagPendientes} onPageChange={setPagPendientes} />
              </>
            )}

            {enIPhone ? (
              <div className="ios-panel-head" style={{ marginTop: 26 }}>
                <h2>{t("bandeja.miembrosArchivadosLabel")} ({archivados.length})</h2>
              </div>
            ) : (
              <div className="inbox-section-label" style={{ marginTop: 20 }}>{t("bandeja.miembrosArchivadosLabel")}</div>
            )}
            {archivados.length === 0 ? (
              enIPhone ? (
                <div className="ios-panel-empty">{t("bandeja.noMiembrosArchivados")}</div>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                  {t("bandeja.noMiembrosArchivados")}
                </div>
              )
            ) : enIPhone ? (
              <>
                <div className="ios-listcard" style={{ marginBottom: 8 }}>
                  {paginaArchivados.map((m) => (
                    /* La fila no lleva `--clickable`: en Mac tocarla tampoco
                       hace nada, la única acción es "Restaurar". */
                    <div className="ios-txrow" key={m.id}>
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title" title={m.nombre}>
                          <span className="truncate">{m.nombre}</span>
                        </div>
                        <div className="tx-secundaria-movil">
                          {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing">
                        <button
                          type="button"
                          className="ios-row-accion"
                          aria-label={t("bandeja.restaurar")}
                          title={t("bandeja.restaurar")}
                          onClick={() => void handleRestore(m)}
                        >
                          <span><IconRefreshCw size={15} strokeWidth={2.2} /></span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={pagArchivados} totalPages={totalPagArchivados} onPageChange={setPagArchivados} />
              </>
            ) : (
              <>
                <div className="inbox-list">
                  {paginaArchivados.map((m) => (
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
                <Pagination page={pagArchivados} totalPages={totalPagArchivados} onPageChange={setPagArchivados} />
              </>
            )}
          </>
        )}
      </div>
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}
    </>
  );
}
