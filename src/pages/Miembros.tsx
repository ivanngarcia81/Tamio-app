import { useEffect, useState } from "react";
import { archiveMember, countMemberTx, deleteMember, listMembers, type Church, type Member } from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconPlus } from "../icons";

const TAG_CLASS: Record<string, string> = {
  diezmador: "diezmo",
  donador: "donacion",
  ofrendante: "ofrenda",
  comite: "pastores",
  junta: "mantenimiento",
};

const TAG_NOMBRE: Record<string, string> = {
  diezmador: "Diezmador",
  donador: "Donador",
  ofrendante: "Ofrendante",
  comite: "Comité",
  junta: "Junta",
};

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];

function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();
}

interface Props {
  church: Church;
  refreshKey: number;
  onNew: () => void;
  onEdit: (member: Member) => void;
  onChanged: () => void;
}

interface PendingDelete {
  member: Member;
  hasHistory: boolean;
  count: number;
}

export default function Miembros({ church, refreshKey, onNew, onEdit, onChanged }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  useEffect(() => {
    listMembers(church.id).then(setMembers).catch(console.error);
  }, [church.id, refreshKey]);

  async function requestDelete(m: Member) {
    const n = await countMemberTx(m.id, church.id);
    setPendingDelete({ member: m, hasHistory: n > 0, count: n });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { member, hasHistory } = pendingDelete;
    if (hasHistory) {
      await archiveMember(member.id, church.id);
    } else {
      await deleteMember(member.id, church.id);
    }
    setPendingDelete(null);
    onChanged();
  }

  const q = query.trim().toLowerCase();
  const visibles = q
    ? members.filter(
        (m) =>
          m.nombre.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q) ||
          (m.rfc ?? "").toLowerCase().includes(q)
      )
    : members;

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">Miembros</div>
          <div className="page-sub">
            {members.length} miembro{members.length === 1 ? "" : "s"} activo{members.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> Nuevo miembro
          </button>
        </div>
      </div>

      <div className="content">
        <div className="tx-head">
          <div style={{ position: "relative", flex: 1, maxWidth: 420 }}>
            <input
              className="form-input"
              placeholder="Buscar por nombre, email o RFC…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            titulo={members.length === 0 ? "Aún no hay miembros" : "Sin resultados"}
            sub={
              members.length === 0
                ? "Agrega al primer miembro o familia con el botón de arriba."
                : "Prueba con otro término de búsqueda."
            }
          />
        ) : (
          <div className="data-table">
            <div className="thead" style={{ gridTemplateColumns: "1.7fr 1.2fr 160px 160px 40px" }}>
              <div className="th">Miembro</div>
              <div className="th">Etiquetas</div>
              <div className="th">Contacto</div>
              <div className="th">RFC</div>
              <div className="th"></div>
            </div>
            {visibles.map((m, i) => {
              let etiquetas: string[] = [];
              try { etiquetas = JSON.parse(m.etiquetas); } catch { /* noop */ }
              return (
                <div
                  className="tr"
                  key={m.id}
                  style={{ gridTemplateColumns: "1.7fr 1.2fr 160px 160px 40px" }}
                >
                  <div className="td">
                    <div className="person">
                      <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                        {initials(m.nombre)}
                      </div>
                      <div>
                        <div className="p-name">{m.nombre}</div>
                        <div className="p-mail">{m.email ?? "Sin correo registrado"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="td">
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {etiquetas.length === 0 && (
                        <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>
                      )}
                      {etiquetas.map((et) => (
                        <span key={et} className={`tag ${TAG_CLASS[et] ?? "otros"}`} style={{ justifySelf: "start" }}>
                          {TAG_NOMBRE[et] ?? et}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {m.telefono ?? "—"}
                  </div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {m.rfc ?? "Sin RFC"}
                  </div>
                  <div className="td">
                    <RowMenu
                      onEdit={() => onEdit(m)}
                      onDelete={() => requestDelete(m)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.hasHistory ? "Archivar miembro" : "Eliminar miembro"}
          message={
            pendingDelete.hasHistory
              ? `"${pendingDelete.member.nombre}" tiene ${pendingDelete.count} movimiento${pendingDelete.count === 1 ? "" : "s"} registrado${pendingDelete.count === 1 ? "" : "s"}. No se puede eliminar sin perder ese historial en tus reportes, así que se archivará: dejará de aparecer en la lista, pero sus aportes se conservan.`
              : `¿Eliminar a "${pendingDelete.member.nombre}"? No tiene movimientos registrados. Esta acción no se puede deshacer.`
          }
          confirmLabel={pendingDelete.hasHistory ? "Archivar" : "Eliminar"}
          danger={!pendingDelete.hasHistory}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
