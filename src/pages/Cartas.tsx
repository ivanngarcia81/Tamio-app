import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPhone, textoCorto } from "../movil";
import {
  deleteCarta, deletePlantilla, deleteSolicitud, deleteTrasladoEntrada, deleteTrasladoSalida,
  estadoAnteriorDeHistorial, fmtFechaCorta, insertCarta,
  listCartas, listMembersRegistro, listPlantillas, listSolicitudes, listTrasladosEntrada,
  listTrasladosSalida, updateCarta, updatePlantilla, updateSolicitud, updateTrasladoEntrada,
  updateTrasladoSalida, vincularCartaSolicitud,
  type Carta, type Church, type Member, type NewCarta, type NewPlantilla, type NewSolicitud,
  type NewTrasladoEntrada, type NewTrasladoSalida, type Plantilla, type Solicitud,
  type TrasladoEntrada, type TrasladoSalida,
} from "../db";
import { asegurarPlantillasIniciales } from "../services/cartas/plantillas";
import { EmptyState } from "../components/TxList";
import RowMenu, { type RowMenuItem } from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import CartaEditor, { ESTADOS_CARTA, TIPOS_CARTA, type CartaPrefill } from "../components/CartaEditor";
import ActionSheet, { type ActionSheetOption } from "../components/ActionSheet";
import SolicitudModal from "../components/SolicitudModal";
import TrasladoSalidaModal from "../components/TrasladoSalidaModal";
import TrasladoEntradaModal from "../components/TrasladoEntradaModal";
import PlantillaModal from "../components/PlantillaModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { buildCartaHtml, abrirCartaParaImprimir, parseFirmas } from "../services/cartas/cartaDoc";
import { IconMail, IconPlus, IconPrinter, IconSearch } from "../icons";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";
import CountUp from "../components/CountUp";
import { MenuAnchor, type MenuItem } from "../components/MenuAnchor";

const COLS = "130px 1.8fr 110px 150px 130px 72px";
const COLS_SOL = "120px 1.6fr 120px 110px 140px 72px";
const PAGE_SIZE = 25;

/** Glifos del menú "+" — el ícono va a la derecha del texto (convención de
 *  menú de iOS). "Nueva solicitud" reutiliza IconMail (misma silueta de
 *  sobre que ya usa esa acción en su propia pestaña); los otros tres no
 *  tenían equivalente en el set de íconos y se agregan aquí, solo para
 *  este menú. */
const DocPlusIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5M12 11v6M9 14h6" />
  </svg>
);
const ArrowUpRightIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
const ArrowDownLeftIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 7 7 17M15 17H7V9" />
  </svg>
);
const TemplateIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M3 9h18M9 9v12" />
  </svg>
);
const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M2 4h20v4H2zM9 13h6" />
  </svg>
);
const IosChevron = () => (
  <span className="ios-chevron" aria-hidden="true">
    <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
  </span>
);

type Tab = "resumen" | "nueva" | "solicitudes" | "salida" | "entrada" | "plantillas" | "archivo";

const BADGE_TS: Record<string, string> = {
  borrador: "administracion",
  solicitud: "donacion",
  revision: "musicos",
  aprobacion: "eventos",
  aprobado: "ofrenda",
  cartaPreparacion: "servicios",
  cartaEmitida: "diezmo",
  cartaEntregada: "misiones",
  confirmacion: "limpieza",
  completado: "activo",
  cancelado: "pastores",
};

const BADGE_TE: Record<string, string> = {
  recibida: "donacion",
  revision: "musicos",
  incompleta: "servicios",
  entrevista: "eventos",
  aprobacion: "misiones",
  aceptado: "ofrenda",
  noAceptado: "pastores",
  completado: "activo",
  archivado: "baja",
};

const BADGE_PRIORIDAD: Record<string, string> = {
  normal: "administracion",
  importante: "servicios",
  urgente: "pastores",
};

const BADGE_SOLICITUD: Record<string, string> = {
  nueva: "donacion",
  revision: "musicos",
  preparacion: "servicios",
  firma: "eventos",
  lista: "diezmo",
  entregada: "activo",
  cancelada: "pastores",
};

const BADGE_ESTADO: Record<string, string> = {
  borrador: "administracion",
  preparacion: "servicios",
  revision: "musicos",
  firma: "eventos",
  aprobada: "donacion",
  lista: "diezmo",
  entregada: "activo",
  archivada: "baja",
  cancelada: "pastores",
};

function accent(color: string): CSSProperties {
  // Las tarjetas del resumen son <button> clicables: heredan la tipografía
  // y pierden los bordes por defecto del navegador.
  return { "--accent-color": color, textAlign: "left", cursor: "pointer", font: "inherit" } as CSSProperties;
}

/** Mismo agrupamiento que `resumen` (útil arriba), aplicado a la insignia de
 *  cada fila de actividad reciente en el idioma de panel de iPhone: gris por
 *  default, ámbar mientras espera firma, verde ya lista/entregada. Nunca
 *  cian — esa era la queja original sobre `.tag.administracion`. */
function badgeClaseIOS(estado: string): string {
  if (estado === "firma") return "ios-badge--pending";
  if (["aprobada", "lista", "entregada"].includes(estado)) return "ios-badge--ok";
  return "";
}

/** Solicitudes comparte los mismos nombres de etapa ("firma", "lista",
 *  "entregada") que las cartas, así que reutiliza badgeClaseIOS tal cual —
 *  ver comentario ahí arriba. Traslados de salida y entrada tienen su
 *  propio vocabulario de estados (revisión/aprobación/confirmación
 *  pendientes vs. completado/entregado/aceptado), así que cada uno arma su
 *  propio mapeo gris/ámbar/verde a partir de lo que ya dice cada etiqueta
 *  en `traslados.estadoTS`/`traslados.estadoTE` (es.ts). */
