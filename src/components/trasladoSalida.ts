/**
 * trasladoSalida.ts — el estado y el guardado del traslado de salida, sin una
 * sola línea de pintura.
 *
 * Vivía dentro de `TrasladoSalidaModal.tsx`. Se sacó aquí cuando el teléfono
 * dejó de usar el modal de escritorio y pasó a una hoja de iOS: son dos formas
 * de enseñar el MISMO formulario, y con la lógica duplicada la segunda copia
 * se habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. Las cuatro validaciones, el aviso de
 * "este miembro ya tiene otro traslado en proceso", la generación de la carta
 * vinculada y la oferta de marcar al miembro como Trasladado son los de
 * siempre, movidos tal cual.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  darDeBajaMember, insertCarta, insertTrasladoSalida, memberTieneTrasladoActivo, updateTrasladoSalida,
  type Church, type Member, type NewCarta, type NewTrasladoSalida, type TrasladoSalida,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";

export const ESTADOS_TS = [
  "borrador", "solicitud", "revision", "aprobacion", "aprobado", "cartaPreparacion",
  "cartaEmitida", "cartaEntregada", "confirmacion", "completado", "cancelado",
] as const;

/** Método de entrega de la carta. Antes era texto libre y cada persona
 *  escribía lo suyo ("email", "Email", "correo", "en mano"), así que los
 *  valores no eran comparables y no se podía filtrar ni reportar por él. */
export const METODOS_ENTREGA = ["mano", "email", "postal", "tercero", "otro"] as const;

export function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PropsTrasladoSalida {
  church: Church;
  /** null = traslado nuevo. */
  traslado: TrasladoSalida | null;
  /** Miembros que pueden iniciar traslado (activos del registro). */
  members: Member[];
  /** Miembro preseleccionado (puente desde la baja por traslado en Membresía). */
  preMemberId?: number | null;
  onClose: () => void;
  onSaved: () => void;
  /** Abre la carta vinculada en el editor. */
  onAbrirCarta: (cartaId: number) => void;
}

/** Los cuatro campos que pueden bloquear el guardado. */
export type CampoTS = "miembro" | "fechaSolicitud" | "iglesiaDestino" | "fechaConfirmacion";

