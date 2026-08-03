import { useTranslation } from "react-i18next";
import { IconCheck, IconWarn } from "../../icons";

/**
 * Estado de guardado de una tarjeta de Ajustes (modelo "todo se guarda al
 * cambiar"). El requisito clave es el estado `error`: si el guardado
 * automático falla EN SILENCIO, el usuario cree que quedó grabado y no fue
 * así — justo el problema que el guardado automático viene a evitar. Por eso
 * el error es persistente (no se esconde solo) y "guardado" sí se apaga a
 * los pocos segundos.
 */
export type EstadoGuardado =
  | { tipo: "oculto" }
  | { tipo: "guardando" }
  | { tipo: "guardado" }
  | { tipo: "error"; detalle: string };

export default function GuardadoChip({ estado }: { estado: EstadoGuardado }) {
  const { t } = useTranslation();
  if (estado.tipo === "oculto") return null;
  if (estado.tipo === "guardando") {
    return <span className="form-hint" style={{ whiteSpace: "nowrap" }}>{t("common.guardando")}</span>;
  }
  if (estado.tipo === "guardado") {
    return (
      <span className="settings-saved-pill" style={{ whiteSpace: "nowrap" }}>
        <IconCheck size={13} /> {t("common.guardado")}
      </span>
    );
  }
  return (
    <span
      className="form-warning"
      title={estado.detalle}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
    >
      <IconWarn size={13} /> {estado.detalle}
    </span>
  );
}
