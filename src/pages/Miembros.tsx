import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone, textoCorto } from "../movil";
import {
  archiveMember, countMemberAsistencias, countMemberTx, currentYear, deleteMember, fmtFechaCorta, fmtMoney,
  insertMember, listMembers, memberStats, undeleteMember, type Church, type Member, type MemberStat, type NewMember,
} from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import { useContextMenu } from "../components/ContextMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import GenericCsvImportModal from "../components/GenericCsvImportModal";
import MemberDetailModal from "../components/MemberDetailModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { MIEMBROS_CSV_TEMPLATE, MIEMBROS_FIELDS, validarFilaMiembro } from "../services/importMiembrosCsv";
import { IconEdit, IconPlus, IconSearch, IconUpload } from "../icons";
import CountUp from "../components/CountUp";
import { CERO, sumar } from "../dinero";

const TAG_CLASS: Record<string, string> = {
  diezmador: "diezmo",
  donador: "donacion",
  ofrendante: "ofrenda",
  comite: "pastores",
  junta: "mantenimiento",
};

const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const MEMBER_COLS = "1.6fr 1fr 130px 150px 170px 72px";
/* Sin la columna de etiquetas: si ninguna iglesia las usa, reservarle un
   quinto del ancho para pintar guiones en todas las filas es desperdicio. */
const MEMBER_COLS_SIN_ETIQUETAS = "1.6fr 130px 150px 170px 72px";
const PAGE_SIZE = 30;

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
  /** false = el padrón lo administra Secretaría (las altas van por Membresía). */
  puedeCrear: boolean;
  onEdit: (member: Member) => void;
  onNew: () => void;
  onChanged: () => void;
}

interface PendingDelete {
  member: Member;
  hasHistory: boolean;
  count: number;
}

