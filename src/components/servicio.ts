/**
 * servicio.ts — el estado y el guardado del culto, sin una sola línea de
 * pintura.
 *
 * Vivía dentro de `ServicioModal.tsx`. Se sacó aquí cuando el teléfono dejó de
 * usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar el MISMO formulario, y con la lógica duplicada la segunda copia se
 * habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, el aviso de culto vacío que
 * se confirma pero no bloquea, el snapshot de cambios sin guardar, los
 * mutadores del roster y el `NewServicio` que se escribe son los de siempre,
 * movidos tal cual.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buscarPosiblesDuplicados, getServicioAsistencia, insertServicio, insertVisitanteComoMiembro,
  marcarActividadRealizada,
  listMembersAsistencia, parseVisitantes, updateServicio,
  type AsistenciaEntry, type Church, type NewServicio, type Servicio, type ServicioVisitante,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";

export const RAZONES_AUSENCIA = [
  "justificada", "enfermedad", "trabajo", "viaje", "emergencia", "desconocida", "otra",
] as const;

/** Estado de un miembro en el roster. Presentes y Ausentes son vistas
 *  derivadas de este mismo mapa: un miembro jamás puede estar en ambas. */
export interface RosterState {
  nombre: string;
  presente: boolean;
  razon: string;
  razonOtra: string;
  seguimiento: boolean;
  /** Estado en el padrón (visitante/enProceso pintan etiqueta); ausente en
   *  servicios guardados, donde el roster es un snapshot histórico. */
  estadoMiembro?: string;
}

export type Roster = Map<number, RosterState>;

