import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, textoCorto, esMac } from "../movil";
import { MacBuscador } from "../components/mac/MacFiltros";
import {
  currentYear, darDeBajaMember, fmtFechaCorta, listAsistenciaLigera, listMembersRegistro,
  listServiciosLigero, listTrasladosEntrada, membresiaStats, restoreMember,
  type AsistenciaLigera, type Church, type Member, type MembresiaStats,
  type ServicioLigero, type TrasladoEntrada,
} from "../db";
import {
  asistenciaPorMiembro, camposFaltantes, enPeriodo, esNuevoEnPeriodo, estadoEfectivo,
  periodoDeAnio, resumenAsistencia, resumenMembresia, type AsistenciaMiembro,
} from "../services/informes/membresia";
import { cargarUmbrales, UMBRALES_DEFAULT, type Umbrales } from "../services/informes/umbrales";
import DetalleMembresia from "../components/DetalleMembresia";
import HojaDetentesIOS, { type Detente } from "../components/ios/HojaDetentesIOS";
import HojaMiembro from "../components/ios/HojaMiembro";
import SeguimientoModal from "../components/SeguimientoModal";
import { MenuAnchor } from "../components/MenuAnchor";
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
import SeccionIOS, { IosChevron } from "../components/ios/SeccionIOS";
import { useScrollInfinito } from "../hooks/useScrollInfinito";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconArrowDown, IconArrowUp, IconChevronLeft, IconEdit, IconEye, IconIdBadge, IconMiembros, IconPlus, IconSearch } from "../icons";
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
      <div className="truncate" style={{ fontSize: "calc(11.5px * var(--fs-escala))", color: "var(--text-3)", marginTop: 3 }}>
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
    return <span style={{ color: "var(--text-3)", fontSize: "calc(13px * var(--fs-escala))" }}>{t("membresia.asistenciaSinDatos")}</span>;
  }
  if (!a || a.pct == null) return <span style={{ color: "var(--text-3)" }}>—</span>;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{a.pct}%</div>
      <div className="truncate" style={{ fontSize: "calc(11.5px * var(--fs-escala))", color: "var(--text-3)", marginTop: 2 }}>
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
  /* Era `const`: el maestro-detalle del handoff 2 trae selector de periodo,
     así que el año pasa a ser estado. El efecto de carga ya dependía de él. */
  const [anio, setAnio] = useState(currentYear());

  /* ---- Estado del maestro-detalle (handoff 2, solo iPad partido) ---- */
  /* "resumen" es SOLO del teléfono. En el iPad el resumen no es un sitio: sus
     ocho tarjetas viven permanentemente encima del panel, así que nunca hay que
     "estar" en él. En 390px no caben tarjetas y padrón a la vez, así que el
     resumen pasa a ser la pantalla de inicio y las otras tres, sus destinos. */
  type VistaMb = "resumen" | "miembros" | "asistencia" | "seguimiento";
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const partido = enIPad && anchoPartido;
  /* El teléfono aterriza en el PADRÓN, no en el resumen.
     Con el segundo enfoque el resumen era una pantalla previa que había que
     atravesar; en el tercero las ocho tarjetas son un filtro de esta misma
     lista —se abren desde la barra y se ven actuar detrás—, así que ya no hay
     nada que atravesar. Mac e iPad no cambian: allí siempre fue "miembros". */
  const [vistaMb, setVistaMb] = useState<VistaMb>("miembros");
  /* El detalle es un ID que se re-busca, no una copia congelada. */
  const [selId, setSelId] = useState<number | null>(null);
  const [tarjeta, setTarjeta] = useState<string>("todos");
  /* La hoja de tres alturas del teléfono (tercer enfoque). `hojaDe` es el
     miembro que se está mirando —null con la hoja cerrada— y `detente` a qué
     altura está. Van juntos porque cerrar y volver a abrir tiene que empezar
     otra vez asomada: si la hoja recordara la altura, tocar un nombre desde
     el padrón te la subiría a media pantalla sin haberlo pedido. */
  const [hojaDe, setHojaDe] = useState<Member | null>(null);
  const [detente, setDetente] = useState<Detente>("asomada");
  function abrirHoja(m: Member) { setHojaDe(m); setDetente("asomada"); }
  /* La hoja de filtros: las ocho tarjetas del iPad y los dos destinos que
     antes vivían en la pantalla de resumen. Con el padrón como aterrizaje,
     ese resumen ya no se pisa, y sin esta hoja las ocho tarjetas, la
     asistencia y el seguimiento se quedaban sin ninguna puerta en el
     teléfono. Es exactamente el defecto que este rediseño lleva seis veces
     arreglando, y esta vez lo habría metido yo. */
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [segDe, setSegDe] = useState<Member | null>(null);
  const [menuAnio, setMenuAnio] = useState(false);
  const [menuFiltros, setMenuFiltros] = useState(false);
  const [asisFilas, setAsisFilas] = useState<AsistenciaLigera[]>([]);
  const [serviciosLig, setServiciosLig] = useState<ServicioLigero[]>([]);
  const [trasladosE, setTrasladosE] = useState<TrasladoEntrada[]>([]);
  const [umbrales, setUmbrales] = useState<Umbrales>(UMBRALES_DEFAULT);
  const refFilas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    // `currentYear()` da la cadena; `periodoDeAnio` pide el número.
    const periodo = periodoDeAnio(Number(anio));
    Promise.all([
      listMembersRegistro(church.id),
      membresiaStats(church.id, anio),
      /* El iPhone entra en la misma consulta que el iPad desde el rediseño de
         iOS 26: sus ocho tarjetas de resumen salen de `resumenMembresia`, y
         dos de ellas —"Ausencias consecutivas" y "Recibidos por traslado"— se
         calculan con la asistencia del año y los traslados de entrada. El
         comentario de arriba decía que en el teléfono "sería una consulta que
         nadie mira"; era cierto mientras el teléfono enseñaba otras cuatro
         cifras. Mac se queda fuera: ahí manda la tabla, no las tarjetas. */
      enIPad || enIPhone ? listAsistenciaLigera(church.id, periodo.desde, periodo.hasta) : Promise.resolve([]),
      enIPad || enIPhone ? listServiciosLigero(church.id, periodo.desde, periodo.hasta) : Promise.resolve([]),
      enIPad || enIPhone ? listTrasladosEntrada(church.id) : Promise.resolve([]),
    ])
      .then(([nuevosMembers, nuevosStats, filas, servicios, te]) => {
        if (cancelado) return;
        setMembers(nuevosMembers);
        setStats(nuevosStats);
        setAsistencia(enIPad || enIPhone ? asistenciaPorMiembro(filas) : null);
        setAsisFilas(filas);
        setServiciosLig(servicios);
        setTrasladosE(te);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, anio, enIPad]);

  /* `tarjeta` entra aquí desde el rediseño: en el teléfono elegir una tarjeta
     recorta el padrón, así que si no se vuelve a la primera página, tocar una
     tarjeta estando en la página 3 dejaba una lista vacía sin decir por qué. */
  useEffect(() => setPage(1), [query, filtro, tarjeta, refreshKey]);

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

  /* ---- Derivados del maestro-detalle (todos de datos ya cargados) ---- */
  useEffect(() => {
    if (!enIPad) return;
    let cancelado = false;
    cargarUmbrales(church.id).then((u) => { if (!cancelado) setUmbrales(u); }).catch(console.error);
    return () => { cancelado = true; };
  }, [church.id, enIPad]);

  const periodoObj = useMemo(() => periodoDeAnio(Number(anio)), [anio]);

  /* Recibidos por traslado en el periodo: el MISMO criterio del resumen del
     informe (traslado de entrada completado con recepción en el periodo),
     para que la tarjeta y su filtro digan lo mismo. */
  const recibidosSet = useMemo(() => {
    const set = new Set<number>();
    for (const te of trasladosE) {
      if (te.estado === "completado" && te.member_id != null &&
          enPeriodo(te.fecha_recepcion ?? te.creado_en.slice(0, 10), periodoObj)) set.add(te.member_id);
    }
    return set;
  }, [trasladosE, periodoObj]);

  /* Las alertas de un miembro: las dos computables hoy. La MISMA regla que
     pinta DetalleMembresia, escrita una sola vez para lista, globo y modal. */
  const alertasDe = useMemo(() => (m: Member): string[] => {
    const out: string[] = [];
    const a = asistencia?.get(m.id);
    if (estadoEfectivo(m) === "activo" && a && a.racha >= umbrales.rachaServicios) {
      out.push(t("membresia.alertaRacha", { n: a.racha }));
    }
    const fechaNuevo = m.fecha_ingreso ?? m.fecha_congregacion;
    if (fechaNuevo && enPeriodo(fechaNuevo, periodoObj) && !m.seguimiento_revisado_en) {
      out.push(t("membresia.alertaNuevo"));
    }
    return out;
  }, [asistencia, umbrales, periodoObj, t]);

  const conAlertas = useMemo(
    () => (partido || enIPhone ? members.filter((m) => alertasDe(m).length > 0) : []),
    [partido, enIPhone, members, alertasDe]
  );

  const resumen = useMemo(
    () => ((partido || enIPhone) && asistencia
      ? resumenMembresia(members, periodoObj, [], trasladosE, asistencia, umbrales)
      : null),
    [partido, enIPhone, members, periodoObj, trasladosE, asistencia, umbrales]
  );

  /* Las ocho tarjetas del handoff, con su predicado de filtro. Los colores
     son los del prototipo; los números, los del servicio del informe. */
  const tarjetas = useMemo(() => {
    if (!resumen) return [];
    const nuevoEn = (m: Member) => esNuevoEnPeriodo(m, periodoObj, umbrales);
    const def: { id: string; label: string; valor: number; color: string; pred: (m: Member) => boolean }[] = [
      { id: "todos", label: t("membresia.tarj.total"), valor: resumen.total, color: "var(--text-3)", pred: () => true },
      { id: "activos", label: t("membresia.tarj.activos"), valor: resumen.activos, color: "var(--brand)", pred: (m) => estadoEfectivo(m) === "activo" },
      { id: "inactivos", label: t("membresia.tarj.inactivos"), valor: resumen.inactivos, color: "#f97316", pred: (m) => estadoEfectivo(m) === "inactivo" },
      { id: "nuevos", label: t("membresia.tarj.nuevos"), valor: resumen.nuevosEnPeriodo, color: "#7c3aed", pred: nuevoEn },
      { id: "recibidos", label: t("membresia.tarj.recibidos"), valor: resumen.recibidosPorTraslado, color: "#06b6d4", pred: (m) => recibidosSet.has(m.id) },
      { id: "trasladados", label: t("membresia.tarj.trasladados"), valor: resumen.trasladados, color: "#b45309", pred: (m) => m.activo === 0 && m.motivo_baja === "traslado" && enPeriodo(m.fecha_baja, periodoObj) },
      { id: "frecuentes", label: t("membresia.tarj.ausencias"), valor: resumen.ausenciasFrecuentes, color: "var(--neg)", pred: (m) => { const a = asistencia?.get(m.id); return estadoEfectivo(m) === "activo" && !!a && a.racha >= umbrales.rachaServicios; } },
      { id: "incompletos", label: t("membresia.tarj.incompletos"), valor: resumen.incompletos, color: "#4338ca", pred: (m) => camposFaltantes(m).length > 0 },
    ];
    return def;
  }, [resumen, periodoObj, umbrales, recibidosSet, asistencia, t]);

  /* La tarjeta recorta el padrón, igual que en el iPad: elegida una, su
     predicado manda y el segmentado De alta/Bajas/Todos se aparta —las
     tarjetas de bajas ("Trasladados") no tendrían sentido bajo "De alta"—.
     Es la misma regla que `filasSplit` aplica arriba para la columna maestra,
     escrita una vez por lista porque cada plataforma arma la suya. */
  const tarjetaSel = tarjetas.find((c) => c.id === tarjeta && c.id !== "todos");
  const visibles = members
    .filter((m) => (tarjetaSel ? tarjetaSel.pred(m)
      : filtro === "todos" ? true : filtro === "activos" ? m.activo === 1 : m.activo === 0))
    .filter(
      (m) =>
        !q ||
        m.nombre.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.telefono ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  /* En el teléfono la página CRECE en vez de moverse: el mismo corte del mismo
     array, abierto por arriba. En Mac e iPad el paginador se queda. */
  const pagina = enIPhone
    ? visibles.slice(0, page * PAGE_SIZE)
    : visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const centinela = useScrollInfinito(
    enIPhone && page < totalPages,
    () => setPage((p) => Math.min(p + 1, totalPages)),
  );

  /* Pie de ventana (solo Mac): los que se están viendo, no los que hay. Con
     un filtro o una búsqueda puestos, el total del padrón contradice a la
     lista que tienes delante. */
  useBarraEstado(t("barraEstado.membresia", { count: visibles.length }));

  /* La lista del maestro: la vista decide el universo, la tarjeta recorta,
     y el filtro alta/baja solo aplica cuando no hay tarjeta puesta (las
     tarjetas de bajas — Trasladados — no tendrían sentido bajo "De alta"). */
  const filasSplit = useMemo(() => {
    if (!partido) return [];
    let base = vistaMb === "seguimiento" ? conAlertas : members;
    const tj = tarjetas.find((c) => c.id === tarjeta);
    if (tj && tarjeta !== "todos") base = base.filter(tj.pred);
    else if (vistaMb !== "seguimiento") base = base.filter((m) => (filtro === "todos" ? true : filtro === "activos" ? m.activo === 1 : m.activo === 0));
    if (q) {
      base = base.filter((m) => m.nombre.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) || (m.telefono ?? "").toLowerCase().includes(q));
    }
    return base;
  }, [partido, vistaMb, conAlertas, members, tarjetas, tarjeta, filtro, q]);

  const selMiembro = useMemo(
    () => (selId == null ? null : filasSplit.find((m) => m.id === selId) ?? members.find((m) => m.id === selId) ?? null),
    [selId, filasSplit, members]
  );

  /* Los años que vale la pena ofrecer: los que aparecen en el padrón. */
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>([currentYear()]);
    for (const m of members) for (const fch of [m.fecha_ingreso, m.fecha_congregacion, m.fecha_baja]) {
      if (fch) set.add(fch.slice(0, 4));
    }
    return [...set].sort().reverse().slice(0, 8);
  }, [members]);

  /* ---- Analítica de la vista Asistencia (todo de asisFilas/servicios) ---- */
  const anal = useMemo(() => {
    if ((!partido && !enIPhone) || vistaMb !== "asistencia") return null;
    const res = resumenAsistencia(serviciosLig, asisFilas);
    const porMes = new Map<string, { pres: number; roster: number }>();
    const porServicio = new Map<number, number>();
    for (const fila of asisFilas) {
      const mes = fila.fecha.slice(0, 7);
      const e = porMes.get(mes) ?? { pres: 0, roster: 0 };
      e.roster += 1;
      if (fila.presente === 1) { e.pres += 1; porServicio.set(fila.servicio_id, (porServicio.get(fila.servicio_id) ?? 0) + 1); }
      porMes.set(mes, e);
    }
    const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const barras = [...porMes.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-8)
      .map(([mes, v2]) => ({ mes: MESES[Number(mes.slice(5, 7)) - 1] ?? mes, n: v2.pres, h: v2.roster ? Math.max(4, Math.round((v2.pres / v2.roster) * 100)) : 4 }));
    let mejor: { fecha: string; n: number } | null = null;
    const tipoAg = new Map<string, { pres: number; servicios: number }>();
    for (const sv of serviciosLig) {
      const pres = porServicio.get(sv.id) ?? 0;
      if (!mejor || pres > mejor.n) mejor = { fecha: sv.fecha, n: pres };
      const e = tipoAg.get(sv.tipo) ?? { pres: 0, servicios: 0 };
      e.pres += pres; e.servicios += 1; tipoAg.set(sv.tipo, e);
    }
    const tipos = [...tipoAg.entries()]
      .map(([tipo, v2]) => ({ tipo, prom: v2.servicios ? Math.round(v2.pres / v2.servicios) : 0 }))
      .sort((a, b) => b.prom - a.prom);
    const maxProm = Math.max(1, ...tipos.map((x) => x.prom));
    const mejores = (asistencia ? [...asistencia.entries()] : [])
      .filter(([, a]) => a.pct != null && a.enRoster >= 2)
      .sort(([, a], [, b]) => (b.pct ?? 0) - (a.pct ?? 0))
      .slice(0, umbrales.topAsistencia)
      .map(([id, a]) => ({ m: members.find((x) => x.id === id), a }))
      .filter((x): x is { m: Member; a: AsistenciaMiembro } => !!x.m);
    const ausentes = members
      .map((m) => ({ m, a: asistencia?.get(m.id) }))
      .filter((x): x is { m: Member; a: AsistenciaMiembro } => x.m.activo === 1 && !!x.a && x.a.racha > 0)
      .sort((a, b) => b.a.racha - a.a.racha)
      .slice(0, 5);
    return { res, barras, mejor, tipos, maxProm, mejores, ausentes };
  }, [partido, vistaMb, serviciosLig, asisFilas, asistencia, members, umbrales]);

  function paginaLista(dir: number) {
    const el = refFilas.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: "smooth" });
  }

  /* El bloque de analítica de asistencia, con nombre. Es el MISMO que el iPad
     pinta en su panel; sale a una constante porque desde el rediseño el
     teléfono también tiene una pantalla de Asistencia, y duplicar noventa
     líneas de barras y promedios era garantizar que las dos se separaran. */
  const analiticaAsistencia = anal && (
                <div className="mb-analitica">
                  <div className="mb-anal-rejilla">
                    <section className="mb-carta">
                      <div className="mb-carta-cab">
                        <h3 className="mb-carta-titulo">{t("membresia.analPorServicio")}</h3>
                        <span className="mb-leyenda">
                          <span><i className="mb-ley-cuadro lleno" />{t("membresia.presentes")}</span>
                          <span><i className="mb-ley-cuadro" />{t("membresia.enRoster")}</span>
                        </span>
                      </div>
                      {anal.barras.length === 0 ? (
                        <p className="mb-movs-vacio">{t("membresia.asistenciaSinDatos")}</p>
                      ) : (
                        <div className="mb-barras alta">
                          {anal.barras.map((b) => (
                            <span key={b.mes} className="mb-barra-col">
                              <span className="mb-barra-n">{b.n}</span>
                              <span className="mb-barra-hueco"><span className="mb-barra" style={{ height: `${b.h}%` }} /></span>
                              <span className="mb-barra-mes">{b.mes}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                    <div className="mb-anal-lado">
                      <section className="mb-carta">
                        <h3 className="mb-carta-titulo">{t("membresia.analPromedio")}</h3>
                        <div className="mb-anillo-fila">
                          <span
                            className="mb-anillo"
                            style={{ background: `conic-gradient(var(--brand) 0 ${anal.res.pctGeneral ?? 0}%, var(--line) ${anal.res.pctGeneral ?? 0}% 100%)` }}
                          >
                            <span className="mb-anillo-centro">
                              <strong>{anal.res.pctGeneral != null ? `${anal.res.pctGeneral}%` : "—"}</strong>
                              <span>{t("membresia.delRoster")}</span>
                            </span>
                          </span>
                          <span className="mb-anillo-datos">
                            <span><span>{t("membresia.analServicios")}</span><strong>{anal.res.totalServicios}</strong></span>
                            <span><span>{t("membresia.analPromPresentes")}</span><strong>{anal.res.promedioPorServicio}</strong></span>
                            <span><span>{t("membresia.analMejor")}</span><strong>{anal.mejor ? `${anal.mejor.n} · ${fmtFechaCorta(anal.mejor.fecha)}` : "—"}</strong></span>
                          </span>
                        </div>
                      </section>
                      <section className="mb-carta">
                        <h3 className="mb-carta-titulo">{t("membresia.analPorTipo")}</h3>
                        <div className="mb-tipos">
                          {anal.tipos.length === 0 && <span className="mb-movs-vacio">{t("membresia.asistenciaSinDatos")}</span>}
                          {anal.tipos.map((tp) => (
                            <span key={tp.tipo} className="mb-tipo">
                              <span className="mb-tipo-cab">
                                <span className="mb-tipo-nombre">{t(`servicios.tipo.${tp.tipo}`, { defaultValue: tp.tipo })}</span>
                                <strong>{t("membresia.enPromedio", { n: tp.prom })}</strong>
                              </span>
                              <span className="mb-tipo-pista"><span className="mb-tipo-barra" style={{ width: `${Math.round((tp.prom / anal.maxProm) * 100)}%` }} /></span>
                            </span>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                  <div className="mb-anal-rejilla listas">
                    <div>
                      <div className="mb-lista-rotulo">{t("membresia.analConstantes")}</div>
                      <div className="mb-carta mb-carta-lisa">
                        {anal.mejores.length === 0 && <span className="mb-movs-vacio">{t("membresia.asistenciaSinDatos")}</span>}
                        {anal.mejores.map(({ m, a }) => (
                          <span key={m.id} className="mb-mini-fila">
                            <span className="mb-mini-avatar">{initials(m.nombre)}</span>
                            <span className="mb-mini-nombre">{m.nombre}</span>
                            <strong>{a.pct}%</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-lista-rotulo">
                        {t("membresia.analAusentes")}
                        <button type="button" className="mb-ver-seg" onClick={() => setVistaMb("seguimiento")}>{t("membresia.verSeguimiento")}</button>
                      </div>
                      <div className="mb-carta mb-carta-lisa">
                        {anal.ausentes.length === 0 && <span className="mb-movs-vacio">{t("membresia.sinAusentes")}</span>}
                        {anal.ausentes.map(({ m, a }) => (
                          <button key={m.id} type="button" className="mb-mini-fila boton" onClick={() => { setVistaMb("miembros"); setSelId(m.id); }}>
                            <span className="mb-mini-avatar aviso">{initials(m.nombre)}</span>
                            <span className="mb-mini-textos">
                              <span className="mb-mini-nombre">{m.nombre}</span>
                              <span className="mb-mini-sub">{a.ultimaAsistencia ? t("membresia.ultimaVisitaEl", { fecha: fmtFechaCorta(a.ultimaAsistencia) }) : t("membresia.sinVisitas")}</span>
                            </span>
                            <strong className="aviso">{t("membresia.rachaServicios", { count: a.racha })}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
  );

  return (
    <>
      {/* La salida del teléfono, en la barra fija. Solo desde asistencia y
          seguimiento: el padrón es el aterrizaje del tercer enfoque, y un
          "volver" en la pantalla a la que se llega no vuelve a ninguna parte.
          Es el mismo `dm-volver` que el iPad tiene junto a su panel. */}
      {enIPhone && (vistaMb === "asistencia" || vistaMb === "seguimiento") && (
        <button
          type="button"
          className="ios-nav-volver"
          onClick={() => { setVistaMb("miembros"); setTarjeta("todos"); }}
        >
          <IconChevronLeft size={17} strokeWidth={2.4} /> {t("secretaria.membresia.titulo")}
        </button>
      )}
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

      {partido ? (
        /* ---- Maestro-detalle del handoff 2 (22 ago 2026) ----
           Lista de 400px con TRES vistas (Miembros / Asistencia / Seguimiento)
           y el panel a la derecha: las ocho tarjetas del padrón arriba —que
           además FILTRAN la lista— y debajo la ficha del miembro elegido, o
           la analítica de asistencia, según la vista. Mac y iPhone no pasan
           por aquí: conservan su página de siempre, más abajo. */
        loading ? (
          <LoadingState />
        ) : (
          <div className={`md-split md-membresia${selId != null || vistaMb === "asistencia" ? " md-abierto" : ""}`}>
            <div className="md-lista mb-lista">
              <div className="mb-lista-cab">
                <div className="mb-segmentado" role="tablist">
                  {(["miembros", "asistencia", "seguimiento"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={vistaMb === v}
                      className={`mb-seg-opcion${vistaMb === v ? " activo" : ""}`}
                      onClick={() => { setVistaMb(v); if (v === "asistencia") setSelId(null); }}
                    >
                      {t(`membresia.vista.${v}`)}
                      {v === "seguimiento" && conAlertas.length > 0 && <span className="mb-globo">{conAlertas.length}</span>}
                    </button>
                  ))}
                </div>
                <label className="mb-buscar">
                  <IconSearch size={15} strokeWidth={2} />
                  <input
                    value={query}
                    placeholder={t("membresia.buscarPlaceholder")}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={t("miembros.buscarPlaceholder")}
                  />
                </label>
                <div className="mb-controles">
                  <MenuAnchor
                    open={menuAnio}
                    onOpenChange={setMenuAnio}
                    ariaLabel={t("membresia.periodoAria")}
                    button={<span className="mb-chip-mando teñido">{t("membresia.chipAnio", { anio })}</span>}
                    items={aniosDisponibles.map((a) => ({ label: a, onPress: () => setAnio(a) }))}
                  />
                  <MenuAnchor
                    open={menuFiltros}
                    onOpenChange={setMenuFiltros}
                    ariaLabel={t("membresia.masFiltros")}
                    button={
                      <span className="mb-chip-mando">
                        {t("membresia.masFiltros")}
                        {filtro !== "todos" && <span className="mb-punto" />}
                      </span>
                    }
                    items={(["activos", "bajas", "todos"] as Filtro[]).map((fl) => ({
                      label: t(`membresia.filtro.${fl}`),
                      onPress: () => setFiltro(fl),
                    }))}
                  />
                  <span className="mb-conteo">{t("membresia.conteoLista", { visibles: filasSplit.length, total: members.length })}</span>
                </div>
              </div>

              <div className="mb-filas" ref={refFilas}>
                {filasSplit.length === 0 ? (
                  <div className="mb-filas-vacio">{t("membresia.sinResultados")}</div>
                ) : (
                  filasSplit.map((m) => {
                    const a = asistencia?.get(m.id);
                    const alertasM = vistaMb === "seguimiento" ? alertasDe(m) : [];
                    const esNuevo = esNuevoEnPeriodo(m, periodoObj, umbrales);
                    const tag = m.activo === 0
                      ? (m.motivo_baja === "traslado" ? t("membresia.tag.traslado") : t("membresia.tag.baja"))
                      : esNuevo ? t("membresia.tag.nuevo") : t(`membresia.estado.${estadoEfectivo(m)}`, { defaultValue: "—" });
                    const tagClase = m.activo === 0 ? (m.motivo_baja === "traslado" ? "administracion" : "baja")
                      : esNuevo ? "donacion" : estadoEfectivo(m) === "activo" ? "activo" : "baja";
                    const sub = vistaMb === "seguimiento"
                      ? alertasM.join(" · ")
                      : [
                          m.fecha_ingreso ? t("membresia.chipIngreso", { anio: m.fecha_ingreso.slice(0, 4) }) : null,
                          ministeriosDe(t, m.ministerios) || null,
                        ].filter(Boolean).join(" · ") || (m.email ?? t("miembros.sinCorreoRegistrado"));
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`mb-fila${selId === m.id ? " sel" : ""}`}
                        onClick={() => { setSelId(m.id); if (vistaMb === "asistencia") setVistaMb("miembros"); }}
                      >
                        {/* Por `id` y no por índice: ver la nota en `HojaMiembro`. */}
                        <span className={`mini-avatar ${AVATAR_COLORS[m.id % AVATAR_COLORS.length]} mb-fila-avatar`}>
                          {initials(m.nombre)}
                        </span>
                        <span className="mb-fila-textos">
                          <span className="mb-fila-nombre">{m.nombre}</span>
                          <span className="mb-fila-sub">{sub}</span>
                        </span>
                        <span className="mb-fila-cola">
                          <span className={`mb-fila-pct${a && a.pct != null && a.pct < 70 ? " bajo" : ""}`}>
                            {a?.pct != null ? `${a.pct}%` : "—"}
                          </span>
                          <span className={`tag ${tagClase}`}>{tag}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mb-pie">
                <span>{t("membresia.pieTotal", { count: members.length })}</span>
                <span className="mb-pie-nav">
                  <button type="button" aria-label={t("paginacion.anterior")} onClick={() => paginaLista(-1)}>‹</button>
                  <button type="button" aria-label={t("paginacion.siguiente")} onClick={() => paginaLista(1)}>›</button>
                </span>
              </div>
            </div>

            <div className="md-detalle">
              <div className="dm mb-dm">
                <button type="button" className="dm-volver" onClick={() => { setSelId(null); setVistaMb("miembros"); }}>
                  <IconChevronLeft size={17} strokeWidth={2.4} /> {t("secretaria.membresia.titulo")}
                </button>

                <div className="mb-tarjetas">
                  {tarjetas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`mb-tarjeta${tarjeta === c.id && c.id !== "todos" ? " sel" : ""}`}
                      style={{ borderTopColor: c.color }}
                      onClick={() => setTarjeta(tarjeta === c.id ? "todos" : c.id)}
                    >
                      <span className="mb-tarjeta-label">{c.label}</span>
                      <span className="mb-tarjeta-valor">{c.valor}</span>
                    </button>
                  ))}
                </div>

                {vistaMb === "asistencia" && anal ? (
                  analiticaAsistencia
                ) : selMiembro ? (
                  <DetalleMembresia
                    member={selMiembro}
                    asis={asistencia?.get(selMiembro.id)}
                    filasAsis={asisFilas.filter((fla) => fla.member_id === selMiembro.id)}
                    periodo={periodoObj}
                    umbralRacha={umbrales.rachaServicios}
                    onEditar={(mm) => setFicha(mm)}
                    onSeguimiento={(mm) => setSegDe(mm)}
                  />
                ) : (
                  <div className="md-vacio">
                    <div className="md-vacio-hint">
                      <h3>{t("membresia.eligeMiembro")}</h3>
                      <p>{t("membresia.eligeMiembroSub")}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : (
      <div className="content">
        {enIPhone ? (
          /* Rediseño de iOS 26. El teléfono enseñaba CUATRO cifras sacadas de
             `membresiaStats` —Activos, Altas, Bajas, Total— que no llevaban a
             ninguna parte: eran tarjetas de lectura. El iPad, en cambio, tiene
             desde el handoff las OCHO de `resumenMembresia`, y cada una recorta
             el padrón con su predicado. Ese trabajo ya estaba hecho (`tarjetas`,
             con su `pred`); solo se pintaba dentro de `{partido ? …}`.

             Aquí son las mismas ocho, como lista agrupada y tocables: elegir
             una filtra la lista de abajo y vuelve a tocarla la suelta. "Total"
             es la que quita el filtro, así que se marca sola cuando no hay
             ninguno puesto. */
          vistaMb !== "resumen" ? null : (
          <>
            {/* El membrete, igual que en el índice de Informes: convierte la
                pantalla en la portada de un juego de vistas y no en otra
                pantalla de datos. */}
            <div className="rep-cabecera">
              <div className="rep-iglesia">{church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""}</div>
              <div className="rep-periodo">{t("membresia.enElPadron", { count: members.length })}</div>
            </div>

            <SeccionIOS titulo={t("membresia.elPadronEn", { anio })}>
              {tarjetas.map((c) => (
                /* Tocar una tarjeta ENTRA al padrón ya filtrado por su
                   predicado, que es lo que pide el handoff. Antes filtraba en
                   sitio, con la lista debajo; ahora el padrón es otra pantalla,
                   así que la tarjeta es un destino con su filtro puesto. */
                <button
                  type="button"
                  key={c.id}
                  className="ios-txrow ios-txrow--clickable"
                  onClick={() => { setTarjeta(c.id); setVistaMb("miembros"); }}
                >
                  <span className="ios-punto" style={{ background: c.color }} aria-hidden="true" />
                  <div className="ios-txrow-main"><div className="ios-txrow-title">{c.label}</div></div>
                  <div className="ios-txrow-trailing">
                    <span className="ios-fila-valor">{c.valor}</span>
                    <IosChevron />
                  </div>
                </button>
              ))}
            </SeccionIOS>

            {/* Los tres destinos. `vistaMb` ya existía con estos tres valores
                exactos —los usa el selector del panel del iPad—; lo único nuevo
                es que en el teléfono son pantallas y no pestañas. */}
            <SeccionIOS>
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => { setTarjeta("todos"); setVistaMb("miembros"); }}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("membresia.vista.miembros")}</div></div>
                <div className="ios-txrow-trailing">
                  <span className="ios-fila-valor">{members.length}</span><IosChevron />
                </div>
              </button>
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => setVistaMb("asistencia")}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("membresia.vista.asistencia")}</div></div>
                <div className="ios-txrow-trailing"><IosChevron /></div>
              </button>
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => setVistaMb("seguimiento")}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("membresia.vista.seguimiento")}</div></div>
                <div className="ios-txrow-trailing">
                  {conAlertas.length > 0 && <span className="ios-insignia es-pendiente">{conAlertas.length}</span>}
                  <IosChevron />
                </div>
              </button>
            </SeccionIOS>
          </>
          )
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

        {/* De aquí abajo es el PADRÓN, que en el teléfono ya no es la pantalla
            sino uno de los tres destinos del resumen. En Mac e iPad no cambia
            nada: ahí `vistaMb` arranca en "miembros" y nunca vale "resumen". */}
        {(!enIPhone || vistaMb === "miembros") && (<>
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
            {pagina.map((m) => {
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
                  onClick={() => (enIPhone ? abrirHoja(m) : setFicha(m))}
                >
                  {/* Por `id` y no por índice: ver la nota en `HojaMiembro`. */}
                  <div className={`mini-avatar ${AVATAR_COLORS[m.id % AVATAR_COLORS.length]}`}>
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
            {pagina.map((m) => (
              <div
                className="tr" data-fila
                key={m.id}
                style={{ gridTemplateColumns: cols, cursor: "pointer", opacity: m.activo === 1 ? 1 : 0.72 }}
                onClick={() => setFicha(m)}
              >
                <div className="td">
                  <div className="person" style={{ minWidth: 0 }}>
                    <div className={`mini-avatar ${AVATAR_COLORS[m.id % AVATAR_COLORS.length]}`}>
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
                  <div className="td" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                    <div className="truncate">{m.telefono ?? t("common.sinTelefono")}</div>
                  </div>
                )}
                <div className="td" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                  {m.fecha_ingreso ? fmtFechaCorta(m.fecha_ingreso) : "—"}
                </div>
                {conMinisterio && (
                  <div className="td" style={{ fontSize: "calc(13.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                    <div className="truncate">{ministeriosDe(t, m.ministerios) || "—"}</div>
                  </div>
                )}
                {enIPad ? (
                  <div className="td" style={{ fontSize: "calc(13.5px * var(--fs-escala))", color: "var(--text-2)" }}>
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
        {enIPhone
          ? <div ref={centinela} aria-hidden="true" />
          : <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
        </>)}

        {/* Asistencia: el MISMO bloque de analítica que el iPad pinta en su
            panel, sin una copia. Lo que cambia es el ancho, y eso lo resuelve
            el CSS aplanando su rejilla a una columna. */}
        {enIPhone && vistaMb === "asistencia" && (
          anal ? analiticaAsistencia : <div className="ios-panel-empty">{t("membresia.asistenciaSinDatos")}</div>
        )}

        {/* Seguimiento: los miembros con alguna alerta, cada uno con la suya y
            el botón que abre `SeguimientoModal` — el mismo que ya usaba el
            iPad, sin tocarlo. */}
        {enIPhone && vistaMb === "seguimiento" && (
          conAlertas.length === 0 ? (
            <div className="ios-panel-empty">{t("membresia.seguimientoVacio")}</div>
          ) : (
            <SeccionIOS titulo={t("membresia.vista.seguimiento")}>
              {conAlertas.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className="ios-txrow ios-txrow--clickable"
                  onClick={() => setSegDe(m)}
                >
                  <div className={`mini-avatar ${AVATAR_COLORS[m.id % AVATAR_COLORS.length]}`}>{initials(m.nombre)}</div>
                  <div className="ios-txrow-main">
                    <div className="ios-txrow-title">{m.nombre}</div>
                    <div className="tx-secundaria-movil">{alertasDe(m).join(" · ")}</div>
                  </div>
                  <div className="ios-txrow-trailing"><IosChevron /></div>
                </button>
              ))}
            </SeccionIOS>
          )
        )}
      </div>
      )}

      {segDe && (
        <SeguimientoModal
          church={church}
          member={segDe}
          alertas={alertasDe(segDe)}
          onClose={() => setSegDe(null)}
          onSaved={onChanged}
          onVerPerfil={() => { const m = segDe; setSegDe(null); setFicha(m); }}
        />
      )}

      {fusionando && (
        <FusionarMiembroModal
          churchId={church.id}
          origen={fusionando}
          members={members}
          onClose={() => setFusionando(null)}
          onMerged={onChanged}
        />
      )}

      {/* ---- La hoja de tres alturas (tercer enfoque) ----
          Asomada: lo que se mira de reojo —quién es y qué le pasa—, con el
          padrón entero arriba y TOCABLE: tocar otro nombre cambia la hoja sin
          navegar, que es la promesa del enfoque.
          Media: la altura de trabajo. Por qué me importa este miembro, tres
          cifras y las tres cosas que se hacen con él.
          Completa: `DetalleMembresia`, la MISMA columna que el iPad pinta en
          su panel —asistencia por mes, los cuatro requisitos del expediente,
          movimientos y documentos—. No se duplicó nada: estaba escrita y solo
          se pintaba dentro de `{partido ? … }`. Van siete veces en este
          rediseño. */}
      {/* El botón de la barra: el juego de las ocho tarjetas, convertido en
          filtro de esta misma lista. Lleva puesto el nombre del filtro activo,
          que es lo que hace la maqueta con `{{ labelFiltro }}`. */}
      {enIPhone && vistaMb === "miembros" && (
        <button type="button" className="ios-nav-btn" onClick={() => setFiltrosAbiertos(true)}>
          {tarjetaSel ? tarjetaSel.label : t("agenda.filtros")}
        </button>
      )}

      {/* La hoja de filtros: una sola altura, sin telón. «Toca una tarjeta: la
          lista de detrás ya está filtrada mientras la hoja sigue abierta, así
          que se puede probar otra sin salir y volver.» Debajo de las ocho, los
          dos destinos que antes colgaban de la pantalla de resumen —asistencia
          y seguimiento—, que si no se quedaban sin puerta. */}
      {enIPhone && filtrosAbiertos && (
        <HojaDetentesIOS
          detente="media"
          detentes={["media"]}
          onDetente={() => {}}
          onCerrar={() => setFiltrosAbiertos(false)}
          etiqueta={t("membresia.elPadronEn", { anio })}
        >
          <div className="hm-filtros">
            <div className="hm-filtros-barra">
              <span className="hm-filtros-titulo">{t("membresia.elPadronEn", { anio })}</span>
              {tarjetaSel
                ? <button type="button" onClick={() => setTarjeta("todos")}>{t("common.quitar")}</button>
                : <button type="button" onClick={() => setFiltrosAbiertos(false)}>{t("common.listo")}</button>}
            </div>
            <div className="ios-listcard">
              {tarjetas.filter((c) => c.id !== "todos").map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`ios-txrow ios-txrow--clickable${tarjeta === c.id ? " es-elegida" : ""}`}
                  onClick={() => setTarjeta(tarjeta === c.id ? "todos" : c.id)}
                >
                  <span className="ios-punto" style={{ background: c.color }} aria-hidden="true" />
                  <div className="ios-txrow-main"><div className="ios-txrow-title">{c.label}</div></div>
                  <div className="ios-txrow-trailing"><span className="ios-fila-valor">{c.valor}</span></div>
                </button>
              ))}
            </div>
            <div className="ios-listcard hm-filtros-destinos">
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => { setFiltrosAbiertos(false); setVistaMb("asistencia"); }}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("membresia.vista.asistencia")}</div></div>
                <div className="ios-txrow-trailing"><IosChevron /></div>
              </button>
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => { setFiltrosAbiertos(false); setVistaMb("seguimiento"); }}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("membresia.vista.seguimiento")}</div></div>
                <div className="ios-txrow-trailing">
                  {conAlertas.length > 0 && <span className="ios-insignia es-pendiente">{conAlertas.length}</span>}
                  <IosChevron />
                </div>
              </button>
            </div>
          </div>
        </HojaDetentesIOS>
      )}

      {enIPhone && hojaDe && (
        <HojaDetentesIOS
          detente={detente}
          onDetente={setDetente}
          onCerrar={() => setHojaDe(null)}
          etiqueta={hojaDe.nombre}
        >
          {detente === "completa" ? (
            <DetalleMembresia
              member={hojaDe}
              asis={asistencia?.get(hojaDe.id)}
              filasAsis={asisFilas.filter((fla) => fla.member_id === hojaDe.id)}
              periodo={periodoObj}
              umbralRacha={umbrales.rachaServicios}
              onEditar={(mm) => { setHojaDe(null); setFicha(mm); }}
              onSeguimiento={(mm) => setSegDe(mm)}
            />
          ) : (
            <HojaMiembro
              m={hojaDe}
              detente={detente}
              asis={asistencia?.get(hojaDe.id)}
              alertas={alertasDe(hojaDe)}
              onSubir={() => setDetente("completa")}
              onVisita={() => setSegDe(hojaDe)}
              onExpediente={() => { setHojaDe(null); setFicha(hojaDe); }}
              onBaja={() => setPendingBaja(hojaDe)}
            />
          )}
        </HojaDetentesIOS>
      )}

      {ficha && (
        <FichaMiembroModal
          church={church}
          member={ficha}
          onClose={() => setFicha(null)}
          onSaved={onChanged}
          /* Donde la fila NO tiene menú de "···": el teléfono y el iPad
             partido. En Mac —y en el iPad sin partir— fusionar sigue en el
             menú de la fila y esto no se pasa, para no ofrecer la misma
             acción dos veces. */
          onFusionar={enIPhone || partido ? () => { const m = ficha; setFicha(null); setFusionando(m); } : undefined}
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
