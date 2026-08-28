import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, textoCorto, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleServicio from "../components/DetalleServicio";
import { currentMonth, deleteServicio, fmtFecha, fmtFechaCorta, listServicios, mesLegible, type Church, type Servicio } from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import ServicioModal from "../components/ServicioModal";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import SeccionIOS from "../components/ios/SeccionIOS";
import { agruparPorMes } from "../components/ios/agrupado";
import { useScrollInfinito } from "../hooks/useScrollInfinito";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconBookOpen, IconMiembros, IconPlus, IconSearch } from "../icons";
import CountUp from "../components/CountUp";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";

const COLS = "110px 1.8fr 1fr 130px 72px";
const PAGE_SIZE = 25;

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

function totalPresentes(s: Servicio): number {
  return s.ninos + s.jovenes + s.adultos;
}

/** "Dom", "Mié" — el día de la semana abreviado que lleva la pastilla de
 *  fecha de la lista. Sale del mismo `fmtFecha` que ya usan las cabeceras de
 *  día de Ingresos, así que respeta el idioma sin una tabla propia. */
function diaCorto(fecha: string): string {
  const n = fmtFecha(fecha).nombreDia;
  return n.length > 4 ? n.slice(0, 3) : n;
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Servicios({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Servicios" como pastilla activa —
  // el título grande sobra ahí.
  const enIPhone = esIPhone();
  const location = useLocation();
  const navigate = useNavigate();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ open: boolean; servicio: Servicio | null }>({ open: false, servicio: null });
  const [prefill, setPrefill] = useState<{ fecha?: string; tipo?: string; dirige?: string; actividadId?: number } | null>(null);
  useAbrirCrearDesdeMas(() => setModal({ open: true, servicio: null }));

  // Puente Agenda → Bitácora: si la Agenda navegó aquí con una actividad,
  // se abre el registro nuevo con la fecha y el tipo ya puestos. El state se
  // limpia enseguida para que un refresh no reabra el modal.
  useEffect(() => {
    const pre = (location.state as { prefillServicio?: { fecha?: string; tipo?: string; dirige?: string; actividadId?: number } } | null)?.prefillServicio;
    if (!pre) return;
    setPrefill(pre);
    setModal({ open: true, servicio: null });
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const [pendingDelete, setPendingDelete] = useState<Servicio | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  /* ---- Maestro-detalle del iPad: los dos umbrales de siempre. ---- */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [selId, setSelId] = useState<number | null>(null);

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
  /* En el teléfono la página CRECE en vez de moverse: es el mismo corte del
     mismo array, abierto por arriba, que es lo que convierte el paginador en
     scroll infinito. En Mac e iPad el paginador se queda — con ratón y teclado,
     saltar a la página 7 sigue siendo mejor que desplazarse seis. */
  const pagina = enIPhone
    ? visibles.slice(0, page * PAGE_SIZE)
    : visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const centinela = useScrollInfinito(
    enIPhone && page < totalPages,
    () => setPage((p) => Math.min(p + 1, totalPages)),
  );

  const sel = selId == null ? null : servicios.find((s) => s.id === selId) ?? null;
  const ultimoSel = useRef<Servicio | null>(null);
  /* El buscador del teléfono: el mismo par estado + referencia que Actas y
     Membresía, para que «Cancelar» aparezca al enfocar y devuelva el foco. */
  const [buscando, setBuscando] = useState(false);
  const refBuscar = useRef<HTMLInputElement>(null);
  if (sel) ultimoSel.current = sel;

  /* Los cultos se agrupan por MES: es el periodo con el que se cuentan en los
     informes y el que el secretario tiene en la cabeza al buscar uno. */
  const gruposMes: { mes: string; items: Servicio[] }[] = [];
  for (const s of visibles) {
    const m = s.fecha.slice(0, 7);
    const ultimo = gruposMes[gruposMes.length - 1];
    if (ultimo && ultimo.mes === m) ultimo.items.push(s);
    else gruposMes.push({ mes: m, items: [s] });
  }

  const estadoVacio = (
    <EmptyState
      pagina
      titulo={servicios.length === 0 ? t("servicios.aunNoHay") : t("servicios.sinResultados")}
      sub={servicios.length === 0 ? t("servicios.agregaPrimero") : t("servicios.sinResultadosSub")}
      icon={<IconBookOpen size={20} strokeWidth={1.8} />}
      accion={servicios.length === 0
        ? { label: t("servicios.nuevoServicio"), onClick: () => setModal({ open: true, servicio: null }) }
        : undefined}
      duplicaCrear
    />
  );

  /* Pie de ventana (solo Mac). */
  useBarraEstado(t("barraEstado.servicios", { count: visibles.length }));

  /* Las tres tarjetas del mes, a una constante: el maestro-detalle las pinta
     en dos sitios —el panel sin fila abierta y la cabeza de la lista en el
     modo de empuje— y tienen que ser los mismos nodos. */
  const resumenEscritorio = (
    <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      <div className="stat-card accent" style={accent("var(--accent-4)")}>
        <div className="stat-head">
          <span className="stat-label">{t("servicios.statServiciosMes")}</span>
          <div className="stat-icon neutral"><IconBookOpen size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md"><CountUp value={statsMes.servicios} format={String} /></div>
      </div>
      <div className="stat-card accent" style={accent("var(--accent-2)")}>
        <div className="stat-head">
          <span className="stat-label">{t("servicios.statAsistenciaPromedio")}</span>
          <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">{statsMes.promedio ? <CountUp value={statsMes.promedio} format={String} /> : "—"}</div>
      </div>
      <div className="stat-card accent" style={accent("var(--accent-1)")}>
        <div className="stat-head">
          <span className="stat-label">{t("servicios.statVisitantesMes")}</span>
          <div className="stat-icon neutral"><IconPlus size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md"><CountUp value={statsMes.visitantes} format={String} /></div>
      </div>
    </div>
  );

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("secretaria.servicios.titulo")}</div>
            {!esMac() && <div className="page-sub">{t("secretaria.servicios.sub")}</div>}
          </div>
        )}
        <div className="header-actions">
          <button className="btn primary btn-nuevo-cabecera" onClick={() => setModal({ open: true, servicio: null })}>
            <IconPlus size={14} /> {t("servicios.nuevoServicio")}
          </button>
        </div>
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          Lista de 358px con la fecha en pastilla, y a la derecha la ficha del
          culto: el conteo primero y grande, la tira de los cultos anteriores
          y el resto de secciones, cada una solo si tiene algo dentro. */}
      {partido ? (
        <div className={`md-split md-servicios${selId != null ? " md-abierto" : ""}`}>
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
                      placeholder={t("servicios.buscarPlaceholder")}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("servicios.buscarPlaceholder")}
                    />
                  </label>
                </div>

                <div className="md-filas">
                  {angosto && <div className="md-extra">{resumenEscritorio}</div>}
                  {visibles.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposMes.map((g) => (
                      <div key={g.mes}>
                        <div className="md-grupo">{mesLegible(g.mes)}</div>
                        {g.items.map((s) => (
                          <div
                            key={s.id}
                            className={`md-fila${selId === s.id ? " sel" : ""}`}
                            onClick={() => setSelId(s.id)}
                          >
                            {/* La pastilla de fecha del handoff: día de la
                                semana arriba y número abajo. En una lista de
                                cultos la fecha es la identidad de la fila. */}
                            <div className="md-dia">
                              <span className="md-dia-nombre">{diaCorto(s.fecha)}</span>
                              <span className="md-dia-num">{Number(s.fecha.slice(8, 10))}</span>
                            </div>
                            <div className="md-fila-textos">
                              <div className="md-fila-titular">{t(`servicios.tipo.${s.tipo}`)}</div>
                              <div className="md-fila-sub">
                                {[s.titulo_mensaje, s.predica].filter(Boolean).join(" · ") || fmtFechaCorta(s.fecha)}
                              </div>
                            </div>
                            <span className="md-fila-cola">
                              <span className="md-fila-monto">{totalPresentes(s) || "—"}</span>
                              {/* El punto naranja del handoff: el culto al que
                                  le falta gente por asignar. "Falta" se mide
                                  sobre lo que la tabla SÍ guarda —quién
                                  predica y quién dirige—; los otros cuatro
                                  puestos del diseño no se pueden contar
                                  todavía (ver DetalleServicio). */}
                              {(!s.predica || !s.dirige) && (
                                <span className="sv-punto-falta" title={t("servicios.rosterIncompleto")} />
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const det = angosto ? sel ?? ultimoSel.current : sel;
                  if (det) {
                    return (
                      <DetalleServicio
                        servicio={det}
                        historial={servicios}
                        churchId={church.id}
                        tituloLista={t("secretaria.servicios.titulo")}
                        onVolver={() => setSelId(null)}
                        onEditar={(s) => setModal({ open: true, servicio: s })}
                        onEliminar={setPendingDelete}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("servicios.eligeServicio")}</h3>
                        <p>{t("servicios.eligeServicioSub")}</p>
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
          /* Rediseño de iOS 26 (GUIA §4, fila 14): las tres tarjetas de
             resumen pasan a las tres filas de una lista agrupada. Las tres son
             un conteo suelto —un número sin unidad ni pie—, y en una tarjeta de
             media pantalla ese número ocupaba 40px de alto para decir "9".
             Además eran tres en una rejilla de dos columnas, así que la tercera
             dejaba un hueco. En fila se leen las tres de un vistazo. */
          <SeccionIOS titulo={t("servicios.seccionResumen")}>
            <div className="ios-txrow">
              <div className="ios-txrow-main"><div className="ios-txrow-title">{t("servicios.statServiciosMes")}</div></div>
              <div className="ios-txrow-trailing">
                <span className="ios-fila-valor"><CountUp value={statsMes.servicios} format={String} /></span>
              </div>
            </div>
            <div className="ios-txrow">
              <div className="ios-txrow-main"><div className="ios-txrow-title">{t("servicios.statAsistenciaPromedio")}</div></div>
              <div className="ios-txrow-trailing">
                <span className="ios-fila-valor">
                  {statsMes.promedio ? <CountUp value={statsMes.promedio} format={String} /> : "—"}
                </span>
              </div>
            </div>
            <div className="ios-txrow">
              <div className="ios-txrow-main"><div className="ios-txrow-title">{t("servicios.statVisitantesMes")}</div></div>
              <div className="ios-txrow-trailing">
                <span className="ios-fila-valor"><CountUp value={statsMes.visitantes} format={String} /></span>
              </div>
            </div>
          </SeccionIOS>
        ) : (
          <div className="dash-canvas">
            {resumenEscritorio}
          </div>
        )}

        {/* Las tarjetas de arriba cuentan SOLO el mes en curso; esta tabla es
            la bitácora entera y su buscador busca en todo lo registrado. Sin
            el rótulo parecían contradecirse: "Servicios este mes: 0" encima
            de una tabla con cultos de meses anteriores. */}
        {enIPhone ? (
          /* En el teléfono el rótulo y el buscador NO comparten renglón.
             `.tx-head` es una fila de escritorio —título a la izquierda, campo
             a la derecha— y en 393 px dejaba el encabezado del grupo midiendo
             152 px, con el campo empezando a media pantalla: el único buscador
             de la app que no iba a lo ancho. Aquí van uno debajo del otro, con
             el mismo campo gris de Actas y Membresía. */
          <>
            <h2 className="ios-section-header">{t("servicios.historialCompleto")}</h2>
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
                    aria-label={t("servicios.buscarPlaceholder")}
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
            </div>
          </>
        ) : (
          <div className="tx-head">
            {/* `.card-title` es la etiqueta en versalitas de 11px de una
                tarjeta de escritorio. */}
            <span className="card-title">{t("servicios.historialCompleto")}</span>
            <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
              <IconSearch size={15} strokeWidth={2} />
              <input
                className="form-input"
                placeholder={textoCorto(t("common.buscarCorto"), t("servicios.buscarPlaceholder"))}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          estadoVacio
        ) : enIPhone ? (
          /* Rediseño v2: «agrupada por mes, con el conteo como valor de la
             fila». Era una lista plana con el conteo en negrita de 16; ahora
             cada mes es su sección y el número se lee como cualquier otro
             valor de la derecha, que es lo que es. */
          agruparPorMes(pagina, (s) => s.fecha).map((seccion) => (
          <SeccionIOS key={seccion.clave} titulo={seccion.etiqueta}>
          <div className="ios-listcard">
            {seccion.items.map((s) => (
              <div
                className="ios-txrow ios-txrow--clickable"
                data-fila
                key={s.id}
                onClick={() => setModal({ open: true, servicio: s })}
              >
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title">{t(`servicios.tipo.${s.tipo}`)}</div>
                  <div className="tx-secundaria-movil">
                    {[s.titulo_mensaje, s.predica, fmtFechaCorta(s.fecha)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="ios-txrow-trailing">
                  <span className="ios-fila-valor">{totalPresentes(s) || "—"}</span>
                </div>
                <RowMenu
                  onEdit={() => setModal({ open: true, servicio: s })}
                  onDelete={() => setPendingDelete(s)}
                />
              </div>
            ))}
          </div>
          </SeccionIOS>
          ))
        ) : (
          <div className="data-table roomy tabla-servicios">
            <div className="thead" style={{ gridTemplateColumns: COLS }}>
              <div className="th">{t("tx.colFecha")}</div>
              <div className="th">{t("servicios.colServicio")}</div>
              <div className="th">{t("servicios.colPredica")}</div>
              <div className="th" style={{ textAlign: "right" }}>{t("servicios.colAsistencia")}</div>
              <div className="th"></div>
            </div>
            {pagina.map((s) => (
              <div
                className="tr" data-fila
                key={s.id}
                style={{ gridTemplateColumns: COLS, cursor: "pointer" }}
                onClick={() => setModal({ open: true, servicio: s })}
              >
                <div className="td" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>{fmtFechaCorta(s.fecha)}</div>
                <div className="td" style={{ minWidth: 0 }}>
                  <div className="p-name truncate">{t(`servicios.tipo.${s.tipo}`)}</div>
                  <div className="p-mail truncate" title={s.titulo_mensaje ?? undefined}>
                    {s.titulo_mensaje ?? "—"}
                  </div>
                </div>
                <div className="td" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                  <div className="truncate">{s.predica ?? "—"}</div>
                </div>
                <div className="td" style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {totalPresentes(s) || "—"}
                </div>
                <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    onEdit={() => setModal({ open: true, servicio: s })}
                    onDelete={() => setPendingDelete(s)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {enIPhone
          ? <div ref={centinela} aria-hidden="true" />
          : <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
      </div>
      )}

      {modal.open && (
        <ServicioModal
          church={church}
          servicio={modal.servicio}
          prefill={modal.servicio ? null : prefill}
          onClose={() => { setModal({ open: false, servicio: null }); setPrefill(null); }}
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
