/**
 * actividad.ts — el estado y el guardado de una actividad de la Agenda, sin
 * una sola línea de pintura.
 *
 * Vivía dentro de `ActividadModal.tsx`. Se sacó aquí cuando el teléfono dejó
 * de usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar el MISMO formulario —el más grande de la app, con la repetición y
 * los recordatorios dentro—, y con la lógica duplicada la segunda copia se
 * habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. Las seis validaciones, la construcción
 * de la recurrencia y la detección de choques de horario —con su "guardar de
 * todas formas"— son las de siempre, movidas tal cual.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RECURRENCIA_NINGUNA, hoyISO, insertActividad, listMembersRoster,
  parseRecordatorios, parseRecurrencia, updateActividad,
  type Actividad, type Church, type NewActividad, type RecFin, type Recurrencia, type RecurrenciaTipo,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";

/** Un choque de horario detectado (lo calcula la página, que tiene todas las ocurrencias). */
export interface ConflictoAgenda {
  nombre: string;
  detalle: string;
}

export const REC_TIPOS: RecurrenciaTipo[] = ["ninguna", "semanal", "quincenal", "mensual", "anual", "personalizada"];

/** Presets de recordatorio: días de anticipación → clave i18n. */
export const RECORDATORIOS_PRESET: { offset: number; clave: string }[] = [
  { offset: 0, clave: "mismoDia" },
  { offset: 1, clave: "unDiaAntes" },
  { offset: 2, clave: "dosDiasAntes" },
  { offset: 7, clave: "unaSemanaAntes" },
];

export interface PropsActividad {
  church: Church;
  /** null = actividad nueva. */
  actividad: Actividad | null;
  /** Cuando se abre para duplicar: precarga los campos de esta actividad
   *  pero guarda como una NUEVA (actividad debe ser null). */
  duplicarDe?: Actividad | null;
  /** Fecha preseleccionada (YYYY-MM-DD) al crear desde una celda del calendario. */
  fechaInicial?: string | null;
  /** Oculta la sección de repetición (p. ej. al editar "solo esta" ocurrencia). */
  mostrarRecurrencia?: boolean;
  /** Título personalizado (para editar el alcance de una serie). */
  tituloModo?: string;
  /** Si se provee, se llama en vez de insertar/actualizar (la página decide qué hacer). */
  onSubmitOverride?: (payload: NewActividad) => Promise<void>;
  /** Detección de conflictos de horario para la fecha/lugar del payload. */
  detectarConflictos?: (payload: NewActividad) => ConflictoAgenda[];
  onClose: () => void;
  onSaved: () => void;
}

/** Los seis campos que pueden bloquear el guardado. */
export type CampoActividad =
  | "nombre" | "fecha" | "horaInicio" | "horaFin" | "tipoPersonalizado" | "recHasta";

