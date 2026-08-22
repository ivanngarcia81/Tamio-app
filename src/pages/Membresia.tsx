import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, textoCorto, esMac } from "../movil";
import { MacBuscador } from "../components/mac/MacFiltros";
import {
  currentYear, darDeBajaMember, fmtFechaCorta, listAsistenciaLigera, listMembersRegistro,
  membresiaStats, restoreMember,
  type Church, type Member, type MembresiaStats,
} from "../db";
import { asistenciaPorMiembro, periodoDeAnio, type AsistenciaMiembro } from "../services/informes/membresia";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import BajaMemberModal from "../components/BajaMemberModal";
import FichaMiembroModal from "../components/FichaMiembroModal";
import FusionarMiembroModal from "../components/FusionarMiembroModal";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconArrowDown, IconArrowUp, IconEdit, IconEye, IconIdBadge, IconMiembros, IconPlus, IconSearch } from "../icons";
import CountUp from "../components/CountUp";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const COLS = "1.7fr 1fr 130px 190px 104px";
/* El iPad reparte distinto porque el handoff de "Diseño nativo para iPad"
   dibuja esta pantalla como una tabla táctil de CINCO columnas: Nombre,
   Condición, Ingreso, Ministerio y Asistencia. Las cinco están.

   La quinta se calcula, no se inventa: sale de `servicio_asistencia` con la
   misma función que usa Informes de membresía (`asistenciaPorMiembro`), y
   cuando no hay listas tomadas la celda lo DICE en vez de enseñar un número
   de mentira. Ese fue el criterio de Iván: "lo más correcto es poner que no
   hay suficiente información hasta que haya información que compilar".

   Las columnas se eligen aquí y no con `display: none` en el CSS a
   propósito: esconder una celda de una rejilla NO quita su vía, así que
   apagar Ministerio dejaba a las acciones ocupando la vía de 1.2fr y un
   hueco muerto de 104px al final de cada fila. Se veía en los tres iPads
   chicos en vertical. */
const COLS_IPAD = "2.2fr 1.1fr 132px 1.2fr 132px 104px";
/* Debajo de 1024 —el mini, el 10.9" y el 11" en vertical— cae Ministerio,
   que es lo más prescindible de las cinco: con seis vías los nombres se
   partían a la mitad. Asistencia se queda: es la columna que responde "¿este
   miembro sigue viniendo?", que es de lo que va el padrón. */
const COLS_IPAD_ESTRECHO = "2.2fr 1.1fr 132px 132px 104px";
const PAGE_SIZE = 30;

type Filtro = "activos" | "bajas" | "todos";

const MOTIVOS_CONOCIDOS = ["traslado", "fallecimiento", "retiro", "disciplina"];

/** Etiqueta y clase del badge de estado. Los miembros del registro usan su
 *  estado (activo/inactivo/visitante); las bajas por traslado o fallecimiento
 *  se muestran con ese nombre, el resto como "Baja". */
function estadoBadge(m: Member): { key: string; clase: string } {
  if (m.activo === 1) {
    const e = ["activo", "inactivo", "visitante", "enProceso"].includes(m.estado_membresia) ? m.estado_membresia : "activo";
    const clase = e === "activo" ? "activo" : e === "visitante" ? "donacion" : e === "enProceso" ? "musicos" : "servicios";
    return { key: `membresia.estado.${e}`, clase };
  }
  if (m.motivo_baja === "traslado") return { key: "membresia.estado.trasladado", clase: "baja" };
  if (m.motivo_baja === "fallecimiento") return { key: "membresia.estado.fallecido", clase: "baja" };
  return { key: "membresia.estadoBaja", clase: "baja" };
}

/** Solo "activo" (de verdad, no visitante/en proceso/inactivo) se destaca
 *  en verde; el resto —incluidas todas las bajas— se queda en gris
 *  neutro. Mismo criterio que InformesMembresia (badgeClaseEstadoMiembro):
 *  son estados administrativos, no una cola de trabajo con "pendiente". */
function badgeClaseMembresiaIOS(m: Member): string {
  if (m.activo !== 1) return "";
  const e = ["activo", "inactivo", "visitante", "enProceso"].includes(m.estado_membresia) ? m.estado_membresia : "activo";
  return e === "activo" ? "ios-badge--ok" : "";
}

