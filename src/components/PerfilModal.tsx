import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { comprimirAvatar, iniciales } from "../services/avatar";
import { IconClose, IconUpload, IconUser, IconWarn } from "../icons";

interface Props {
  nombre: string | null;
  email: string | null;
  foto: string | null;
  onGuardarFoto: (foto: string | null) => Promise<void>;
  onClose: () => void;
}

export default function PerfilModal({ nombre, email, foto, onGuardarFoto, onClose }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [fotoLocal, setFotoLocal] = useState<string | null>(foto);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const sinCambios = fotoLocal === foto;
  const ini = iniciales(nombre, email);

  async function elegir() {
    setError(null);
    try {
      const sel = await openFileDialog({
        multiple: false,
        title: t("perfil.seleccionarFoto"),
        filters: [{ name: t("perfil.imagen"), extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (typeof sel !== "string") return;
      const bytes = await readFile(sel);
      const dataUrl = await comprimirAvatar(bytes, sel);
      setFotoLocal(dataUrl);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await onGuardarFoto(fotoLocal);
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="perfil-card">
        <button type="button" className="modal-close" onClick={onClose} aria-label={t("common.cerrar")}>
          <IconClose size={16} />
        </button>
        <div className="perfil-title">{t("perfil.titulo")}</div>

        <div className="perfil-avatar-grande">
          {fotoLocal
            ? <img src={fotoLocal} alt="" />
            : (ini ? <span className="perfil-ini">{ini}</span> : <IconUser size={40} />)}
        </div>

        <div className="perfil-nombre">{(nombre && nombre.trim()) || (email ? email.split("@")[0] : t("perfil.usuario"))}</div>
        {email && <div className="perfil-email">{email}</div>}

        <div className="perfil-acciones">
          <button type="button" className="btn secondary" onClick={elegir}>
            <IconUpload size={14} /> {fotoLocal ? t("perfil.cambiarFoto") : t("perfil.subirFoto")}
          </button>
          {fotoLocal && (
            <button type="button" className="btn ghost" onClick={() => setFotoLocal(null)}>
              {t("perfil.quitarFoto")}
            </button>
          )}
        </div>

        <div className="form-hint" style={{ textAlign: "center" }}>{t("perfil.hint")}</div>

        {error && (
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 10 }}>
            <IconWarn size={13} /> {error}
          </div>
        )}

        <div className="perfil-footer">
          <button type="button" className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
          <button type="button" className="btn primary" onClick={guardar} disabled={sinCambios || guardando}>
            {guardando ? t("common.guardando") : t("common.guardarCambios")}
          </button>
        </div>
      </div>
    </div>
  );
}
