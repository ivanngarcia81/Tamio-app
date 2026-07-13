import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconMonitor, IconMoon, IconSun } from "../../icons";

export type ThemePref = "light" | "dark" | "auto";

interface Props {
  value: ThemePref;
  onChange: (pref: ThemePref) => void;
}

export default function AppearanceSettings({ value, onChange }: Props) {
  const { t } = useTranslation();
  const opciones: { id: ThemePref; label: string; icon: ReactNode }[] = [
    { id: "light", label: t("apariencia.claro"), icon: <IconSun size={14} strokeWidth={2} /> },
    { id: "dark", label: t("apariencia.oscuro"), icon: <IconMoon size={14} strokeWidth={2} /> },
    { id: "auto", label: t("apariencia.automatico"), icon: <IconMonitor size={14} strokeWidth={2} /> },
  ];
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconMonitor size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("apariencia.titulo")}</div>
            <div className="card-title-sub">{t("apariencia.sub")}</div>
          </div>
        </div>
      </div>

      <div className="tabs-segmented" style={{ marginBottom: 10 }}>
        {opciones.map((opt) => (
          <div
            key={opt.id}
            className={`seg${value === opt.id ? " active" : ""}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.icon} {opt.label}
          </div>
        ))}
      </div>
      <div className="form-hint">{t("apariencia.hint")}</div>
    </div>
  );
}