export function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function numeroSano(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const VISITANTE_VACIO: ServicioVisitante = {
  nombre: "", telefono: null, correo: null, invitado_por: null, primera_visita: true, notas: null,
};

export interface PropsServicio {
  church: Church;
  /** null = servicio nuevo. */
  servicio: Servicio | null;
  /** Valores iniciales al crear (puente desde la Agenda). */
  prefill?: { fecha?: string; tipo?: string; dirige?: string; actividadId?: number } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function useServicio({ church, servicio, prefill, onClose, onSaved }: PropsServicio) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDesmarcar, setConfirmDesmarcar] = useState(false);
  const [confirmVacio, setConfirmVacio] = useState(false);
  // En un culto nuevo los motivos de ausencia se anotan DESPUÉS de contar:
  // mientras todos arrancan ausentes, esos controles son una pared que no
  // sirve. Al editar un culto guardado las ausencias ya son reales y los
  // controles aparecen desde el principio.
  const [anotarAusencias, setAnotarAusencias] = useState(servicio !== null);

  const [fecha, setFecha] = useState(servicio?.fecha ?? prefill?.fecha ?? hoyLocal());
  const [tipo, setTipo] = useState(servicio?.tipo ?? prefill?.tipo ?? "dominical");
  const [dirige, setDirige] = useState(servicio?.dirige ?? prefill?.dirige ?? "");
  const [predica, setPredica] = useState(servicio?.predica ?? "");
  const [tituloMensaje, setTituloMensaje] = useState(servicio?.titulo_mensaje ?? "");
  const [textoBiblico, setTextoBiblico] = useState(servicio?.texto_biblico ?? "");
  const [resumenMensaje, setResumenMensaje] = useState(servicio?.resumen_mensaje ?? "");
  const [participaciones, setParticipaciones] = useState<string[]>(() => (servicio ? parseNombres(servicio.participaciones) : []));
  const [temaEscuela, setTemaEscuela] = useState(servicio?.tema_escuela ?? "");
  const [maestroEscuela, setMaestroEscuela] = useState(servicio?.maestro_escuela ?? "");
  const [roster, setRoster] = useState<Roster>(new Map());
  const [rosterLoading, setRosterLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [visitantes, setVisitantes] = useState<ServicioVisitante[]>(() => (servicio ? parseVisitantes(servicio.visitantes) : []));
  const [ninos, setNinos] = useState(servicio?.ninos ?? 0);
  const [jovenes, setJovenes] = useState(servicio?.jovenes ?? 0);
  const [adultos, setAdultos] = useState(servicio?.adultos ?? 0);
  const [eventos, setEventos] = useState(servicio?.eventos ?? "");

  // Snapshot inicial serializado para detectar cambios sin guardar sin tener
  // que instrumentar cada campo.
  const inicialRef = useRef<string | null>(null);

  const serializar = useCallback((r: Roster, vs: ServicioVisitante[], campos: unknown[]) =>
    JSON.stringify([Array.from(r.entries()), vs, campos]), []);

  const camposActuales = [fecha, tipo, dirige, predica, tituloMensaje, textoBiblico, resumenMensaje,
    participaciones, temaEscuela, maestroEscuela, ninos, jovenes, adultos, eventos];

  useEffect(() => {
    let cancelado = false;
    setRosterLoading(true);
    (async () => {
      const m: Roster = new Map();
      if (servicio) {
        // Editar: cargar exactamente el snapshot guardado. Miembros cuyo
        // estado cambió después del servicio siguen aquí — es histórico.
        const rows = await getServicioAsistencia(servicio.id);
        for (const a of rows) {
          m.set(a.member_id, {
            nombre: a.nombre_snapshot,
            presente: a.presente,
            razon: a.razon ?? "",
            razonOtra: a.razon_otra ?? "",
            seguimiento: a.seguimiento,
          });
        }
      } else {
        // Nuevo: todos los miembros con estado Activo entran como ausentes;
        // la secretaria solo marca a los presentes.
        const activos = await listMembersAsistencia(church.id);
        for (const a of activos) {
          m.set(a.id, { nombre: a.nombre, presente: false, razon: "", razonOtra: "", seguimiento: false, estadoMiembro: a.estado });
        }
      }
      if (cancelado) return;
      setRoster(m);
      setRosterLoading(false);
    })().catch((e) => {
      console.error(e);
      if (!cancelado) setRosterLoading(false);
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, servicio?.id]);

  // El snapshot inicial se fija cuando el roster terminó de cargar.
  useEffect(() => {
    if (!rosterLoading && inicialRef.current === null) {
      inicialRef.current = serializar(roster, visitantes, camposActuales);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterLoading]);

  function hayCambios(): boolean {
    if (inicialRef.current === null) return false;
    return serializar(roster, visitantes, camposActuales) !== inicialRef.current;
  }

  function pedirCerrar() {
    if (saving) return;
    // Con un diálogo de confirmación abierto, Escape lo cierra a él (su
    // propio hook), no al modal completo.
    if (confirmClose || confirmDesmarcar || confirmVacio) return;
    if (hayCambios()) setConfirmClose(true);
    else onClose();
  }

  // ----- Mutadores del roster (una sola fuente de datos) -----
  const toggle = useCallback((id: number) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      // Al marcar presente se limpian razón y seguimiento (ya no está ausente);
      // al desmarcar, vuelve a Ausentes sin razón.
      m.set(id, prev.presente
        ? { ...prev, presente: false }
        : { ...prev, presente: true, razon: "", razonOtra: "", seguimiento: false });
      return m;
    });
  }, []);
  const setRazon = useCallback((id: number, v: string) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, razon: v, razonOtra: v === "otra" ? prev.razonOtra : "" });
      return m;
    });
  }, []);
  const setRazonOtra = useCallback((id: number, v: string) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, razonOtra: v });
      return m;
    });
  }, []);
  const setSeguimiento = useCallback((id: number, v: boolean) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, seguimiento: v });
      return m;
    });
  }, []);

  // ----- Vistas derivadas -----
  const q = busqueda.trim().toLowerCase();
  const entradas = useMemo(() => Array.from(roster.entries()), [roster]);
  // La búsqueda solo oculta filas: nunca toca el estado del mapa.
  const visibles = useMemo(
    () => (q ? entradas.filter(([, e]) => e.nombre.toLowerCase().includes(q)) : entradas),
    [entradas, q]
  );
  const presentesVisibles = visibles.filter(([, e]) => e.presente);
  const ausentesVisibles = visibles.filter(([, e]) => !e.presente);
  const totalPresentes = entradas.reduce((s, [, e]) => s + (e.presente ? 1 : 0), 0);

  function marcarVisibles(presente: boolean) {
    setRoster((r) => {
      const m = new Map(r);
      for (const [id] of visibles) {
        const prev = m.get(id);
        if (!prev) continue;
        m.set(id, presente
          ? { ...prev, presente: true, razon: "", razonOtra: "", seguimiento: false }
          : { ...prev, presente: false });
      }
      return m;
    });
  }

  async function cargarActivos() {
    // Solo para servicios guardados antes del roster (snapshot vacío).
    const activos = await listMembersAsistencia(church.id);
    setRoster((r) => {
      const m = new Map(r);
      for (const a of activos) {
        if (!m.has(a.id)) m.set(a.id, { nombre: a.nombre, presente: false, razon: "", razonOtra: "", seguimiento: false, estadoMiembro: a.estado });
      }
      return m;
    });
  }

  // ----- Visitantes -----
  // Aviso de posible duplicado al pasar un visitante al padrón: guarda el
  // índice ya advertido; el segundo clic procede (patrón de dos clics).
  const [padronConfirma, setPadronConfirma] = useState<number | null>(null);

  function setVisitante(i: number, patch: Partial<ServicioVisitante>) {
    if (padronConfirma === i) setPadronConfirma(null);
    setVisitantes((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  /** Da de alta al visitante en Membresía (estado "visitante"), lo pasa al
   *  roster como presente y quita la fila de texto libre. El alta se escribe
   *  de inmediato; la asistencia se guarda con el servicio. */
  async function agregarAlPadron(i: number) {
    const v = visitantes[i];
    if (!v || !v.nombre.trim()) { setError(t("servicios.visitanteSinNombre")); return; }
    setError(null);
    try {
      if (padronConfirma !== i) {
        const dups = await buscarPosiblesDuplicados(church.id, {
          nombre: v.nombre, telefono: v.telefono, correo: v.correo,
        });
        if (dups.length > 0) {
          setPadronConfirma(i);
          setError(t("servicios.padronPosibleDuplicado", {
            nombres: dups.slice(0, 3).map((d) => d.nombre).join(", "),
          }));
          return;
        }
      }
      const nuevoId = await insertVisitanteComoMiembro(church.id, v, fecha || hoyLocal());
      if (nuevoId != null) {
        setRoster((r) => {
          const m = new Map(r);
          m.set(nuevoId, {
            nombre: v.nombre.trim(), presente: true, razon: "", razonOtra: "",
            seguimiento: false, estadoMiembro: "visitante",
          });
          return m;
        });
      }
      setVisitantes((vs) => vs.filter((_, j) => j !== i));
      setPadronConfirma(null);
      playSound("guardado");
      showToast(t("servicios.padronAgregado", { nombre: v.nombre.trim() }));
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

  async function guardar(aceptaVacio = false) {
    setError(null);
    if (!fecha) { setError(t("servicios.fechaObligatoria")); return; }

    // Con nadie marcado y los contadores en cero, la app no puede distinguir
    // "nadie vino" de "no se tomó la asistencia": guardado así, el culto queda
    // con asistencia cero REAL y todos los miembros entran como ausentes en
    // Ausencias frecuentes y en el seguimiento pastoral. Se confirma, no se
    // bloquea: un culto legítimamente vacío existe.
    if (!aceptaVacio && totalPresentes === 0 && ninos + jovenes + adultos === 0) {
      setConfirmVacio(true);
      return;
    }

    // Visitante con datos pero sin nombre → error; filas totalmente vacías se descartan.
    const visitantesLimpios: ServicioVisitante[] = [];
    for (const v of visitantes) {
      const tieneDatos = [v.telefono, v.correo, v.invitado_por, v.notas].some((x) => (x ?? "").trim());
      if (!v.nombre.trim()) {
        if (tieneDatos) { setError(t("servicios.visitanteSinNombre")); return; }
        continue;
      }
      visitantesLimpios.push({
        nombre: v.nombre.trim(),
        telefono: (v.telefono ?? "").trim() || null,
        correo: (v.correo ?? "").trim() || null,
        invitado_por: (v.invitado_por ?? "").trim() || null,
        primera_visita: v.primera_visita,
        notas: (v.notas ?? "").trim() || null,
      });
    }

    // Aserción defensiva: el modelo hace imposible presente-y-ausente a la
    // vez, y el Map hace imposible duplicar; verifícalo de todas formas.
    const ids = new Set<number>();
    const asistencia: AsistenciaEntry[] = [];
    for (const [id, e] of roster) {
      if (ids.has(id)) throw new Error(`roster duplicado: ${id}`);
      ids.add(id);
      asistencia.push({
        member_id: id,
        presente: e.presente,
        razon: e.presente ? null : e.razon || null,
        razon_otra: e.presente ? null : (e.razon === "otra" ? e.razonOtra.trim() || null : null),
        seguimiento: e.presente ? false : e.seguimiento,
        nombre_snapshot: e.nombre,
      });
    }

    setSaving(true);
    try {
      const payload: NewServicio = {
        fecha,
        tipo,
        dirige: dirige.trim() || null,
        predica: predica.trim() || null,
        titulo_mensaje: tituloMensaje.trim() || null,
        texto_biblico: textoBiblico.trim() || null,
        resumen_mensaje: resumenMensaje.trim() || null,
        participaciones,
        tema_escuela: temaEscuela.trim() || null,
        maestro_escuela: maestroEscuela.trim() || null,
        asistencia,
        visitantes: visitantesLimpios,
        ninos,
        jovenes,
        adultos,
        eventos: eventos.trim() || null,
      };
      if (servicio) {
        await updateServicio(servicio.id, church.id, payload);
      } else {
        const nuevoServicioId = await insertServicio(church.id, payload);
        // Puente Agenda→Bitácora: la actividad de origen queda realizada y
        // enlazada. Nunca frena el guardado del servicio.
        if (prefill?.actividadId) {
          try { await marcarActividadRealizada(prefill.actividadId, church.id, nuevoServicioId); } catch { /* noop */ }
        }
      }
      playSound("guardado");
      showToast(t("servicios.toastGuardado"));
      inicialRef.current = null; // ya no hay cambios sin guardar
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }


  const totalConteo = ninos + jovenes + adultos;

  return {
    saving, error, setError, confirmClose, setConfirmClose,
    confirmDesmarcar, setConfirmDesmarcar, confirmVacio, setConfirmVacio,
    anotarAusencias, setAnotarAusencias,
    fecha, setFecha, tipo, setTipo, dirige, setDirige, predica, setPredica,
    tituloMensaje, setTituloMensaje, textoBiblico, setTextoBiblico, resumenMensaje, setResumenMensaje,
    participaciones, setParticipaciones, temaEscuela, setTemaEscuela, maestroEscuela, setMaestroEscuela,
    roster, rosterLoading, busqueda, setBusqueda,
    visitantes, setVisitantes, padronConfirma, setVisitante, agregarAlPadron,
    ninos, setNinos, jovenes, setJovenes, adultos, setAdultos, totalConteo,
    eventos, setEventos,
    entradas, visibles, presentesVisibles, ausentesVisibles, totalPresentes,
    toggle, setRazon, setRazonOtra, setSeguimiento, marcarVisibles, cargarActivos,
    hayCambios, pedirCerrar, guardar,
  };
}
