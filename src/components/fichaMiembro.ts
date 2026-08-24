/**
 * fichaMiembro.ts — el estado y el guardado de la ficha de miembro, sin una
 * sola línea de pintura.
 *
 * Vivía dentro de `FichaMiembroModal.tsx`. Se sacó aquí cuando el ALTA en el
 * teléfono dejó de usar el modal de escritorio y pasó a una hoja de iOS: son
 * dos formas de enseñar el MISMO formulario, y con la lógica duplicada la
 * segunda copia se habría quedado atrás a la primera corrección — de esas que
 * no dan error, solo un campo que se guarda en Mac y no en el iPhone.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, `limpiarParaOtro()`, la
 * validación del nombre y el objeto `MemberFicha` son los de siempre, movidos
 * tal cual: el registro que se escribe en la base es el mismo byte a byte.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  insertMemberConFicha, memberAsistenciaStats, memberDocs, updateMemberFicha,
  type Church, type Member, type MemberAsistenciaStats, type MemberDoc, type MemberFicha, type NewMember,
} from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";

/** Los cuatro estados que se pueden elegir a mano. Los otros tres
 *  (trasladado, retirado, fallecido) los pone el sistema. */
export const ESTADOS_REGISTRO = ["activo", "inactivo", "visitante", "enProceso"] as const;

