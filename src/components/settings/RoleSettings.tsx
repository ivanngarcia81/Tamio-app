import { useTranslation } from "react-i18next";
import { IconIdBadge, IconUser } from "../../icons";
import type { Role } from "../../role";

interface Props {
  value: Role;
  onChange: (r: Role) => void;
}

/** Selector de rol temporal (Tesorero/Secretaria). Solo se usa cuando NO hay
 *  login configurado; con Supabase el rol lo fija el servidor y la sesión
 *  (usuario + cerrar sesión) vive en el sidebar. */
export default function RoleSettings({ value, onChange }: Props) {
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
            <div className="card-title-lg">{t("rolConfig.titulo")}</div>
            <div className="card-title-sub">{t("rolConfig.sub")}</div>
          </div>
        </div>
      </div>

      <div className="tabs-segmented" style={{ marginBottom: 10 }}>
        {opciones.map((opt) => (
          <div key={opt.id} className={`seg${value === opt.id ? " active" : ""}`} onClick={() => onChange(opt.id)}>
            {opt.id === "tesorero" ? <IconUser size={14} strokeWidth={2} /> : <IconIdBadge size={14} strokeWidth={2} />} {opt.label}
          </div>
        ))}
      </div>
      <div className="form-hint">{t("rolConfig.hint")}</div>
    </div>
  );
}