export function useActividad({
  church, actividad, duplicarDe, fechaInicial, mostrarRecurrencia = true, tituloModo,
  onSubmitOverride, detectarConflictos, onClose, onSaved,
}: PropsActividad) {
  const { t } = useTranslation();
  const editar = actividad !== null;
  const base = actividad ?? duplicarDe ?? null;
  const recBase = useMemo(() => parseRecurrencia(base?.recurrencia), [base]);

  const [nombre, setNombre] = useState(
    base ? (duplicarDe && !actividad ? `${base.nombre} ${t("agenda.sufijoCopia")}` : base.nombre) : ""
  );
  const [tipo, setTipo] = useState(base?.tipo ?? "cultoRegular");
  const [tipoPersonalizado, setTipoPersonalizado] = useState(base?.tipo_personalizado ?? "");
  const [fecha, setFecha] = useState(base?.fecha ?? fechaInicial ?? hoyISO());
  const [diaCompleto, setDiaCompleto] = useState(base ? base.dia_completo === 1 : false);
  const [horaInicio, setHoraInicio] = useState(base?.hora_inicio ?? "");
  const [horaFin, setHoraFin] = useState(base?.hora_fin ?? "");
  const [lugar, setLugar] = useState(base?.lugar ?? "");
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? "");
  // "" = sin asignar (el valor por omisión); "externa" = persona de fuera con
  // nombre libre. Antes el vacío ERA "otra persona (externa)": el caso raro
  // como valor por defecto, con su campo de nombre abierto desde el inicio.
  const [responsableMemberId, setResponsableMemberId] = useState<string>(
    base?.responsable_member_id != null
      ? String(base.responsable_member_id)
      : base?.responsable_persona
        ? "externa"
        : ""
  );
  const [responsablePersona, setResponsablePersona] = useState(base?.responsable_persona ?? "");
  const [responsableMinisterio, setResponsableMinisterio] = useState(base?.responsable_ministerio ?? "");
  const [invitado, setInvitado] = useState(base?.invitado ?? "");
  const [contacto, setContacto] = useState(base?.contacto ?? "");
  const [estado, setEstado] = useState(
    duplicarDe && !actividad ? "programada" : (base?.estado ?? "programada")
  );
  const [esFechaImportante, setEsFechaImportante] = useState(base ? base.es_fecha_importante === 1 : false);
  const [recordatorios, setRecordatorios] = useState<number[]>(parseRecordatorios(base?.recordatorios));

  // ---- Recurrencia ----
  const [recTipo, setRecTipo] = useState<RecurrenciaTipo>(recBase.tipo);
  const [recDias, setRecDias] = useState<number[]>(recBase.diasSemana);
  const [recIntervalo, setRecIntervalo] = useState(recBase.intervalo);
  const [recFinTipo, setRecFinTipo] = useState<RecFin["tipo"]>(recBase.fin.tipo);
  const [recHasta, setRecHasta] = useState(recBase.fin.tipo === "hasta" ? recBase.fin.hasta : "");
  const [recConteo, setRecConteo] = useState(recBase.fin.tipo === "conteo" ? recBase.fin.conteo : 10);

  const [miembros, setMiembros] = useState<{ id: number; nombre: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el error, para que el iPhone pueda poner el aviso al pie
     de SU sección en vez de todo junto al final. Mac sigue leyendo `error` y
     no se entera de esto. */
  const [campoError, setCampoError] = useState<CampoActividad | null>(null);
  const [conflictos, setConflictos] = useState<ConflictoAgenda[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    listMembersRoster(church.id)
      .then((m) => { if (!cancelado) setMiembros(m); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  // Estas dos no son un catálogo pelado: llevan centinelas propios
  // ("sin asignar", "externa") que no salen de ninguna lista.
  const opcResponsable = [
    { value: "", label: t("agenda.responsableSinAsignar") },
    ...miembros.map((m) => ({ value: String(m.id), label: m.nombre })),
    { value: "externa", label: t("agenda.responsableExterno") },
  ];
  const opcRecFin = [
    { value: "nunca", label: t("agenda.finNunca") },
    { value: "hasta", label: t("agenda.finHasta") },
    { value: "conteo", label: t("agenda.finConteo") },
  ];

  const diasSemana = t("agenda.diasSemana", { returnObjects: true }) as string[];
  const muestraDias = recTipo === "semanal" || recTipo === "personalizada";
  const titulo = tituloModo ?? (editar ? t("agenda.editarActividad") : t("agenda.nuevaActividad"));
  const etiquetaGuardar = editar || onSubmitOverride ? t("common.guardarCambios") : t("agenda.guardarActividad");

  function toggleDia(d: number) {
    setRecDias((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }
  function toggleRecordatorio(off: number) {
    setRecordatorios((prev) => prev.includes(off) ? prev.filter((x) => x !== off) : [...prev, off].sort((a, b) => a - b));
  }

  function construirRecurrencia(): Recurrencia {
    if (!mostrarRecurrencia || recTipo === "ninguna") return { ...RECURRENCIA_NINGUNA };
    const fin: RecFin = recFinTipo === "hasta"
      ? { tipo: "hasta", hasta: recHasta }
      : recFinTipo === "conteo"
        ? { tipo: "conteo", conteo: Math.max(1, recConteo) }
        : { tipo: "nunca" };
    const intervalo = recTipo === "personalizada" ? Math.max(1, recIntervalo) : recTipo === "quincenal" ? 2 : 1;
    const diasSem = muestraDias ? recDias : [];
    return { tipo: recTipo, intervalo, diasSemana: diasSem, fin };
  }

  /** Devuelve el campo que falla y su mensaje, o null si todo está bien. */
  function validar(): { campo: CampoActividad; msg: string } | null {
    if (!nombre.trim()) return { campo: "nombre", msg: t("agenda.errNombre") };
    if (!fecha) return { campo: "fecha", msg: t("agenda.errFecha") };
    if (!diaCompleto && !horaInicio) return { campo: "horaInicio", msg: t("agenda.errHoraInicio") };
    if (!diaCompleto && horaInicio && horaFin && horaFin < horaInicio) return { campo: "horaFin", msg: t("agenda.errHoraFin") };
    if (tipo === "otra" && !tipoPersonalizado.trim()) return { campo: "tipoPersonalizado", msg: t("agenda.errTipoPersonalizado") };
    if (mostrarRecurrencia && recTipo !== "ninguna" && recFinTipo === "hasta" && recHasta && recHasta < fecha) {
      return { campo: "recHasta", msg: t("agenda.errFinRepeticion") };
    }
    return null;
  }

  function armarPayload(): NewActividad {
    const memberId = responsableMemberId && responsableMemberId !== "externa"
      ? Number(responsableMemberId) : null;
    return {
      nombre, tipo, tipo_personalizado: tipoPersonalizado, fecha,
      hora_inicio: horaInicio, hora_fin: horaFin, dia_completo: diaCompleto,
      lugar, descripcion,
      responsable_member_id: memberId,
      responsable_persona: responsableMemberId === "externa" ? responsablePersona : "",
      responsable_ministerio: responsableMinisterio,
      invitado, contacto, estado, es_fecha_importante: esFechaImportante,
      recurrencia: construirRecurrencia(),
      recordatorios,
    };
  }

  async function guardar(forzar = false) {
    const problema = validar();
    if (problema) { setCampoError(problema.campo); setError(problema.msg); return; }
    const payload = armarPayload();

    if (!forzar && detectarConflictos) {
      const ch = detectarConflictos(payload);
      if (ch.length > 0) { setConflictos(ch); return; }
    }

    setSaving(true);
    setError(null);
    setCampoError(null);
    setConflictos(null);
    try {
      if (onSubmitOverride) await onSubmitOverride(payload);
      else if (editar) await updateActividad(actividad!.id, church.id, payload);
      else await insertActividad(church.id, payload);
      playSound("guardado");
      showToast(editar || onSubmitOverride ? t("agenda.toastActualizada") : t("agenda.toastCreada"));
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError(t("agenda.errGuardar"));
      setSaving(false);
    }
  }

  return {
    saving, error, campoError, conflictos, setConflictos,
    titulo, etiquetaGuardar, mostrarRecurrencia, muestraDias, diasSemana,
    opcResponsable, opcRecFin,

    nombre, setNombre, tipo, setTipo, tipoPersonalizado, setTipoPersonalizado,
    fecha, setFecha, diaCompleto, setDiaCompleto,
    horaInicio, setHoraInicio, horaFin, setHoraFin,
    lugar, setLugar, descripcion, setDescripcion,
    responsableMemberId, setResponsableMemberId,
    responsablePersona, setResponsablePersona,
    responsableMinisterio, setResponsableMinisterio,
    invitado, setInvitado, contacto, setContacto,
    estado, setEstado, esFechaImportante, setEsFechaImportante,
    recordatorios, toggleRecordatorio,
    recTipo, setRecTipo, recDias, toggleDia, recIntervalo, setRecIntervalo,
    recFinTipo, setRecFinTipo, recHasta, setRecHasta, recConteo, setRecConteo,

    guardar,
  };
}
