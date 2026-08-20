import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ROLES_USUARIO, deleteUsuario, insertUsuario, updateUsuario, type Church, type Usuario } from "../../db";
import { IconEdit, IconIdBadge, IconPlus } from "../../icons";
import ConfirmDialog from "../ConfirmDialog";
import UsuarioModal from "./UsuarioModal";
import { showToast } from "../../toast";
import { playSound } from "../../sound";

function useRolNombre(): (rol: string) => string {
  const { t } = useTranslation();
  return (rol) => (ROLES_USUARIO.some((r) => r.id === rol) ? t(`rol.${rol}`) : rol);
}

/** Dos letras para el círculo de la fila: las iniciales de las dos primeras
 *  palabras del nombre, o las dos primeras letras si es una sola. La misma
 *  cuenta que hace el sidebar con el nombre de la iglesia. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

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
  /* Qué fila está seleccionada, para que el "−" del pie sepa a quién quitar.
     Es el mismo trato que la tabla de categorías, que ya enseñó este gesto en
     esta misma pantalla: clic selecciona, doble clic abre el editor. */
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const seleccionado = usuarios.find((u) => u.id === seleccion) ?? null;

  function abrirNuevo() {
    setEditing(null);
    setModalOpen(true);
  }

  function abrirEditar(u: Usuario) {
    setEditing(u);
    setModalOpen(true);
  }

  /** El rol se cambia en la propia fila; el resto de los campos (correo,
   *  teléfono, notas) siguen en el modal. `updateUsuario` reescribe la fila
   *  entera, así que se le pasa lo que ya había con el rol nuevo encima. */
  async function cambiarRol(u: Usuario, rol: string) {
    try {
      await updateUsuario(u.id, u.church_id, {
        nombre: u.nombre, rol, email: u.email, telefono: u.telefono, notas: u.notas,
      });
      onChanged();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const borrado = pendingDelete;
    await deleteUsuario(borrado.id, borrado.church_id);
    setPendingDelete(null);
    setSeleccion(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.usuarioEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        await insertUsuario(borrado.church_id, {
          nombre: borrado.nombre,
          rol: borrado.rol,
          email: borrado.email,
          telefono: borrado.telefono,
          notas: borrado.notas,
        });
        onChanged();
      },
    });
  }

  return (
    /* El pie de nota explica el bloque entero, así que vive FUERA de la caja
       —es lo que hace Ajustes del Sistema— y por eso hay un envoltorio: la
       tarjeta es la raíz del componente y sin él la nota no podría ser su
       hermana. Ver `.settings-bloque` en styles.css. */
    <div className="settings-bloque">
      <div className="card pad-lg settings-card">
        {/* La cabecera ya no lleva "Agregar usuario": ese botón es ahora el "+"
            del pie de la lista, donde macOS pone el de una tabla editable. */}
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-icon"><IconIdBadge size={16} /></div>
            <div className="card-head-titles">
              <div className="card-title-lg">{t("usuarios.titulo")}</div>
              <div className="card-title-sub">{t("usuarios.sub")}</div>
            </div>
          </div>
        </div>

        {/* Lista y no tabla: de las tres columnas de antes (nombre │ pastilla de
            rol │ correo y teléfono) solo el nombre necesitaba una columna
            propia. El rol pasa a ser un desplegable que se cambia sin abrir
            nada, y el correo baja bajo el nombre — que es donde se lee, no en
            una tercera columna a 400 px de distancia. */}
        <div className="settings-lista">
          {usuarios.length === 0 ? (
            <div className="settings-lista-vacio">{t("usuarios.vacio")}</div>
          ) : usuarios.map((u) => (
            <div
              key={u.id}
              className={`settings-lista-fila${seleccion === u.id ? " sel" : ""}`}
              onClick={() => setSeleccion(u.id)}
              onDoubleClick={() => abrirEditar(u)}
            >
              <span className="settings-lista-avatar" aria-hidden="true">{iniciales(u.nombre)}</span>
              <span className="settings-lista-texto">
                <span className="settings-lista-nombre" title={u.nombre}>{u.nombre}</span>
                <span className="settings-lista-sub">{u.email ?? t("common.sinCorreo")}</span>
              </span>
              {/* `stopPropagation` en el clic: abrir el desplegable no debe
                  contar como seleccionar la fila. */}
              <select
                className="form-select settings-lista-rol"
                value={u.rol}
                aria-label={t("usuarios.rolLabel")}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => cambiarRol(u, e.target.value)}
              >
                {/* Un rol escrito a mano en una versión anterior no está en la
                    lista; se añade como opción suya para no perderlo al tocar
                    cualquier otra cosa de la fila. */}
                {!ROLES_USUARIO.some((r) => r.id === u.rol) && <option value={u.rol}>{rolNombre(u.rol)}</option>}
                {ROLES_USUARIO.map((r) => <option key={r.id} value={r.id}>{t(`rol.${r.id}`)}</option>)}
              </select>
              {/* El lápiz se queda aunque el doble clic haga lo mismo: el modal
                  tiene cuatro campos que la fila no muestra (teléfono, notas…) y
                  un gesto que solo se descubre leyendo el pie no es una puerta. */}
              <button
                type="button"
                className="row-icon-btn"
                title={t("common.editar")}
                aria-label={t("common.editar")}
                onClick={(e) => { e.stopPropagation(); abrirEditar(u); }}
              >
                <IconEdit size={13} strokeWidth={2} />
              </button>
            </div>
          ))}

          <div className="settings-pie">
            <button
              type="button"
              className="settings-pie-btn"
              title={t("usuarios.agregar")}
              aria-label={t("usuarios.agregar")}
              onClick={abrirNuevo}
            >
              <IconPlus size={11} />
            </button>
            <button
              type="button"
              className="settings-pie-btn"
              title={t("common.eliminar")}
              aria-label={t("common.eliminar")}
              disabled={!seleccionado}
              onClick={() => seleccionado && setPendingDelete(seleccionado)}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
          </div>
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
      <p className="settings-nota">{t("usuarios.hintLista")}</p>
      <p className="settings-nota">{t("usuarios.hintSinLogin")}</p>
    </div>
  );
}
