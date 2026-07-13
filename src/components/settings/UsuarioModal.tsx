import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLES_USUARIO, insertUsuario, updateUsuario, type Church, type Usuario } from "../../db";
import { IconClose, IconWarn } from "../../icons";
import { showToast } from "../../toast";
import { playSound } from "../../sound";
import { useEscapeClose } from "../../hooks/useEscapeClose";

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
  const { t } = useTranslation();
  useEscapeClose(onClose);
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
    if (!nombre.trim()) { setError(t("validacion.nombreObligatorio")); return; }
    if (email.trim() && !EMAIL_RE.test(email.trim())) { setError(t("validacion.correoInvalido")); return; }
    if (telefono.trim() && !PHONE_RE.test(telefono.trim())) { setError(t("validacion.telefonoInvalido")); return; }

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
      showToast(isEdit ? t("toast.cambiosGuardados") : t("toast.usuarioGuardado"));
      playSound("guardado");
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? t("usuarios.modalEditar") : t("usuarios.modalNuevo")}</div>
            <div className="modal-sub">{t("usuarios.modalSub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div className="form-group full">
            <label className="form-label">{t("usuarios.nombreLabel")}</label>
            <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("usuarios.nombrePlaceholder")} />
          </div>

          <div className="form-group full">
            <label className="form-label">{t("usuarios.rolLabel")}</label>
            <div className="type-grid">
              {ROLES_USUARIO.map((r) => (
                <span
                  key={r.id}
                  className={`tag ${tagClassForRol(r.id)} cat-pill${rol === r.id ? " is-selected" : ""}`}
                  onClick={() => setRol(r.id)}
                >
                  {t(`rol.${r.id}`)}
                </span>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t("tesorero.correo")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("tesorero.correoPlaceholder")} />
            </div>
            <div className="form-group">
              <label className="form-label">{t("tesorero.telefono")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder={t("tesorero.telefonoPlaceholder")} />
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">{t("usuarios.notas")} <span className="opt">{t("common.opcional")}</span></label>
            <textarea className="form-textarea" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t("usuarios.notasPlaceholder")} />
          </div>

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">{t("usuarios.modalHint")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : isEdit ? t("common.guardarCambios") : t("usuarios.guardarUsuario")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
