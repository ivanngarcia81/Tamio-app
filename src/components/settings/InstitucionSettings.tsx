import { useTranslation } from "react-i18next";
import { IconChurch } from "../../icons";

export interface InstitucionFormValues {
  direccion: string;
  region: string;
  telefono: string;
  email: string;
  pie_institucional: string;
  secretaria_nombre: string;
  secretaria_cargo: string;
}

interface Props {
  value: InstitucionFormValues;
  onChange: (patch: Partial<InstitucionFormValues>) => void;
}

/** Datos institucionales para el membrete de cartas y documentos oficiales,
 *  más el nombre de la secretaria (firma cartas y actas). */
export default function InstitucionSettings({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconChurch size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("institucion.titulo")}</div>
            <div className="card-title-sub">{t("institucion.sub")}</div>
          </div>
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">{t("institucion.direccion")}</label>
        <input className="form-input" value={value.direccion} onChange={(e) => onChange({ direccion: e.target.value })} />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{t("institucion.region")}</label>
          <input className="form-input" value={value.region} onChange={(e) => onChange({ region: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">{t("institucion.telefono")}</label>
          <input className="form-input" value={value.telefono} onChange={(e) => onChange({ telefono: e.target.value })} />
        </div>
      </div>
      <div className="form-group full">
        <label className="form-label">{t("institucion.correo")}</label>
        <input className="form-input" type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} />
      </div>
      <div className="form-group full">
        <label className="form-label">{t("institucion.pie")} <span className="opt">{t("common.opcional")}</span></label>
        <input className="form-input" placeholder={t("institucion.piePlaceholder")} value={value.pie_institucional} onChange={(e) => onChange({ pie_institucional: e.target.value })} />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{t("institucion.secretariaNombre")}</label>
          <input className="form-input" value={value.secretaria_nombre} onChange={(e) => onChange({ secretaria_nombre: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">{t("institucion.secretariaCargo")}</label>
          <input className="form-input" value={value.secretaria_cargo} onChange={(e) => onChange({ secretaria_cargo: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
