/**
 * acta.ts — el estado y el guardado del acta, sin una sola línea de pintura.
 *
 * Vivía dentro de `ActaModal.tsx`. Se sacó aquí cuando el teléfono dejó de
 * usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar el MISMO formulario —treinta y pico campos en seis secciones—, y con
 * la lógica duplicada la segunda copia se habría quedado atrás a la primera
 * corrección.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, sus tres validaciones —y en
 * particular la que exige presidió y redactó para pasar de borrador— y el
 * `NewActa` que se escribe son los de siempre, movidos tal cual.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  insertActa, updateActa,
  type Acta, type ActaAcuerdo, type ActaMocion, type Church, type NewActa,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { redactarActa } from "../ia";

export function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function parseMociones(json: string): ActaMocion[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseAcuerdos(json: string): ActaAcuerdo[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PropsActa {
  church: Church;
  /** null = acta nueva. */
  acta: Acta | null;
  onClose: () => void;
  onSaved: () => void;
  /** Imprimir esta acta. Opcional y solo lo pasa Actas en el teléfono, donde
   *  los "···" de la fila se fueron: el deslizamiento da Editar y Eliminar, e
   *  imprimir se quedaría sin ninguna forma de llegar. */
  onImprimir?: () => void;
}

/** Los cuatro campos que pueden bloquear el guardado. */
export type CampoActa = "titulo" | "fecha" | "preside" | "secretario";

export function useActa({ church, acta, onClose, onSaved }: PropsActa) {
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [iaAbierta, setIaAbierta] = useState(false);
  const [iaPuntos, setIaPuntos] = useState("");
  const [iaGenerando, setIaGenerando] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el error, para que el iPhone pueda poner el aviso al pie
     de SU sección en vez de todo junto al final. Mac sigue leyendo `error` y
     no se entera de esto. */
  const [campoError, setCampoError] = useState<CampoActa | null>(null);

  const [tipo, setTipo] = useState(acta?.tipo ?? "administrativa");
  const [titulo, setTitulo] = useState(acta?.titulo ?? "");
  const [fecha, setFecha] = useState(acta?.fecha ?? hoyLocal());
  const [horaInicio, setHoraInicio] = useState(acta?.hora_inicio ?? "");
  const [horaCierre, setHoraCierre] = useState(acta?.hora_cierre ?? "");
  const [lugar, setLugar] = useState(acta?.lugar ?? "");
  const [preside, setPreside] = useState(acta?.preside ?? "");
  const [secretario, setSecretario] = useState(acta?.secretario ?? "");
  const [presentes, setPresentes] = useState<string[]>(() => (acta ? parseNombres(acta.presentes) : []));
  const [ausentes, setAusentes] = useState<string[]>(() => (acta ? parseNombres(acta.ausentes) : []));
  const [invitados, setInvitados] = useState<string[]>(() => (acta ? parseNombres(acta.invitados) : []));
  const [quorum, setQuorum] = useState(acta ? acta.quorum === 1 : false);
  const [agenda, setAgenda] = useState(acta?.agenda ?? "");
  const [resumen, setResumen] = useState(acta?.resumen ?? "");
  const [mociones, setMociones] = useState<ActaMocion[]>(() => (acta ? parseMociones(acta.mociones) : []));
  const [acuerdos, setAcuerdos] = useState<ActaAcuerdo[]>(() => (acta ? parseAcuerdos(acta.acuerdos) : []));
  const [estado, setEstado] = useState(acta?.estado ?? "borrador");
  const [confidencial, setConfidencial] = useState(acta ? acta.confidencial === 1 : false);
  const [fechaAprobacion, setFechaAprobacion] = useState(acta?.fecha_aprobacion ?? "");

  const muestraAprobacion = estado === "aprobada" || estado === "corregida";

  async function generarActaIA() {
    const puntos = iaPuntos.trim();
    if (!puntos) return;
    setIaGenerando(true);
    setIaError(null);
    try {
      const texto = await redactarActa({
        puntos,
        titulo: titulo.trim() || undefined,
        iglesia: church.nombre,
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      setResumen(texto);
      setIaAbierta(false);
      setIaPuntos("");
      playSound("guardado");
    } catch (e) {
      setIaError(t("cartas.ia.error", { error: String((e as { message?: string })?.message ?? e) }));
    } finally {
      setIaGenerando(false);
    }
  }

  function setMocion(i: number, patch: Partial<ActaMocion>) {
    setMociones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  function setAcuerdo(i: number, patch: Partial<ActaAcuerdo>) {
    setAcuerdos((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function guardar() {
    setError(null); setCampoError(null);
    const falla = (campo: CampoActa, msg: string) => { setCampoError(campo); setError(msg); };
    if (!titulo.trim()) { falla("titulo", t("actas.tituloObligatorio")); return; }
    if (!fecha) { falla("fecha", t("actas.fechaObligatoria")); return; }
    // Un acta aprobada/corregida es un documento formal: sin quién presidió y
    // quién levantó el acta no puede pasar de borrador.
    if (estado === "aprobada" || estado === "corregida") {
      if (!preside.trim()) { falla("preside", t("actas.presideObligatorio", { estado: t(`actas.estado.${estado}`) })); return; }
      if (!secretario.trim()) { falla("secretario", t("actas.secretarioObligatorio", { estado: t(`actas.estado.${estado}`) })); return; }
    }
    setSaving(true);
    try {
      const payload: NewActa = {
        tipo,
        titulo: titulo.trim(),
        fecha,
        hora_inicio: horaInicio || null,
        hora_cierre: horaCierre || null,
        lugar: lugar.trim() || null,
        preside: preside.trim() || null,
        secretario: secretario.trim() || null,
        presentes,
        ausentes,
        invitados,
        quorum,
        agenda: agenda.trim() || null,
        resumen: resumen.trim() || null,
        mociones: mociones.filter((m) => m.texto.trim()),
        acuerdos: acuerdos.filter((a) => a.texto.trim()),
        estado,
        confidencial,
        fecha_aprobacion: muestraAprobacion ? fechaAprobacion || null : null,
      };
      if (acta) {
        await updateActa(acta.id, church.id, payload);
      } else {
        await insertActa(church.id, payload);
      }
      playSound("guardado");
      showToast(t("actas.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return {
    saving, error, setError, campoError, muestraAprobacion,
    iaAbierta, setIaAbierta, iaPuntos, setIaPuntos, iaGenerando, iaError, setIaError, generarActaIA,
    tipo, setTipo, titulo, setTitulo, fecha, setFecha,
    horaInicio, setHoraInicio, horaCierre, setHoraCierre, lugar, setLugar,
    preside, setPreside, secretario, setSecretario,
    presentes, setPresentes, ausentes, setAusentes, invitados, setInvitados, quorum, setQuorum,
    agenda, setAgenda, resumen, setResumen,
    mociones, setMociones, setMocion, acuerdos, setAcuerdos, setAcuerdo,
    estado, setEstado, confidencial, setConfidencial, fechaAprobacion, setFechaAprobacion,
    guardar,
  };
}
