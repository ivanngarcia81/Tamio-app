/**
 * trasladoEntrada.ts — el estado y el guardado del traslado de entrada, sin
 * una sola línea de pintura.
 *
 * Vivía dentro de `TrasladoEntradaModal.tsx`. Se sacó aquí cuando el teléfono
 * dejó de usar el modal de escritorio y pasó a una hoja de iOS: son dos formas
 * de enseñar el MISMO formulario —diecinueve campos en cuatro secciones, más
 * el adjunto y la creación del miembro—, y con la lógica duplicada la segunda
 * copia se habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. `payloadActual()` con sus dos
 * validaciones, `guardar()`, el adjunto y todo el enredo de duplicados
 * («¿es la misma persona que ya está en el padrón?») son los de siempre,
 * movidos tal cual.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  buscarPosiblesDuplicados, insertMemberDesdeTraslado, insertTrasladoEntrada, updateTrasladoEntrada,
  type Church, type Member, type NewTrasladoEntrada, type TrasladoEntrada,
} from "../db";
import { guardarAdjunto, eliminarAdjunto } from "../services/cartas/adjuntos";
import { showToast } from "../toast";
import { playSound } from "../sound";

export const ESTADOS_TE = [
  "recibida", "revision", "incompleta", "entrevista", "aprobacion",
  "aceptado", "noAceptado", "completado", "archivado",
] as const;

export function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface Adjunto {
  path: string;
  nombre: string;
  fecha: string;
}

export interface PropsTrasladoEntrada {
  church: Church;
  /** null = traslado nuevo. */
  traslado: TrasladoEntrada | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Los dos campos que pueden bloquear el guardado. */
export type CampoTE = "nombre" | "fechaRecepcion";