/** Los ministerios del miembro en una línea ("Música · Ujieres"). El campo
 *  es JSON en la base; si trae basura, la fila se queda sin dato en vez de
 *  reventar la tabla entera. */
function ministeriosDe(t: (k: string) => string, json: string | null): string {
  if (!json) return "";
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return "";
    return v
      .map((x) => {
        /* El catálogo (MINISTERIOS) no es cerrado: la ficha admite escribir
           uno a mano, y esos no tienen clave. i18next devuelve la clave tal
           cual cuando no la encuentra, así que sin esta vuelta atrás la
           celda diría "ficha.ministerio.Damas" en la tabla. */
        const clave = `ficha.ministerio.${x}`;
        const texto = t(clave);
        return texto === clave ? String(x) : texto;
      })
      .join(" · ");
  } catch {
    return "";
  }
}

/** La celda de Condición: la pastilla de estado y, en una baja, la fecha y
 *  el motivo debajo. Estaba escrita en línea dentro de la fila; sale a una
 *  función porque el iPad la pinta en otra columna (la segunda) y el Mac en
 *  la cuarta — el mismo nodo, no una copia que se desviaría. */
function celdaCondicion(t: (k: string, o?: Record<string, unknown>) => string, m: Member) {
  const badge = estadoBadge(m);
  if (m.activo === 1) return <span className={`tag ${badge.clase}`}>{t(badge.key)}</span>;
  const motivoTexto = m.motivo_baja
    ? MOTIVOS_CONOCIDOS.includes(m.motivo_baja)
      ? t(`membresia.motivo.${m.motivo_baja}`)
      : m.motivo_baja
    : null;
  return (
    <div style={{ minWidth: 0 }}>
      <span className={`tag ${badge.clase}`}>{t(badge.key)}</span>
      <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
        {[m.fecha_baja ? fmtFechaCorta(m.fecha_baja) : null, motivoTexto].filter(Boolean).join(" · ") || "—"}
      </div>
    </div>
  );
}

/** La celda de Asistencia. Tres estados, y ninguno inventa nada:
 *
 *  - **Sin listas tomadas en todo el año** (`vacio`): no hay NADA que
 *    resumir. Se dice con palabras, no con un guion que se leería como
 *    "este miembro no vino". La nota al pie de la tabla explica por qué.
 *  - **Hay listas, pero este miembro no estuvo en ningún roster**: guion.
 *    Aquí el guion sí significa lo que parece: de esta persona no hay dato.
 *  - **Hay dato**: el porcentaje, y debajo de cuántos cultos sale — un 100%
 *    de un culto y un 100% de cuarenta no son la misma noticia, y el
 *    porcentaje solo no distingue los dos.
 */
function CeldaAsistencia({ a, vacio, t }: {
  a: AsistenciaMiembro | undefined;
  vacio: boolean;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  if (vacio) {
    return <span style={{ color: "var(--text-3)", fontSize: 13 }}>{t("membresia.asistenciaSinDatos")}</span>;
  }
  if (!a || a.pct == null) return <span style={{ color: "var(--text-3)" }}>—</span>;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{a.pct}%</div>
      <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
        {t("membresia.asistenciaDeCultos", { asistidos: a.asistidos, total: a.enRoster })}
      </div>
    </div>
  );
}

function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();
}

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

interface Props {
  church: Church;
  refreshKey: number;
  onEdit: (member: Member) => void;
  onChanged: () => void;
}

