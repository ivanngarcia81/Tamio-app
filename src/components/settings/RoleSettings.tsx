import { useTranslation } from "react-i18next";
import { IconIdBadge, IconUser } from "../../icons";
import type { Role } from "../../role";

interface Props {
  value: Role;
  onChange: (r: Role) => void;
  /** Con login activo el rol lo fija el servidor: se muestra en modo lectura. */
  authActivo?: boolean;
  sesionEmail?: string | null;
  onSalir?: () => void;
}

/** Selector de rol. Sin login es un selector temporal (Tesorero/Secretaria);
 *  con login muestra el usuario y su rol en modo lectura + cerrar sesión. */
export default function RoleSettings({ value, onChange, authActivo, sesionEmail, onSalir }: Props) {
  const { t } = useTranslation();
  const opciones: { id: Role; label: string }[] = [
    { id: "tesorero", label: t("rol.tesorero") },
    { id: "secretaria", label: t("rol.secretaria") },
  ];

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconUser size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{authActivo ? t("rolConfig.tituloSesion") : t("rolConfig.titulo")}</div>
            <div className="card-title-sub">{authActivo ? t("rolConfig.subSesion") : t("rolConfig.sub")}</div>
          </div>
        </div>
      </div>

      {authActivo ? (
        <div className="sesion-box">
          {sesionEmail && <div className="sesion-email">{sesionEmail}</div>}
          <div className="sesion-rol">{value === "secretaria" ? t("rol.secretaria") : t("rol.tesorero")}</div>
          <button className="btn secondary sm" onClick={onSalir}>{t("login.salir")}</button>
        </div>
      ) : (
        <>
          <div className="tabs-segmented" style={{ marginBottom: 10 }}>
            {opciones.map((opt) => (
              <div key={opt.id} className={`seg${value === opt.id ? " active" : ""}`} onClick={() => onChange(opt.id)}>
                {opt.id === "tesorero" ? <IconUser size={14} strokeWidth={2} /> : <IconIdBadge size={14} strokeWidth={2} />} {opt.label}
              </div>
            ))}
          </div>
          <div className="form-hint">{t("rolConfig.hint")}</div>
        </>
      )}
    </div>
  );
}
