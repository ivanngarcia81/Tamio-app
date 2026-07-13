export interface ChurchFormValues {
  nombre: string;
  ciudad: string;
  pais: string;
  moneda: string;
}

interface Props {
  value: ChurchFormValues;
  onChange: (patch: Partial<ChurchFormValues>) => void;
  error?: string | null;
}

export default function ChurchSettings({ value, onChange, error }: Props) {
  return (
    <div className="card pad-lg">
      <div className="card-title" style={{ marginBottom: 18 }}>Información de la iglesia</div>

      <div className="form-group full">
        <label className="form-label">Nombre de la iglesia</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="p. ej. Iglesia Central"
        />
        {error && <div className="field-error">{error}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Ciudad <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            value={value.ciudad}
            onChange={(e) => onChange({ ciudad: e.target.value })}
            placeholder="p. ej. Ciudad de México"
          />
        </div>
        <div className="form-group">
          <label className="form-label">País <span className="opt">(opcional)</span></label>
          <input
            className="form-input"
            value={value.pais}
            onChange={(e) => onChange({ pais: e.target.value })}
            placeholder="p. ej. México"
          />
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label">Moneda</label>
        <select className="form-select" value={value.moneda} onChange={(e) => onChange({ moneda: e.target.value })}>
          <option value="USD">USD — Dólar</option>
          <option value="MXN">MXN — Peso mexicano</option>
        </select>
        <div className="form-hint">Se usará en todos los movimientos nuevos, reportes y balances.</div>
      </div>
    </div>
  );
}