export function useTrasladoSalida({
  church, traslado, members, preMemberId, onClose, onSaved,
}: PropsTrasladoSalida) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el error, para que el iPhone pueda poner el aviso al pie
     de SU sección en vez de todo junto al final. Mac sigue leyendo `error` y
     no se entera de esto. */
  const [campoError, setCampoError] = useState<CampoTS | null>(null);
  /** Advertencia que NO bloquea: el miembro ya tiene otro traslado en proceso. */
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmTrasladado, setConfirmTrasladado] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const [memberId, setMemberId] = useState<number | null>(traslado?.member_id ?? preMemberId ?? null);
  const [fechaSolicitud, setFechaSolicitud] = useState(traslado?.fecha_solicitud ?? hoyLocal());
  const [motivo, setMotivo] = useState(traslado?.motivo ?? "");
  const [iglesiaDestino, setIglesiaDestino] = useState(traslado?.iglesia_destino ?? "");
  const [pastorReceptor, setPastorReceptor] = useState(traslado?.pastor_receptor ?? "");
  const [direccion, setDireccion] = useState(traslado?.direccion ?? "");
  const [ciudad, setCiudad] = useState(traslado?.ciudad ?? "");
  const [region, setRegion] = useState(traslado?.region ?? "");
  const [pais, setPais] = useState(traslado?.pais ?? "");
  const [telefono, setTelefono] = useState(traslado?.telefono ?? "");
  const [email, setEmail] = useState(traslado?.email ?? "");
  const [fechaAprobacion, setFechaAprobacion] = useState(traslado?.fecha_aprobacion ?? "");
  const [aprobadoPor, setAprobadoPor] = useState(traslado?.aprobado_por ?? "");
  const [cartaId, setCartaId] = useState<number | null>(traslado?.carta_id ?? null);
  const [fechaEntrega, setFechaEntrega] = useState(traslado?.fecha_entrega ?? "");
  const [metodoEntrega, setMetodoEntrega] = useState(traslado?.metodo_entrega ?? "");
  const [confirmacion, setConfirmacion] = useState(traslado ? traslado.confirmacion_recibida === 1 : false);
  const [fechaConfirmacion, setFechaConfirmacion] = useState(traslado?.fecha_confirmacion ?? "");
  const [observaciones, setObservaciones] = useState(traslado?.observaciones ?? "");
  const [estado, setEstado] = useState(traslado?.estado ?? "borrador");

  const miembro = members.find((m) => m.id === memberId) ?? null;
  const puedeGenerarCarta = ["aprobado", "cartaPreparacion", "cartaEmitida", "cartaEntregada", "confirmacion", "completado"].includes(estado);
  /** El miembro no se puede cambiar en un traslado ya guardado: el expediente
   *  y la carta vinculada cuelgan de él. */
  const miembroFijo = traslado !== null;

  /* Los traslados viejos guardaban el método de entrega como texto libre, así
     que si el valor guardado no es una de las claves nuevas se ofrece tal cual
     para que abrir y guardar un registro antiguo no lo borre. Así no hace
     falta migrar nada. */
  const esMetodoConocido = METODOS_ENTREGA.includes(metodoEntrega as (typeof METODOS_ENTREGA)[number]);
  const opcMetodoEntrega = [
    { value: "", label: "—" },
    ...METODOS_ENTREGA.map((m) => ({ value: m, label: t(`traslados.entrega.${m}`) })),
    ...(metodoEntrega && !esMetodoConocido ? [{ value: metodoEntrega, label: metodoEntrega }] : []),
  ];

  /** Todo lo escrito, en bruto y sin validar: arma el payload y dice si hay
   *  cambios sin guardar. */
  function camposActuales() {
    return {
      memberId, fechaSolicitud, motivo,
      iglesiaDestino, pastorReceptor, direccion, ciudad, region, pais, telefono, email,
      fechaAprobacion, aprobadoPor, cartaId, fechaEntrega, metodoEntrega,
      confirmacion, fechaConfirmacion, observaciones, estado,
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
    if (confirmClose || confirmTrasladado !== null) return;
    if (hayCambios()) setConfirmClose(true);
    else onClose();
  }

  function payloadActual(): NewTrasladoSalida | null {
    setError(null); setCampoError(null);
    const falla = (campo: CampoTS, msg: string) => { setCampoError(campo); setError(msg); };
    if (memberId === null) { falla("miembro", t("traslados.miembroObligatorio")); return null; }
    if (!fechaSolicitud) { falla("fechaSolicitud", t("traslados.fechaObligatoria")); return null; }
    if (estado === "completado" && !iglesiaDestino.trim()) { falla("iglesiaDestino", t("traslados.destinoObligatorio")); return null; }
    if (fechaConfirmacion && fechaEntrega && fechaConfirmacion < fechaEntrega) {
      falla("fechaConfirmacion", t("traslados.confirmacionAntes")); return null;
    }
    return {
      member_id: memberId,
      fecha_solicitud: fechaSolicitud,
      motivo: motivo.trim() || null,
      iglesia_destino: iglesiaDestino.trim() || null,
      pastor_receptor: pastorReceptor.trim() || null,
      direccion: direccion.trim() || null,
      ciudad: ciudad.trim() || null,
      region: region.trim() || null,
      pais: pais.trim() || null,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      fecha_aprobacion: fechaAprobacion || null,
      aprobado_por: aprobadoPor.trim() || null,
      carta_id: cartaId,
      fecha_entrega: fechaEntrega || null,
      metodo_entrega: metodoEntrega.trim() || null,
      confirmacion_recibida: confirmacion ? 1 : 0,
      fecha_confirmacion: confirmacion ? fechaConfirmacion || null : null,
      observaciones: observaciones.trim() || null,
      estado,
    };
  }

  async function guardar() {
    const payload = payloadActual();
    if (!payload) return;
    setSaving(true);
    try {
      // Advertencia (no bloqueo) si el miembro ya tiene otro traslado activo.
      if (memberId !== null && (await memberTieneTrasladoActivo(memberId, church.id, traslado?.id))) {
        setAviso(t("traslados.dosActivos"));
      }
      if (traslado) {
        await updateTrasladoSalida(traslado.id, church.id, payload, traslado.estado);
      } else {
        await insertTrasladoSalida(church.id, payload);
      }
      playSound("guardado");
      showToast(t("traslados.toastGuardado"));
      onSaved();
      // Al completar el traslado: ¿cambiar el estado del miembro a Trasladado?
      // (Nunca se borra el expediente; solo sale de los registros ordinarios.)
      if (payload.estado === "completado" && traslado?.estado !== "completado" && miembro && miembro.activo === 1) {
        setConfirmTrasladado(memberId);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function marcarTrasladado() {
    if (confirmTrasladado === null) return;
    await darDeBajaMember(confirmTrasladado, church.id, fechaEntrega || hoyLocal(), "traslado");
    playSound("guardado");
    showToast(t("traslados.toastMiembroTrasladado"));
    setConfirmTrasladado(null);
    onSaved();
    onClose();
  }

  /** Genera la carta de traslado con los datos del proceso y la vincula. */
  async function generarCarta() {
    const payload = payloadActual();
    if (!payload || !miembro) return;
    setSaving(true);
    try {
      const cuerpo =
        `<p>${t("traslados.cartaCuerpo1", { nombre: miembro.nombre })}</p>` +
        `<p>${t("traslados.cartaCuerpo2", { destino: iglesiaDestino.trim() || "—" })}</p>`;
      const carta: NewCarta = {
        tipo: "traslado",
        fecha_emision: hoyLocal(),
        lugar_emision: church.ciudad ?? null,
        destinatario_tipo: "iglesia",
        member_id: memberId,
        destinatario_nombre: pastorReceptor.trim() || iglesiaDestino.trim() || t("traslados.iglesiaDestino"),
        destinatario_direccion: [direccion, ciudad, region, pais].filter((x) => x.trim()).join(", ") || null,
        asunto: t("traslados.cartaAsunto", { nombre: miembro.nombre }),
        saludo: null,
        cuerpo_html: cuerpo,
        despedida: null,
        firmas: [
          ...(church.pastor_nombre ? [{ rol: "pastor", nombre: church.pastor_nombre, cargo: church.pastor_cargo ?? t("rol.pastor"), firmado: false, fecha: null }] : []),
          ...(church.secretaria_nombre ? [{ rol: "secretaria", nombre: church.secretaria_nombre, cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmado: false, fecha: null }] : []),
        ],
        observaciones: null,
        estado: "preparacion",
        entregada_a: null,
        fecha_entrega: null,
      };
      const creada = await insertCarta(church.id, carta);
      if (!creada || !traslado) return;
      setCartaId(creada.id);
      const nuevoEstado = estado === "aprobado" ? "cartaPreparacion" : estado;
      setEstado(nuevoEstado);
      await updateTrasladoSalida(traslado.id, church.id, { ...payload, carta_id: creada.id, estado: nuevoEstado }, traslado.estado);
      playSound("guardado");
      showToast(t("traslados.toastCartaGenerada", { folio: creada.folio }));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return {
    saving, error, campoError, aviso, miembro, miembroFijo, members,
    puedeGenerarCarta, opcMetodoEntrega,
    confirmTrasladado, setConfirmTrasladado,
    confirmClose, setConfirmClose,
    /** Cerrar sin preguntar. Lo usa el "Descartar" del diálogo. */
    onCerrarDeVerdad: onClose,
    hayCambios, pedirCerrar,

    memberId, setMemberId, fechaSolicitud, setFechaSolicitud, motivo, setMotivo,
    iglesiaDestino, setIglesiaDestino, pastorReceptor, setPastorReceptor,
    direccion, setDireccion, ciudad, setCiudad, region, setRegion, pais, setPais,
    telefono, setTelefono, email, setEmail,
    fechaAprobacion, setFechaAprobacion, aprobadoPor, setAprobadoPor,
    cartaId, fechaEntrega, setFechaEntrega, metodoEntrega, setMetodoEntrega,
    confirmacion, setConfirmacion, fechaConfirmacion, setFechaConfirmacion,
    observaciones, setObservaciones, estado, setEstado,

    guardar, generarCarta, marcarTrasladado,
  };
}