export default function Miembros({ church, refreshKey, puedeCrear, onEdit, onNew, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Miembros" como pastilla activa
  // (ver Cartas.tsx/Movimientos.tsx) — el título grande de aquí abajo sobra
  // ahí.
  const enIPhone = esIPhone();
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<Record<number, MemberStat>>({});
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [detalle, setDetalle] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { abrirMenu, menu } = useContextMenu();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listMembers(church.id),
      memberStats(church.id, currentYear()),
    ])
      .then(([nuevosMembers, nuevosStats]) => {
        if (cancelado) return;
        setMembers(nuevosMembers);
        setStats(nuevosStats);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => setPage(1), [query, refreshKey]);

  async function requestDelete(m: Member) {
    // Un miembro con historial (movimientos O asistencia a servicios) nunca
    // se borra en duro: se archiva, para que los registros viejos siempre
    // puedan resolver a su miembro.
    const [n, asistencias] = await Promise.all([
      countMemberTx(m.id, church.id),
      countMemberAsistencias(m.id, church.id),
    ]);
    setPendingDelete({ member: m, hasHistory: n > 0 || asistencias > 0, count: n });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { member, hasHistory } = pendingDelete;
    if (hasHistory) {
      await archiveMember(member.id, church.id);
      setPendingDelete(null);
      showToast(t("toast.miembroArchivado"));
      playSound("guardado");
      onChanged();
      return;
    }
    await deleteMember(member.id, church.id);
    setPendingDelete(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.miembroEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        // Borrado suave: se restaura la MISMA fila (mismo uid), no una nueva.
        await undeleteMember(member.id, church.id);
        onChanged();
      },
    });
  }

  // Resumen calculado a partir de los datos ya cargados (sin consultas nuevas).
  // "Diezmaron" cuenta miembros con al menos un ingreso de categoría diezmo en
  // el año, no los que tienen la etiqueta puesta en la ficha: la etiqueta la
  // escribe alguien a mano una vez y después nadie la mantiene, así que el
  // número que salía era el de una intención vieja, no el del año en curso.
  const resumen = useMemo(() => {
    let diezmadores = 0, aportaron = 0, totalAnio = CERO;
    for (const m of members) {
      const s = stats[m.id];
      if (s?.diezmoAnio) diezmadores++;
      if (s?.totalAnio) { aportaron++; totalAnio = sumar(totalAnio, s.totalAnio); }
    }
    return { total: members.length, diezmadores, aportaron, totalAnio };
  }, [members, stats]);

  const q = query.trim().toLowerCase();
  const visibles = q
    ? members.filter(
        (m) =>
          m.nombre.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q) ||
          (m.rfc ?? "").toLowerCase().includes(q)
      )
    : members;
  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pagina = visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Muchas iglesias no usan etiquetas: la columna quedaba entera con guiones,
  // ocupando ancho que las demás necesitan. Se muestra solo si alguien la usa.
  const hayEtiquetas = members.some((m) => {
    try { return (JSON.parse(m.etiquetas) as string[]).length > 0; } catch { return false; }
  });
  const cols = hayEtiquetas ? MEMBER_COLS : MEMBER_COLS_SIN_ETIQUETAS;

  return (
    <>
      <div className="header">
        {!enIPhone && (
          <div>
            <div className="page-title">{t("miembros.titulo")}</div>
            <div className="page-sub">{t("miembros.activos", { count: members.length })}</div>
          </div>
        )}
        <div className="header-actions">
          {puedeCrear ? (
            <>
              {/* En el teléfono este botón se pintaba entero (borde, fondo,
                  texto "Import CSV") junto al título, en vez de reducirse al
                  glifo solo que ya llevan el resto de páginas en la fila fija
                  de arriba — a esta página nunca le llegó ese tratamiento.
                  La versión de escritorio se marca aparte y la fija de abajo
                  cubre el móvil, mismo patrón que .btn-compartir-cabecera en
                  Dashboard/Movimientos/Reportes/InformesMembresia. */}
              <button className="btn secondary solo-escritorio" onClick={() => setImportOpen(true)}>
                <IconUpload size={13} /> {t("miembros.importarCsv")}
              </button>
              <button className="btn primary btn-nuevo-cabecera" onClick={onNew}>
                <IconPlus size={14} /> {t("miembros.nuevo")}
              </button>
            </>
          ) : (
            <span className="form-hint">{t("miembros.padronSecretaria")}</span>
          )}
        </div>
        {puedeCrear && (
          <div className="header-actions solo-movil">
            <button
              type="button"
              className="btn-compartir-cabecera"
              onClick={() => setImportOpen(true)}
              aria-label={t("miembros.importarCsv")}
            >
              <IconUpload size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="content">
        {!loading && (
          enIPhone ? (
            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("miembros.seccionResumen")}</h2></div>
              <div className="ios-panel-grid">
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statTotal")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.total} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statDiezmadores")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.diezmadores} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statAportaronAnio")}</span></div>
                  <span className="ios-stat-num"><CountUp value={resumen.aportaron} format={String} /></span>
                </div>
                <div className="ios-stat" style={{ cursor: "default" }}>
                  <div className="ios-stat-top"><span className="ios-stat-label">{t("miembros.statTotalAnio")}</span></div>
                  <span className="ios-stat-num money"><CountUp value={resumen.totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="dash-canvas">
              <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("miembros.statTotal")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.total} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("miembros.statDiezmadores")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.diezmadores} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("miembros.statAportaronAnio")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.aportaron} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-5)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("miembros.statTotalAnio")}</span></div>
                  <div className="stat-value md"><CountUp value={resumen.totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></div>
                </div>
              </div>
            </div>
          )
        )}

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
        </div>

        {loading ? (
          <LoadingState />
        ) : visibles.length === 0 ? (
          <EmptyState
            pagina
            titulo={members.length === 0 ? t("miembros.aunNoHay") : t("miembros.sinResultados")}
            sub={members.length === 0 ? t("miembros.agregaPrimero") : t("miembros.pruebaOtroTermino")}
            icon={<IconPlus size={20} strokeWidth={1.8} />}
            accion={members.length === 0 && puedeCrear
              ? { label: t("miembros.nuevo"), onClick: onNew }
              : undefined}
            duplicaCrear
          />
        ) : (
          <div className={enIPhone ? "ios-listcard" : "data-table roomy tabla-miembros"}>
            {!enIPhone && (
              <div className="thead" style={{ gridTemplateColumns: cols }}>
                <div className="th">{t("miembros.colMiembro")}</div>
                {hayEtiquetas && <div className="th">{t("miembros.colEtiquetas")}</div>}
                <div className="th">{t("miembros.colUltimoAporte")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("miembros.colTotalAnio")}</div>
                <div className="th">{t("miembros.colContacto")}</div>
                <div className="th"></div>
              </div>
            )}
            {pagina.map((m, i) => {
              let etiquetas: string[] = [];
              try { etiquetas = JSON.parse(m.etiquetas); } catch { /* noop */ }
              const stat = stats[m.id];

              if (enIPhone) {
                return (
                  <div
                    className="ios-txrow ios-txrow--clickable"
                    data-fila
                    key={m.id}
                    onClick={() => setDetalle(m)}
                    onContextMenu={(e) =>
                      abrirMenu(e, [
                        { label: t("common.verFicha"), onClick: () => setDetalle(m) },
                        { label: t("common.editar"), onClick: () => onEdit(m) },
                        { label: t("common.eliminar"), danger: true, onClick: () => requestDelete(m) },
                      ])}
                  >
                    <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {initials(m.nombre)}
                    </div>
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title" title={m.nombre}>{m.nombre}</div>
                      <div className="tx-secundaria-movil" title={m.email ?? undefined}>
                        {m.email ?? t("miembros.sinCorreoRegistrado")}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      {stat?.totalAnio ? (
                        <span className="tx-amount positive">
                          {fmtMoney(stat.totalAnio)}<span className="cur">{church.moneda}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)", fontSize: 15 }}>—</span>
                      )}
                    </div>
                    <RowMenu
                      onEdit={() => onEdit(m)}
                      onDelete={() => requestDelete(m)}
                    />
                  </div>
                );
              }

              return (
                <div
                  className="tr" data-fila
                  key={m.id}
                  style={{ gridTemplateColumns: cols, cursor: "pointer" }}
                  onClick={() => setDetalle(m)}
                  onContextMenu={(e) =>
                    abrirMenu(e, [
                      { label: t("common.verFicha"), onClick: () => setDetalle(m) },
                      { label: t("common.editar"), onClick: () => onEdit(m) },
                      { label: t("common.eliminar"), danger: true, onClick: () => requestDelete(m) },
                    ])}
                >
                  <div className="td">
                    <div className="person" style={{ minWidth: 0 }}>
                      <div className={`mini-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                        {initials(m.nombre)}
                      </div>
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <div className="p-name truncate" title={m.nombre}>{m.nombre}</div>
                        <div className="p-mail truncate" title={m.email ?? undefined}>{m.email ?? t("miembros.sinCorreoRegistrado")}</div>
                      </div>
                    </div>
                  </div>
                  {hayEtiquetas && (
                    <div className="td">
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {etiquetas.length === 0 && (
                          <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>
                        )}
                        {etiquetas.map((et) => (
                          <span key={et} className={`tag ${TAG_CLASS[et] ?? "otros"}`} title={TAG_CLASS[et] ? t(`etiqueta.${et}`) : et}>
                            {TAG_CLASS[et] ? t(`etiqueta.${et}`) : et}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {stat?.ultimoAporte ? fmtFechaCorta(stat.ultimoAporte) : "—"}
                  </div>
                  <div className="td" style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {stat?.totalAnio ? `${fmtMoney(stat.totalAnio)} ${church.moneda}` : "—"}
                  </div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    <div className="truncate">{m.telefono ?? t("common.sinTelefono")}</div>
                    {/* El valor presente salía pelado ("57876") mientras el
                        ausente sí se explicaba: justo al revés de lo útil. */}
                    <div className="truncate" style={{ fontSize: 11.5, color: "var(--text-3)" }} title={m.rfc ?? undefined}>
                      {m.rfc ? `${t("campo.rfc")}: ${m.rfc}` : t("miembros.sinRfc")}
                    </div>
                  </div>
                  <div className="td td-acciones" onClick={(e) => e.stopPropagation()}>
                    <span className="row-actions">
                      <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(m)}>
                        <IconEdit size={13} strokeWidth={2} />
                      </span>
                    </span>
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
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {menu}

      {detalle && (
        <MemberDetailModal church={church} member={detalle} onClose={() => setDetalle(null)} />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.hasHistory ? t("miembros.archivarTitulo") : t("miembros.eliminarTitulo")}
          message={
            pendingDelete.hasHistory
              ? t("miembros.archivarMensaje", { nombre: pendingDelete.member.nombre, count: pendingDelete.count })
              : t("miembros.eliminarMensaje", { nombre: pendingDelete.member.nombre })
          }
          confirmLabel={pendingDelete.hasHistory ? t("miembros.archivar") : t("common.eliminar")}
          danger={!pendingDelete.hasHistory}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {importOpen && (
        <GenericCsvImportModal<NewMember>
          titulo={t("miembrosImport.titulo")}
          subtitulo={t("miembrosImport.sub")}
          instrucciones={t("miembrosImport.instrucciones")}
          fields={MIEMBROS_FIELDS}
          templateCsv={MIEMBROS_CSV_TEMPLATE}
          templateFileName="plantilla-miembros.csv"
          validarFila={validarFilaMiembro}
          previewColsTemplate="1.6fr 1fr 1fr 1fr"
          previewColumns={[
            { label: t("miembrosImport.colNombre"), render: (m) => m.nombre },
            { label: t("miembrosImport.colCorreo"), render: (m) => m.email ?? "—" },
            { label: t("miembrosImport.colTelefono"), render: (m) => m.telefono ?? "—" },
            { label: t("miembrosImport.colRfc"), render: (m) => m.rfc ?? "—" },
          ]}
          etiquetaItem={(n) => t("miembrosImport.items", { count: n })}
          onConfirmar={async (items) => {
            for (const m of items) await insertMember(church.id, m);
          }}
          onClose={() => setImportOpen(false)}
          onImportado={onChanged}
        />
      )}
    </>
  );
}
