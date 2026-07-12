import { useState } from "react";
import { updateChurch, type Church } from "../db";
import { IconCheck } from "../icons";

interface Props {
  church: Church;
  onChurchUpdated: (c: Church) => void;
}

export default function Configuracion({ church, onChurchUpdated }: Props) {
  const [nombre, setNombre] = useState(church.nombre);
  const [ciudad, setCiudad] = useState(church.ciudad ?? "");
  const [pais, setPais] = useState(church.pais ?? "");
  const [moneda, setMoneda] = useState(church.moneda);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    nombre !== church.nombre ||
    ciudad !== (church.ciudad ?? "") ||
    pais !== (church.pais ?? "") ||
    moneda !== church.moneda;

  async function guardar() {
    if (!nombre.trim()) {
      setError("El nombre de la iglesia es obligatorio.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updated = await updateChurch(church.id, {
        nombre: nombre.trim(),
        ciudad: ciudad.trim() || null,
        pais: pais.trim() || null,
        moneda,
      });
      onChurchUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(`No se pudo guardar: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">Configuración</div>
          <div className="page-sub">Datos de la iglesia</div>
        </div>
      </div>

      <div className="content">
        <div className="card pad-lg" style={{ maxWidth: 520 }}>
          <div className="card-title" style={{ marginBottom: 18 }}>Información de la iglesia</div>

          <div className="form-group full">
            <label className="form-label">Nombre de la iglesia</label>
            <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="p. ej. Iglesia Central" />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Ciudad <span className="opt">(opcional)</span></label>
              <input className="form-input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="p. ej. Ciudad de México" />
            </div>
            <div className="form-group">
              <label className="form-label">País <span className="opt">(opcional)</span></label>
              <input className="form-input" value={pais} onChange={(e) => setPais(e.target.value)} placeholder="p. ej. México" />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">Moneda</label>
            <select className="form-select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="USD">USD — Dólar</option>
              <option value="MXN">MXN — Peso mexicano</option>
            </select>
            <div className="form-hint">Se usará en todos los movimientos nuevos, reportes y balances.</div>
          </div>

          {error && (
            <div className="form-warning" style={{ marginBottom: 8 }}>{error}</div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <button className="btn primary" onClick={guardar} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            {saved && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#059669", fontWeight: 600 }}>
                <IconCheck size={14} /> Guardado
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
