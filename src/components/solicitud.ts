/**
 * solicitud.ts — el estado y el guardado de una solicitud de carta, sin una
 * sola línea de pintura.
 *
 * Vivía dentro de `SolicitudModal.tsx`. Se sacó aquí cuando el teléfono dejó
 * de usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar el MISMO formulario, y con la lógica duplicada la segunda copia se
 * habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, sus tres validaciones y el
 * `NewSolicitud` que se escribe son los de siempre, movidos tal cual.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  insertSolicitud, updateSolicitud,
  type Church, type Member, type NewSolicitud, type Solicitud,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";

export const PRIORIDADES = ["normal", "importante", "urgente"] as const;
export const ESTADOS_SOLICITUD = ["nueva", "revision", "preparacion", "firma", "lista", "entregada", "cancelada"] as const;
export const MEDIOS_ENTREGA = ["impresa", "email", "mensajeria", "recoge", "otro"] as const;

export function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PropsSolicitud {
  church: Church;
  /** null = solicitud nueva. */
  solicitud: Solicitud | null;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

/** Los campos que pueden bloquear el guardado. */
export type CampoSolicitud = "solicitante" | "fechaSolicitud" | "fechaRequerida";

export function useSolicitud({ church, solicitud, members, onClose, onSaved }: PropsSolicitud) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el error, para que el iPhone pueda poner el aviso al pie
     de SU sección en vez de todo junto al final. Mac sigue leyendo `error` y
     no se entera de esto. */
  const [campoError, setCampoError] = useState<CampoSolicitud | null>(null);

  const [esMiembro, setEsMiembro] = useState(solicitud ? solicitud.member_id !== null : true);
  const [memberId, setMemberId] = useState<number | null>(solicitud?.member_id ?? null);
  const [externo, setExterno] = useState(solicitud?.solicitante_externo ?? "");
  const [tipoCarta, setTipoCarta] = useState(solicitud?.tipo_carta ?? "recomendacion");
  const [motivo, setMotivo] = useState(solicitud?.motivo ?? "");
  const [fechaSolicitud, setFechaSolicitud] = useState(solicitud?.fecha_solicitud ?? hoyLocal());
  const [fechaRequerida, setFechaRequerida] = useState(solicitud?.fecha_requerida ?? "");
  const [medio, setMedio] = useState(solicitud?.medio_entrega ?? "impresa");
  const [responsable, setResponsable] = useState(solicitud?.responsable ?? church.secretaria_nombre ?? "");
  const [prioridad, setPrioridad] = useState(solicitud?.prioridad ?? "normal");
  const [estado, setEstado] = useState(solicitud?.estado ?? "nueva");
  const [observaciones, setObservaciones] = useState(solicitud?.observaciones ?? "");

  /** El nombre del miembro elegido, o "" si no hay ninguno. Lo usan las dos
   *  vistas: Mac para nada, el teléfono para pintar el valor de la fila. */
  const nombreMiembro = members.find((m) => m.id === memberId)?.nombre ?? "";

  async function guardar() {
    setError(null); setCampoError(null);
    const falla = (campo: CampoSolicitud, msg: string) => { setCampoError(campo); setError(msg); };
    const nombreSolicitante = esMiembro ? nombreMiembro : externo.trim();
    if (!nombreSolicitante) { falla("solicitante", t("solicitudes.solicitanteObligatorio")); return; }
    if (!fechaSolicitud) { falla("fechaSolicitud", t("solicitudes.fechaObligatoria")); return; }
    if (fechaRequerida && fechaRequerida < fechaSolicitud) { falla("fechaRequerida", t("solicitudes.requeridaAntes")); return; }
    setSaving(true);
    try {
      const payload: NewSolicitud = {
        member_id: esMiembro ? memberId : null,
        solicitante_externo: esMiembro ? null : externo.trim() || null,
        tipo_carta: tipoCarta,
        motivo: motivo.trim() || null,
        fecha_solicitud: fechaSolicitud,
        fecha_requerida: fechaRequerida || null,
        medio_entrega: medio,
        responsable: responsable.trim() || null,
        prioridad,
        estado,
        observaciones: observaciones.trim() || null,
      };
      if (solicitud) {
        await updateSolicitud(solicitud.id, church.id, payload, solicitud.estado);
      } else {
        await insertSolicitud(church.id, payload);
      }
      playSound("guardado");
      showToast(t("solicitudes.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return {
    saving, error, campoError, members, nombreMiembro,
    esMiembro, setEsMiembro, memberId, setMemberId, externo, setExterno,
    tipoCarta, setTipoCarta, motivo, setMotivo,
    fechaSolicitud, setFechaSolicitud, fechaRequerida, setFechaRequerida,
    medio, setMedio, responsable, setResponsable,
    prioridad, setPrioridad, estado, setEstado, observaciones, setObservaciones,
    guardar,
  };
}
