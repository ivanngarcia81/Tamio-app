import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ESTADOS_ACTIVIDAD, TIPOS_ACTIVIDAD, agregarExcepcionAgenda, deleteActividad, fmtFecha, fmtFechaCorta,
  hoyISO, insertActividad, listActividades, listMembersRoster, nextMonth, parseRecordatorios, prevMonth,
  setEstadoActividad, truncarSerieAgenda, type Actividad, type Church, type ExcepcionAgenda, type NewActividad,
} from "../db";
import { expandirTodas, normalizarLugar, solapanHorario, type OcurrenciaVista } from "../services/agenda/recurrencia";
import { EmptyState } from "../components/TxList";
import ConfirmDialog from "../components/ConfirmDialog";
import ActividadModal, { type ConflictoAgenda } from "../components/ActividadModal";
import ActividadDetalle from "../components/ActividadDetalle";
import AlcanceDialog, { type Alcance } from "../components/AlcanceDialog";
import LoadingState from "../components/LoadingState";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconPlus, IconSearch } from "../icons";
import CountUp from "../components/CountUp";

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
  return { "--accent-color": color } as CSSProperties;
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

/** Fila compacta reutilizada por la vista de lista y el historial. */
function FilaActividad({ a, onOpen, etiquetaTipo, nombreResponsable, t }: {
  a: OcurrenciaVista;
  onOpen: () => void;
  etiquetaTipo: (x: Actividad) => string;
  nombreResponsable: (x: Actividad) => string | null;
  t: TFunction;
}) {
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
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [miembros, setMiembros] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>("mes");
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
  function limpiarFiltros() {
    setFiltros(FILTROS_VACIOS);
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

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.agenda.titulo")}</div>
          <div className="page-sub">{t("secretaria.agenda.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => abrirNueva(null)}><IconPlus size={14} /> {t("agenda.nuevaActividad")}</button>
        </div>
      </div>

      <div className="content">
        <div className="dash-canvas">
        <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="stat-card accent" style={accent("var(--accent-3)")}>
            <div className="stat-head"><span className="stat-label">{t("agenda.statHoy")}</span><div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div></div>
            <div className="stat-value md"><CountUp value={stats.deHoy} format={String} /></div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-4)")}>
            <div className="stat-head"><span className="stat-label">{t("agenda.statSemana")}</span><div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div></div>
            <div className="stat-value md"><CountUp value={stats.deSemana} format={String} /></div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-1)")}>
            <div className="stat-head"><span className="stat-label">{t("agenda.statProximas")}</span><div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div></div>
            <div className="stat-value md"><CountUp value={stats.proximas} format={String} /></div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-5)")}>
            <div className="stat-head"><span className="stat-label">{t("agenda.statPorConfirmar")}</span><div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div></div>
            <div className="stat-value md"><CountUp value={stats.porConfirmar} format={String} /></div>
          </div>
        </div>
        </div>

        {!loading && !vacio && recordatorios.length > 0 && (
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

        {!vacio && (
          <div className="agenda-filtros">
            <div className="search-input-wrap" style={{ flex: "1 1 240px", maxWidth: 340 }}>
              <IconSearch size={15} strokeWidth={2} />
              <input className="form-input" placeholder={t("agenda.buscarPlaceholder")} value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))} />
            </div>
            <select className="form-input sm" aria-label={t("agenda.filtrarTipo")} value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
              <option value="">{t("agenda.filtroTodosTipos")}</option>
              {TIPOS_ACTIVIDAD.map((k) => <option key={k} value={k}>{t(`agenda.tipos.${k}`)}</option>)}
            </select>
            <select className="form-input sm" aria-label={t("agenda.filtrarEstado")} value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
              <option value="">{t("agenda.filtroTodosEstados")}</option>
              {ESTADOS_ACTIVIDAD.map((k) => <option key={k} value={k}>{t(`agenda.estados.${k}`)}</option>)}
            </select>
            {ministeriosPresentes.length > 0 && (
              <select className="form-input sm" aria-label={t("agenda.filtrarMinisterio")} value={filtros.ministerio} onChange={(e) => setFiltros((f) => ({ ...f, ministerio: e.target.value }))}>
                <option value="">{t("agenda.filtroTodosMinisterios")}</option>
                {ministeriosPresentes.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {responsablesPresentes.length > 0 && (
              <select className="form-input sm" aria-label={t("agenda.filtrarResponsable")} value={filtros.responsable} onChange={(e) => setFiltros((f) => ({ ...f, responsable: e.target.value }))}>
                <option value="">{t("agenda.filtroTodosResponsables")}</option>
                {responsablesPresentes.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <input type="date" className="form-input sm" aria-label={t("agenda.rangoDesde")} value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
            <input type="date" className="form-input sm" aria-label={t("agenda.rangoHasta")} value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
            <button className={`chip ${soloImportantes ? "active" : ""}`} aria-pressed={soloImportantes} onClick={() => setSoloImportantes((v) => !v)}>
              ★ {t("agenda.soloImportantes")}
            </button>
            {hayFiltros && <button className="btn ghost sm" onClick={limpiarFiltros}>{t("agenda.limpiarFiltros")}</button>}
          </div>
        )}

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
            {vista === "historial" && (
              <>
                <select className="form-input sm" aria-label={t("agenda.filtrarAnio")} value={anioHist} onChange={(e) => setAnioHist(e.target.value)}>
                  <option value="">{t("agenda.ultimosMeses")}</option>
                  {aniosHist.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <select className="form-input sm" aria-label={t("agenda.filtrarMes")} value={mesHist} onChange={(e) => setMesHist(e.target.value)}>
                  <option value="">{t("agenda.todosLosMeses")}</option>
                  {mesesNombres.map((nom, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{nom}</option>)}
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

        {loading ? (
          <LoadingState />
        ) : vacio ? (
          <div className="agenda-vacio">
            <EmptyState icon={<IconCalendar size={22} strokeWidth={1.6} />} titulo={t("agenda.vacioTitulo")} sub={t("agenda.vacioSub")} />
            <button className="btn primary" onClick={() => abrirNueva(null)}>{t("agenda.crearPrimera")}</button>
          </div>
        ) : vista === "mes" ? (
          <div className="agenda-cal card">
            <div className="agenda-dow">{diasSemana.map((d, i) => <div key={i} className="agenda-dow-cell">{d}</div>)}</div>
            <div className="agenda-grid">
              {matrizMes(mesCursor).map((fecha, i) => {
                if (!fecha) return <div key={i} className="agenda-cell empty" />;
                const items = porFecha.get(fecha) ?? [];
                return (
                  <div key={i} className={`agenda-cell${fecha === hoy ? " today" : ""}`} onClick={() => abrirNueva(fecha)}
                    role="button" tabIndex={0} aria-label={fmtFechaCorta(fecha)} onKeyDown={(e) => { if (e.key === "Enter") abrirNueva(fecha); }}>
                    <div className="agenda-cell-num">{Number(fecha.slice(8, 10))}</div>
                    <div className="agenda-cell-items">
                      {items.slice(0, 3).map((a) => (
                        <button key={`${a._master.id}:${a._fechaOriginal}`} className={`agenda-evt estado-${a.estado}`} title={etiquetaTipo(a)}
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
                  <button className="agenda-sem-head" onClick={() => abrirNueva(fecha)}>
                    <span className="agenda-sem-dow">{f.nombreDia}</span>
                    <span className="agenda-sem-num">{f.dia}</span>
                  </button>
                  <div className="agenda-sem-body">
                    {items.length === 0 ? <div className="agenda-sem-vacio">·</div> : items.map((a) => (
                      <button key={`${a._master.id}:${a._fechaOriginal}`} className={`agenda-evt estado-${a.estado}`} title={etiquetaTipo(a)} onClick={() => setDetalle(a)}>
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
                    <div className="data-table">
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
              <div className="data-table">
                {historial.map((a) => <FilaActividad key={`${a._master.id}:${a._fechaOriginal}`} a={a} onOpen={() => setDetalle(a)} etiquetaTipo={etiquetaTipo} nombreResponsable={nombreResponsable} t={t} />)}
              </div>
            </div>
          )
        )}
      </div>

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

      {detalle && (
        <ActividadDetalle
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
      )}

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