function badgeClaseTS(estado: string): string {
  if (["revision", "aprobacion", "confirmacion"].includes(estado)) return "ios-badge--pending";
  if (["cartaEntregada", "completado"].includes(estado)) return "ios-badge--ok";
  return "";
}
function badgeClaseTE(estado: string): string {
  if (["revision", "incompleta", "entrevista", "aprobacion"].includes(estado)) return "ios-badge--pending";
  if (["aceptado", "completado"].includes(estado)) return "ios-badge--ok";
  return "";
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Cartas({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones (CarruselSecciones, solo iPhone) ya muestra el
  // nombre de la sección activa, así que el título grande de aquí abajo
  // sobra ahí — igual que en Ajustes (ver Configuracion.tsx/enIPhone).
  const enIPhone = esIPhone();
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [solicitudModal, setSolicitudModal] = useState<{ open: boolean; solicitud: Solicitud | null }>({ open: false, solicitud: null });
  const [trasladosSalida, setTrasladosSalida] = useState<TrasladoSalida[]>([]);
  const [trasladosEntrada, setTrasladosEntrada] = useState<TrasladoEntrada[]>([]);
  const [tsModal, setTsModal] = useState<{ open: boolean; traslado: TrasladoSalida | null }>({ open: false, traslado: null });
  // Puente Membresía → Traslados: baja con motivo "traslado" ofrece crear el
  // traslado de salida aquí, con el miembro (recién dado de baja) preseleccionado.
  const [tsPreMemberId, setTsPreMemberId] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const deId = (location.state as { trasladoSalidaDe?: number } | null)?.trasladoSalidaDe;
    if (!deId) return;
    setTab("salida");
    setTsPreMemberId(deId);
    setTsModal({ open: true, traslado: null });
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const [teModal, setTeModal] = useState<{ open: boolean; traslado: TrasladoEntrada | null }>({ open: false, traslado: null });
  const [pendingDeleteTS, setPendingDeleteTS] = useState<TrasladoSalida | null>(null);
  const [pendingDeleteTE, setPendingDeleteTE] = useState<TrasladoEntrada | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [plantillaModal, setPlantillaModal] = useState<{ open: boolean; plantilla: Plantilla | null; base: Plantilla | null }>({ open: false, plantilla: null, base: null });
  const [pendingDeletePl, setPendingDeletePl] = useState<Plantilla | null>(null);
  const [pendingDeleteSol, setPendingDeleteSol] = useState<Solicitud | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ tipo: "entregar" | "cancelar"; carta: Carta } | null>(null);
  const [desdeSolicitud, setDesdeSolicitud] = useState<Solicitud | null>(null);
  const [filtroMiembro, setFiltroMiembro] = useState<string>("todos");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resumen");
  const [menuCrearAbierto, setMenuCrearAbierto] = useState(false);
  // El "+" fijo de iPhone (BotonCrear, ver App.tsx) no puede anclar el menú
  // de escritorio (MenuAnchor cuelga del botón de la cabecera, que en móvil
  // no se pinta): en su lugar abre esta hoja de acciones, mismo contenido.
  const [hojaCrearAbierta, setHojaCrearAbierta] = useState(false);
  const [editando, setEditando] = useState<Carta | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Carta | null>(null);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todas");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const editorDirtyRef = useRef(false);
  const [refrescoLocal, setRefrescoLocal] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    (async () => {
      // Siembra idempotente + limpieza de duplicados (blindada contra
      // corridas concurrentes del efecto en modo desarrollo).
      await asegurarPlantillasIniciales(church.id);
      const [nuevasCartas, nuevasSolicitudes, nuevosTS, nuevosTE, nuevasPlantillas, nuevosMembers] = await Promise.all([
        listCartas(church.id),
        listSolicitudes(church.id),
        listTrasladosSalida(church.id),
        listTrasladosEntrada(church.id),
        listPlantillas(church.id),
        listMembersRegistro(church.id),
      ]);
      if (cancelado) return;
      setCartas(nuevasCartas);
      setSolicitudes(nuevasSolicitudes);
      setTrasladosSalida(nuevosTS);
      setTrasladosEntrada(nuevosTE);
      setPlantillas(nuevasPlantillas);
      setMembers(nuevosMembers);
    })()
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, refrescoLocal]);

  useEffect(() => setPage(1), [query, filtroEstado, filtroTipo, desde, hasta]);

  // Cambiar de pestaña con cambios sin guardar en el editor pide confirmación.
  const cambiarTab = useCallback((destino: Tab) => {
    if (tab === "nueva" && destino !== "nueva" && editorDirtyRef.current) {
      setPendingTab(destino);
      return;
    }
    if (destino === "nueva" && tab !== "nueva") setEditando(null);
    if (destino !== "nueva") setDesdeSolicitud(null);
    setTab(destino);
  }, [tab]);
  // En iPad (movil sin ser iPhone) el "+" sigue abriendo "Nueva carta"
  // directo, como antes — el gap que se cierra aquí es solo el de iPhone,
  // que además tiene el carrusel para ubicarse sin la fila de pastillas.
  useAbrirCrearDesdeMas(() => {
    if (enIPhone) setHojaCrearAbierta(true);
    else cambiarTab("nueva");
  });

  const nombreMiembro = useCallback(
    (id: number | null) => (id === null ? null : members.find((m) => m.id === id)?.nombre ?? null),
    [members]
  );

  /** "Crear carta desde esta solicitud": copia los datos y vincula ambos
   *  registros al guardar. Se invoca desde la pestaña Solicitudes (el editor
   *  no está montado ahí, así que no hay cambios que perder). */
  function crearDesdeSolicitud(s: Solicitud) {
    setEditando(null);
    setDesdeSolicitud(s);
    setTab("nueva");
  }

  const prefillDesdeSolicitud: CartaPrefill | null = desdeSolicitud
    ? {
        tipo: desdeSolicitud.tipo_carta,
        destinatario_tipo: desdeSolicitud.member_id !== null ? "miembro" : "externo",
        member_id: desdeSolicitud.member_id,
        destinatario_nombre: desdeSolicitud.solicitante_externo ?? "",
        asunto: desdeSolicitud.motivo ?? "",
      }
    : null;

  function abrirCarta(c: Carta) {
    if (tab === "nueva" && editorDirtyRef.current) {
      setPendingTab(null);
      // Cambios sin guardar y quieren abrir otra carta: misma confirmación.
      setPendingAbrir(c);
      return;
    }
    setEditando(c);
    setTab("nueva");
  }
  const [pendingAbrir, setPendingAbrir] = useState<Carta | null>(null);

  async function imprimir(c: Carta) {
    try {
      const html = await buildCartaHtml(church, c, parseFirmas(c.firmas));
      await abrirCartaParaImprimir(html, c.folio);
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    }
  }

  async function archivarCarta(c: Carta) {
    const payload: NewCarta = {
      tipo: c.tipo, fecha_emision: c.fecha_emision, lugar_emision: c.lugar_emision,
      destinatario_tipo: c.destinatario_tipo, member_id: c.member_id,
      destinatario_nombre: c.destinatario_nombre, destinatario_direccion: c.destinatario_direccion,
      asunto: c.asunto, saludo: c.saludo, cuerpo_html: c.cuerpo_html, despedida: c.despedida,
      firmas: parseFirmas(c.firmas), observaciones: c.observaciones,
      estado: "archivada", entregada_a: c.entregada_a, fecha_entrega: c.fecha_entrega,
    };
    await updateCarta(c.id, church.id, payload, c.estado);
    playSound("guardado");
    showToast(t("cartas.toastArchivada"));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteCarta(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("cartas.toastEliminada"));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  function cartaComoPayload(c: Carta, estado: string): NewCarta {
    return {
      tipo: c.tipo, fecha_emision: c.fecha_emision, lugar_emision: c.lugar_emision,
      destinatario_tipo: c.destinatario_tipo, member_id: c.member_id,
      destinatario_nombre: c.destinatario_nombre, destinatario_direccion: c.destinatario_direccion,
      asunto: c.asunto, saludo: c.saludo, cuerpo_html: c.cuerpo_html, despedida: c.despedida,
      firmas: parseFirmas(c.firmas), observaciones: c.observaciones,
      estado, entregada_a: c.entregada_a, fecha_entrega: c.fecha_entrega,
    };
  }

  async function duplicarCarta(c: Carta) {
    const hoy = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    const payload = cartaComoPayload(c, "borrador");
    payload.fecha_emision = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;
    payload.firmas = payload.firmas.map((f) => ({ ...f, firmado: false }));
    payload.entregada_a = null;
    payload.fecha_entrega = null;
    const creada = await insertCarta(church.id, payload);
    playSound("guardado");
    showToast(t("cartas.toastDuplicada", { folio: creada?.folio ?? "" }));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  async function cambiarEstadoCarta(c: Carta, estado: string) {
    await updateCarta(c.id, church.id, cartaComoPayload(c, estado), c.estado);
    playSound("guardado");
    showToast(t("cartas.toastGuardada"));
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  async function restaurarCarta(c: Carta) {
    await cambiarEstadoCarta(c, estadoAnteriorDeHistorial(c.historial_estados, c.estado));
  }

  function solicitudComoPayload(s: Solicitud, estado: string): NewSolicitud {
    return {
      member_id: s.member_id, solicitante_externo: s.solicitante_externo, tipo_carta: s.tipo_carta,
      motivo: s.motivo, fecha_solicitud: s.fecha_solicitud, fecha_requerida: s.fecha_requerida,
      medio_entrega: s.medio_entrega, responsable: s.responsable, prioridad: s.prioridad,
      estado, observaciones: s.observaciones,
    };
  }

  function tsComoPayload(s: TrasladoSalida, estado: string): NewTrasladoSalida {
    return {
      member_id: s.member_id, fecha_solicitud: s.fecha_solicitud, motivo: s.motivo,
      iglesia_destino: s.iglesia_destino, pastor_receptor: s.pastor_receptor, direccion: s.direccion,
      ciudad: s.ciudad, region: s.region, pais: s.pais, telefono: s.telefono, email: s.email,
      fecha_aprobacion: s.fecha_aprobacion, aprobado_por: s.aprobado_por, carta_id: s.carta_id,
      fecha_entrega: s.fecha_entrega, metodo_entrega: s.metodo_entrega,
      confirmacion_recibida: s.confirmacion_recibida, fecha_confirmacion: s.fecha_confirmacion,
      observaciones: s.observaciones, estado,
    };
  }

  function teComoPayload(s: TrasladoEntrada, estado: string): NewTrasladoEntrada {
    return {
      nombre: s.nombre, fecha_nacimiento: s.fecha_nacimiento, telefono: s.telefono, correo: s.correo,
      direccion: s.direccion, iglesia_procedencia: s.iglesia_procedencia, pastor_anterior: s.pastor_anterior,
      direccion_anterior: s.direccion_anterior, fecha_emision_carta: s.fecha_emision_carta,
      fecha_recepcion: s.fecha_recepcion, referencia_carta: s.referencia_carta,
      adjunto_path: s.adjunto_path, adjunto_nombre: s.adjunto_nombre, adjunto_fecha: s.adjunto_fecha,
      fecha_congregacion: s.fecha_congregacion, fecha_entrevista: s.fecha_entrevista,
      entrevistador: s.entrevistador, decision: s.decision, fecha_aprobacion: s.fecha_aprobacion,
      observaciones: s.observaciones, estado, member_id: s.member_id,
    };
  }

  async function eliminarOCancelarTS() {
    if (!pendingDeleteTS) return;
    const s = pendingDeleteTS;
    if (s.estado === "borrador") {
      await deleteTrasladoSalida(s.id, church.id);
      playSound("eliminar");
      showToast(t("traslados.toastEliminado"));
    } else {
      await updateTrasladoSalida(s.id, church.id, tsComoPayload(s, "cancelado"), s.estado);
      playSound("guardado");
      showToast(t("traslados.toastCancelado"));
    }
    setPendingDeleteTS(null);
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  async function eliminarOArchivarTE() {
    if (!pendingDeleteTE) return;
    const s = pendingDeleteTE;
    if (s.estado === "recibida" && s.member_id === null) {
      await deleteTrasladoEntrada(s.id, church.id);
      playSound("eliminar");
      showToast(t("traslados.toastEliminado"));
    } else {
      await updateTrasladoEntrada(s.id, church.id, teComoPayload(s, "archivado"), s.estado);
      playSound("guardado");
      showToast(t("traslados.toastArchivado"));
    }
    setPendingDeleteTE(null);
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  function plComoPayload(p: Plantilla, patch: Partial<NewPlantilla>): NewPlantilla {
    return {
      nombre: p.nombre, tipo: p.tipo, asunto: p.asunto, saludo: p.saludo,
      cuerpo_html: p.cuerpo_html, despedida: p.despedida,
      activa: p.activa === 1, predeterminada: p.predeterminada === 1,
      ...patch,
    };
  }

  async function togglePlantillaActiva(p: Plantilla) {
    await updatePlantilla(p.id, church.id, plComoPayload(p, { activa: p.activa !== 1 }));
    playSound("guardado");
    setRefrescoLocal((k) => k + 1);
  }

  async function marcarPredeterminada(p: Plantilla) {
    await updatePlantilla(p.id, church.id, plComoPayload(p, { predeterminada: true }));
    playSound("guardado");
    showToast(t("plantillas.toastPredeterminada", { nombre: p.nombre }));
    setRefrescoLocal((k) => k + 1);
  }

  async function eliminarPlantilla() {
    if (!pendingDeletePl) return;
    await deletePlantilla(pendingDeletePl.id, church.id);
    setPendingDeletePl(null);
    playSound("eliminar");
    showToast(t("plantillas.toastEliminada"));
    setRefrescoLocal((k) => k + 1);
  }

  /** Desde el modal de traslado: cierra y abre la carta vinculada en el editor. */
  function abrirCartaPorId(cartaId: number) {
    const c = cartas.find((x) => x.id === cartaId);
    setTsModal({ open: false, traslado: null });
    if (c) abrirCarta(c);
  }

  async function eliminarOCancelarSolicitud() {
    if (!pendingDeleteSol) return;
    const s = pendingDeleteSol;
    if (s.estado === "nueva" && s.carta_id === null) {
      await deleteSolicitud(s.id, church.id);
      playSound("eliminar");
      showToast(t("solicitudes.toastEliminada"));
    } else {
      await updateSolicitud(s.id, church.id, solicitudComoPayload(s, "cancelada"), s.estado);
      playSound("guardado");
      showToast(t("solicitudes.toastCancelada"));
    }
    setPendingDeleteSol(null);
    setRefrescoLocal((k) => k + 1);
    onChanged();
  }

  // ----- Datos derivados para Resumen y Archivo -----
  const resumen = useMemo(() => ({
    enPreparacion: cartas.filter((c) => ["borrador", "preparacion", "revision"].includes(c.estado)).length,
    esperandoFirma: cartas.filter((c) => c.estado === "firma").length,
    listas: cartas.filter((c) => ["aprobada", "lista"].includes(c.estado)).length,
  }), [cartas]);

  const q = query.trim().toLowerCase();
  const visibles = cartas
    .filter((c) => (filtroEstado === "todas" ? true : c.estado === filtroEstado))
    .filter((c) => (filtroTipo === "todos" ? true : c.tipo === filtroTipo))
    .filter((c) => (filtroMiembro === "todos" ? true : c.member_id === Number(filtroMiembro)))
    .filter((c) => (!desde || c.fecha_emision >= desde) && (!hasta || c.fecha_emision <= hasta))
    .filter(
      (c) =>
        !q ||
        c.folio.toLowerCase().includes(q) ||
        c.destinatario_nombre.toLowerCase().includes(q) ||
        (c.asunto ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function irAArchivoFiltrado(estado: string) {
    setFiltroEstado(estado);
    cambiarTab("archivo");
  }

  // Las cuatro acciones de crear, antes cuatro pastillas de la fila que se
  // quitó. Cada una hace lo mismo que hacía su pastilla: cambia a la
  // pestaña correspondiente y, si esa pestaña abre con un modal (solicitud,
  // traslado), lo abre de una vez — el mismo atajo que ya usaban los dos
  // botones de "Registrar traslado" del resumen. Sin este cambio de
  // pestaña, "Solicitudes" se quedaba sin ninguna forma de llegar a su
  // lista: a diferencia del paquete de referencia, aquí SÍ es una lista de
  // verdad, no solo un formulario.
  const menuCrearItems: MenuItem[] = [
    { label: t("cartas.nuevaCartaMenu"), icon: <DocPlusIcon />, onPress: () => cambiarTab("nueva") },
    {
      label: t("solicitudes.nuevaSolicitud"),
      icon: <IconMail size={20} strokeWidth={1.8} />,
      onPress: () => { cambiarTab("solicitudes"); setSolicitudModal({ open: true, solicitud: null }); },
    },
    {
      label: t("traslados.registrarSalida"),
      icon: <ArrowUpRightIcon />,
      onPress: () => { cambiarTab("salida"); setTsModal({ open: true, traslado: null }); },
    },
    {
      label: t("traslados.registrarEntrada"),
      icon: <ArrowDownLeftIcon />,
      onPress: () => { cambiarTab("entrada"); setTeModal({ open: true, traslado: null }); },
    },
  ];

  // Mismas cuatro acciones que menuCrearItems, para la hoja del "+" fijo de
  // iPhone (ver hojaCrearAbierta arriba) — un ActionSheet no tiene "icono",
  // así que aquí solo importan label y onPress.
  const hojaCrearOpciones: ActionSheetOption[] = menuCrearItems.map((item) => ({
    label: item.label,
    danger: item.destructive,
    onClick: () => { setHojaCrearAbierta(false); item.onPress(); },
  }));

  return (
    <>
      {!enIPhone && (
        <div className="header">
          <div>
            <div className="page-title">{t("secretaria.cartas.titulo")}</div>
            <div className="page-sub">{t("secretaria.cartas.sub")}</div>
          </div>
          <div className="header-actions">
            <div className="cartas-menu-crear">
              <MenuAnchor
                open={menuCrearAbierto}
                onOpenChange={setMenuCrearAbierto}
                button={<IconPlus size={22} strokeWidth={2.1} />}
                ariaLabel={t("cartas.nuevaCarta")}
                items={menuCrearItems}
              />
            </div>
          </div>
        </div>
      )}

      <div className="content">
        {loading ? (
          <LoadingState />
        ) : tab === "resumen" ? (
          <>
            {enIPhone ? (
              <div className="ios-panel">
                <div className="ios-panel-head"><h2>{t("cartas.seccionEstado")}</h2></div>
                <div className="ios-panel-grid">
                  <button type="button" className="ios-stat" onClick={() => irAArchivoFiltrado("borrador")}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("cartas.cardPreparacion")}</span></div>
                    <span className="ios-stat-num"><CountUp value={resumen.enPreparacion} format={String} /></span>
                  </button>
                  <button type="button" className="ios-stat" onClick={() => irAArchivoFiltrado("firma")}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("cartas.cardFirma")}</span></div>
                    <span className="ios-stat-num"><CountUp value={resumen.esperandoFirma} format={String} /></span>
                  </button>
                  <button type="button" className="ios-stat" onClick={() => irAArchivoFiltrado("lista")}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("cartas.cardListas")}</span></div>
                    <span className="ios-stat-num"><CountUp value={resumen.listas} format={String} /></span>
                  </button>
                  <button type="button" className="ios-stat" onClick={() => cambiarTab("salida")}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("traslados.cardEnProceso")}</span></div>
                    <span className="ios-stat-num">
                      <CountUp
                        value={
                          trasladosSalida.filter((s) => !["completado", "cancelado"].includes(s.estado)).length +
                          trasladosEntrada.filter((s) => !["completado", "archivado", "noAceptado"].includes(s.estado)).length
                        }
                        format={String}
                      />
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="dash-canvas">
              <div className="summary-4 enter">
                <button className="stat-card accent" style={accent("var(--accent-4)")} onClick={() => irAArchivoFiltrado("borrador")}>
                  <div className="stat-head"><span className="stat-label">{t("cartas.cardPreparacion")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.enPreparacion} format={String} /></div>
                </button>
                <button className="stat-card accent" style={accent("var(--accent-3)")} onClick={() => irAArchivoFiltrado("firma")}>
                  <div className="stat-head"><span className="stat-label">{t("cartas.cardFirma")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.esperandoFirma} format={String} /></div>
                </button>
                <button className="stat-card accent" style={accent("var(--accent-1)")} onClick={() => irAArchivoFiltrado("lista")}>
                  <div className="stat-head"><span className="stat-label">{t("cartas.cardListas")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.listas} format={String} /></div>
                </button>
                {/* Cuatro tarjetas que cuentan una sola historia, y todas son
                    colas de trabajo: en preparación → esperando firma → listas
                    para entregar, más los traslados en curso. Antes eran seis
                    (con "Emitidas este mes", puro dato, y los traslados
                    separados en dos) y la sexta rompía la fila sola. */}
                <button className="stat-card accent" style={accent("var(--accent-5)")} onClick={() => cambiarTab("salida")}>
                  <div className="stat-head"><span className="stat-label">{t("traslados.cardEnProceso")}</span></div>
                  <div className="stat-value md">
                    <CountUp
                      value={
                        trasladosSalida.filter((s) => !["completado", "cancelado"].includes(s.estado)).length +
                        trasladosEntrada.filter((s) => !["completado", "archivado", "noAceptado"].includes(s.estado)).length
                      }
                      format={String}
                    />
                  </div>
                </button>
              </div>
              </div>
            )}

            {/* Las dos cajas de "Registrar traslado" vivían aquí — ya están
                en el menú del "+". Este mismo sitio ahora es Plantillas y
                Archivo, que eran pastillas de la fila que se quitó. Este
                bloque no varía por plataforma: no es parte del idioma de
                panel de iPhone, es el reemplazo directo de la fila de
                pastillas que se quitó para todos por igual. */}
            <div className="ios-navcards" style={{ marginTop: 14 }}>
              <button type="button" className="ios-navcard" onClick={() => cambiarTab("plantillas")}>
                <span className="ios-navcard-icon"><TemplateIcon /></span>
                <span className="ios-navcard-label">{t("cartas.tab.plantillas")}</span>
                <IosChevron />
              </button>
              <button type="button" className="ios-navcard" onClick={() => cambiarTab("archivo")}>
                <span className="ios-navcard-icon"><ArchiveIcon /></span>
                <span className="ios-navcard-label">{t("cartas.tab.archivo")}</span>
                <IosChevron />
              </button>
            </div>

            {enIPhone ? (
              <div className="ios-panel" style={{ marginTop: 18 }}>
                <div className="ios-panel-head">
                  <h2>{t("cartas.actividadReciente")}</h2>
                  {cartas.length > 0 && (
                    <button type="button" className="ios-panel-action" onClick={() => cambiarTab("archivo")}>
                      {t("cartas.verTodo")}
                    </button>
                  )}
                </div>
                {cartas.length === 0 ? (
                  <div className="ios-panel-empty">{t("cartas.aunNoHay")}</div>
                ) : (
                  <div className="ios-listcard">
                    {cartas.slice(0, 5).map((c) => (
                      <button key={c.id} type="button" className="ios-listrow" onClick={() => abrirCarta(c)}>
                        <span className="ios-listrow-code">{c.folio}</span>
                        <span className="ios-listrow-name">{c.destinatario_nombre} — {t(`cartas.tipoDoc.${c.tipo}`)}</span>
                        <span className={`ios-badge ${badgeClaseIOS(c.estado)}`}>{t(`cartas.estado.${c.estado}`)}</span>
                        <IosChevron />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="card enter" style={{ marginTop: 18 }}>
                <div className="card-head"><span className="card-title">{t("cartas.actividadReciente")}</span></div>
                {cartas.length === 0 ? (
                  <EmptyState
                    titulo={t("cartas.aunNoHay")}
                    sub={t("cartas.agregaPrimera")}
                    icon={<IconMail size={20} strokeWidth={1.8} />}
                  />
                ) : (
                  cartas.slice(0, 5).map((c) => (
                    <div key={c.id} className="roster-row" style={{ cursor: "pointer" }} onClick={() => abrirCarta(c)}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, width: 120, flex: "none", fontVariantNumeric: "tabular-nums" }}>{c.folio}</span>
                      <span className="roster-name">{c.destinatario_nombre} — {t(`cartas.tipoDoc.${c.tipo}`)}</span>
                      <span className={`tag ${BADGE_ESTADO[c.estado] ?? "otros"}`}>{t(`cartas.estado.${c.estado}`)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : tab === "nueva" ? (
          <CartaEditor
            key={editando?.id ?? `nueva-${desdeSolicitud?.id ?? 0}`}
            church={church}
            carta={editando}
            members={members}
            dirtyRef={editorDirtyRef}
            plantillas={plantillas.filter((p) => p.activa === 1)}
            prefill={prefillDesdeSolicitud}
            vinculo={desdeSolicitud?.folio ?? solicitudes.find((s) => s.id === editando?.solicitud_id)?.folio ?? null}
            onSaved={async (creada) => {
              if (creada && desdeSolicitud) {
                await vincularCartaSolicitud(desdeSolicitud.id, creada.id, church.id);
                showToast(t("solicitudes.toastVinculada", { sol: desdeSolicitud.folio, carta: creada.folio }));
              }
              setRefrescoLocal((k) => k + 1);
              onChanged();
              if (creada) setEditando(creada);
            }}
          />
        ) : tab === "solicitudes" ? (
          <>
            <div className="tx-head">
              <span className="roster-counters">
                <span>{t("solicitudes.pendientes")}: <b>{solicitudes.filter((s) => !["entregada", "cancelada"].includes(s.estado)).length}</b></span>
              </span>
              <button className="btn primary" onClick={() => setSolicitudModal({ open: true, solicitud: null })}>
                <IconPlus size={14} /> {t("solicitudes.nuevaSolicitud")}
              </button>
            </div>
            {solicitudes.length === 0 ? (
              <EmptyState
                titulo={t("solicitudes.aunNoHay")}
                sub={t("solicitudes.agregaPrimera")}
                icon={<IconMail size={20} strokeWidth={1.8} />}
              />
            ) : enIPhone ? (
              <div className="ios-listcard">
                {solicitudes.map((s) => {
                  const cartaVinculada = cartas.find((c) => c.id === s.carta_id) ?? null;
                  const extra: RowMenuItem[] = [];
                  if (!s.carta_id && !["entregada", "cancelada"].includes(s.estado)) {
                    extra.push({ label: t("solicitudes.crearCarta"), onClick: () => crearDesdeSolicitud(s) });
                  }
                  if (cartaVinculada) {
                    extra.push({ label: t("solicitudes.abrirCarta", { folio: cartaVinculada.folio }), onClick: () => abrirCarta(cartaVinculada) });
                  }
                  return (
                    <div
                      className="ios-txrow ios-txrow--clickable"
                      data-fila
                      key={s.id}
                      onClick={() => setSolicitudModal({ open: true, solicitud: s })}
                    >
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title">{nombreMiembro(s.member_id) ?? s.solicitante_externo ?? "—"}</div>
                        <div className="tx-secundaria-movil">
                          {t(`cartas.tipoDoc.${s.tipo_carta}`)}
                          {cartaVinculada ? ` · ${cartaVinculada.folio}` : ""}
                          {" · "}{fmtFechaCorta(s.fecha_solicitud)}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing">
                        <span className={`ios-badge ${badgeClaseIOS(s.estado)}`}>{t(`solicitudes.estado.${s.estado}`)}</span>
                      </div>
                      <RowMenu
                        onEdit={() => setSolicitudModal({ open: true, solicitud: s })}
                        extraItems={extra}
                        onDelete={() => setPendingDeleteSol(s)}
                        deleteLabel={s.estado === "nueva" && s.carta_id === null ? t("common.eliminar") : t("solicitudes.cancelar")}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="data-table roomy">
                <div className="thead" style={{ gridTemplateColumns: COLS_SOL }}>
                  <div className="th">{t("actas.colFolio")}</div>
                  <div className="th">{t("solicitudes.colSolicitud")}</div>
                  <div className="th">{t("solicitudes.colFechas")}</div>
                  <div className="th">{t("solicitudes.prioridad")}</div>
                  <div className="th">{t("membresia.colEstado")}</div>
                  <div className="th"></div>
                </div>
                {solicitudes.map((s) => {
                  const cartaVinculada = cartas.find((c) => c.id === s.carta_id) ?? null;
                  const extra: RowMenuItem[] = [];
                  if (!s.carta_id && !["entregada", "cancelada"].includes(s.estado)) {
                    extra.push({ label: t("solicitudes.crearCarta"), onClick: () => crearDesdeSolicitud(s) });
                  }
                  if (cartaVinculada) {
                    extra.push({ label: t("solicitudes.abrirCarta", { folio: cartaVinculada.folio }), onClick: () => abrirCarta(cartaVinculada) });
                  }
                  return (
                    <div
                      className="tr" data-fila
                      key={s.id}
                      style={{ gridTemplateColumns: COLS_SOL, cursor: "pointer" }}
                      onClick={() => setSolicitudModal({ open: true, solicitud: s })}
                    >
                      <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{s.folio}</div>
                      <div className="td" style={{ minWidth: 0 }}>
                        <div className="p-name truncate">{nombreMiembro(s.member_id) ?? s.solicitante_externo ?? "—"}</div>
                        <div className="p-mail truncate">
                          {t(`cartas.tipoDoc.${s.tipo_carta}`)}
                          {cartaVinculada ? ` · ${cartaVinculada.folio}` : ""}
                        </div>
                      </div>
                      <div className="td" style={{ fontSize: 12, color: "var(--text-2)" }}>
                        <div>{fmtFechaCorta(s.fecha_solicitud)}</div>
                        {s.fecha_requerida && (
                          <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                            {t("solicitudes.para")} {fmtFechaCorta(s.fecha_requerida)}
                          </div>
                        )}
                      </div>
                      <div className="td">
                        <span className={`tag ${BADGE_PRIORIDAD[s.prioridad] ?? "otros"}`}>{t(`solicitudes.prioridadOpcion.${s.prioridad}`)}</span>
                      </div>
                      <div className="td">
                        <span className={`tag ${BADGE_SOLICITUD[s.estado] ?? "otros"}`}>{t(`solicitudes.estado.${s.estado}`)}</span>
                      </div>
                      <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          onEdit={() => setSolicitudModal({ open: true, solicitud: s })}
                          extraItems={extra}
                          onDelete={() => setPendingDeleteSol(s)}
                          deleteLabel={s.estado === "nueva" && s.carta_id === null ? t("common.eliminar") : t("solicitudes.cancelar")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : tab === "salida" ? (
          <>
            <div className="tx-head">
              <span className="roster-counters">
                <span>{t("traslados.enProceso")}: <b>{trasladosSalida.filter((s) => !["completado", "cancelado"].includes(s.estado)).length}</b></span>
              </span>
              <button className="btn primary" onClick={() => setTsModal({ open: true, traslado: null })}>
                <IconPlus size={14} /> {t("traslados.registrarSalida")}
              </button>
            </div>
            {trasladosSalida.length === 0 ? (
              <EmptyState
                titulo={t("traslados.aunNoHaySalida")}
                sub={t("traslados.agregaPrimeroSalida")}
                icon={<IconMail size={20} strokeWidth={1.8} />}
              />
            ) : enIPhone ? (
              <div className="ios-listcard">
                {trasladosSalida.map((s) => (
                  <div
                    className="ios-txrow ios-txrow--clickable"
                    data-fila
                    key={s.id}
                    onClick={() => setTsModal({ open: true, traslado: s })}
                  >
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{nombreMiembro(s.member_id) ?? "—"}</div>
                      <div className="tx-secundaria-movil">
                        {s.iglesia_destino ?? t("traslados.sinDestino")} · {fmtFechaCorta(s.fecha_solicitud)}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span className={`ios-badge ${badgeClaseTS(s.estado)}`}>{t(`traslados.estadoTS.${s.estado}`)}</span>
                    </div>
                    <RowMenu
                      onEdit={() => setTsModal({ open: true, traslado: s })}
                      onDelete={() => setPendingDeleteTS(s)}
                      deleteLabel={s.estado === "borrador" ? t("common.eliminar") : t("solicitudes.cancelar")}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="data-table roomy">
                <div className="thead" style={{ gridTemplateColumns: COLS_SOL }}>
                  <div className="th">{t("actas.colFolio")}</div>
                  <div className="th">{t("traslados.colTraslado")}</div>
                  <div className="th">{t("tx.colFecha")}</div>
                  <div className="th">{t("traslados.colConfirmacion")}</div>
                  <div className="th">{t("membresia.colEstado")}</div>
                  <div className="th"></div>
                </div>
                {trasladosSalida.map((s) => (
                  <div
                    className="tr" data-fila
                    key={s.id}
                    style={{ gridTemplateColumns: COLS_SOL, cursor: "pointer" }}
                    onClick={() => setTsModal({ open: true, traslado: s })}
                  >
                    <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{s.folio}</div>
                    <div className="td" style={{ minWidth: 0 }}>
                      <div className="p-name truncate">{nombreMiembro(s.member_id) ?? "—"}</div>
                      <div className="p-mail truncate">{s.iglesia_destino ?? t("traslados.sinDestino")}</div>
                    </div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(s.fecha_solicitud)}</div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                      {s.confirmacion_recibida === 1
                        ? `${t("common.si")}${s.fecha_confirmacion ? ` · ${fmtFechaCorta(s.fecha_confirmacion)}` : ""}`
                        : t("common.no")}
                    </div>
                    <div className="td"><span className={`tag ${BADGE_TS[s.estado] ?? "otros"}`}>{t(`traslados.estadoTS.${s.estado}`)}</span></div>
                    <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        onEdit={() => setTsModal({ open: true, traslado: s })}
                        onDelete={() => setPendingDeleteTS(s)}
                        deleteLabel={s.estado === "borrador" ? t("common.eliminar") : t("solicitudes.cancelar")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : tab === "entrada" ? (
          <>
            <div className="tx-head">
              <span className="roster-counters">
                <span>{t("traslados.enRevision")}: <b>{trasladosEntrada.filter((s) => !["completado", "archivado", "noAceptado"].includes(s.estado)).length}</b></span>
              </span>
              <button className="btn primary" onClick={() => setTeModal({ open: true, traslado: null })}>
                <IconPlus size={14} /> {t("traslados.registrarEntrada")}
              </button>
            </div>
            {trasladosEntrada.length === 0 ? (
              <EmptyState
                titulo={t("traslados.aunNoHayEntrada")}
                sub={t("traslados.agregaPrimeroEntrada")}
                icon={<IconMail size={20} strokeWidth={1.8} />}
              />
            ) : enIPhone ? (
              <div className="ios-listcard">
                {trasladosEntrada.map((s) => (
                  <div
                    className="ios-txrow ios-txrow--clickable"
                    data-fila
                    key={s.id}
                    onClick={() => setTeModal({ open: true, traslado: s })}
                  >
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{s.nombre}</div>
                      <div className="tx-secundaria-movil">
                        {s.iglesia_procedencia ?? "—"}
                        {s.fecha_recepcion ? ` · ${fmtFechaCorta(s.fecha_recepcion)}` : ""}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span className={`ios-badge ${badgeClaseTE(s.estado)}`}>{t(`traslados.estadoTE.${s.estado}`)}</span>
                    </div>
                    <RowMenu
                      onEdit={() => setTeModal({ open: true, traslado: s })}
                      onDelete={() => setPendingDeleteTE(s)}
                      deleteLabel={s.estado === "recibida" && s.member_id === null ? t("common.eliminar") : t("cartas.archivar")}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="data-table roomy">
                <div className="thead" style={{ gridTemplateColumns: COLS_SOL }}>
                  <div className="th">{t("actas.colFolio")}</div>
                  <div className="th">{t("traslados.colProceso")}</div>
                  <div className="th">{t("traslados.fechaRecepcion")}</div>
                  <div className="th">{t("traslados.adjunto")}</div>
                  <div className="th">{t("membresia.colEstado")}</div>
                  <div className="th"></div>
                </div>
                {trasladosEntrada.map((s) => (
                  <div
                    className="tr" data-fila
                    key={s.id}
                    style={{ gridTemplateColumns: COLS_SOL, cursor: "pointer" }}
                    onClick={() => setTeModal({ open: true, traslado: s })}
                  >
                    <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{s.folio}</div>
                    <div className="td" style={{ minWidth: 0 }}>
                      <div className="p-name truncate">{s.nombre}</div>
                      <div className="p-mail truncate">{s.iglesia_procedencia ?? "—"}</div>
                    </div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                      {s.fecha_recepcion ? fmtFechaCorta(s.fecha_recepcion) : "—"}
                    </div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                      {s.adjunto_nombre ? <span className="truncate" title={s.adjunto_nombre}>📎 {s.adjunto_nombre}</span> : "—"}
                    </div>
                    <div className="td"><span className={`tag ${BADGE_TE[s.estado] ?? "otros"}`}>{t(`traslados.estadoTE.${s.estado}`)}</span></div>
                    <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        onEdit={() => setTeModal({ open: true, traslado: s })}
                        onDelete={() => setPendingDeleteTE(s)}
                        deleteLabel={s.estado === "recibida" && s.member_id === null ? t("common.eliminar") : t("cartas.archivar")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : tab === "plantillas" ? (
          <>
            <div className="tx-head">
              <span className="roster-counters">
                <span>{t("plantillas.activas")}: <b>{plantillas.filter((p) => p.activa === 1).length}</b></span>
              </span>
              <button className="btn primary" onClick={() => setPlantillaModal({ open: true, plantilla: null, base: null })}>
                <IconPlus size={14} /> {t("plantillas.nuevaPlantilla")}
              </button>
            </div>
            <div className="data-table roomy">
              <div className="thead" style={{ gridTemplateColumns: "1.6fr 1fr 220px 72px" }}>
                <div className="th">{t("plantillas.colPlantilla")}</div>
                <div className="th">{t("cartas.tipoCarta")}</div>
                <div className="th">{t("membresia.colEstado")}</div>
                <div className="th"></div>
              </div>
              {plantillas.map((p) => (
                <div
                  className="tr" data-fila
                  key={p.id}
                  style={{ gridTemplateColumns: "1.6fr 1fr 220px 72px", cursor: "pointer", opacity: p.activa === 1 ? 1 : 0.65 }}
                  onClick={() => setPlantillaModal({ open: true, plantilla: p, base: null })}
                >
                  <div className="td" style={{ minWidth: 0 }}>
                    <div className="p-name truncate">{p.nombre}</div>
                  </div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    <div className="truncate">{t(`cartas.tipoDoc.${p.tipo}`)}</div>
                  </div>
                  <div className="td" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span className={`tag ${p.activa === 1 ? "activo" : "baja"}`}>
                      {p.activa === 1 ? t("plantillas.activaBadge") : t("plantillas.inactivaBadge")}
                    </span>
                    {p.predeterminada === 1 && <span className="tag diezmo">{t("plantillas.predeterminadaBadge")}</span>}
                  </div>
                  <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      onEdit={() => setPlantillaModal({ open: true, plantilla: p, base: null })}
                      extraItems={[
                        { label: t("cartas.duplicar"), onClick: () => setPlantillaModal({ open: true, plantilla: null, base: p }) },
                        { label: p.activa === 1 ? t("plantillas.desactivar") : t("plantillas.activar"), onClick: () => togglePlantillaActiva(p) },
                        ...(p.predeterminada !== 1 ? [{ label: t("plantillas.marcarPredeterminada"), onClick: () => marcarPredeterminada(p) }] : []),
                      ]}
                      onDelete={() => setPendingDeletePl(p)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="tx-head" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="search-input-wrap" style={{ flex: 1, minWidth: 220, maxWidth: 340 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input
                  className="form-input"
                  placeholder={textoCorto(t("common.buscarCorto"), t("cartas.buscarPlaceholder"))}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select className="form-input" style={{ width: "auto" }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label={t("membresia.colEstado")}>
                <option value="todas">{t("cartas.filtroTodosEstados")}</option>
                {ESTADOS_CARTA.map((es) => (
                  <option key={es} value={es}>{t(`cartas.estado.${es}`)}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: "auto" }} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label={t("cartas.tipoCarta")}>
                <option value="todos">{t("cartas.filtroTodosTipos")}</option>
                {TIPOS_CARTA.map((ti) => (
                  <option key={ti} value={ti}>{t(`cartas.tipoDoc.${ti}`)}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: "auto", maxWidth: 180 }} value={filtroMiembro} onChange={(e) => setFiltroMiembro(e.target.value)} aria-label={t("cartas.filtroMiembro")}>
                <option value="todos">{t("cartas.filtroMiembro")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              <input type="date" className="form-input" style={{ width: "auto" }} value={desde} onChange={(e) => setDesde(e.target.value)} aria-label={t("cartas.fechaDesde")} title={t("cartas.fechaDesde")} />
              <input type="date" className="form-input" style={{ width: "auto" }} value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label={t("cartas.fechaHasta")} title={t("cartas.fechaHasta")} />
            </div>

            {visibles.length === 0 ? (
              <EmptyState
                titulo={cartas.length === 0 ? t("cartas.aunNoHay") : t("cartas.sinResultados")}
                sub={cartas.length === 0 ? t("cartas.agregaPrimera") : t("cartas.sinResultadosSub")}
                icon={<IconMail size={20} strokeWidth={1.8} />}
              />
            ) : enIPhone ? (
              <div className="ios-listcard">
                {pagina.map((c) => (
                  <div
                    className="ios-txrow ios-txrow--clickable"
                    data-fila
                    key={c.id}
                    onClick={() => abrirCarta(c)}
                  >
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{c.destinatario_nombre}</div>
                      <div className="tx-secundaria-movil">
                        {t(`cartas.tipoDoc.${c.tipo}`)}{c.asunto ? ` · ${c.asunto}` : ""} · {fmtFechaCorta(c.fecha_emision)}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <span className={`ios-badge ${badgeClaseIOS(c.estado)}`}>{t(`cartas.estado.${c.estado}`)}</span>
                    </div>
                    <RowMenu
                      onEdit={() => abrirCarta(c)}
                      extraItems={(() => {
                        const extra: RowMenuItem[] = [
                          { label: t("cartas.imprimirPdf"), onClick: () => imprimir(c) },
                          { label: t("cartas.duplicar"), onClick: () => duplicarCarta(c) },
                        ];
                        if (!["entregada", "archivada", "cancelada"].includes(c.estado)) {
                          extra.push({ label: t("cartas.marcarEntregadaAccion"), onClick: () => setConfirmAction({ tipo: "entregar", carta: c }) });
                          extra.push({ label: t("cartas.cancelarAccion"), danger: true, onClick: () => setConfirmAction({ tipo: "cancelar", carta: c }) });
                        }
                        if (["archivada", "cancelada"].includes(c.estado)) {
                          extra.push({ label: t("cartas.restaurar"), onClick: () => restaurarCarta(c) });
                        }
                        return extra;
                      })()}
                      onDelete={() => (c.estado === "borrador" ? setPendingDelete(c) : archivarCarta(c))}
                      deleteLabel={c.estado === "borrador" ? t("common.eliminar") : t("cartas.archivar")}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="data-table roomy tabla-doc">
                <div className="thead" style={{ gridTemplateColumns: COLS }}>
                  <div className="th">{t("actas.colFolio")}</div>
                  <div className="th">{t("cartas.colDocumento")}</div>
                  <div className="th">{t("tx.colFecha")}</div>
                  <div className="th">{t("membresia.colEstado")}</div>
                  <div className="th">{t("cartas.colModificada")}</div>
                  <div className="th"></div>
                </div>
                {pagina.map((c) => (
                  <div
                    className="tr" data-fila
                    key={c.id}
                    style={{ gridTemplateColumns: COLS, cursor: "pointer" }}
                    onClick={() => abrirCarta(c)}
                  >
                    <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{c.folio}</div>
                    <div className="td" style={{ minWidth: 0 }}>
                      <div className="p-name truncate">{c.destinatario_nombre}</div>
                      <div className="p-mail truncate">{t(`cartas.tipoDoc.${c.tipo}`)}{c.asunto ? ` · ${c.asunto}` : ""}</div>
                    </div>
                    <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(c.fecha_emision)}</div>
                    <div className="td"><span className={`tag ${BADGE_ESTADO[c.estado] ?? "otros"}`}>{t(`cartas.estado.${c.estado}`)}</span></div>
                    <div className="td" style={{ fontSize: 12, color: "var(--text-3)" }}>{c.modificado_en.slice(0, 10)}</div>
                    <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                      <span className="row-actions">
                        <span className="row-icon-btn" title={t("cartas.imprimirPdf")} onClick={() => imprimir(c)}>
                          <IconPrinter size={13} strokeWidth={2} />
                        </span>
                      </span>
                      <RowMenu
                        onEdit={() => abrirCarta(c)}
                        extraItems={(() => {
                          const extra: RowMenuItem[] = [
                            { label: t("cartas.imprimirPdf"), onClick: () => imprimir(c) },
                            { label: t("cartas.duplicar"), onClick: () => duplicarCarta(c) },
                          ];
                          if (!["entregada", "archivada", "cancelada"].includes(c.estado)) {
                            extra.push({ label: t("cartas.marcarEntregadaAccion"), onClick: () => setConfirmAction({ tipo: "entregar", carta: c }) });
                            extra.push({ label: t("cartas.cancelarAccion"), danger: true, onClick: () => setConfirmAction({ tipo: "cancelar", carta: c }) });
                          }
                          if (["archivada", "cancelada"].includes(c.estado)) {
                            extra.push({ label: t("cartas.restaurar"), onClick: () => restaurarCarta(c) });
                          }
                          return extra;
                        })()}
                        onDelete={() => (c.estado === "borrador" ? setPendingDelete(c) : archivarCarta(c))}
                        deleteLabel={c.estado === "borrador" ? t("common.eliminar") : t("cartas.archivar")}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={t("cartas.eliminarTitulo", { folio: pendingDelete.folio })}
          message={t("cartas.eliminarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.tipo === "entregar"
              ? t("cartas.entregarTitulo", { folio: confirmAction.carta.folio })
              : t("cartas.cancelarTitulo", { folio: confirmAction.carta.folio })
          }
          message={
            confirmAction.tipo === "entregar"
              ? parseFirmas(confirmAction.carta.firmas).some((f) => !f.firmado)
                ? t("cartas.firmasPendientesMensaje")
                : t("cartas.entregarMensaje")
              : t("cartas.cancelarMensaje")
          }
          confirmLabel={confirmAction.tipo === "entregar" ? t("cartas.marcarEntregada") : t("cartas.cancelarAccion")}
          danger={confirmAction.tipo === "cancelar"}
          onConfirm={() => {
            cambiarEstadoCarta(confirmAction.carta, confirmAction.tipo === "entregar" ? "entregada" : "cancelada");
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {pendingDeleteSol && (
        <ConfirmDialog
          title={
            pendingDeleteSol.estado === "nueva" && pendingDeleteSol.carta_id === null
              ? t("solicitudes.eliminarTitulo", { folio: pendingDeleteSol.folio })
              : t("solicitudes.cancelarTitulo", { folio: pendingDeleteSol.folio })
          }
          message={
            pendingDeleteSol.estado === "nueva" && pendingDeleteSol.carta_id === null
              ? t("solicitudes.eliminarMensaje")
              : t("solicitudes.cancelarMensaje")
          }
          confirmLabel={
            pendingDeleteSol.estado === "nueva" && pendingDeleteSol.carta_id === null
              ? t("common.eliminar")
              : t("solicitudes.cancelar")
          }
          danger
          onConfirm={eliminarOCancelarSolicitud}
          onCancel={() => setPendingDeleteSol(null)}
        />
      )}

      {tsModal.open && (
        <TrasladoSalidaModal
          church={church}
          traslado={tsModal.traslado}
          members={members.filter((m) => m.activo === 1 || m.id === tsPreMemberId)}
          preMemberId={tsPreMemberId}
          onClose={() => { setTsModal({ open: false, traslado: null }); setTsPreMemberId(null); }}
          onSaved={() => { setRefrescoLocal((k) => k + 1); onChanged(); }}
          onAbrirCarta={abrirCartaPorId}
        />
      )}

      {teModal.open && (
        <TrasladoEntradaModal
          church={church}
          traslado={teModal.traslado}
          onClose={() => setTeModal({ open: false, traslado: null })}
          onSaved={() => { setRefrescoLocal((k) => k + 1); onChanged(); }}
        />
      )}

      {pendingDeleteTS && (
        <ConfirmDialog
          title={
            pendingDeleteTS.estado === "borrador"
              ? t("solicitudes.eliminarTitulo", { folio: pendingDeleteTS.folio })
              : t("solicitudes.cancelarTitulo", { folio: pendingDeleteTS.folio })
          }
          message={pendingDeleteTS.estado === "borrador" ? t("traslados.eliminarMensaje") : t("traslados.cancelarMensaje")}
          confirmLabel={pendingDeleteTS.estado === "borrador" ? t("common.eliminar") : t("solicitudes.cancelar")}
          danger
          onConfirm={eliminarOCancelarTS}
          onCancel={() => setPendingDeleteTS(null)}
        />
      )}

      {pendingDeleteTE && (
        <ConfirmDialog
          title={
            pendingDeleteTE.estado === "recibida" && pendingDeleteTE.member_id === null
              ? t("solicitudes.eliminarTitulo", { folio: pendingDeleteTE.folio })
              : t("traslados.archivarTitulo", { folio: pendingDeleteTE.folio })
          }
          message={
            pendingDeleteTE.estado === "recibida" && pendingDeleteTE.member_id === null
              ? t("traslados.eliminarMensaje")
              : t("traslados.archivarMensaje")
          }
          confirmLabel={
            pendingDeleteTE.estado === "recibida" && pendingDeleteTE.member_id === null
              ? t("common.eliminar")
              : t("cartas.archivar")
          }
          danger={pendingDeleteTE.estado === "recibida" && pendingDeleteTE.member_id === null}
          onConfirm={eliminarOArchivarTE}
          onCancel={() => setPendingDeleteTE(null)}
        />
      )}

      {plantillaModal.open && (
        <PlantillaModal
          church={church}
          plantilla={plantillaModal.plantilla}
          base={plantillaModal.base}
          onClose={() => setPlantillaModal({ open: false, plantilla: null, base: null })}
          onSaved={() => setRefrescoLocal((k) => k + 1)}
        />
      )}

      {pendingDeletePl && (
        <ConfirmDialog
          title={t("plantillas.eliminarTitulo", { nombre: pendingDeletePl.nombre })}
          message={t("plantillas.eliminarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={eliminarPlantilla}
          onCancel={() => setPendingDeletePl(null)}
        />
      )}

      {solicitudModal.open && (
        <SolicitudModal
          church={church}
          solicitud={solicitudModal.solicitud}
          members={members}
          onClose={() => setSolicitudModal({ open: false, solicitud: null })}
          onSaved={() => {
            setRefrescoLocal((k) => k + 1);
            onChanged();
          }}
        />
      )}

      {(pendingTab !== null || pendingAbrir !== null) && (
        <ConfirmDialog
          title={t("servicios.cambiosSinGuardarTitulo")}
          message={t("cartas.cambiosSinGuardarMensaje")}
          confirmLabel={t("servicios.descartarCambios")}
          danger
          onConfirm={() => {
            editorDirtyRef.current = false;
            if (pendingAbrir) {
              setEditando(pendingAbrir);
              setTab("nueva");
              setPendingAbrir(null);
            } else if (pendingTab) {
              if (pendingTab !== "nueva") setEditando(null);
              setTab(pendingTab);
              setPendingTab(null);
            }
          }}
          onCancel={() => { setPendingTab(null); setPendingAbrir(null); }}
        />
      )}

      {hojaCrearAbierta && (
        <ActionSheet
          options={hojaCrearOpciones}
          onCancel={() => setHojaCrearAbierta(false)}
        />
      )}
    </>
  );
}
