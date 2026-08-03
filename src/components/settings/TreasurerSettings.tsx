// Tarjeta de "Información del Tesorero". El mismo patrón (nombre, cargo,
// correo, teléfono) sirve como plantilla para agregar más adelante Pastor,
// Secretario, Auditor o Consejo administrativo sin rediseñar la pantalla —
// solo se necesitaría otra tarjeta igual a esta con su propio prefijo de
// columnas en `churches` (o una tabla `roles` si llegan a ser varias personas
// por rol).
import { useTranslation } from "react-i18next";
import { IconUser } from "../../icons";
import GuardadoChip, { type EstadoGuardado } from "./GuardadoChip";

export interface TreasurerFormValues {
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
}

export interface TreasurerFormErrors {
  nombre?: string;
  cargo?: string;
  email?: string;
  telefono?: string;
}

interface Props {
  /** Indicador de guardado automático de esta tarjeta. */
  estado?: EstadoGuardado;
  value: TreasurerFormValues;
  onChange: (patch: Partial<TreasurerFormValues>) => void;
  errors: TreasurerFormErrors;
}

export default function TreasurerSettings({ value, onChange, errors, estado }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconUser size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("tesorero.titulo")}</div>
            <div className="card-title-sub">{t("tesorero.sub")}</div>
          </div>
        </div>
        {estado && <GuardadoChip estado={estado} />}
      </div>

      <div className="form-group full">
        <label className="form-label">{t("tesorero.nombreLabel")}</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder={t("tesorero.nombrePlaceholder")}
        />
        {errors.nombre && <div className="field-error">{errors.nombre}</div>}
      </div>

      <div className="form-group full">
        <label className="form-label">{t("tesorero.cargo")}</label>
        <input
          className="form-input"
          value={value.cargo}
          onChange={(e) => onChange({ cargo: e.target.value })}
          placeholder={t("tesorero.cargoPlaceholder")}
        />
        {errors.cargo && <div className="field-error">{errors.cargo}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{t("tesorero.correo")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder={t("tesorero.correoPlaceholder")}
          />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="form-group">
          <label className="form-label">{t("tesorero.telefono")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            value={value.telefono}
            onChange={(e) => onChange({ telefono: e.target.value })}
            placeholder={t("tesorero.telefonoPlaceholder")}
          />
          {errors.telefono && <div className="field-error">{errors.telefono}</div>}
        </div>
      </div>
    </div>
  );
}
