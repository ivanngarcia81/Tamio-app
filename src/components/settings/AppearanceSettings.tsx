import type { ReactNode } from "react";
import { IconMonitor, IconMoon, IconSun } from "../../icons";

export type ThemePref = "light" | "dark" | "auto";

interface Props {
  value: ThemePref;
  onChange: (pref: ThemePref) => void;
}

const OPCIONES: { id: ThemePref; label: string; icon: ReactNode }[] = [
  { id: "light", label: "Claro", icon: <IconSun size={14} strokeWidth={2} /> },
  { id: "dark", label: "Oscuro", icon: <IconMoon size={14} strokeWidth={2} /> },
  { id: "auto", label: "Automático", icon: <IconMonitor size={14} strokeWidth={2} /> },
];

export default function AppearanceSettings({ value, onChange }: Props) {
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconMonitor size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Apariencia</div>
            <div className="card-title-sub">Elige el tema de la aplicación</div>
          </div>
        </div>
      </div>

      <div className="tabs-segmented" style={{ marginBottom: 10 }}>
        {OPCIONES.map((opt) => (
          <div
            key={opt.id}
            className={`seg${value === opt.id ? " active" : ""}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.icon} {opt.label}
          </div>
        ))}
      </div>
      <div className="form-hint">
        "Automático" sigue el modo claro/oscuro del sistema operativo y cambia solo si tú lo cambias ahí.
      </div>
    </div>
  );
}
