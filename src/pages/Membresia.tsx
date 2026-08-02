import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { textoCorto } from "../movil";
import {
  currentYear, darDeBajaMember, fmtFechaCorta, listMembersRegistro, membresiaStats, restoreMember,
  type Church, type Member, type MembresiaStats,
} from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import BajaMemberModal from "../components/BajaMemberModal";
import FichaMiembroModal from "../components/FichaMiembroModal";
import FusionarMiembroModal from "../components/FusionarMiembroModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconArrowDown, IconArrowUp, IconEdit, IconEye, IconIdBadge, IconMiembros, IconPlus, IconSearch } from "../icons";
import CountUp from "../components/CountUp";

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const COLS = "1.7fr 1fr 130px 190px 104px";
const PAGE_SIZE = 30;

type Filtro = "activos" | "bajas" | "todos";

const MOTIVOS_CONOCIDOS = ["traslado", "fallecimiento", "retiro", "disciplina"];

/** Etiqueta y clase del badge de estado. Los miembros del registro usan su
 *  estado (activo/inactivo/visitante); las bajas por traslado o fallecimiento
 *  se muestran con ese nombre, el resto como "Baja". */
function estadoBadge(m: Member): { key: string; clase: string } {
  if (m.activo === 1) {
    const e = ["activo", "inactivo", "visitante", "enProceso"].includes(m.estado_membresia) ? m.estado_membresia : "activo";
    const clase = e === "activo" ? "activo" : e === "visitante" ? "donacion" : e === "enProceso" ? "musicos" : "servicios";
    return { key: `membresia.estado.${e}`, clase };
  }
  if (m.motivo_baja === "traslado") return { key: "membresia.estado.trasladado", clase: "baja" };
  if (m.motivo_baja === "fallecimiento") return { key: "membresia.estado.fallecido", clase: "baja" };
  return { key: "membresia.estadoBaja", clase: "baja" };
}

function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();
}

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

interface Props {
  church: Church;
  refreshKey: number;
  onEdit: (member: Member) => void;
  onChanged: () => void;
}