export default function Membresia({ church, refreshKey, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Membresía" como pastilla activa —
  // el título grande sobra ahí.
  const enIPhone = esIPhone();
  const enIPad = esIPad();
  /* 1024 y no los 1000 del maestro-detalle: aquí lo que decide no es si caben
     dos columnas de pantalla, sino si caben las seis vías de la tabla. */
  const iPadAmplio = useMediaQuery("(min-width: 1024px)");
  const conMinisterio = enIPad && iPadAmplio;
  const cols = enIPad ? (conMinisterio ? COLS_IPAD : COLS_IPAD_ESTRECHO) : COLS;
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<MembresiaStats | null>(null);
  /* La asistencia del año por miembro. Se carga solo en el iPad, que es la
     única plataforma cuya tabla lleva esa columna: en el Mac y en el teléfono
     sería una consulta que nadie mira. */
  const [asistencia, setAsistencia] = useState<Map<number, AsistenciaMiembro> | null>(null);
  const [query, setQuery] = useState("");
  /* Igual que en Actas: el foco del buscador es estado de React y no
     `:focus-within`, porque con el selector "Cancelar" desaparecía al tocarlo
     —el campo perdía el foco antes de que llegara el clic. */
  const [buscando, setBuscando] = useState(false);
  const refBuscar = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const [pendingBaja, setPendingBaja] = useState<Member | null>(null);
  const [ofrecerTraslado, setOfrecerTraslado] = useState<Member | null>(null);
  const [fusionando, setFusionando] = useState<Member | null>(null);
  const navigate = useNavigate();
  const [pendingReactivar, setPendingReactivar] = useState<Member | null>(null);
  const [ficha, setFicha] = useState<Member | null>(null);
  const [crearFicha, setCrearFicha] = useState(false);
  useAbrirCrearDesdeMas(() => setCrearFicha(true));
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const anio = currentYear();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    // `currentYear()` da la cadena; `periodoDeAnio` pide el número.
    const periodo = periodoDeAnio(Number(anio));
    Promise.all([
      listMembersRegistro(church.id),
      membresiaStats(church.id, anio),
      enIPad ? listAsistenciaLigera(church.id, periodo.desde, periodo.hasta) : Promise.resolve([]),
    ])
      .then(([nuevosMembers, nuevosStats, filas]) => {
        if (cancelado) return;
        setMembers(nuevosMembers);
        setStats(nuevosStats);
        setAsistencia(enIPad ? asistenciaPorMiembro(filas) : null);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, anio, enIPad]);

  useEffect(() => setPage(1), [query, filtro, refreshKey]);

  async function confirmarBaja(fecha: string, motivo: string | null) {
    if (!pendingBaja) return;
    await darDeBajaMember(pendingBaja.id, church.id, fecha, motivo);
    // Baja por traslado sin traslado registrado: la marca de estado sola no
    // genera documento ni cuenta en informes — se ofrece crear el traslado
    // de salida real con el miembro ya precargado.
    if (motivo === "traslado") setOfrecerTraslado(pendingBaja);
    setPendingBaja(null);
    playSound("eliminar");
    showToast(t("membresia.toastBaja"));
    onChanged();
  }

  async function confirmarReactivar() {
    if (!pendingReactivar) return;
    await restoreMember(pendingReactivar.id, church.id);
    setPendingReactivar(null);
    playSound("guardado");
    showToast(t("membresia.toastReactivado"));
    onChanged();
  }

  /* "No hay suficiente información todavía": ni un solo culto del año con
     lista tomada. No es que los miembros falten — es que nadie ha pasado
     lista, y por tanto no hay nada que resumir. El mapa vacío lo dice sin
     ambigüedad, porque `asistenciaPorMiembro` solo crea entradas para quien
     aparece en algún roster. */
  const sinAsistenciaQueResumir = enIPad && asistencia != null && asistencia.size === 0;

  const q = query.trim().toLowerCase();
  const visibles = members
    .filter((m) => (filtro === "todos" ? true : filtro === "activos" ? m.activo === 1 : m.activo === 0))
    .filter(
      (m) =>
        !q ||
        m.nombre.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.telefono ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* Pie de ventana (solo Mac): los que se están viendo, no los que hay. Con
     un filtro o una búsqueda puestos, el total del padrón contradice a la
     lista que tienes delante. */
  useBarraEstado(t("barraEstado.membresia", { count: visibles.length }));

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("secretaria.membresia.titulo")}</div>
            {!esMac() && <div className="page-sub">{t("secretaria.membresia.sub")}</div>}
          </div>
        )}
        <div className="header-actions">
          {/* El buscador vive en la toolbar; en táctil se queda dentro del
              contenido, al alcance del pulgar. */}
          {esMac() && <MacBuscador value={query} onChange={setQuery} placeholder={t("miembros.buscarPlaceholder")} />}
          <button className="btn primary btn-nuevo-cabecera" onClick={() => setCrearFicha(true)}>
            <IconPlus size={14} /> {t("miembros.nuevoMiembro")}
          </button>
        </div>
      </div>

      <div className="content">
        {enIPhone ? (
          <div className="ios-panel">
            <div className="ios-panel-head"><h2>{t("membresia.seccionResumen")}</h2></div>
            <div className="ios-panel-grid">
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("membresia.statActivos")}</span></div>
                <span className="ios-stat-num">{stats ? <CountUp value={stats.activos} format={String} /> : "—"}</span>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("membresia.statAltas", { anio })}</span></div>
                <span className="ios-stat-num">{stats ? <CountUp value={stats.altasAnio} format={String} /> : "—"}</span>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("membresia.statBajas", { anio })}</span></div>
                <span className="ios-stat-num">{stats ? <CountUp value={stats.bajasAnio} format={String} /> : "—"}</span>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("membresia.statTotal")}</span></div>
                <span className="ios-stat-num">{stats ? <CountUp value={stats.total} format={String} /> : "—"}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="dash-canvas">
          <div className="summary-4 enter membresia-resumen">
            <div className="stat-card accent" style={accent("var(--accent-2)")}>
              <div className="stat-head">
                <span className="stat-label">{t("membresia.statActivos")}</span>
                <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={1.8} /></div>
              </div>
              <div className="stat-value md">{stats ? <CountUp value={stats.activos} format={String} /> : "—"}</div>
            </div>
            <div className="stat-card accent" style={accent("var(--accent-1)")}>
              <div className="stat-head">
                <span className="stat-label">{t("membresia.statAltas", { anio })}</span>
                <div className="stat-icon neutral"><IconArrowUp size={15} strokeWidth={1.8} /></div>
              </div>
              <div className="stat-value md">{stats ? <CountUp value={stats.altasAnio} format={String} /> : "—"}</div>
            </div>
            <div className="stat-card accent" style={accent("var(--accent-3)")}>
              <div className="stat-head">
                <span className="stat-label">{t("membresia.statBajas", { anio })}</span>
                <div className="stat-icon neutral"><IconArrowDown size={15} strokeWidth={1.8} /></div>
              </div>
              <div className="stat-value md">{stats ? <CountUp value={stats.bajasAnio} format={String} /> : "—"}</div>
            </div>
            <div className="stat-card accent" style={accent("var(--accent-5)")}>
              <div className="stat-head">
                <span className="stat-label">{t("membresia.statTotal")}</span>
                <div className="stat-icon neutral"><IconIdBadge size={15} strokeWidth={1.8} /></div>
              </div>
              <div className="stat-value md">{stats ? <CountUp value={stats.total} format={String} /> : "—"}</div>
            </div>
          </div>
          </div>
        )}

        {enIPhone ? (
          /* Campo arriba y categorías DEBAJO, a todo el ancho — la barra de
             alcance de Mail. Al lado del campo, el chip activo se pintaba en
             negro entre dos blancos.

             Aquí el segmentado es FIJO de tres: los filtros de esta pantalla
             están escritos a mano (activos, bajas, todos), no calculados como
             los de Actas, así que siempre son tres y siempre caben. */
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
                  aria-label={t("miembros.buscarPlaceholder")}
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
            <div className="ios-alcance" role="tablist">
              <span
                className="ios-alcance-pulgar"
                style={{ width: "calc((100% - 4px) / 3)", transform: `translateX(${["activos", "bajas", "todos"].indexOf(filtro) * 100}%)` }}
              />
              {(["activos", "bajas", "todos"] as Filtro[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f}
                  className="ios-alcance-opcion"
                  onClick={() => setFiltro(f)}
                >
                  {t(`membresia.filtro.${f}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
        /* Las medidas que estaban en `style=` pasan a clases con los MISMOS
           valores (.membresia-buscar, .membresia-segmentado): un estilo en
           línea gana a cualquier hoja, así que mientras vivieran ahí el iPad
           no podía convertir los tres chips en el segmentado que pide el
           handoff. En Mac no cambia un píxel — está medido. */
        <div className="tx-head membresia-controles">
          <div className="search-input-wrap membresia-buscar">
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={textoCorto(t("common.buscarCorto"), t("miembros.buscarPlaceholder"))}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="membresia-segmentado">
            {(["activos", "bajas", "todos"] as Filtro[]).map((f) => (
              <button
                key={f}
                className={`chip${filtro === f ? " active" : ""}`}
                onClick={() => setFiltro(f)}
              >
                {t(`membresia.filtro.${f}`)}
              </button>
            ))}
          </div>
        </div>
        )}

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            pagina
            titulo={members.length === 0 ? t("miembros.aunNoHay") : t("membresia.sinResultados")}
            sub={members.length === 0 ? t("miembros.agregaPrimero") : t("membresia.sinResultadosSub")}
            icon={<IconIdBadge size={20} strokeWidth={1.8} />}
          />
        ) : enIPhone ? (
          <div className="ios-listcard">
            {pagina.map((m, i) => {
              const badge = estadoBadge(m);
              const motivoTexto = m.motivo_baja
                ? MOTIVOS_CONOCIDOS.includes(m.motivo_baja)
                  ? t(`membresia.motivo.${m.motivo_baja}`)
                  : m.motivo_baja
                : null;
              const subtitulo = m.activo === 1
                ? (m.email ?? t("miembros.sinCorreoRegistrado"))
                : [m.fecha_baja ? fmtFechaCorta(m.fecha_baja) : null, motivoTexto].filter(Boolean).join(" · ") || "—";
              return (
                <div
                  className="ios-txrow ios-txrow--clickable"
                  data-fila
                  key={m.id}
                  style={{ opacity: m.activo === 1 ? 1 : 0.72 }}
                  onClick={() => setFicha(m)}
                >
                  <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                    {initials(m.nombre)}
                  </div>
                  <div className="ios-txrow-main">
                    <div className="ios-txrow-title" title={m.nombre}>{m.nombre}</div>
                    <div className="tx-secundaria-movil">{subtitulo}</div>
                  </div>
                  <div className="ios-txrow-trailing">
                    <span className={`ios-badge ${badgeClaseMembresiaIOS(m)}`}>{t(badge.key)}</span>
                  </div>
                  <RowMenu
                    onEdit={() => onEdit(m)}
                    onDelete={() => (m.activo === 1 ? setPendingBaja(m) : setPendingReactivar(m))}
                    deleteLabel={m.activo === 1 ? t("membresia.darDeBaja") : t("membresia.reactivar")}
                    /* En el teléfono NO se pasa: sin acciones de más, RowMenu esconde
                       los "···" y queda solo el gesto. Fusionar vive en la ficha. */
                    extraItems={enIPhone ? undefined : [{ label: t("fusion.accion"), onClick: () => setFusionando(m) }]}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`data-table roomy tabla-membresia${enIPad ? " tabla-membresia-ipad" : ""}`}>
            <div className="thead" style={{ gridTemplateColumns: cols }}>
              <div className="th">{t("miembros.colMiembro")}</div>
              <div className="th">{enIPad ? t("membresia.colCondicion") : t("miembros.colContacto")}</div>
              <div className="th">{t("membresia.colIngreso")}</div>
              {conMinisterio && <div className="th">{t("membresia.colMinisterio")}</div>}
              {enIPad ? (
                <div className="th">{t("membresia.colAsistencia")}</div>
              ) : (
                <div className="th">{t("membresia.colEstado")}</div>
              )}
              <div className="th"></div>
            </div>
            {pagina.map((m, i) => (
              <div
                className="tr" data-fila
                key={m.id}
                style={{ gridTemplateColumns: cols, cursor: "pointer", opacity: m.activo === 1 ? 1 : 0.72 }}
                onClick={() => setFicha(m)}
              >
                <div className="td">
                  <div className="person" style={{ minWidth: 0 }}>
                    <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {initials(m.nombre)}
                    </div>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      <div className="p-name truncate" title={m.nombre}>{m.nombre}</div>
                      <div className="p-mail truncate" title={m.email ?? undefined}>
                        {m.email ?? t("miembros.sinCorreoRegistrado")}
                      </div>
                    </div>
                  </div>
                </div>
                {/* El iPad adelanta la Condición a la segunda columna, como en el
                    handoff: en una tabla táctil el estado se lee antes que el
                    teléfono. En Mac el orden no se toca. */}
                {enIPad ? (
                  <div className="td">{celdaCondicion(t, m)}</div>
                ) : (
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    <div className="truncate">{m.telefono ?? t("common.sinTelefono")}</div>
                  </div>
                )}
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  {m.fecha_ingreso ? fmtFechaCorta(m.fecha_ingreso) : "—"}
                </div>
                {conMinisterio && (
                  <div className="td" style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                    <div className="truncate">{ministeriosDe(t, m.ministerios) || "—"}</div>
                  </div>
                )}
                {enIPad ? (
                  <div className="td" style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                    <CeldaAsistencia a={asistencia?.get(m.id)} vacio={sinAsistenciaQueResumir} t={t} />
                  </div>
                ) : (
                  <div className="td">{celdaCondicion(t, m)}</div>
                )}
                <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                  <span className="row-actions">
                    <span className="row-icon-btn" title={t("common.verFicha")} onClick={() => setFicha(m)}>
                      <IconEye size={13} strokeWidth={2} />
                    </span>
                    <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(m)}>
                      <IconEdit size={13} strokeWidth={2} />
                    </span>
                  </span>
                  <RowMenu
                    onEdit={() => onEdit(m)}
                    onDelete={() => (m.activo === 1 ? setPendingBaja(m) : setPendingReactivar(m))}
                    deleteLabel={m.activo === 1 ? t("membresia.darDeBaja") : t("membresia.reactivar")}
                    extraItems={[{ label: t("fusion.accion"), onClick: () => setFusionando(m) }]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* La nota va UNA vez, debajo de la tabla, y no repetida en cada celda:
            el motivo es el mismo para todas las filas y treinta veces
            "sin datos" no informa treinta veces. Dice de dónde saldría el
            dato, que es lo que convierte un hueco en una tarea. */}
        {sinAsistenciaQueResumir && !loading && visibles.length > 0 && (
          <p className="membresia-nota-asistencia">{t("membresia.asistenciaNota", { anio })}</p>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {fusionando && (
        <FusionarMiembroModal
          churchId={church.id}
          origen={fusionando}
          members={members}
          onClose={() => setFusionando(null)}
          onMerged={onChanged}
        />
      )}

      {ficha && (
        <FichaMiembroModal
          church={church}
          member={ficha}
          onClose={() => setFicha(null)}
          onSaved={onChanged}
          /* Solo en el teléfono: en Mac fusionar sigue en el menú de la fila. */
          onFusionar={enIPhone ? () => { const m = ficha; setFicha(null); setFusionando(m); } : undefined}
        />
      )}

      {crearFicha && (
        <FichaMiembroModal
          church={church}
          member={null}
          onClose={() => setCrearFicha(false)}
          onSaved={onChanged}
        />
      )}

      {ofrecerTraslado && (
        <ConfirmDialog
          title={t("membresia.trasladoOfertaTitulo")}
          message={t("membresia.trasladoOfertaMensaje", { nombre: ofrecerTraslado.nombre })}
          confirmLabel={t("membresia.trasladoOfertaCrear")}
          onConfirm={() => {
            const id = ofrecerTraslado.id;
            setOfrecerTraslado(null);
            navigate("/cartas", { state: { trasladoSalidaDe: id } });
          }}
          onCancel={() => setOfrecerTraslado(null)}
        />
      )}

      {pendingBaja && (
        <BajaMemberModal
          member={pendingBaja}
          onConfirm={confirmarBaja}
          onCancel={() => setPendingBaja(null)}
        />
      )}

      {pendingReactivar && (
        <ConfirmDialog
          title={t("membresia.reactivarTitulo", { nombre: pendingReactivar.nombre })}
          message={t("membresia.reactivarMensaje")}
          confirmLabel={t("membresia.reactivar")}
          onConfirm={confirmarReactivar}
          onCancel={() => setPendingReactivar(null)}
        />
      )}
    </>
  );
}
