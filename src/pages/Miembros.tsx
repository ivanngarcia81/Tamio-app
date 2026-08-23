import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, textoCorto, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleMiembro from "../components/DetalleMiembro";
import {
  archiveMember, countMemberAsistencias, countMemberTx, currentYear, deleteMember, fmtFechaCorta, fmtMoney,
  insertMember, listMembersRegistro, memberStats, undeleteMember, type Church, type Member, type MemberStat, type NewMember,
} from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import { useContextMenu } from "../components/ContextMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import GenericCsvImportModal from "../components/GenericCsvImportModal";
import MemberDetailModal from "../components/MemberDetailModal";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { MIEMBROS_CSV_TEMPLATE, MIEMBROS_FIELDS, validarFilaMiembro } from "../services/importMiembrosCsv";
import { IconEdit, IconPlus, IconSearch, IconUpload } from "../icons";
import CountUp from "../components/CountUp";
import { CERO, sumar } from "../dinero";

const TAG_CLASS: Record<string, string> = {
  diezmador: "diezmo",
  donador: "donacion",
  ofrendante: "ofrenda",
  comite: "pastores",
  junta: "mantenimiento",
};

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const MEMBER_COLS = "1.6fr 1fr 130px 150px 170px 72px";
/* Sin la columna de etiquetas: si ninguna iglesia las usa, reservarle un
   quinto del ancho para pintar guiones en todas las filas es desperdicio. */
const MEMBER_COLS_SIN_ETIQUETAS = "1.6fr 130px 150px 170px 72px";
const PAGE_SIZE = 30;

function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();
}

interface Props {
  church: Church;
  refreshKey: number;
  /** false = el padrón lo administra Secretaría (las altas van por Membresía). */
  puedeCrear: boolean;
  onEdit: (member: Member) => void;
  onNew: () => void;
  onChanged: () => void;
}

interface PendingDelete {
  member: Member;
  hasHistory: boolean;
  count: number;
}

