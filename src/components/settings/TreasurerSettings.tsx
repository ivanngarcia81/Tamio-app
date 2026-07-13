// Tarjeta de "Información del Tesorero". El mismo patrón (nombre, cargo,
// correo, teléfono) sirve como plantilla para agregar más adelante Pastor,
// Secretario, Auditor o Consejo administrativo sin rediseñar la pantalla —
// solo se necesitaría otra tarjeta igual a esta con su propio prefijo de
// columnas en `churches` (o una tabla `roles` si llegan a ser varias personas
// por rol).
import { IconUser } from "../../icons";

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
  value: TreasurerFormValues;
  onChange: (patch: Partial<TreasurerFormValues>) => void;
  errors: TreasurerFormErrors;
}

export default function TreasurerSettings({ value, onChange, errors }: Props) {
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconUser size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Información del tesorero</div>
            <div className="card-title-sub">Se usa para identificar quién generó cada reporte</div>
          </div>
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">Nombre completo</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="p. ej. Juan Pérez"
        />
        {errors.nombre && <div className="field-error">{errors.nombre}</div>}
      </div>

      <div className="form-group full">
        <label className="form-label">Cargo</label>
        <input
          className="form-input"
          value={value.cargo}
          onChange={(e) => onChange({ cargo: e.target.value })}
          placeholder="Tesorero"
        />
        {errors.cargo && <div className="field-error">{errors.cargo}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Correo electrónico <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="correo@ejemplo.com"
          />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </div>
        <div className="form-group">
          <label className="form-label">Teléfono <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            value={value.telefono}
            onChange={(e) => onChange({ telefono: e.target.value })}
            placeholder="55 0000 0000"
          />
          {errors.telefono && <div className="field-error">{errors.telefono}</div>}
        </div>
      </div>
    </div>
  );
}