export default function Membresia({ church, refreshKey, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<MembresiaStats | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const [pendingBaja, setPendingBaja] = useState<Member | null>(null);
  const [ofrecerTraslado, setOfrecerTraslado] = useState<Member | null>(null);
  const [fusionando, setFusionando] = useState<Member | null>(null);
  const navigate = useNavigate();
  const [pendingReactivar, setPendingReactivar] = useState<Member | null>(null);
  const [ficha, setFicha] = useState<Member | null>(null);
  const [crearFicha, setCrearFicha] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const anio = currentYear();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([listMembersRegistro(church.id), membresiaStats(church.id, anio)])
      .then(([nuevosMembers, nuevosStats]) => {
        if (cancelado) return;
        setMembers(nuevosMembers);
        setStats(nuevosStats);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, anio]);

  useEffect(() => setPage(1), [query, filtro, refreshKey]);

  async function confirmarBaja(fecha: string, motivo: string | null) {
    if (!pendingBaja) return;
    await darDeBajaMember(pendingBaja.id, church.id, fecha, motivo);
    // Baja por traslado sin traslado registrado: la marca de estado sola no
    // genera documento ni cuenta en informes — se ofrece crear el traslado
    // de salida real con el miembro ya precargado.
    if (motivo === "traslado") setOfrecerTraslado(pendingBaja);
    setPendingBaja(null);
    playSound("eliminar");
    showToast(t("membresia.toastBaja"));
    onChanged();
  }

  async function confirmarReactivar() {
    if (!pendingReactivar) return;
    await restoreMember(pendingReactivar.id, church.id);
    setPendingReactivar(null);
    playSound("guardado");
    showToast(t("membresia.toastReactivado"));
    onChanged();
  }

  const q = query.trim().toLowerCase();
  const visibles = members
    .filter((m) => (filtro === "todos" ? true : filtro === "activos" ? m.activo === 1 : m.activo === 0))
    .filter(
      (m) =>
        !q ||
        m.nombre.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.telefono ?? "").toLowerCase().includes(q)
    );
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.membresia.titulo")}</div>
          <div className="page-sub">{t("secretaria.membresia.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => setCrearFicha(true)}>
            <IconPlus size={14} /> {t("miembros.nuevoMiembro")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="dash-canvas">
        <div className="summary-4 enter">
          <div className="stat-card accent" style={accent("var(--accent-2)")}>
            <div className="stat-head">
              <span className="stat-label">{t("membresia.statActivos")}</span>
              <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats ? <CountUp value={stats.activos} format={String} /> : "—"}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-1)")}>
            <div className="stat-head">
              <span className="stat-label">{t("membresia.statAltas", { anio })}</span>
              <div className="stat-icon neutral"><IconArrowUp size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats ? <CountUp value={stats.altasAnio} format={String} /> : "—"}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-3)")}>
            <div className="stat-head">
              <span className="stat-label">{t("membresia.statBajas", { anio })}</span>
              <div className="stat-icon neutral"><IconArrowDown size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats ? <CountUp value={stats.bajasAnio} format={String} /> : "—"}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-5)")}>
            <div className="stat-head">
              <span className="stat-label">{t("membresia.statTotal")}</span>
              <div className="stat-icon neutral"><IconIdBadge size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats ? <CountUp value={stats.total} format={String} /> : "—"}</div>
          </div>
        </div>
        </div>

        <div className="tx-head">
          <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={textoCorto(t("common.buscarCorto"), t("miembros.buscarPlaceholder"))}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["activos", "bajas", "todos"] as Filtro[]).map((f) => (
              <button
                key={f}
                className={`chip${filtro === f ? " active" : ""}`}
                onClick={() => setFiltro(f)}
              >
                {t(`membresia.filtro.${f}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            titulo={members.length === 0 ? t("miembros.aunNoHay") : t("membresia.sinResultados")}
            sub={members.length === 0 ? t("miembros.agregaPrimero") : t("membresia.sinResultadosSub")}
            icon={<IconIdBadge size={20} strokeWidth={1.8} />}
          />
        ) : (
          <div className="data-table roomy tabla-membresia">
            <div className="thead" style={{ gridTemplateColumns: COLS }}>
              <div className="th">{t("miembros.colMiembro")}</div>
              <div className="th">{t("miembros.colContacto")}</div>
              <div className="th">{t("membresia.colIngreso")}</div>
              <div className="th">{t("membresia.colEstado")}</div>
              <div className="th"></div>
            </div>
            {pagina.map((m, i) => (
              <div
                className="tr"
                key={m.id}
                style={{ gridTemplateColumns: COLS, cursor: "pointer", opacity: m.activo === 1 ? 1 : 0.72 }}
                onClick={() => setFicha(m)}
              >
                <div className="td">
                  <div className="person" style={{ minWidth: 0 }}>
                    <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {initials(m.nombre)}
                    </div>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      <div className="p-name truncate" title={m.nombre}>{m.nombre}</div>
                      <div className="p-mail truncate" title={m.email ?? undefined}>
                        {m.email ?? t("miembros.sinCorreoRegistrado")}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  <div className="truncate">{m.telefono ?? t("common.sinTelefono")}</div>
                </div>
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  {m.fecha_ingreso ? fmtFechaCorta(m.fecha_ingreso) : "—"}
                </div>
                <div className="td">
                  {(() => {
                    const badge = estadoBadge(m);
                    if (m.activo === 1) return <span className={`tag ${badge.clase}`}>{t(badge.key)}</span>;
                    const motivoTexto = m.motivo_baja
                      ? MOTIVOS_CONOCIDOS.includes(m.motivo_baja)
                        ? t(`membresia.motivo.${m.motivo_baja}`)
                        : m.motivo_baja
                      : null;
                    return (
                      <div style={{ minWidth: 0 }}>
                        <span className={`tag ${badge.clase}`}>{t(badge.key)}</span>
                        <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>
                          {[m.fecha_baja ? fmtFechaCorta(m.fecha_baja) : null, motivoTexto].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                  <span className="row-actions">
                    <span className="row-icon-btn" title={t("common.verFicha")} onClick={() => setFicha(m)}>
                      <IconEye size={13} strokeWidth={2} />
                    </span>
                    <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(m)}>
                      <IconEdit size={13} strokeWidth={2} />
                    </span>
                  </span>
                  <RowMenu
                    onEdit={() => onEdit(m)}
                    onDelete={() => (m.activo === 1 ? setPendingBaja(m) : setPendingReactivar(m))}
                    deleteLabel={m.activo === 1 ? t("membresia.darDeBaja") : t("membresia.reactivar")}
                    extraItems={[{ label: t("fusion.accion"), onClick: () => setFusionando(m) }]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {fusionando && (
        <FusionarMiembroModal
          churchId={church.id}
          origen={fusionando}
          members={members}
          onClose={() => setFusionando(null)}
          onMerged={onChanged}
        />
      )}

      {ficha && (
        <FichaMiembroModal
          church={church}
          member={ficha}
          onClose={() => setFicha(null)}
          onSaved={onChanged}
        />
      )}

      {crearFicha && (
        <FichaMiembroModal
          church={church}
          member={null}
          onClose={() => setCrearFicha(false)}
          onSaved={onChanged}
        />
      )}

      {ofrecerTraslado && (
        <ConfirmDialog
          title={t("membresia.trasladoOfertaTitulo")}
          message={t("membresia.trasladoOfertaMensaje", { nombre: ofrecerTraslado.nombre })}
          confirmLabel={t("membresia.trasladoOfertaCrear")}
          onConfirm={() => {
            const id = ofrecerTraslado.id;
            setOfrecerTraslado(null);
            navigate("/cartas", { state: { trasladoSalidaDe: id } });
          }}
          onCancel={() => setOfrecerTraslado(null)}
        />
      )}

      {pendingBaja && (
        <BajaMemberModal
          member={pendingBaja}
          onConfirm={confirmarBaja}
          onCancel={() => setPendingBaja(null)}
        />
      )}

      {pendingReactivar && (
        <ConfirmDialog
          title={t("membresia.reactivarTitulo", { nombre: pendingReactivar.nombre })}
          message={t("membresia.reactivarMensaje")}
          confirmLabel={t("membresia.reactivar")}
          onConfirm={confirmarReactivar}
          onCancel={() => setPendingReactivar(null)}
        />
      )}
    </>
  );
}
