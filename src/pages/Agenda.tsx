import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, esMac, textoCorto } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { TFunction } from "i18next";
import {
  ESTADOS_ACTIVIDAD, TIPOS_ACTIVIDAD, agregarExcepcionAgenda, deleteActividad, fmtFecha, fmtFechaCorta,
  hoyISO, insertActividad, listActividades, listMembersRoster, nextMonth, parseRecordatorios, prevMonth,
  setEstadoActividad, truncarSerieAgenda, type Actividad, type Church, type ExcepcionAgenda, type NewActividad,
} from "../db";
import { expandirTodas, normalizarLugar, solapanHorario, type OcurrenciaVista } from "../services/agenda/recurrencia";
import { familiaDeActividad } from "../services/inicio/periodo";
import { EmptyState } from "../components/TxList";
import { useBarraEstado } from "../components/BarraEstado";
import ConfirmDialog from "../components/ConfirmDialog";
import ActividadModal, { type ConflictoAgenda } from "../components/ActividadModal";
import ActividadDetalle from "../components/ActividadDetalle";
import ActividadDetalleIOS from "../components/ActividadDetalleIOS";
import AlcanceDialog, { type Alcance } from "../components/AlcanceDialog";
import LoadingState from "../components/LoadingState";
import { MacBuscador, MacFiltros, MacSegmentado, type CampoFiltro } from "../components/mac/MacFiltros";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconPlus, IconSearch } from "../icons";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";
import CountUp from "../components/CountUp";
import { IOSPickerChip } from "../components/ios/IOSPickerField";
import IOSSegmented from "../components/ios/IOSSegmented";
import CalendarioIOS from "../components/ios/CalendarioIOS";
import IOSFormSheet from "../components/ios/IOSFormSheet";
import IOSRangoFechas from "../components/ios/IOSRangoFechas";
import type { IOSPickerOption } from "../components/ios/IOSPickerSheet";

/** Traducción tipo de actividad → tipo de servicio de la Bitácora, para el
 *  puente Agenda→Servicios ("Registrar en bitácora"). */
const TIPO_SERVICIO_POR_ACTIVIDAD: Record<string, string> = {
  cultoRegular: "dominical",
  escuelaBiblica: "estudio",
  vigilia: "vigilia",
  campana: "evangelistico",
  actividadJuvenil: "jovenes",
  actividadDamas: "damas",
  actividadCaballeros: "caballeros",
  cultoEspecial: "especial",
  santaCena: "especial",
  bautismo: "especial",
  presentacionNinos: "especial",
  boda: "especial",
  funeral: "especial",
};

type Vista = "mes" | "semana" | "lista" | "historial";

interface Filtros {
  q: string; tipo: string; estado: string; ministerio: string; responsable: string; desde: string; hasta: string;
}
const FILTROS_VACIOS: Filtros = { q: "", tipo: "", estado: "", ministerio: "", responsable: "", desde: "", hasta: "" };

interface ModalState {
  actividad: Actividad | null;
  duplicarDe: Actividad | null;
  fecha: string | null;
  mostrarRecurrencia: boolean;
  tituloModo?: string;
  excluirMasterId?: number | null;
  onSubmitOverride?: (p: NewActividad) => Promise<void>;
}

function accent(color: string): CSSProperties {
  // Las tarjetas son <button> clicables (como en Cartas): heredan la
  // tipografía y pierden los bordes por defecto del navegador.
  return { "--accent-color": color, textAlign: "left", cursor: "pointer", font: "inherit" } as CSSProperties;
}
function isoLocal(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoLocal(dt);
}
function minISO(...xs: string[]): string { return xs.reduce((a, b) => (a < b ? a : b)); }
function maxISO(...xs: string[]): string { return xs.reduce((a, b) => (a > b ? a : b)); }

/** Celdas del mes (con nulos de relleno) empezando en domingo. */
function matrizMes(yyyyMm: string): (string | null)[] {
  const [y, m] = yyyyMm.split("-").map(Number);
  const diasEnMes = new Date(y, m, 0).getDate();
  const offset = new Date(y, m - 1, 1).getDay();
  const celdas: (string | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}
/**
 * Las mismas celdas, pero con los días VECINOS en vez de huecos.
 *
 * El handoff dibuja la rejilla del mes con los días de los meses de al lado
 * en gris —26, 27… 31 de julio antes del 1 de agosto—, que es como se dibuja
 * un calendario en cualquier parte: la semana no se parte a la mitad.
 *
 * Va aparte de `matrizMes` a propósito. Aquella la usa también el calendario
 * del teléfono (`CalendarioIOS`), donde el hueco es deliberado —ahí el mes es
 * una cuadrícula de puntos, no una tabla— y cambiarla movería una pantalla
 * que no es la de este rediseño.
 */
function matrizMesVecinos(yyyyMm: string): { fecha: string; fuera: boolean }[] {
  const [y, m] = yyyyMm.split("-").map(Number);
  const primero = new Date(y, m - 1, 1);
  const inicio = new Date(primero);
  inicio.setDate(primero.getDate() - primero.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { fecha: iso, fuera: iso.slice(0, 7) !== yyyyMm };
  })
    // Seis semanas siempre serían una fila vacía en los meses cortos; se
    // recorta la última si entera cae fuera del mes.
    .filter((_, i, todas) => i < 35 || todas.slice(35).some((x) => !x.fuera));
}

function diasDeSemana(iso: string): string[] {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const dom = new Date(base);
  dom.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(isoLocal(dom), i));
}

/** Convierte un payload del editor en el objeto de cambios de una excepción. */
function payloadACambios(p: NewActividad): ExcepcionAgenda["cambios"] {
  return {
    nombre: p.nombre.trim(),
    tipo: p.tipo,
    tipo_personalizado: p.tipo === "otra" ? (p.tipo_personalizado?.trim() || null) : null,
    fecha: p.fecha,
    hora_inicio: p.dia_completo ? null : (p.hora_inicio || null),
    hora_fin: p.dia_completo ? null : (p.hora_fin || null),
    dia_completo: p.dia_completo ? 1 : 0,
    lugar: p.lugar?.trim() || null,
    descripcion: p.descripcion?.trim() || null,
    responsable_member_id: p.responsable_member_id,
    responsable_persona: p.responsable_member_id ? null : (p.responsable_persona?.trim() || null),
    responsable_ministerio: p.responsable_ministerio?.trim() || null,
    invitado: p.invitado?.trim() || null,
    contacto: p.contacto?.trim() || null,
    estado: p.estado,
    es_fecha_importante: p.es_fecha_importante ? 1 : 0,
  };
}

/** "Programada" es lo único que espera confirmación; "confirmada" y
 *  "completada" son destinos felices. Borrador/cancelada se quedan en
 *  gris neutro — mismo criterio que Actas/Cartas: un borrador no es una
 *  alerta, solo una etapa temprana. */
function badgeClaseAgendaIOS(estado: string): string {
  if (estado === "programada") return "ios-badge--pending";
  if (estado === "confirmada" || estado === "completada") return "ios-badge--ok";
  return "";
}

/** Fila compacta reutilizada por la vista de lista y el historial. En
 *  iPhone pasa al idioma de panel (.ios-txrow como <button>, sin RowMenu
 *  porque esta fila nunca tuvo deslizar/editar — un solo toque ya abre el
 *  detalle, igual que antes). Mac/iPad no cambian: siguen con
 *  .agenda-fila de siempre.
 *
 *  Se exporta para que InicioSecretaria pinte ahí sus "Próximas
 *  actividades" con esta misma fila en vez de una copia: son las mismas
 *  ocurrencias de `expandirTodas`, y dos filas parecidas se separan al
 *  primer retoque. `nombreResponsable` puede devolver siempre null cuando
 *  la pantalla que la usa no carga los miembros. */
