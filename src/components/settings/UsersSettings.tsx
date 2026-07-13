import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLES_USUARIO, deleteUsuario, type Church, type Usuario } from "../../db";
import { IconEdit, IconIdBadge, IconPlus } from "../../icons";
import RowMenu from "../RowMenu";
import ConfirmDialog from "../ConfirmDialog";
import UsuarioModal from "./UsuarioModal";
import { showToast } from "../../toast";

function useRolNombre(): (rol: string) => string {
  const { t } = useTranslation();
  return (rol) => (ROLES_USUARIO.some((r) => r.id === rol) ? t(`rol.${rol}`) : rol);
}

function tagClassForRol(rol: string): string {
  return ROLES_USUARIO.some((r) => r.id === rol) ? `rol-${rol}` : "rol-otro";
}

const COLS = "1fr 150px 170px 40px";

interface Props {
  church: Church;
  usuarios: Usuario[];
  onChanged: () => void;
}

export default function UsersSettings({ church, usuarios, onChanged }: Props) {
  const { t } = useTranslation();
  const rolNombre = useRolNombre();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Usuario | null>(null);

  function abrirNuevo() {
    setEditing(null);
    setModalOpen(true);
  }

  function abrirEditar(u: Usuario) {
    setEditing(u);
    setModalOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteUsuario(pendingDelete.id, pendingDelete.church_id);
    setPendingDelete(null);
    showToast(t("toast.usuarioEliminado"));
    onChanged();
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconIdBadge size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("usuarios.titulo")}</div>
            <div className="card-title-sub">{t("usuarios.sub")}</div>
          </div>
        </div>
        <button className="btn secondary sm" onClick={abrirNuevo}>
          <IconPlus size={13} /> {t("usuarios.agregar")}
        </button>
      </div>

      {usuarios.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>
          {t("usuarios.vacio")}
        </div>
      ) : (
        <div className="data-table roomy">
          <div className="thead" style={{ gridTemplateColumns: COLS }}>
            <div className="th">{t("usuarios.colNombre")}</div>
            <div className="th">{t("usuarios.colRol")}</div>
            <div className="th">{t("usuarios.colContacto")}</div>
            <div className="th"></div>
          </div>
          {usuarios.map((u) => (
            <div className="tr" key={u.id} style={{ gridTemplateColumns: COLS }}>
              <div className="td">
                <div className="truncate" style={{ fontWeight: 600 }} title={u.nombre}>{u.nombre}</div>
              </div>
              <div className="td">
                <span className={`tag ${tagClassForRol(u.rol)}`} title={rolNombre(u.rol)}>{rolNombre(u.rol)}</span>
              </div>
              <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                <div className="truncate">{u.email ?? t("common.sinCorreo")}</div>
                <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{u.telefono ?? t("common.sinTelefono")}</div>
              </div>
              <div className="td" style={{ textAlign: "center" }}>
                <span className="row-actions">
                  <span className="row-icon-btn" title={t("common.editar")} onClick={() => abrirEditar(u)}>
                    <IconEdit size={13} strokeWidth={2} />
                  </span>
                </span>
                <RowMenu onEdit={() => abrirEditar(u)} onDelete={() => setPendingDelete(u)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form-hint" style={{ marginTop: 14 }}>
        {t("usuarios.hintSinLogin")}
      </div>

      {modalOpen && (
        <UsuarioModal
          church={church}
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={onChanged}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("usuarios.eliminarTitulo")}
          message={t("usuarios.eliminarMensaje", { nombre: pendingDelete.nombre })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