export function parseLista(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface PropsFicha {
  church: Church;
  /** Miembro existente (editar su ficha) o null para dar de alta uno nuevo con
   *  toda la ficha de una vez (datos personales + espiritual + servicio). */
  member: Member | null;
  onClose: () => void;
  onSaved: () => void;
  /** Fusionar este miembro con otro. Opcional, y solo lo pasa Membresía donde
   *  la fila se ha quedado sin menú de "···": el teléfono (el deslizamiento ya
   *  da Editar y Eliminar) y el iPad partido (la fila del maestro solo
   *  selecciona). Sin esto, ahí fusionar no tendría ninguna forma de llegar.
   *  En Mac —y en el iPad sin partir— la acción sigue en el menú de la fila y
   *  esto no se pasa. */
  onFusionar?: () => void;
}

export function useFichaMiembro({ church, member, onClose, onSaved }: PropsFicha) {
  const { t } = useTranslation();
  const crear = member === null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos personales (solo se editan aquí en el alta).
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rfc, setRfc] = useState("");
  const [notas, setNotas] = useState("");

  const [estado, setEstado] = useState(
    ESTADOS_REGISTRO.includes(member?.estado_membresia as (typeof ESTADOS_REGISTRO)[number])
      ? (member?.estado_membresia ?? "activo")
      : "activo"
  );
  const [fechaCongregacion, setFechaCongregacion] = useState(member?.fecha_congregacion ?? "");
  // Ninguna de las dos fechas se prellena: "Recibido como miembro" casi nunca
  // es hoy (se recibe a gente que ya venía congregándose), y un prellenado
  // que casi siempre está mal se guarda sin que nadie lo mire.
  const [fechaIngreso, setFechaIngreso] = useState(member?.fecha_ingreso ?? "");
  const [iglesiaAnterior, setIglesiaAnterior] = useState(member?.iglesia_anterior ?? "");
  const [bautizadoAgua, setBautizadoAgua] = useState(member?.bautizado_agua === 1);
  const [fechaBautismoAgua, setFechaBautismoAgua] = useState(member?.fecha_bautismo_agua ?? "");
  const [bautizadoEspiritu, setBautizadoEspiritu] = useState(member?.bautizado_espiritu === 1);
  const [fechaBautismoEspiritu, setFechaBautismoEspiritu] = useState(member?.fecha_bautismo_espiritu ?? "");
  const [cursoMembresia, setCursoMembresia] = useState(member?.curso_membresia === 1);
  const [ministerios, setMinisterios] = useState<string[]>(() => parseLista(member?.ministerios ?? "[]"));
  const [cargos, setCargos] = useState<string[]>(() => parseLista(member?.cargos ?? "[]"));
  const [ministeriosInteres, setMinisteriosInteres] = useState<string[]>(() => parseLista(member?.ministerios_interes ?? "[]"));
  const [instrumentos, setInstrumentos] = useState<string[]>(() => parseLista(member?.instrumentos ?? "[]"));
  const [habilidades, setHabilidades] = useState<string[]>(() => parseLista(member?.habilidades ?? "[]"));
  const [disponibilidad, setDisponibilidad] = useState(member?.disponibilidad ?? "");
  const [interesServir, setInteresServir] = useState(member?.interes_servir === 1);

  const esBaja = member?.activo === 0;

  // Estadísticas de asistencia: derivadas de los servicios guardados
  // (snapshots), nunca almacenadas por separado.
  const [asistencia, setAsistencia] = useState<MemberAsistenciaStats | null>(null);
  const [docs, setDocs] = useState<MemberDoc[] | null>(null);
  useEffect(() => {
    if (!member) return;
    let cancelado = false;
    memberAsistenciaStats(member.id, church.id)
      .then((s) => { if (!cancelado) setAsistencia(s); })
      .catch(console.error);
    memberDocs(member.id, church.id)
      .then((d) => { if (!cancelado) setDocs(d); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [member, church.id]);

  /** Deja el formulario de alta limpio para registrar otro miembro sin cerrar. */
  function limpiarParaOtro() {
    setNombre(""); setEmail(""); setTelefono(""); setRfc(""); setNotas("");
    setEstado("activo");
    setFechaCongregacion(""); setFechaIngreso(""); setIglesiaAnterior("");
    setBautizadoAgua(false); setFechaBautismoAgua("");
    setBautizadoEspiritu(false); setFechaBautismoEspiritu("");
    setCursoMembresia(false);
    setMinisterios([]); setCargos([]); setMinisteriosInteres([]); setInstrumentos([]); setHabilidades([]);
    setDisponibilidad(""); setInteresServir(false);
    setError(null);
  }

  async function guardar(cerrar = true) {
    if (crear && !nombre.trim()) { setError(t("validacion.nombreObligatorio")); return; }
    setSaving(true);
    try {
      const ficha: MemberFicha = {
        estado_membresia: estado,
        cargos,
        fecha_congregacion: fechaCongregacion || null,
        fecha_ingreso: fechaIngreso || null,
        iglesia_anterior: iglesiaAnterior.trim() || null,
        bautizado_agua: bautizadoAgua,
        fecha_bautismo_agua: bautizadoAgua ? fechaBautismoAgua || null : null,
        bautizado_espiritu: bautizadoEspiritu,
        fecha_bautismo_espiritu: bautizadoEspiritu ? fechaBautismoEspiritu || null : null,
        curso_membresia: cursoMembresia,
        ministerios,
        ministerios_interes: ministeriosInteres,
        instrumentos,
        habilidades,
        disponibilidad: disponibilidad.trim() || null,
        interes_servir: interesServir,
      };
      if (crear) {
        const nuevo: NewMember = {
          nombre: nombre.trim(),
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          rfc: rfc.trim() || null,
          notas: notas.trim() || null,
          fecha_ingreso: fechaIngreso || null,
        };
        await insertMemberConFicha(church.id, nuevo, ficha);
      } else {
        await updateMemberFicha(member!.id, church.id, ficha);
      }
      playSound("guardado");
      showToast(crear ? t("toast.miembroGuardado") : t("ficha.toastGuardada"));
      onSaved();
      if (crear && !cerrar) limpiarParaOtro(); else onClose();
    } finally {
      setSaving(false);
    }
  }

  return {
    crear, esBaja, saving, error,
    nombre, setNombre, email, setEmail, telefono, setTelefono, rfc, setRfc, notas, setNotas,
    estado, setEstado,
    fechaCongregacion, setFechaCongregacion, fechaIngreso, setFechaIngreso,
    iglesiaAnterior, setIglesiaAnterior,
    bautizadoAgua, setBautizadoAgua, fechaBautismoAgua, setFechaBautismoAgua,
    bautizadoEspiritu, setBautizadoEspiritu, fechaBautismoEspiritu, setFechaBautismoEspiritu,
    cursoMembresia, setCursoMembresia,
    ministerios, setMinisterios, cargos, setCargos, ministeriosInteres, setMinisteriosInteres,
    instrumentos, setInstrumentos, habilidades, setHabilidades,
    disponibilidad, setDisponibilidad, interesServir, setInteresServir,
    asistencia, docs,
    limpiarParaOtro, guardar,
  };
}