export function useTrasladoEntrada({ church, traslado, onClose, onSaved }: PropsTrasladoEntrada) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el error, para que el iPhone pueda poner el aviso al pie
     de SU sección en vez de todo junto al final. Mac sigue leyendo `error` y
     no se entera de esto. */
  const [campoError, setCampoError] = useState<CampoTE | null>(null);
  const [duplicados, setDuplicados] = useState<Member[] | null>(null);
  const [confirmQuitarAdjunto, setConfirmQuitarAdjunto] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [nombre, setNombre] = useState(traslado?.nombre ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(traslado?.fecha_nacimiento ?? "");
  const [telefono, setTelefono] = useState(traslado?.telefono ?? "");
  const [correo, setCorreo] = useState(traslado?.correo ?? "");
  const [direccion, setDireccion] = useState(traslado?.direccion ?? "");
  const [iglesiaProcedencia, setIglesiaProcedencia] = useState(traslado?.iglesia_procedencia ?? "");
  const [pastorAnterior, setPastorAnterior] = useState(traslado?.pastor_anterior ?? "");
  const [direccionAnterior, setDireccionAnterior] = useState(traslado?.direccion_anterior ?? "");
  const [fechaEmisionCarta, setFechaEmisionCarta] = useState(traslado?.fecha_emision_carta ?? "");
  const [fechaRecepcion, setFechaRecepcion] = useState(traslado?.fecha_recepcion ?? hoyLocal());
  const [referenciaCarta, setReferenciaCarta] = useState(traslado?.referencia_carta ?? "");
  const [adjunto, setAdjunto] = useState<Adjunto | null>(
    traslado?.adjunto_path
      ? { path: traslado.adjunto_path, nombre: traslado.adjunto_nombre ?? "adjunto", fecha: traslado.adjunto_fecha ?? "" }
      : null
  );
  const [fechaCongregacion, setFechaCongregacion] = useState(traslado?.fecha_congregacion ?? "");
  const [fechaEntrevista, setFechaEntrevista] = useState(traslado?.fecha_entrevista ?? "");
  const [entrevistador, setEntrevistador] = useState(traslado?.entrevistador ?? "");
  const [decision, setDecision] = useState(traslado?.decision ?? "");
  const [fechaAprobacion, setFechaAprobacion] = useState(traslado?.fecha_aprobacion ?? "");
  const [observaciones, setObservaciones] = useState(traslado?.observaciones ?? "");
  const [estado, setEstado] = useState(traslado?.estado ?? "recibida");
  // El member_id solo cambia mediante "Crear miembro" o "Vincular"; en esos
  // flujos se guarda directo con guardar(estado, miembroVinculado).
  const [memberId] = useState<number | null>(traslado?.member_id ?? null);

  /** Todo lo escrito, en bruto y sin validar. Sirve para dos cosas: armar el
   *  payload y saber si hay cambios sin guardar. */
  function camposActuales() {
    return {
      nombre, fechaNacimiento, telefono, correo, direccion,
      iglesiaProcedencia, pastorAnterior, direccionAnterior,
      fechaEmisionCarta, fechaRecepcion, referenciaCarta, adjuntoPath: adjunto?.path ?? null,
      fechaCongregacion, fechaEntrevista, entrevistador, decision, fechaAprobacion,
      observaciones, estado,
    };
  }

  /* Foto de cómo estaba al abrir. Se fija en el primer render y no se vuelve a
     tocar: es la referencia contra la que se decide si "Cancelar" pregunta. */
  const inicialRef = useRef<string | null>(null);
  if (inicialRef.current === null) inicialRef.current = JSON.stringify(camposActuales());

  function hayCambios(): boolean {
    return JSON.stringify(camposActuales()) !== inicialRef.current;
  }

  function pedirCerrar() {
    if (saving) return;
    // Con un diálogo abierto, Escape lo cierra a él (su propio hook), no el
    // formulario entero.
    if (confirmClose || confirmQuitarAdjunto || duplicados) return;
    if (hayCambios()) setConfirmClose(true);
    else onClose();
  }

  function payloadActual(): NewTrasladoEntrada | null {
    setError(null); setCampoError(null);
    const falla = (campo: CampoTE, msg: string) => { setCampoError(campo); setError(msg); };
    if (!nombre.trim()) { falla("nombre", t("traslados.nombreObligatorio")); return null; }
    if (fechaEmisionCarta && fechaRecepcion && fechaRecepcion < fechaEmisionCarta) {
      falla("fechaRecepcion", t("traslados.recepcionAntes")); return null;
    }
    return {
      nombre: nombre.trim(),
      fecha_nacimiento: fechaNacimiento || null,
      telefono: telefono.trim() || null,
      correo: correo.trim() || null,
      direccion: direccion.trim() || null,
      iglesia_procedencia: iglesiaProcedencia.trim() || null,
      pastor_anterior: pastorAnterior.trim() || null,
      direccion_anterior: direccionAnterior.trim() || null,
      fecha_emision_carta: fechaEmisionCarta || null,
      fecha_recepcion: fechaRecepcion || null,
      referencia_carta: referenciaCarta.trim() || null,
      adjunto_path: adjunto?.path ?? null,
      adjunto_nombre: adjunto?.nombre ?? null,
      adjunto_fecha: adjunto?.fecha ?? null,
      fecha_congregacion: fechaCongregacion || null,
      fecha_entrevista: fechaEntrevista || null,
      entrevistador: entrevistador.trim() || null,
      decision: decision.trim() || null,
      fecha_aprobacion: fechaAprobacion || null,
      observaciones: observaciones.trim() || null,
      estado,
      member_id: memberId,
    };
  }

  async function guardar(estadoForzado?: string, miembroVinculado?: number | null): Promise<boolean> {
    const payload = payloadActual();
    if (!payload) return false;
    if (estadoForzado) payload.estado = estadoForzado;
    if (miembroVinculado !== undefined) payload.member_id = miembroVinculado;
    setSaving(true);
    try {
      if (traslado) {
        await updateTrasladoEntrada(traslado.id, church.id, payload, traslado.estado);
      } else {
        await insertTrasladoEntrada(church.id, payload);
      }
      playSound("guardado");
      showToast(t("traslados.toastGuardado"));
      onSaved();
      return true;
    } finally {
      setSaving(false);
    }
  }

  /** Guardar y cerrar, que es lo que hacen los dos botones de "Guardar". */
  async function guardarYCerrar() {
    if (await guardar()) onClose();
  }

  async function elegirAdjunto() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: t("traslados.adjuntoElegir"),
        filters: [{ name: "PDF / imagen", extensions: ["pdf", "jpg", "jpeg", "png"] }],
      });
      if (typeof path !== "string") return;
      const nuevo = await guardarAdjunto(path, traslado?.folio ?? "te-nuevo");
      if (adjunto) await eliminarAdjunto(adjunto.path);
      setAdjunto(nuevo);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function quitarAdjunto() {
    if (adjunto) await eliminarAdjunto(adjunto.path);
    setAdjunto(null);
    setConfirmQuitarAdjunto(false);
  }

  /** "Crear miembro con esta información": verifica duplicados primero. */
  async function crearMiembro() {
    const payload = payloadActual();
    if (!payload) return;
    const coincidencias = await buscarPosiblesDuplicados(church.id, {
      nombre: payload.nombre,
      telefono: payload.telefono,
      correo: payload.correo,
    });
    if (coincidencias.length > 0) {
      setDuplicados(coincidencias);
      return;
    }
    await crearMiembroConfirmado();
  }

  async function crearMiembroConfirmado() {
    setDuplicados(null);
    const payload = payloadActual();
    if (!payload) return;
    const id = await insertMemberDesdeTraslado(church.id, payload);
    if (id) {
      await guardar("completado", id);
      showToast(t("traslados.toastMiembroCreado", { nombre: payload.nombre }));
      onClose();
    }
  }

  async function vincularExistente(m: Member) {
    setDuplicados(null);
    const ok = await guardar("completado", m.id);
    if (ok) {
      showToast(t("traslados.toastVinculadoExistente", { nombre: m.nombre }));
      onClose();
    }
  }

  return {
    saving, error, campoError, memberId,
    duplicados, setDuplicados,
    confirmQuitarAdjunto, setConfirmQuitarAdjunto,
    confirmClose, setConfirmClose,
    /** Cerrar sin preguntar. Lo usa el "Descartar" del diálogo. */
    onCerrarDeVerdad: onClose,
    hayCambios, pedirCerrar,

    nombre, setNombre, fechaNacimiento, setFechaNacimiento,
    telefono, setTelefono, correo, setCorreo, direccion, setDireccion,
    iglesiaProcedencia, setIglesiaProcedencia, pastorAnterior, setPastorAnterior,
    direccionAnterior, setDireccionAnterior,
    fechaEmisionCarta, setFechaEmisionCarta, fechaRecepcion, setFechaRecepcion,
    referenciaCarta, setReferenciaCarta, adjunto,
    fechaCongregacion, setFechaCongregacion, fechaEntrevista, setFechaEntrevista,
    entrevistador, setEntrevistador, decision, setDecision,
    fechaAprobacion, setFechaAprobacion, observaciones, setObservaciones,
    estado, setEstado,

    guardar, guardarYCerrar, elegirAdjunto, quitarAdjunto,
    crearMiembro, crearMiembroConfirmado, vincularExistente,
  };
}