export function FilaActividad({ a, onOpen, etiquetaTipo, nombreResponsable, t, sinFecha = false }: {
  a: OcurrenciaVista;
  onOpen: () => void;
  etiquetaTipo: (x: Actividad) => string;
  nombreResponsable: (x: Actividad) => string | null;
  t: TFunction;
  /** Omite la fecha de la segunda línea. Lo usa la lista de un día del
   *  calendario del teléfono, donde el encabezado ya dice "Miércoles 19" y
   *  repetirla en cada fila gasta el espacio que necesita el lugar. */
  sinFecha?: boolean;
}) {
  if (esIPhone()) {
    const hora = a.dia_completo ? t("agenda.diaCompletoCorto") : (a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""}` : "—");
    return (
      <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onOpen}>
        <div className="ios-txrow-main">
          <div className="ios-txrow-title">
            {a.es_fecha_importante === 1 && <span style={{ marginRight: 4 }}>★</span>}
            <span className="truncate">{a.nombre}</span>
          </div>
          <div className="tx-secundaria-movil">
            {!sinFecha && `${fmtFechaCorta(a.fecha)} · `}{hora} · {etiquetaTipo(a)}
            {a.lugar && ` · ${a.lugar}`}
            {nombreResponsable(a) && ` · ${nombreResponsable(a)}`}
          </div>
        </div>
        <div className="ios-txrow-trailing">
          <span className={`ios-badge ${badgeClaseAgendaIOS(a.estado)}`}>{t(`agenda.estados.${a.estado}`)}</span>
        </div>
      </button>
    );
  }
  return (
    <button className="agenda-fila" onClick={onOpen}>
      <div className="agenda-fila-fecha">
        <div>{fmtFechaCorta(a.fecha)}</div>
        <div className="agenda-fila-hora">{a.dia_completo ? t("agenda.diaCompletoCorto") : (a.hora_inicio ? `${a.hora_inicio}${a.hora_fin ? `–${a.hora_fin}` : ""}` : "—")}</div>
      </div>
      <div className="agenda-fila-main">
        <div className="agenda-fila-nombre">{a.es_fecha_importante === 1 && <span className="evt-star">★</span>}{a.nombre}</div>
        <div className="agenda-fila-meta">
          {etiquetaTipo(a)}
          {a.lugar && <> · {a.lugar}</>}
          {nombreResponsable(a) && <> · {nombreResponsable(a)}</>}
        </div>
      </div>
      <span className={`tag estado-tag estado-${a.estado}`}>{t(`agenda.estados.${a.estado}`)}</span>
    </button>
  );
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Agenda({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // El carrusel de secciones ya muestra "Agenda" como pastilla activa —
  // el título grande sobra ahí.
  const enIPhone = esIPhone();
  const enMac = esMac();
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [miembros, setMiembros] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>("mes");

  /* ---- Maestro-detalle del iPad ----
     Un solo umbral aquí: partido a partir de 700px. El de 1000 lo aplica el
     CSS —columnas o empuje—, pero el componente no necesita saberlo: el día
     elegido se pinta igual en los dos. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const partido = esIPad() && anchoPartido;
  /* El día abierto es una FECHA, no un objeto: sobrevive a recargas y a
     cambiar de mes, y las actividades se re-buscan de `porFecha` cada vez.
     Es el mismo patrón de "el detalle es un ID que se re-busca". */
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [cursor, setCursor] = useState(hoyISO());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [soloImportantes, setSoloImportantes] = useState(false);
  const [anioHist, setAnioHist] = useState("");
  const [mesHist, setMesHist] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [detalle, setDetalle] = useState<OcurrenciaVista | null>(null);
  const [alcance, setAlcance] = useState<{ modo: "editar" | "eliminar"; vista: OcurrenciaVista } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Actividad | null>(null);

  const hoy = hoyISO();

  /* En el iPad partido, Mes y Semana enseñan SOLO el calendario: es lo que
     dibuja el handoff —una rejilla que llena el alto con `grid-auto-rows:1fr`
     y la columna del día al lado— y con la fila de cuatro cifras, los
     recordatorios y la fila de filtros encima no queda alto para eso.

     No se pierde nada: las cuatro cifras y los filtros siguen en Lista e
     Historial (que es donde se filtra), y los cuatro destinos a los que
     llevaban las cifras son exactamente los que la barra nueva ya ofrece —
     "Semana" + "Hoy" para las dos primeras, "Lista" para las otras dos. */
  const soloCalendario = partido && (vista === "mes" || vista === "semana");

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([listActividades(church.id), listMembersRoster(church.id)])
      .then(([rows, ms]) => {
        if (cancelado) return;
        setActividades(rows);
        setMiembros(new Map(ms.map((m) => [m.id, m.nombre])));
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  function etiquetaTipo(a: Actividad): string {
    if (a.tipo === "otra" && a.tipo_personalizado) return a.tipo_personalizado;
    return t(`agenda.tipos.${a.tipo}`);
  }
  function nombreResponsable(a: Actividad): string | null {
    if (a.responsable_member_id != null) return miembros.get(a.responsable_member_id) ?? null;
    return a.responsable_persona || null;
  }

  // ---- Ventana de expansión (cubre mes/semana visibles + próximos 12 meses) ----
  const mesCursor = cursor.slice(0, 7);
  const [cy, cm] = mesCursor.split("-").map(Number);
  const ventana = useMemo(() => {
    const mesInicio = `${mesCursor}-01`;
    const mesFin = `${mesCursor}-${String(new Date(cy, cm, 0).getDate()).padStart(2, "0")}`;
    const sem = diasDeSemana(cursor);
    const desde = minISO(diasDeSemana(mesInicio)[0], sem[0], hoy);
    const hasta = maxISO(diasDeSemana(mesFin)[6], sem[6], addDays(hoy, 366));
    return { desde, hasta };
  }, [mesCursor, cursor, cy, cm, hoy]);

  const ocurrencias = useMemo(
    () => expandirTodas(actividades, ventana.desde, ventana.hasta),
    [actividades, ventana]
  );

  // ---- Filtros ----
  const hayFiltros = useMemo(
    () => Object.values(filtros).some((v) => v !== "") || soloImportantes,
    [filtros, soloImportantes]
  );
  /* La hoja de filtros del teléfono, y cuántos hay puestos para su insignia.
     La BÚSQUEDA no cuenta: se queda fuera de la hoja, en su campo, porque se
     escribe y se ve el efecto al momento — meterla dentro obligaría a abrir
     una hoja para teclear tres letras. */
  const [hojaFiltros, setHojaFiltros] = useState(false);
  const nFiltros = useMemo(
    () => Object.entries(filtros).filter(([k, v]) => k !== "q" && v !== "").length + (soloImportantes ? 1 : 0),
    [filtros, soloImportantes]
  );
  function limpiarFiltros() {
    setFiltros(FILTROS_VACIOS);
    setSoloImportantes(false);
  }
  /** "Restablecer" del popover de Mac. Deja la BÚSQUEDA como está: vive en la
   *  toolbar, a la vista, y borrarla desde un botón escondido dentro del
   *  popover sería borrar algo que el usuario no está mirando. */
  function limpiarFiltrosMac() {
    setFiltros((f) => ({ ...FILTROS_VACIOS, q: f.q }));
    setSoloImportantes(false);
  }

  function pasaFiltros(a: Actividad): boolean {
    if (filtros.tipo && a.tipo !== filtros.tipo) return false;
    if (filtros.estado && a.estado !== filtros.estado) return false;
    if (filtros.ministerio && a.responsable_ministerio !== filtros.ministerio) return false;
    if (filtros.responsable && nombreResponsable(a) !== filtros.responsable) return false;
    if (filtros.desde && a.fecha < filtros.desde) return false;
    if (filtros.hasta && a.fecha > filtros.hasta) return false;
    if (soloImportantes && a.es_fecha_importante !== 1) return false;
    const q = filtros.q.trim().toLowerCase();
    if (q) {
      const heno = [a.nombre, nombreResponsable(a), a.lugar, a.responsable_ministerio, a.invitado, a.descripcion]
        .filter(Boolean).join(" ").toLowerCase();
      if (!heno.includes(q)) return false;
    }
    return true;
  }
  const ministeriosPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const a of actividades) if (a.responsable_ministerio) set.add(a.responsable_ministerio);
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [actividades]);
  const responsablesPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const a of actividades) { const n = nombreResponsable(a); if (n) set.add(n); }
    return [...set].sort((x, y) => x.localeCompare(y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actividades, miembros]);

  const filtradas = useMemo(() => ocurrencias.filter(pasaFiltros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ocurrencias, filtros, soloImportantes, miembros]);

  /* Pie de ventana (solo Mac): lo que hay EN LA VISTA, no en la base. Esta
     pantalla cambia de ventana temporal (mes, semana, lista, historial) y de
     filtros, así que un total absoluto no diría nada del que se está
     mirando. */
  useBarraEstado(t("barraEstado.agenda", { count: filtradas.length }));

  // Catálogos de los filtros, en un solo sitio: los consumen tanto los
  // `<option>` de Mac como los chips de iPhone. Cada lista lleva de primera
  // la fila de "quitar el filtro" (value ""), que en Mac es el `<option>` de
  // siempre y en iPhone es la única forma de soltar UN filtro sin borrarlos
  // todos con "Limpiar filtros" — sin ella un chip sería de ida y vuelta
  // solo por la puerta grande.
  const opcTipo: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.filtroTodosTipos") },
    ...TIPOS_ACTIVIDAD.map((k) => ({ value: k, label: t(`agenda.tipos.${k}`) })),
  ], [t]);
  const opcEstado: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.filtroTodosEstados") },
    ...ESTADOS_ACTIVIDAD.map((k) => ({ value: k, label: t(`agenda.estados.${k}`) })),
  ], [t]);
  const opcMinisterio: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.filtroTodosMinisterios") },
    ...ministeriosPresentes.map((m) => ({ value: m, label: m })),
  ], [ministeriosPresentes, t]);
  const opcResponsable: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.filtroTodosResponsables") },
    ...responsablesPresentes.map((r) => ({ value: r, label: r })),
  ], [responsablesPresentes, t]);

  const porFecha = useMemo(() => {
    const mapa = new Map<string, OcurrenciaVista[]>();
    for (const a of filtradas) {
      const arr = mapa.get(a.fecha) ?? [];
      arr.push(a);
      mapa.set(a.fecha, arr);
    }
    for (const arr of mapa.values()) {
      arr.sort((a, b) => (a.dia_completo !== b.dia_completo
        ? (a.dia_completo ? -1 : 1)
        : (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")));
    }
    return mapa;
  }, [filtradas]);

  // ---- Estadísticas (sobre las ocurrencias reales) ----
  const stats = useMemo(() => {
    const semana = diasDeSemana(hoy);
    const iniSem = semana[0], finSem = semana[6];
    return {
      deHoy: ocurrencias.filter((a) => a.fecha === hoy && a.estado !== "cancelada").length,
      deSemana: ocurrencias.filter((a) => a.fecha >= iniSem && a.fecha <= finSem && a.estado !== "cancelada").length,
      proximas: ocurrencias.filter((a) => a.fecha >= hoy && a.estado !== "cancelada" && a.estado !== "completada").length,
      // Cuenta ACTIVIDADES (maestras) por confirmar, no ocurrencias expandidas:
      // una serie semanal sin confirmar es 1 pendiente, no 52 — antes este
      // contador clonaba a "Próximas" y no decía nada accionable. Si alguna
      // fecha puntual de la serie se confirmó con una excepción, la serie
      // sigue contando mientras queden fechas sin confirmar.
      porConfirmar: new Set(
        ocurrencias
          .filter((a) => a.fecha >= hoy && (a.estado === "programada" || a.estado === "borrador"))
          .map((a) => a._master.id)
      ).size,
    };
  }, [ocurrencias, hoy]);

  // ---- Navegación / título ----
  const semanaDias = useMemo(() => diasDeSemana(cursor), [cursor]);
  /** Lo del día elegido. Solo lo usa el calendario del teléfono, donde tocar
   *  un día lo elige y la lista de abajo enseña lo que tiene. */
  const delDia = porFecha.get(cursor) ?? [];
  const diasSemana = t("agenda.diasSemana", { returnObjects: true }) as string[];
  const titulo = useMemo(() => (
    vista === "semana"
      ? `${fmtFechaCorta(semanaDias[0])} – ${fmtFechaCorta(semanaDias[6])}`
      : fmtFecha(`${mesCursor}-01`).mesAnio
  ), [vista, semanaDias, mesCursor]);

  function irAtras() { setCursor((c) => (vista === "semana" ? addDays(c, -7) : `${prevMonth(c.slice(0, 7))}-01`)); }
  function irAdelante() { setCursor((c) => (vista === "semana" ? addDays(c, 7) : `${nextMonth(c.slice(0, 7))}-01`)); }

  // ---- Próximas agrupadas ----
  const grupos = useMemo(() => {
    const manana = addDays(hoy, 1);
    const finSemana = diasDeSemana(hoy)[6];
    const upc = filtradas.filter((a) => a.fecha >= hoy)
      .sort((a, b) => (a.fecha === b.fecha ? (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "") : a.fecha.localeCompare(b.fecha)));
    return {
      hoy: upc.filter((a) => a.fecha === hoy),
      manana: upc.filter((a) => a.fecha === manana),
      semana: upc.filter((a) => a.fecha > manana && a.fecha <= finSemana),
      despues: upc.filter((a) => a.fecha > finSemana),
    };
  }, [filtradas, hoy]);

  // ---- Recordatorios activos (in-app) ----
  const recordatorios = useMemo(() => {
    const map = new Map<string, OcurrenciaVista>();
    for (const o of ocurrencias) {
      if (o.estado === "cancelada" || o.estado === "completada" || o.fecha < hoy) continue;
      const offs = parseRecordatorios(o._master.recordatorios);
      if (offs.length && offs.some((off) => addDays(o.fecha, -off) <= hoy && hoy <= o.fecha)) {
        const k = `${o._master.id}:${o._fechaOriginal}`;
        if (!map.has(k)) map.set(k, o);
      }
    }
    return [...map.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [ocurrencias, hoy]);

  function diasFaltan(fecha: string): number {
    const [y, m, d] = fecha.split("-").map(Number);
    const [hy, hm, hd] = hoy.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
  }
  function etiquetaFaltan(fecha: string): string {
    const n = diasFaltan(fecha);
    if (n <= 0) return t("agenda.recHoy");
    if (n === 1) return t("agenda.recManana");
    return t("agenda.recEnDias", { n });
  }

  // ---- Historial (pasadas / completadas / canceladas) ----
  const aniosHist = useMemo(() => {
    const cur = new Date().getFullYear();
    let min = cur;
    for (const a of actividades) { const y = Number(a.fecha.slice(0, 4)); if (y && y < min) min = y; }
    return Array.from({ length: cur - min + 1 }, (_, i) => cur - i);
  }, [actividades]);
  const mesesNombres = useMemo(
    () => Array.from({ length: 12 }, (_, i) => fmtFecha(`2000-${String(i + 1).padStart(2, "0")}-01`).mesAnio.split(" ")[0]),
    []
  );
  // Los otros catálogos de filtro viven más arriba, junto a `filtradas`;
  // estos dos van aquí porque dependen de `aniosHist`/`mesesNombres`.
  const opcAnioHist: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.ultimosMeses") },
    ...aniosHist.map((y) => ({ value: String(y), label: String(y) })),
  ], [aniosHist, t]);
  const opcMesHist: IOSPickerOption[] = useMemo(() => [
    { value: "", label: t("agenda.todosLosMeses") },
    ...mesesNombres.map((nom, i) => ({ value: String(i + 1).padStart(2, "0"), label: nom })),
  ], [mesesNombres, t]);

  /* Los mismos valores y los mismos setters que ya usaban los `<select>` de
     la fila de filtros: solo cambia dónde se pintan. Ministerio y responsable
     siguen apareciendo únicamente si hay alguno, igual que antes. */
  const camposFiltro: CampoFiltro[] = [
    { tipo: "opciones", id: "tipo", label: t("agenda.filtrarTipo"), valor: filtros.tipo, vacio: "",
      opciones: opcTipo, onChange: (v) => setFiltros((f) => ({ ...f, tipo: v })) },
    { tipo: "opciones", id: "estado", label: t("agenda.filtrarEstado"), valor: filtros.estado, vacio: "",
      opciones: opcEstado, onChange: (v) => setFiltros((f) => ({ ...f, estado: v })) },
    ...(ministeriosPresentes.length > 0
      ? [{ tipo: "opciones", id: "ministerio", label: t("agenda.filtrarMinisterio"), valor: filtros.ministerio, vacio: "",
          opciones: opcMinisterio, onChange: (v: string) => setFiltros((f) => ({ ...f, ministerio: v })) } as CampoFiltro]
      : []),
    ...(responsablesPresentes.length > 0
      ? [{ tipo: "opciones", id: "responsable", label: t("agenda.filtrarResponsable"), valor: filtros.responsable, vacio: "",
          opciones: opcResponsable, onChange: (v: string) => setFiltros((f) => ({ ...f, responsable: v })) } as CampoFiltro]
      : []),
    { tipo: "fecha", id: "desde", label: t("agenda.rangoDesde"), valor: filtros.desde,
      onChange: (v) => setFiltros((f) => ({ ...f, desde: v })) },
    { tipo: "fecha", id: "hasta", label: t("agenda.rangoHasta"), valor: filtros.hasta,
      onChange: (v) => setFiltros((f) => ({ ...f, hasta: v })) },
    { tipo: "interruptor", id: "importantes", label: t("agenda.soloImportantes"), valor: soloImportantes,
      onChange: setSoloImportantes },
    ...(vista === "historial"
      ? [
          { tipo: "opciones", id: "anio", label: t("agenda.filtrarAnio"), valor: anioHist, vacio: "",
            opciones: opcAnioHist, onChange: setAnioHist } as CampoFiltro,
          { tipo: "opciones", id: "mes", label: t("agenda.filtrarMes"), valor: mesHist, vacio: "",
            opciones: opcMesHist, onChange: setMesHist } as CampoFiltro,
        ]
      : []),
  ];
  const historial = useMemo(() => {
    const desde = anioHist ? `${anioHist}-01-01` : addDays(hoy, -731);
    const hasta = anioHist ? `${anioHist}-12-31` : hoy;
    return expandirTodas(actividades, desde, hasta)
      .filter((o) => o.fecha < hoy || o.estado === "completada" || o.estado === "cancelada")
      .filter((o) => !mesHist || o.fecha.slice(5, 7) === mesHist)
      .filter(pasaFiltros)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora_inicio ?? "").localeCompare(a.hora_inicio ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actividades, anioHist, mesHist, hoy, filtros, soloImportantes, miembros]);

  // ---- Detección de conflictos ----
  function detectarConflictos(p: NewActividad, excluirMasterId?: number | null): ConflictoAgenda[] {
    if (!p.lugar || !p.lugar.trim()) return [];
    const lugarN = normalizarLugar(p.lugar);
    const cand = expandirTodas(actividades, p.fecha, p.fecha).filter((o) => o.estado !== "cancelada");
    const yo = { dia_completo: p.dia_completo ? 1 : 0, hora_inicio: p.hora_inicio || null, hora_fin: p.hora_fin || null };
    const out: ConflictoAgenda[] = [];
    for (const o of cand) {
      if (excluirMasterId != null && o._master.id === excluirMasterId) continue;
      if (normalizarLugar(o.lugar) !== lugarN) continue;
      if (!solapanHorario(yo, o)) continue;
      const horario = o.dia_completo ? t("agenda.diaCompletoCorto") : (o.hora_inicio ? `${o.hora_inicio}${o.hora_fin ? `–${o.hora_fin}` : ""}` : "—");
      out.push({ nombre: o.nombre, detalle: `${horario}${o.lugar ? ` · ${o.lugar}` : ""}` });
    }
    return out;
  }

  // ---- Acciones ----
  function abrirNueva(fecha: string | null) {
    setModal({ actividad: null, duplicarDe: null, fecha, mostrarRecurrencia: true });
  }
  /* El "+" crea en el día ELEGIDO cuando el calendario del teléfono está a la
     vista: es lo que promete el estado vacío ("Toca ＋ para añadir una
     actividad a este día"). En Lista/Historial y en escritorio no hay día
     elegido y sigue creando sin fecha. */
  useAbrirCrearDesdeMas(() => abrirNueva(enIPhone && (vista === "mes" || vista === "semana") ? cursor : null));

  function abrirEditor(v: OcurrenciaVista) {
    setDetalle(null);
    if (v._esOcurrencia) { setAlcance({ modo: "editar", vista: v }); return; }
    setModal({ actividad: v._master, duplicarDe: null, fecha: null, mostrarRecurrencia: true, excluirMasterId: v._master.id });
  }

  function elegirEditar(al: Alcance, v: OcurrenciaVista) {
    setAlcance(null);
    const master = v._master;
    const fechaOriginal = v._fechaOriginal;
    if (al === "serie") {
      setModal({ actividad: master, duplicarDe: null, fecha: null, mostrarRecurrencia: true, excluirMasterId: master.id });
    } else if (al === "sola") {
      setModal({
        actividad: v, duplicarDe: null, fecha: null, mostrarRecurrencia: false,
        tituloModo: t("agenda.editarSola"), excluirMasterId: master.id,
        onSubmitOverride: async (p) => { await agregarExcepcionAgenda(master.id, church.id, { fechaOriginal, cambios: payloadACambios(p) }); },
      });
    } else {
      setModal({
        actividad: v, duplicarDe: null, fecha: null, mostrarRecurrencia: true,
        tituloModo: t("agenda.editarSiguientes"), excluirMasterId: master.id,
        onSubmitOverride: async (p) => { await truncarSerieAgenda(master.id, church.id, fechaOriginal); await insertActividad(church.id, p); },
      });
    }
  }

  async function elegirEliminar(al: Alcance, v: OcurrenciaVista) {
    setAlcance(null);
    const master = v._master;
    if (al === "sola") await agregarExcepcionAgenda(master.id, church.id, { fechaOriginal: v._fechaOriginal, eliminada: true });
    else if (al === "siguientes") await truncarSerieAgenda(master.id, church.id, v._fechaOriginal);
    else await deleteActividad(master.id, church.id);
    playSound("eliminar");
    showToast(t("agenda.toastEliminada"));
    onChanged();
  }

  function abrirEliminar(v: OcurrenciaVista) {
    setDetalle(null);
    if (v._esOcurrencia) setAlcance({ modo: "eliminar", vista: v });
    else setPendingDelete(v._master);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteActividad(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("agenda.toastEliminada"));
    onChanged();
  }

  async function cambiarEstado(v: OcurrenciaVista, nuevo: string) {
    setDetalle(null);
    if (v._esOcurrencia) await agregarExcepcionAgenda(v._master.id, church.id, { fechaOriginal: v._fechaOriginal, cambios: { estado: nuevo } });
    else await setEstadoActividad(v._master.id, church.id, nuevo);
    playSound("guardado");
    showToast(t("agenda.toastEstado"));
    onChanged();
  }

  const vacio = actividades.length === 0;

  // Las tarjetas llevan a la vista donde lo contado SÍ se ve. Hacía falta
  // porque el conteo y la cuadrícula podían discrepar sin remedio: "Esta
  // semana" cuenta de domingo a sábado alrededor de HOY, y cuando esa semana
  // cruza el cambio de mes (28 de julio en la semana del 26 jul–1 ago), la
  // vista mensual de agosto no puede mostrar ese día — sus celdas de relleno
  // son huecos, no días del mes anterior. La vista de semana centrada en hoy
  // enseña exactamente la ventana que la tarjeta cuenta. Se limpian los
  // filtros para que la vista muestre todo lo que el conteo vio (las
  // estadísticas se calculan sin filtrar).
  function irASemanaDeHoy() {
    limpiarFiltros();
    setCursor(hoy);
    setVista("semana");
  }
  function irALista() {
    limpiarFiltros();
    setVista("lista");
  }

  /* ---- El panel del día (columna derecha del iPad) ----
     El handoff lo titula "Jueves 20 · 2 compromisos · 1 vencido". Los dos
     números salen de datos: los compromisos son las ocurrencias de ese día
     que no están canceladas, y "vencido" es una que ya pasó y sigue sin
     completarse ni cancelarse — no un estado guardado, sino la lectura
     evidente de la fecha contra hoy. */
  const actividadesDia = diaSel ? porFecha.get(diaSel) ?? [] : [];
  const compromisosDia = actividadesDia.filter((a) => a.estado !== "cancelada");
  const vencidasDia = compromisosDia.filter(
    (a) => a.fecha < hoy && a.estado !== "completada",
  ).length;

  const panelDia = diaSel == null ? (
    <div className="md-vacio">
      <div className="md-vacio-hint">
        <h3>{t("agenda.eligeDia")}</h3>
        <p>{t("agenda.eligeDiaSub")}</p>
      </div>
    </div>
  ) : (
    <div className="dm ag-dia">
      <button type="button" className="dm-volver" onClick={() => setDiaSel(null)}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {t("secretaria.agenda.titulo")}
      </button>

      <div className="ag-dia-cab">
        <h2 className="ag-dia-titulo">{fmtFechaCorta(diaSel)}</h2>
        <p className="ag-dia-sub">
          {t("agenda.compromisos", { count: compromisosDia.length })}
          {vencidasDia > 0 && ` · ${t("agenda.vencidas", { count: vencidasDia })}`}
        </p>
      </div>

      {compromisosDia.length === 0 ? (
        <p className="ag-dia-vacio">{t("agenda.diaSinNada")}</p>
      ) : (
        <div className="ag-dia-lista">
          {actividadesDia.map((a) => (
            <button
              key={`${a._master.id}:${a._fechaOriginal}`}
              type="button"
              className={`ag-dia-fila estado-${a.estado}`}
              onClick={() => setDetalle(a)}
            >
              <span className="ag-dia-hora">
                {a.dia_completo ? t("agenda.diaCompletoCorto") : (a.hora_inicio ?? "—")}
              </span>
              <span className="ag-dia-textos">
                <span className="ag-dia-nombre">
                  {a.es_fecha_importante === 1 && <span className="evt-star">★</span>}{a.nombre}
                </span>
                <span className="ag-dia-meta">
                  {[etiquetaTipo(a), a.lugar, nombreResponsable(a)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );

  /* ---- La barra de 50px del iPad (handoff) ----
     El handoff pone una barra propia sobre la pantalla partida, del ancho de
     las dos columnas: segmentado de vistas a la izquierda, el mes al lado, y
     al otro extremo ‹ · Hoy · ›. Es la barra de la app de Calendario, y por
     eso va FUERA del calendario que se desplaza: navegar el mes no puede
     depender de dónde esté el scroll.

     El handoff dibuja tres pestañas —Mes, Semana, Lista— y la app tiene
     CUATRO: también "Historial". No se quita: es la única forma de mirar lo
     ya pasado, y el handoff define la forma del control (un segmentado),
     no cuántas vistas tiene esta app. Entra como cuarta pestaña.

     Ojo con el orden: aquí el título va PEGADO al segmentado y los controles
     al extremo derecho, al revés que la vieja `.agenda-toolbar`. */
  const barraIPad = (
    <div className="ag-barra">
      <div className="ag-seg" role="tablist" aria-label={t("agenda.cambiarVista")}>
        {(["mes", "semana", "lista", "historial"] as Vista[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={vista === v}
            className={vista === v ? "activo" : ""} onClick={() => setVista(v)}>
            {t(`agenda.vista${v === "mes" ? "Mes" : v === "semana" ? "Semana" : v === "lista" ? "Lista" : "Historial"}`)}
          </button>
        ))}
      </div>
      {(vista === "mes" || vista === "semana") && <span className="ag-barra-mes">{titulo}</span>}
      {vista === "historial" && (
        <>
          <select className="form-input sm" aria-label={t("agenda.filtrarAnio")} value={anioHist} onChange={(e) => setAnioHist(e.target.value)}>
            {opcAnioHist.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="form-input sm" aria-label={t("agenda.filtrarMes")} value={mesHist} onChange={(e) => setMesHist(e.target.value)}>
            {opcMesHist.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </>
      )}
      <div className="ag-barra-cola" />
      {(vista === "mes" || vista === "semana") && (
        <div className="ag-barra-nav">
          <button type="button" className="ag-nav" aria-label={vista === "semana" ? t("agenda.semanaAnterior") : t("agenda.mesAnterior")} onClick={irAtras}>
            <IconChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <button type="button" className="ag-hoy" onClick={() => setCursor(hoy)}>{t("agenda.hoy")}</button>
          <button type="button" className="ag-nav" aria-label={vista === "semana" ? t("agenda.semanaSiguiente") : t("agenda.mesSiguiente")} onClick={irAdelante}>
            <IconChevronRight size={16} strokeWidth={2.2} />
          </button>
        </div>
      )}
    </div>
  );

  /* El cuerpo de la pantalla (barra de vistas + calendario o lista), a una
     constante: el iPad lo pinta dentro de la columna ancha del
     maestro-detalle y el Mac y el teléfono dentro de su `.content`. Los
     mismos nodos en los dos sitios.  */
  const calendario = (
    <>
        {!soloCalendario && (enIPhone ? (
          /* Rediseño de iOS 26. Las cuatro cifras eran una rejilla de tarjetas
             KPI de media pantalla cada una: ~500px antes del calendario, y en
             Mes y Semana el calendario es la pantalla. Pasan a la forma
             compacta del índice de Informes —etiqueta pequeña y cifra debajo,
             sin caja— y solo salen en Lista, que es donde la maqueta las pone
             y la única vista donde el "cuántas hay" es el dato de entrada.
             Siguen siendo tocables: llevan a la semana de hoy o a la lista. */
          vista !== "lista" ? null : (
          <div className="rep-cifras">
            <button type="button" className="rep-cifra es-boton" onClick={irASemanaDeHoy}>
              <span className="rep-cifra-k">{t("agenda.statHoy")}</span>
              <span className="rep-cifra-v"><CountUp value={stats.deHoy} format={String} /></span>
            </button>
            <button type="button" className="rep-cifra es-boton" onClick={irASemanaDeHoy}>
              <span className="rep-cifra-k">{t("agenda.statSemana")}</span>
              <span className="rep-cifra-v"><CountUp value={stats.deSemana} format={String} /></span>
            </button>
            <button type="button" className="rep-cifra es-boton" onClick={irALista}>
              <span className="rep-cifra-k">{t("agenda.statProximas")}</span>
              <span className="rep-cifra-v"><CountUp value={stats.proximas} format={String} /></span>
            </button>
            <button type="button" className="rep-cifra es-boton" onClick={irALista}>
              <span className="rep-cifra-k">{t("agenda.statPorConfirmar")}</span>
              <span className="rep-cifra-v"><CountUp value={stats.porConfirmar} format={String} /></span>
            </button>
          </div>
          )
        ) : (
          <div className="dash-canvas">
          <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <button className="stat-card accent" style={accent("var(--accent-3)")} onClick={irASemanaDeHoy}>
              <div className="stat-head"><span className="stat-label">{t("agenda.statHoy")}</span><div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div></div>
              <div className="stat-value md"><CountUp value={stats.deHoy} format={String} /></div>
            </button>
            <button className="stat-card accent" style={accent("var(--accent-4)")} onClick={irASemanaDeHoy}>
              <div className="stat-head"><span className="stat-label">{t("agenda.statSemana")}</span><div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div></div>
              <div className="stat-value md"><CountUp value={stats.deSemana} format={String} /></div>
            </button>
            <button className="stat-card accent" style={accent("var(--accent-1)")} onClick={irALista}>
              <div className="stat-head"><span className="stat-label">{t("agenda.statProximas")}</span><div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div></div>
              <div className="stat-value md"><CountUp value={stats.proximas} format={String} /></div>
            </button>
            <button className="stat-card accent" style={accent("var(--accent-5)")} onClick={irALista}>
              <div className="stat-head"><span className="stat-label">{t("agenda.statPorConfirmar")}</span><div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div></div>
              <div className="stat-value md"><CountUp value={stats.porConfirmar} format={String} /></div>
            </button>
          </div>
          </div>
        ))}

        {!soloCalendario && !loading && !vacio && recordatorios.length > 0 && (
          <div className="agenda-recordatorios">
            <div className="agenda-rec-head"><IconClock size={14} strokeWidth={1.9} /> {t("agenda.recordatoriosTitulo")} <span className="agenda-grupo-n">{recordatorios.length}</span></div>
            <div className="agenda-rec-lista">
              {recordatorios.map((o) => (
                <button key={`${o._master.id}:${o._fechaOriginal}`} className="agenda-rec-item" onClick={() => setDetalle(o)}>
                  <span className="agenda-rec-cuando">{etiquetaFaltan(o.fecha)}</span>
                  <span className="agenda-rec-nombre">{o.nombre}</span>
                  <span className="agenda-rec-fecha">{fmtFechaCorta(o.fecha)}{!o.dia_completo && o.hora_inicio ? ` · ${o.hora_inicio}` : ""}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!vacio && !soloCalendario && (enIPhone ? (
          /* En iPhone la búsqueda se queda a lo ancho y los filtros bajan a
             una fila propia que se DESLIZA: con seis, envolver dejaba la
             pantalla en escalera. */
          /* Rediseño de iOS 26 (GUIA §4, fila 9: "los filtros a una hoja").
             Buscador y SEIS filtros vivían encima del calendario: medido en la
             captura, ~700px de mandos antes de ver el primer día del mes, y la
             fila de pastillas se salía por el borde derecho sin decirlo.

             No se ESCONDEN en Mes/Semana aunque ahí no se vean: el calendario
             pinta su punto desde `porFecha`, que sale de `filtradas`, así que
             un filtro puesto cambia lo que el mes enseña. Un control que sigue
             actuando no puede desaparecer — sube a una hoja y su botón dice
             cuántos hay puestos. */
          <>
            <div className="agenda-mandos-ios">
              <div className="search-input-wrap" style={{ flex: "1 1 auto", marginBottom: 0 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input className="form-input" placeholder={textoCorto(t("common.buscarCorto"), t("agenda.buscarPlaceholder"))} value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))} />
              </div>
              <button
                type="button"
                className={`chip${hayFiltros || soloImportantes ? " active" : ""}`}
                onClick={() => setHojaFiltros(true)}
              >
                {t("agenda.filtros")}
                {nFiltros > 0 && <span className="count">{nFiltros}</span>}
              </button>
            </div>

            {hojaFiltros && (
              <IOSFormSheet
                title={t("agenda.filtros")}
                onCancel={() => setHojaFiltros(false)}
                onSave={() => setHojaFiltros(false)}
                canSave
              >
                <div className="ios-filtros ios-filtros--hoja">
                  <IOSPickerChip label={t("agenda.filtrarTipo")} options={opcTipo} value={filtros.tipo}
                    onSelect={(v) => setFiltros((f) => ({ ...f, tipo: v }))} />
                  <IOSPickerChip label={t("agenda.filtrarEstado")} options={opcEstado} value={filtros.estado}
                    onSelect={(v) => setFiltros((f) => ({ ...f, estado: v }))} />
                  {ministeriosPresentes.length > 0 && (
                    <IOSPickerChip label={t("agenda.filtrarMinisterio")} options={opcMinisterio} value={filtros.ministerio}
                      onSelect={(v) => setFiltros((f) => ({ ...f, ministerio: v }))} />
                  )}
                  {responsablesPresentes.length > 0 && (
                    <IOSPickerChip label={t("agenda.filtrarResponsable")} options={opcResponsable} value={filtros.responsable}
                      onSelect={(v) => setFiltros((f) => ({ ...f, responsable: v }))} />
                  )}
                  <IOSRangoFechas
                    desde={filtros.desde}
                    hasta={filtros.hasta}
                    onCambiar={({ desde, hasta }) => setFiltros((f) => ({ ...f, desde, hasta }))}
                  />
                  <button className={`chip ${soloImportantes ? "active" : ""}`} aria-pressed={soloImportantes} onClick={() => setSoloImportantes((v) => !v)}>
                    ★ {t("agenda.soloImportantes")}
                  </button>
                  {hayFiltros && <button className="btn ghost sm" onClick={limpiarFiltros}>{t("agenda.limpiarFiltros")}</button>}
                </div>
              </IOSFormSheet>
            )}
          </>
        ) : enMac ? null : (
          <div className="agenda-filtros">
            <div className="search-input-wrap" style={{ flex: "1 1 240px", maxWidth: 340 }}>
              <IconSearch size={15} strokeWidth={2} />
              <input className="form-input" placeholder={textoCorto(t("common.buscarCorto"), t("agenda.buscarPlaceholder"))} value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))} />
            </div>
            <select className="form-input sm" aria-label={t("agenda.filtrarTipo")} value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
              {opcTipo.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="form-input sm" aria-label={t("agenda.filtrarEstado")} value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
              {opcEstado.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {ministeriosPresentes.length > 0 && (
              <select className="form-input sm" aria-label={t("agenda.filtrarMinisterio")} value={filtros.ministerio} onChange={(e) => setFiltros((f) => ({ ...f, ministerio: e.target.value }))}>
                {opcMinisterio.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {responsablesPresentes.length > 0 && (
              <select className="form-input sm" aria-label={t("agenda.filtrarResponsable")} value={filtros.responsable} onChange={(e) => setFiltros((f) => ({ ...f, responsable: e.target.value }))}>
                {opcResponsable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            <input type="date" className="form-input sm" aria-label={t("agenda.rangoDesde")} value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
            <input type="date" className="form-input sm" aria-label={t("agenda.rangoHasta")} value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
            <button className={`chip ${soloImportantes ? "active" : ""}`} aria-pressed={soloImportantes} onClick={() => setSoloImportantes((v) => !v)}>
              ★ {t("agenda.soloImportantes")}
            </button>
            {hayFiltros && <button className="btn ghost sm" onClick={limpiarFiltros}>{t("agenda.limpiarFiltros")}</button>}
          </div>
        ))}

        {enIPhone ? (
          /* Dos filas en vez de una. El selector va ARRIBA y a todo el ancho
             del contenido, así que aparecer o desaparecer la fila de abajo ya
             no lo mueve. Antes las dos cosas compartían una fila con
             `justify-content: space-between` y un `.agenda-nav` que se
             pintaba siempre aunque estuviera vacío: en Lista el hueco vacío
             empujaba el selector al extremo derecho, y en Mes/Semana la fila
             no cabía en 390 px y lo tiraba a una segunda línea. Medido: x=123
             en Lista contra x=14 en las demás, y 46 px de diferencia de
             altura. */
          <>
            <div className="agenda-vistas-ios">
              <IOSSegmented
                options={[
                  { value: "mes", label: t("agenda.vistaMes") },
                  { value: "semana", label: t("agenda.vistaSemana") },
                  { value: "lista", label: t("agenda.vistaLista") },
                  { value: "historial", label: t("agenda.vistaHistorial") },
                ]}
                value={vista}
                onChange={setVista}
              />
            </div>

            {/* Fila 2: solo lo que depende de la vista. Colapsa del todo
                cuando no hay nada que poner (Lista), sin dejar hueco. */}
            {(vista === "mes" || vista === "semana") && (
              /* El mes a la izquierda y los controles a la derecha, que es el
                 orden de iOS: primero dónde estás, después con qué te mueves.
                 En Mac e iPad se queda como estaba. */
              <div className="agenda-contexto-ios">
                <span className="agenda-mes-titulo">{titulo}</span>
                <div className="agenda-nav-group">
                  <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaAnterior") : t("agenda.mesAnterior")} onClick={irAtras}><IconChevronLeft size={15} /></button>
                  <button className="nav-hoy" onClick={() => setCursor(hoy)}>{t("agenda.hoy")}</button>
                  <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaSiguiente") : t("agenda.mesSiguiente")} onClick={irAdelante}><IconChevronRight size={15} /></button>
                </div>
              </div>
            )}
            {vista === "historial" && (
              /* `.ios-filtros` ya se sale a sangre con su margen negativo
                 —para que los chips puedan desplazarse de borde a borde—,
                 así que va suelto y no dentro de `.agenda-contexto-ios`. */
              <div className="ios-filtros" style={{ paddingBottom: 0 }}>
                <IOSPickerChip label={t("agenda.filtrarAnio")} options={opcAnioHist} value={anioHist} onSelect={setAnioHist} />
                <IOSPickerChip label={t("agenda.filtrarMes")} options={opcMesHist} value={mesHist} onSelect={setMesHist} />
              </div>
            )}
          </>
        ) : enMac || partido ? null : (
        <div className="agenda-toolbar">
          <div className="agenda-nav">
            {(vista === "mes" || vista === "semana") && (
              <>
                <div className="agenda-nav-group">
                  <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaAnterior") : t("agenda.mesAnterior")} onClick={irAtras}><IconChevronLeft size={15} /></button>
                  <button className="nav-hoy" onClick={() => setCursor(hoy)}>{t("agenda.hoy")}</button>
                  <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaSiguiente") : t("agenda.mesSiguiente")} onClick={irAdelante}><IconChevronRight size={15} /></button>
                </div>
                <span className="agenda-mes-titulo">{titulo}</span>
              </>
            )}
            {/* Sin la rama de iPhone que había aquí: esta barra ya solo se
                pinta cuando NO es iPhone, así que era un camino muerto. */}
            {vista === "historial" && (
              <>
                <select className="form-input sm" aria-label={t("agenda.filtrarAnio")} value={anioHist} onChange={(e) => setAnioHist(e.target.value)}>
                  {opcAnioHist.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select className="form-input sm" aria-label={t("agenda.filtrarMes")} value={mesHist} onChange={(e) => setMesHist(e.target.value)}>
                  {opcMesHist.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="chip-toggle" role="tablist" aria-label={t("agenda.cambiarVista")}>
            {(["mes", "semana", "lista", "historial"] as Vista[]).map((v) => (
              <button key={v} className={`chip ${vista === v ? "active" : ""}`} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}>
                {t(`agenda.vista${v === "mes" ? "Mes" : v === "semana" ? "Semana" : v === "lista" ? "Lista" : "Historial"}`)}
              </button>
            ))}
          </div>
        </div>
        )}

        {loading ? (
          <LoadingState />
        ) : vacio ? (
          <div className="agenda-vacio">
            <EmptyState pagina icon={<IconCalendar size={22} strokeWidth={1.6} />} titulo={t("agenda.vacioTitulo")} sub={t("agenda.vacioSub")} />
            <button className="btn primary" onClick={() => abrirNueva(null)}>{t("agenda.crearPrimera")}</button>
          </div>
        ) : enIPhone && (vista === "mes" || vista === "semana") ? (
          /* En el teléfono el calendario NO es la tabla de escritorio: el día
             solo dice si tiene algo, y lo que tiene se lee entero en la lista
             de abajo. El porqué —medido— está en `CalendarioIOS`.
             Aquí tocar un día lo ELIGE; crear es el "+" de la cabecera, que
             ya usa el día elegido. */
          <>
            <CalendarioIOS
              dias={vista === "mes" ? matrizMes(mesCursor) : semanaDias}
              diasSemana={diasSemana}
              seleccion={cursor}
              hoy={hoy}
              tiene={(f) => (porFecha.get(f)?.length ?? 0) > 0}
              onElegir={setCursor}
              tira={vista === "semana"}
            />
            <div className="ios-dia-cab">
              <h2>{`${fmtFecha(cursor).nombreDia} ${fmtFecha(cursor).dia}`}</h2>
              <span>{t("agenda.diaActividades", { count: delDia.length })}</span>
            </div>
            {delDia.length === 0 ? (
              <EmptyState compacto icon={<IconCalendar size={22} strokeWidth={1.6} />} titulo={t("agenda.diaVacioTitulo")} sub={t("agenda.diaVacioSub")} />
            ) : (
              <div className="ios-listcard">
                {delDia.map((a) => (
                  <FilaActividad key={`${a._master.id}:${a._fechaOriginal}`} a={a} onOpen={() => setDetalle(a)} etiquetaTipo={etiquetaTipo} nombreResponsable={nombreResponsable} t={t} sinFecha />
                ))}
              </div>
            )}
          </>
        ) : vista === "mes" ? (
          <div className="agenda-cal card">
            <div className="agenda-dow">{diasSemana.map((d, i) => <div key={i} className="agenda-dow-cell">{d}</div>)}</div>
            <div className="agenda-grid">
              {/* En el iPad la rejilla lleva los días vecinos en gris (handoff);
                  en Mac se queda con los huecos que tenía. */}
              {(partido
                ? matrizMesVecinos(mesCursor)
                : matrizMes(mesCursor).map((f) => (f ? { fecha: f, fuera: false } : null))
              ).map((celda, i) => {
                if (!celda) return <div key={i} className="agenda-cell empty" />;
                const { fecha, fuera } = celda;
                const items = porFecha.get(fecha) ?? [];
                return (
                  /* En el iPad tocar un día lo ABRE en el panel de la
                     derecha —es lo que dibuja el handoff— en vez de saltar
                     directo al formulario de "nueva actividad"; crear sigue
                     estando, dentro del propio panel. En Mac no cambia. */
                  <div key={i} className={`agenda-cell${fecha === hoy ? " today" : ""}${fuera ? " fuera" : ""}${partido && diaSel === fecha ? " sel" : ""}`}
                    onClick={() => (partido ? setDiaSel(fecha) : abrirNueva(fecha))}
                    role="button" tabIndex={0} aria-label={fmtFechaCorta(fecha)}
                    onKeyDown={(e) => { if (e.key === "Enter") (partido ? setDiaSel(fecha) : abrirNueva(fecha)); }}>
                    <div className="agenda-cell-num">{Number(fecha.slice(8, 10))}</div>
                    <div className="agenda-cell-items">
                      {/* El día de hoy sin nada: el handoff le pone su propia
                          pastilla "Hoy" dentro de la celda tintada. */}
                      {partido && fecha === hoy && items.length === 0 && (
                        <span className="agenda-evt agenda-evt--hoy">{t("agenda.hoy")}</span>
                      )}
                      {items.slice(0, 3).map((a) => (
                        <button key={`${a._master.id}:${a._fechaOriginal}`} className={`agenda-evt estado-${a.estado} fam-${familiaDeActividad(a.tipo)}`} title={etiquetaTipo(a)}
                          onClick={(e) => { e.stopPropagation(); setDetalle(a); }}>
                          {!a.dia_completo && a.hora_inicio && <span className="agenda-evt-hora">{a.hora_inicio}</span>}
                          <span className="agenda-evt-nombre">{a.es_fecha_importante === 1 && <span className="evt-star">★</span>}{a.nombre}</span>
                        </button>
                      ))}
                      {items.length > 3 && <div className="agenda-mas">+{items.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : vista === "semana" ? (
          <div className="agenda-semana card">
            {semanaDias.map((fecha) => {
              const items = porFecha.get(fecha) ?? [];
              const f = fmtFecha(fecha);
              return (
                <div key={fecha} className={`agenda-sem-col${fecha === hoy ? " today" : ""}`}>
                  <button className="agenda-sem-head" onClick={() => (partido ? setDiaSel(fecha) : abrirNueva(fecha))}>
                    <span className="agenda-sem-dow">{f.nombreDia}</span>
                    <span className="agenda-sem-num">{f.dia}</span>
                  </button>
                  <div className="agenda-sem-body">
                    {items.length === 0 ? <div className="agenda-sem-vacio">·</div> : items.map((a) => (
                      <button key={`${a._master.id}:${a._fechaOriginal}`} className={`agenda-evt estado-${a.estado} fam-${familiaDeActividad(a.tipo)}`} title={etiquetaTipo(a)} onClick={() => setDetalle(a)}>
                        {!a.dia_completo && a.hora_inicio && <span className="agenda-evt-hora">{a.hora_inicio}</span>}
                        <span className="agenda-evt-nombre">{a.es_fecha_importante === 1 && <span className="evt-star">★</span>}{a.nombre}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : vista === "lista" ? (
          (grupos.hoy.length + grupos.manana.length + grupos.semana.length + grupos.despues.length) === 0 ? (
            <EmptyState icon={<IconCalendar size={22} strokeWidth={1.6} />}
              titulo={hayFiltros ? t("agenda.sinResultados") : t("agenda.sinProximas")}
              sub={hayFiltros ? t("agenda.sinResultadosSub") : t("agenda.sinProximasSub")} />
          ) : (
            <div className="agenda-grupos">
              {([["grupoHoy", grupos.hoy], ["grupoManana", grupos.manana], ["grupoEstaSemana", grupos.semana], ["grupoProximamente", grupos.despues]] as [string, OcurrenciaVista[]][]).map(([clave, items]) => (
                items.length === 0 ? null : (
                  <div key={clave} className="agenda-grupo">
                    <div className="agenda-grupo-titulo">{t(`agenda.${clave}`)} <span className="agenda-grupo-n">{items.length}</span></div>
                    <div className={enIPhone ? "ios-listcard" : "data-table"}>
                      {items.map((a) => <FilaActividad key={`${a._master.id}:${a._fechaOriginal}`} a={a} onOpen={() => setDetalle(a)} etiquetaTipo={etiquetaTipo} nombreResponsable={nombreResponsable} t={t} />)}
                    </div>
                  </div>
                )
              ))}
            </div>
          )
        ) : (
          // ---- Historial ----
          historial.length === 0 ? (
            <EmptyState icon={<IconCalendar size={22} strokeWidth={1.6} />} titulo={t("agenda.historialVacio")} sub={t("agenda.historialVacioSub")} />
          ) : (
            <div className="agenda-grupo">
              <div className="agenda-grupo-titulo">{t("agenda.historialTitulo")} <span className="agenda-grupo-n">{historial.length}</span></div>
              <div className={enIPhone ? "ios-listcard" : "data-table"}>
                {historial.map((a) => <FilaActividad key={`${a._master.id}:${a._fechaOriginal}`} a={a} onOpen={() => setDetalle(a)} etiquetaTipo={etiquetaTipo} nombreResponsable={nombreResponsable} t={t} />)}
              </div>
            </div>
          )
        )}
    </>
  );

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("secretaria.agenda.titulo")}</div>
            {!enMac && <div className="page-sub">{t("secretaria.agenda.sub")}</div>}
          </div>
        )}
        <div className="header-actions">
          {/* En Mac la pantalla entera se maneja desde la toolbar: navegación
              de mes, selector de vista, buscador y filtros. Antes eran dos
              filas dentro del contenido —una barra y una fila de filtros que
              envolvía— que empujaban el calendario media pantalla hacia
              abajo. En iPad y iPhone no cambia nada. */}
          {enMac && (
            <>
              {(vista === "mes" || vista === "semana") && (
                <>
                  <div className="agenda-nav-group">
                    <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaAnterior") : t("agenda.mesAnterior")} onClick={irAtras}><IconChevronLeft size={13} /></button>
                    <button className="nav-hoy" onClick={() => setCursor(hoy)}>{t("agenda.hoy")}</button>
                    <button className="nav-arrow" aria-label={vista === "semana" ? t("agenda.semanaSiguiente") : t("agenda.mesSiguiente")} onClick={irAdelante}><IconChevronRight size={13} /></button>
                  </div>
                  <span className="agenda-mes-titulo">{titulo}</span>
                </>
              )}
              <MacSegmentado
                value={vista}
                onChange={(v) => setVista(v)}
                aria={t("agenda.cambiarVista")}
                opciones={[
                  { id: "mes" as Vista, label: t("agenda.vistaMes") },
                  { id: "semana" as Vista, label: t("agenda.vistaSemana") },
                  { id: "lista" as Vista, label: t("agenda.vistaLista") },
                  { id: "historial" as Vista, label: t("agenda.vistaHistorial") },
                ]}
              />
              <MacBuscador
                value={filtros.q}
                onChange={(v) => setFiltros((f) => ({ ...f, q: v }))}
                placeholder={t("agenda.buscarPlaceholder")}
              />
              <MacFiltros campos={camposFiltro} onRestablecer={limpiarFiltrosMac} />
            </>
          )}
          {/* El ÚNICO "Nueva actividad" de la pantalla. Había otro igual —mismo
              rótulo y mismo peso— al pie de la columna del día, y con un día
              abierto se veían los dos verdes a la vez; el handoff no dibuja
              ninguno ahí. No se pierde el atajo: con un día elegido, este
              botón crea EN ESE DÍA, que es lo que hacía el de abajo. */}
          <button className="btn primary btn-nuevo-cabecera" onClick={() => abrirNueva(partido ? diaSel : null)}><IconPlus size={14} /> {t("agenda.nuevaActividad")}</button>
        </div>
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          Aquí el reparto va al revés que en las otras cinco: el calendario se
          queda con el ancho y el panel es una columna de 318px a la DERECHA
          con el día elegido. Es lo que dibuja el handoff, y tiene sentido —
          un calendario mensual no cabe en una columna de lista.

          Se monta sobre las MISMAS clases (`.md-lista` para el calendario,
          `.md-detalle` para el día) en vez de un andamio nuevo: así el modo
          de empuje, su animación y el botón de volver salen gratis, y lo
          único que hay que hacer es invertir los anchos en el rango de
          columnas. */}
      {partido ? (
        <>
          {barraIPad}
          <div className={`md-split md-agenda${diaSel ? " md-abierto" : ""}`}>
            <div className="md-lista md-agenda-cal">{calendario}</div>
            <div className="md-detalle">{panelDia}</div>
          </div>
        </>
      ) : (
      <div className="content content-lienzo">{calendario}</div>
      )}

      {modal && (
        <ActividadModal
          church={church}
          actividad={modal.actividad}
          duplicarDe={modal.duplicarDe}
          fechaInicial={modal.fecha}
          mostrarRecurrencia={modal.mostrarRecurrencia}
          tituloModo={modal.tituloModo}
          onSubmitOverride={modal.onSubmitOverride}
          detectarConflictos={(p) => detectarConflictos(p, modal.excluirMasterId ?? null)}
          onClose={() => setModal(null)}
          onSaved={onChanged}
        />
      )}

      {alcance && (
        <AlcanceDialog
          modo={alcance.modo}
          onElegir={(al) => (alcance.modo === "editar" ? elegirEditar(al, alcance.vista) : elegirEliminar(al, alcance.vista))}
          onCancel={() => setAlcance(null)}
        />
      )}

      {detalle && (() => {
        /* La misma actividad, la misma mecánica, dos envoltorios: en el
           teléfono el detalle es una PANTALLA (maqueta A5) y en Mac/iPad
           sigue siendo el modal de siempre. Las ocho props son idénticas a
           propósito — lo que cambia es la forma, no lo que hace. */
        const Detalle = esIPhone() ? ActividadDetalleIOS : ActividadDetalle;
        return (
        <Detalle
          actividad={detalle}
          responsableNombre={nombreResponsable(detalle)}
          esRecurrente={detalle._esOcurrencia}
          onClose={() => setDetalle(null)}
          onEditar={() => abrirEditor(detalle)}
          onDuplicar={() => { setModal({ actividad: null, duplicarDe: detalle._master, fecha: null, mostrarRecurrencia: true }); setDetalle(null); }}
          onEliminar={() => abrirEliminar(detalle)}
          onEstado={(nuevo) => cambiarEstado(detalle, nuevo)}
          onRegistrarServicio={() => {
            navigate("/servicios", {
              state: {
                prefillServicio: {
                  fecha: detalle.fecha,
                  tipo: TIPO_SERVICIO_POR_ACTIVIDAD[detalle.tipo] ?? "otro",
                  dirige: nombreResponsable(detalle) ?? undefined,
                  // Solo actividades únicas: en una serie recurrente no se
                  // puede marcar "realizada" una sola fecha sin más mecánica.
                  actividadId: detalle._esOcurrencia ? undefined : detalle._master.id,
                },
              },
            });
          }}
        />
        );
      })()}

      {pendingDelete && (
        <ConfirmDialog
          title={t("agenda.eliminarTitulo")}
          message={t("agenda.eliminarMensaje", { nombre: pendingDelete.nombre })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
