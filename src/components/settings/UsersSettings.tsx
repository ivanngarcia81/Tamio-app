import { useState } from "react";
import { ROLES_USUARIO, deleteUsuario, type Church, type Usuario } from "../../db";
import { IconEdit, IconIdBadge, IconPlus } from "../../icons";
import RowMenu from "../RowMenu";
import ConfirmDialog from "../ConfirmDialog";
import UsuarioModal from "./UsuarioModal";

function rolNombre(rol: string): string {
  return ROLES_USUARIO.find((r) => r.id === rol)?.nombre ?? rol;
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
    onChanged();
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconIdBadge size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">Usuarios</div>
            <div className="card-title-sub">Directorio de personas que administran la iglesia</div>
          </div>
        </div>
        <button className="btn secondary sm" onClick={abrirNuevo}>
          <IconPlus size={13} /> Agregar usuario
        </button>
      </div>

      {usuarios.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>
          Aún no hay usuarios registrados. Agrega al tesorero, pastor u otras personas que administran la iglesia.
        </div>
      ) : (
        <div className="data-table roomy">
          <div className="thead" style={{ gridTemplateColumns: COLS }}>
            <div className="th">Nombre</div>
            <div className="th">Rol</div>
            <div className="th">Contacto</div>
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
                <div className="truncate">{u.email ?? "Sin correo"}</div>
                <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{u.telefono ?? "Sin teléfono"}</div>
              </div>
              <div className="td" style={{ textAlign: "center" }}>
                <span className="row-actions">
                  <span className="row-icon-btn" title="Editar" onClick={() => abrirEditar(u)}>
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
        Este directorio todavía no controla el acceso a la app — es la base para cuando exista un sistema de inicio de sesión.
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
          title="Eliminar usuario"
          message={`¿Eliminar a "${pendingDelete.nombre}" del directorio? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
