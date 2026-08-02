import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LangPref } from "../../i18n";
import { IconGlobe, IconMonitor } from "../../icons";

interface Props {
  value: LangPref;
  onChange: (pref: LangPref) => void;
}

export default function LanguageSettings({ value, onChange }: Props) {
  const { t } = useTranslation();

  const opciones: { id: LangPref; label: string; icon: ReactNode }[] = [
    { id: "auto", label: t("idioma.automatico"), icon: <IconMonitor size={14} strokeWidth={2} /> },
    { id: "es", label: t("idioma.espanol"), icon: null },
    { id: "en", label: t("idioma.ingles"), icon: null },
  ];

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconGlobe size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("idioma.titulo")}</div>
            <div className="card-title-sub">{t("idioma.sub")}</div>
          </div>
        </div>
      </div>

      <div className="tabs-segmented" style={{ marginBottom: 10 }}>
        {opciones.map((opt) => (
          <button
            type="button"
            key={opt.id}
            className={`seg${value === opt.id ? " active" : ""}`}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>
      <div className="form-hint">{t("idioma.hint")}</div>
    </div>
  );
}
