import { useTranslation } from "react-i18next";
import { IconUser } from "../../icons";

export interface PastorFormValues {
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
}

export interface PastorFormErrors {
  nombre?: string;
  cargo?: string;
  email?: string;
  telefono?: string;
}

interface Props {
  value: PastorFormValues;
  onChange: (patch: Partial<PastorFormValues>) => void;
  errors: PastorFormErrors;
}

export default function PastorSettings({ value, onChange, errors }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconUser size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("pastor.titulo")}</div>
            <div className="card-title-sub">{t("pastor.sub")}</div>
          </div>
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">{t("pastor.nombreLabel")}</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder={t("pastor.nombrePlaceholder")}
        />
        {errors.nombre && <div className="field-error">{errors.nombre}</div>}
      </div>

      <div className="form-group full">
        <label className="form-label">{t("pastor.cargo")}</label>
        <input
          className="form-input"
          value={value.cargo}
          onChange={(e) => onChange({ cargo: e.target.value })}
          placeholder={t("pastor.cargoPlaceholder")}
        />
        {errors.cargo && <div className="field-error">{errors.cargo}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{t("pastor.correo")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder={t("pastor.correoPlaceholder")}
          />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="form-group">
          <label className="form-label">{t("pastor.telefono")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            value={value.telefono}
            onChange={(e) => onChange({ telefono: e.target.value })}
            placeholder={t("pastor.telefonoPlaceholder")}
          />
          {errors.telefono && <div className="field-error">{errors.telefono}</div>}
        </div>
      </div>
    </div>
  );
}
