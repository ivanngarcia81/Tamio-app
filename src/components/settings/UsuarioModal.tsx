import { useState } from "react";
import { ROLES_USUARIO, insertUsuario, updateUsuario, type Church, type Usuario } from "../../db";
import { IconClose, IconWarn } from "../../icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

function tagClassForRol(rol: string): string {
  return ROLES_USUARIO.some((r) => r.id === rol) ? `rol-${rol}` : "rol-otro";
}

interface Props {
  church: Church;
  editing: Usuario | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function UsuarioModal({ church, editing, onClose, onSaved }: Props) {
  const isEdit = editing !== null;

  const [nombre, setNombre] = useState(editing?.nombre ?? "");
  const [rol, setRol] = useState(editing?.rol ?? "tesorero");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [telefono, setTelefono] = useState(editing?.telefono ?? "");
  const [notas, setNotas] = useState(editing?.notas ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setError("Escribe un correo con formato válido."); return; }
    if (telefono.trim() && !PHONE_RE.test(telefono.trim())) { setError("Escribe un teléfono con formato válido."); return; }

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        rol,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        notas: notas.trim() || null,
      };
      if (isEdit) {
        await updateUsuario(editing.id, church.id, payload);
      } else {
        await insertUsuario(church.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(`No se pudo guardar: ${e}`);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar usuario" : "Nuevo usuario"}</div>
            <div className="modal-sub">Directorio de personas que administran la iglesia</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div className="form-group full">
            <label className="form-label">Nombre completo</label>
            <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="p. ej. Brenda Rosado" />
          </div>

          <div className="form-group full">
            <label className="form-label">Rol</label>
            <div className="type-grid">
              {ROLES_USUARIO.map((r) => (
                <span
                  key={r.id}
                  className={`tag ${tagClassForRol(r.id)} cat-pill${rol === r.id ? " is-selected" : ""}`}
                  onClick={() => setRol(r.id)}
                >
                  {r.nombre}
                </span>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Correo electrónico <span className="opt">(opcional)</span></label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono <span className="opt">(opcional)</span></label>
              <input className="form-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="55 0000 0000" />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">Notas <span className="opt">(opcional)</span></label>
            <textarea className="form-textarea" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Información adicional relevante…" />
          </div>

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">Este directorio todavía no controla el acceso a la app.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar usuario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