export default function Miembros({ church, refreshKey, puedeCrear, onEdit, onNew, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Miembros" como pastilla activa
  // (ver Cartas.tsx/Movimientos.tsx) — el título grande de aquí abajo sobra
  // ahí.
  const enIPhone = esIPhone();
  /* Maestro-detalle del iPad, el mismo trato que Movimientos.tsx: partido a
     partir de 700px, columnas desde 1000, y entre medias (todo iPad en
     vertical, más el mini en horizontal) la ficha EMPUJA a la lista.
     Ver docs/ipad-rediseno.md. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<Record<number, MemberStat>>({});
  const [query, setQuery] = useState("");
  /* El segmentado Activos · Bajas · Todos del handoff. Arranca en activos,
     que es el padrón vivo y lo que esta pantalla quiere decir por defecto. */
  const [filtro, setFiltro] = useState<"activos" | "bajas" | "todos">("activos");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [detalle, setDetalle] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { abrirMenu, menu } = useContextMenu();

  /* La fila abierta en el maestro-detalle: un ID re-buscado en cada recarga,
     no una copia congelada — una edición refresca la ficha en sitio y un
     borrado la cierra solo. `ultimoSel` conserva el último objeto real para
     que en el modo de empuje el panel no se vacíe a mitad de la animación de
     salida. Mismo patrón, mismos motivos que Movimientos.tsx. */
  const [selId, setSelId] = useState<number | null>(null);
  const sel = selId != null ? members.find((m) => m.id === selId) ?? null : null;
  const ultimoSel = useRef<Member | null>(null);
  if (sel) ultimoSel.current = sel;

  // Puente Ingresos → Aportantes: el "Ver ficha" del detalle de un
  // movimiento (iPad) navega aquí con el miembro a abrir. El state se limpia
  // enseguida para que un refresh no re-seleccione — el mismo trato que el
  // puente Agenda → Bitácora de Servicios.tsx.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const vm = (location.state as { verMiembro?: number } | null)?.verMiembro;
    if (!vm) return;
    setSelId(vm);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      /* El registro COMPLETO —activos y bajas— porque el segmentado del
         handoff ofrece las tres vistas. `listMembers` (solo activos) se
         quedaría corto en "Bajas" y en "Todos", y pedir dos listas sería
         tener dos verdades que sincronizar. El filtro se hace en memoria:
         un padrón de iglesia son cientos de filas, no millones. */
      listMembersRegistro(church.id),
      memberStats(church.id, currentYear()),
    ])
      .then(([nuevosMembers, nuevosStats]) => {
        if (cancelado) return;
        setMembers(nuevosMembers);
        setStats(nuevosStats);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => setPage(1), [query, filtro, refreshKey]);

  async function requestDelete(m: Member) {
    // Un miembro con historial (movimientos O asistencia a servicios) nunca
    // se borra en duro: se archiva, para que los registros viejos siempre
    // puedan resolver a su miembro.
    const [n, asistencias] = await Promise.all([
      countMemberTx(m.id, church.id),
      countMemberAsistencias(m.id, church.id),
    ]);
    setPendingDelete({ member: m, hasHistory: n > 0 || asistencias > 0, count: n });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { member, hasHistory } = pendingDelete;
    // Si lo borrado era la ficha abierta del maestro-detalle, se cierra: un
    // panel enseñando a alguien que ya no está en la lista es mentira.
    setSelId((id) => (id === member.id ? null : id));
    if (hasHistory) {
      await archiveMember(member.id, church.id);
      setPendingDelete(null);
      showToast(t("toast.miembroArchivado"));
      playSound("guardado");
      onChanged();
      return;
    }
    await deleteMember(member.id, church.id);
    setPendingDelete(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.miembroEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        // Borrado suave: se restaura la MISMA fila (mismo uid), no una nueva.
        await undeleteMember(member.id, church.id);
        onChanged();
      },
    });
  }

  // Resumen calculado a partir de los datos ya cargados (sin consultas nuevas).
  // "Diezmaron" cuenta miembros con al menos un ingreso de categoría diezmo en
  // el año, no los que tienen la etiqueta puesta en la ficha: la etiqueta la
  // escribe alguien a mano una vez y después nadie la mantiene, así que el
  // número que salía era el de una intención vieja, no el del año en curso.
  const resumen = useMemo(() => {
    let diezmadores = 0, aportaron = 0, totalAnio = CERO;
    for (const m of members) {
      const s = stats[m.id];
      if (s?.diezmoAnio) diezmadores++;
      if (s?.totalAnio) { aportaron++; totalAnio = sumar(totalAnio, s.totalAnio); }
    }
    return { total: members.length, diezmadores, aportaron, totalAnio };
  }, [members, stats]);

  /* Pie de ventana (solo Mac). "Aportaron" y no "diezmaron": el primero es el
     total de gente que dio algo, que es el número que importa cuando se está
     mirando el padrón entero. El desglose lo tienen las tarjetas. */
  useBarraEstado(t("barraEstado.miembros", {
    count: resumen.total,
    aportaron: resumen.aportaron,
    anio: currentYear(),
  }));

  const q = query.trim().toLowerCase();
  const delFiltro = filtro === "todos"
    ? members
    : members.filter((m) => (filtro === "activos" ? m.activo === 1 : m.activo === 0));
  const visibles = q
    ? delFiltro.filter(
        (m) =>
          m.nombre.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q) ||
          (m.rfc ?? "").toLowerCase().includes(q)
      )
    : delFiltro;
  const nActivos = members.filter((m) => m.activo === 1).length;
  const nBajas = members.length - nActivos;
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Muchas iglesias no usan etiquetas: la columna quedaba entera con guiones,
  // ocupando ancho que las demás necesitan. Se muestra solo si alguien la usa.
  const hayEtiquetas = members.some((m) => {
    try { return (JSON.parse(m.etiquetas) as string[]).length > 0; } catch { return false; }
  });
  const cols = hayEtiquetas ? MEMBER_COLS : MEMBER_COLS_SIN_ETIQUETAS;

  /* ---- Piezas que se pintan en más de un sitio ----
     El resumen sale en el layout de siempre Y en el maestro-detalle del iPad
     (columnas: en el panel mientras no hay ficha abierta; empuje: en la
     cabeza de la lista). La misma extracción, por los mismos motivos, que en
     Movimientos.tsx: un solo marcado, no copias que divergen. */
  const resumenEscritorio = (
    <div className="dash-canvas">
      <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
          <div className="stat-head"><span className="stat-label">{t("miembros.statTotal")}</span></div>
          <div className="stat-value md"><CountUp value={resumen.total} format={String} /></div>
        </div>
        <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
          <div className="stat-head"><span className="stat-label">{t("miembros.statDiezmadores")}</span></div>
          <div className="stat-value md"><CountUp value={resumen.diezmadores} format={String} /></div>
        </div>
        <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
          <div className="stat-head"><span className="stat-label">{t("miembros.statAportaronAnio")}</span></div>
          <div className="stat-value md"><CountUp value={resumen.aportaron} format={String} /></div>
        </div>
        <div className="stat-card accent" style={{ "--accent-color": "var(--accent-5)" } as CSSProperties}>
          <div className="stat-head"><span className="stat-label">{t("miembros.statTotalAnio")}</span></div>
          <div className="stat-value md"><CountUp value={resumen.totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
        </div>
      </div>
    </div>
  );

  const estadoVacio = (
    <EmptyState
      pagina
      titulo={members.length === 0 ? t("miembros.aunNoHay") : t("miembros.sinResultados")}
      sub={members.length === 0 ? t("miembros.agregaPrimero") : t("miembros.pruebaOtroTermino")}
      icon={<IconPlus size={20} strokeWidth={1.8} />}
      accion={members.length === 0 && puedeCrear
        ? { label: t("miembros.nuevo"), onClick: onNew }
        : undefined}
      duplicaCrear
    />
  );

  /* Los grupos por inicial de la lista del maestro-detalle, como la app de
     Contactos. Sin acentos al agrupar ("Ángel" cae en la A) — la misma
     normalización que el buscador de Ajustes. Sobre `visibles` y sin
     paginar: la lista es una columna continua que se desplaza. */
  const gruposLetra: { letra: string; items: Member[] }[] = [];
  if (partido) {
    for (const m of visibles) {
      const letra = (m.nombre.trim()[0] ?? "#")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const ultimo = gruposLetra[gruposLetra.length - 1];
      if (ultimo && ultimo.letra === letra) ultimo.items.push(m);
      else gruposLetra.push({ letra, items: [m] });
    }
  }
  const totalVisibles = sumar(...visibles.map((m) => stats[m.id]?.totalAnio ?? CERO));

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("miembros.titulo")}</div>
            <div className="page-sub">{t("miembros.activos", { count: members.length })}</div>
          </div>
        )}
        <div className="header-actions">
          {puedeCrear ? (
            <>
              {/* En el teléfono este botón se pintaba entero (borde, fondo,
                  texto "Import CSV") junto al título, en vez de reducirse al
                  glifo solo que ya llevan el resto de páginas en la fila fija
                  de arriba — a esta página nunca le llegó ese tratamiento.
                  La versión de escritorio se marca aparte y la fija de abajo
                  cubre el móvil, mismo patrón que .btn-compartir-cabecera en
                  Dashboard/Movimientos/Reportes/InformesMembresia. */}
              <button className="btn secondary solo-escritorio" onClick={() => setImportOpen(true)}>
                <IconUpload size={13} /> {t("miembros.importarCsv")}
              </button>
              <button className="btn primary btn-nuevo-cabecera" onClick={onNew}>
                <IconPlus size={14} /> {t("miembros.nuevo")}
              </button>
            </>
          ) : (
            <span className="form-hint">{t("miembros.padronSecretaria")}</span>
          )}
        </div>
        {puedeCrear && (
          <div className="header-actions solo-movil">
            <button
              type="button"
              className="btn-compartir-cabecera"
              onClick={() => setImportOpen(true)}
              aria-label={t("miembros.importarCsv")}
            >
              <IconUpload size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ---- Maestro-detalle (iPad a partir de 1024px) ---- */}
      {partido ? (
        <div className={`md-split md-miembros${selId != null ? " md-abierto" : ""}`}>
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
                      placeholder={t("miembros.buscarPlaceholder")}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("miembros.buscarPlaceholder")}
                    />
                  </label>
                  {/* El segmentado del handoff. Va DEBAJO del buscador, no
                      encima como en Movimientos: allí elige entre dos
                      pantallas y aquí filtra la que ya estás viendo. */}
                  <div className="md-seg-tipo" role="group" aria-label={t("miembros.filtroAria")}>
                    {(["activos", "bajas", "todos"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={filtro === f ? "sel" : ""}
                        aria-pressed={filtro === f}
                        onClick={() => setFiltro(f)}
                      >
                        {t(`miembros.filtro_${f}`)}
                      </button>
                    ))}
                  </div>
                  {/* El conteo del diseño, bajo el segmentado: dice cuántos
                      hay de cada cosa aunque estés mirando una sola. */}
                  <span className="md-conteo">
                    {t("miembros.conteoFiltro", { activos: nActivos, bajas: nBajas })}
                  </span>
                </div>

                <div className="md-filas">
                  {angosto && <div className="md-extra">{resumenEscritorio}</div>}
                  {visibles.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposLetra.map((g) => (
                      <div key={g.letra}>
                        <div className="md-grupo">{g.letra}</div>
                        {g.items.map((m) => {
                          const stat = stats[m.id];
                          /* La línea secundaria del diseño: "Miembro desde
                             2014 · diezmador". Año de ingreso y primera
                             etiqueta, que sí existen; el correo queda de
                             repuesto para fichas sin nada de eso — mejor un
                             dato que la letanía de "Sin correo registrado". */
                          let etiquetas: string[] = [];
                          try { etiquetas = JSON.parse(m.etiquetas); } catch { /* noop */ }
                          /* Una baja NO se describe por su año de ingreso:
                             lo que hay que saber de ella es cuándo dejó el
                             padrón y por qué, que es lo que dibuja el handoff
                             ("Baja en 2025 · traslado aceptado"). */
                          const esBaja = m.activo === 0;
                          const partesSub = esBaja
                            ? [
                                m.fecha_baja ? t("miembros.bajaEnAnio", { anio: m.fecha_baja.slice(0, 4) }) : null,
                                m.motivo_baja ? (() => {
                                    /* El catálogo de motivos vive en
                                       `membresia.motivo.*`; la ficha también
                                       admite escribir uno a mano, y esos no
                                       tienen clave — i18next devolvería la
                                       clave cruda en la fila. */
                                    const k = `membresia.motivo.${m.motivo_baja}`;
                                    const txt = t(k);
                                    return txt === k ? m.motivo_baja : txt;
                                  })() : null,
                              ].filter(Boolean)
                            : [
                                m.fecha_ingreso ? t("miembros.desdeAnio", { anio: m.fecha_ingreso.slice(0, 4) }) : null,
                                etiquetas[0] ?? null,
                              ].filter(Boolean);
                          const sub = partesSub.length > 0
                            ? partesSub.join(" · ")
                            : m.email ?? t("miembros.sinCorreoRegistrado");
                          /* La etiqueta "Traslado" del diseño. Sale del estado
                             de membresía, no de una invención: `enProceso` es
                             el valor que la ficha pone mientras un traslado
                             está abierto. */
                          const enTraslado = m.estado_membresia === "enProceso";
                          return (
                            <div
                              key={m.id}
                              className={`md-fila${selId === m.id ? " sel" : ""}${esBaja ? " es-baja" : ""}`}
                              onClick={() => setSelId(m.id)}
                            >
                              {/* El color sale del id, no de la posición: así
                                  no cambia al filtrar y coincide con el de la
                                  ficha del panel, que ya usaba id % 8. */}
                              <div className={`mini-avatar ${AVATAR_COLORS[m.id % AVATAR_COLORS.length]}`}>
                                {initials(m.nombre)}
                              </div>
                              <span className="md-fila-textos">
                                <span className="md-fila-titular"><span className="truncate">{m.nombre}</span></span>
                                <span className="md-fila-sub truncate">{sub}</span>
                              </span>
                              <span className="md-fila-cola">
                                {stat?.totalAnio ? (
                                  <span className="md-fila-monto">{fmtMoney(stat.totalAnio)}</span>
                                ) : (
                                  <span className="md-fila-monto" style={{ color: "var(--text-3)", fontWeight: 400 }}>—</span>
                                )}
                                {enTraslado && <span className="md-fila-aviso">{t("miembros.traslado")}</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("miembros.activos", { count: visibles.length })}</span>
                  <span className="md-pie-total">{fmtMoney(totalVisibles)} {church.moneda}</span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const detM = angosto ? sel ?? ultimoSel.current : sel;
                  if (detM) {
                    return (
                      <DetalleMiembro
                        church={church}
                        member={detM}
                        tituloLista={t("miembros.titulo")}
                        onVolver={() => setSelId(null)}
                        onEditar={onEdit}
                        onEliminar={(m) => void requestDelete(m)}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("miembros.eligeMiembro")}</h3>
                        <p>{t("miembros.eligeMiembroSub")}</p>
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
        {!loading && (
          enIPhone ? (
            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("miembros.seccionResumen")}</h2></div>
              <div className="ios-panel-grid">
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statTotal")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.total} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statDiezmadores")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.diezmadores} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statAportaronAnio")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.aportaron} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statTotalAnio")}</span></div>
                  <span className="ios-stat-num money"><CountUp value={resumen.totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></span>
                </div>
              </div>
            </div>
          ) : resumenEscritorio
        )}

        <div className="tx-head">
          <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={textoCorto(t("common.buscarCorto"), t("miembros.buscarPlaceholder"))}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? estadoVacio : (
          <div className={enIPhone ? "ios-listcard" : "data-table roomy tabla-miembros"}>
            {!enIPhone && (
              <div className="thead" style={{ gridTemplateColumns: cols }}>
                <div className="th">{t("miembros.colMiembro")}</div>
                {hayEtiquetas && <div className="th">{t("miembros.colEtiquetas")}</div>}
                <div className="th">{t("miembros.colUltimoAporte")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("miembros.colTotalAnio")}</div>
                <div className="th">{t("miembros.colContacto")}</div>
                <div className="th"></div>
              </div>
            )}
            {pagina.map((m, i) => {
              let etiquetas: string[] = [];
              try { etiquetas = JSON.parse(m.etiquetas); } catch { /* noop */ }
              const stat = stats[m.id];

              if (enIPhone) {
                return (
                  <div
                    className="ios-txrow ios-txrow--clickable"
                    data-fila
                    key={m.id}
                    onClick={() => setDetalle(m)}
                    onContextMenu={(e) =>
                      abrirMenu(e, [
                        { label: t("common.verFicha"), onClick: () => setDetalle(m) },
                        { label: t("common.editar"), onClick: () => onEdit(m) },
                        { label: t("common.eliminar"), danger: true, onClick: () => requestDelete(m) },
                      ])}
                  >
                    <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {initials(m.nombre)}
                    </div>
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title" title={m.nombre}>{m.nombre}</div>
                      <div className="tx-secundaria-movil" title={m.email ?? undefined}>
                        {m.email ?? t("miembros.sinCorreoRegistrado")}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      {stat?.totalAnio ? (
                        <span className="tx-amount positive">
                          {fmtMoney(stat.totalAnio)}<span className="cur">{church.moneda}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 15 }}>—</span>
                      )}
                    </div>
                    <RowMenu
                      onEdit={() => onEdit(m)}
                      onDelete={() => requestDelete(m)}
                    />
                  </div>
                );
              }

              return (
                <div
                  className="tr" data-fila
                  key={m.id}
                  style={{ gridTemplateColumns: cols, cursor: "pointer" }}
                  onClick={() => setDetalle(m)}
                  onContextMenu={(e) =>
                    abrirMenu(e, [
                      { label: t("common.verFicha"), onClick: () => setDetalle(m) },
                      { label: t("common.editar"), onClick: () => onEdit(m) },
                      { label: t("common.eliminar"), danger: true, onClick: () => requestDelete(m) },
                    ])}
                >
                  <div className="td">
                    <div className="person" style={{ minWidth: 0 }}>
                      <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                        {initials(m.nombre)}
                      </div>
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <div className="p-name truncate" title={m.nombre}>{m.nombre}</div>
                        <div className="p-mail truncate" title={m.email ?? undefined}>{m.email ?? t("miembros.sinCorreoRegistrado")}</div>
                      </div>
                    </div>
                  </div>
                  {hayEtiquetas && (
                    <div className="td">
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {etiquetas.length === 0 && (
                          <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>
                        )}
                        {etiquetas.map((et) => (
                          <span key={et} className={`tag ${TAG_CLASS[et] ?? "otros"}`} title={TAG_CLASS[et] ? t(`etiqueta.${et}`) : et}>
                            {TAG_CLASS[et] ? t(`etiqueta.${et}`) : et}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {stat?.ultimoAporte ? fmtFechaCorta(stat.ultimoAporte) : "—"}
                  </div>
                  <div className="td" style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {stat?.totalAnio ? `${fmtMoney(stat.totalAnio)} ${church.moneda}` : "—"}
                  </div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    <div className="truncate">{m.telefono ?? t("common.sinTelefono")}</div>
                    {/* El valor presente salía pelado ("57876") mientras el
                        ausente sí se explicaba: justo al revés de lo útil. */}
                    <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }} title={m.rfc ?? undefined}>
                      {m.rfc ? `${t("campo.rfc")}: ${m.rfc}` : t("miembros.sinRfc")}
                    </div>
                  </div>
                  <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                    <span className="row-actions">
                      <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(m)}>
                        <IconEdit size={13} strokeWidth={2} />
                      </span>
                    </span>
                    <RowMenu
                      onEdit={() => onEdit(m)}
                      onDelete={() => requestDelete(m)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
      )}

      {menu}

      {detalle && (
        <MemberDetailModal church={church} member={detalle} onClose={() => setDetalle(null)} />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.hasHistory ? t("miembros.archivarTitulo") : t("miembros.eliminarTitulo")}
          message={
            pendingDelete.hasHistory
              ? t("miembros.archivarMensaje", { nombre: pendingDelete.member.nombre, count: pendingDelete.count })
              : t("miembros.eliminarMensaje", { nombre: pendingDelete.member.nombre })
          }
          confirmLabel={pendingDelete.hasHistory ? t("miembros.archivar") : t("common.eliminar")}
          danger={!pendingDelete.hasHistory}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {importOpen && (
        <GenericCsvImportModal<NewMember>
          titulo={t("miembrosImport.titulo")}
          subtitulo={t("miembrosImport.sub")}
          instrucciones={t("miembrosImport.instrucciones")}
          fields={MIEMBROS_FIELDS}
          templateCsv={MIEMBROS_CSV_TEMPLATE}
          templateFileName="plantilla-miembros.csv"
          validarFila={validarFilaMiembro}
          previewColsTemplate="1.6fr 1fr 1fr 1fr"
          previewColumns={[
            { label: t("miembrosImport.colNombre"), render: (m) => m.nombre },
            { label: t("miembrosImport.colCorreo"), render: (m) => m.email ?? "—" },
            { label: t("miembrosImport.colTelefono"), render: (m) => m.telefono ?? "—" },
            { label: t("miembrosImport.colRfc"), render: (m) => m.rfc ?? "—" },
          ]}
          etiquetaItem={(n) => t("miembrosImport.items", { count: n })}
          onConfirmar={async (items) => {
            for (const m of items) await insertMember(church.id, m);
          }}
          onClose={() => setImportOpen(false)}
          onImportado={onChanged}
        />
      )}
    </>
  );
}
