import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  currentMonth, deleteActividad, fmtFecha, fmtFechaCorta, hoyISO, listActividades, nextMonth, prevMonth,
  type Actividad, type Church,
} from "../db";
import { EmptyState } from "../components/TxList";
import RowMenu from "../components/RowMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import ActividadModal from "../components/ActividadModal";
import LoadingState from "../components/LoadingState";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconPlus } from "../icons";

type Vista = "mes" | "lista";

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

/** Domingo de la semana en que comienza el mes → matriz de 6×7 fechas locales. */
function matrizMes(yyyyMm: string): (string | null)[][] {
  const [y, m] = yyyyMm.split("-").map(Number);
  const primero = new Date(y, m - 1, 1);
  const diasEnMes = new Date(y, m, 0).getDate();
  const offset = primero.getDay(); // 0 = domingo
  const celdas: (string | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) {
    celdas.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

/** Domingo (inicio) y sábado (fin) de la semana que contiene a `iso`. */
function rangoSemana(iso: string): { desde: string; hasta: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const inicio = new Date(base);
  inicio.setDate(base.getDate() - base.getDay());
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  const iso2 = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { desde: iso2(inicio), hasta: iso2(fin) };
}

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Agenda({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>("mes");
  const [mesCursor, setMesCursor] = useState(currentMonth());
  const [modal, setModal] = useState<{ open: boolean; actividad: Actividad | null; fecha: string | null }>(
    { open: false, actividad: null, fecha: null }
  );
  const [pendingDelete, setPendingDelete] = useState<Actividad | null>(null);

  const hoy = hoyISO();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listActividades(church.id)
      .then((rows) => { if (!cancelado) setActividades(rows); })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  const porFecha = useMemo(() => {
    const mapa = new Map<string, Actividad[]>();
    for (const a of actividades) {
      const arr = mapa.get(a.fecha) ?? [];
      arr.push(a);
      mapa.set(a.fecha, arr);
    }
    return mapa;
  }, [actividades]);

  const stats = useMemo(() => {
    const { desde, hasta } = rangoSemana(hoy);
    const deHoy = actividades.filter((a) => a.fecha === hoy && a.estado !== "cancelada").length;
    const deSemana = actividades.filter(
      (a) => a.fecha >= desde && a.fecha <= hasta && a.estado !== "cancelada"
    ).length;
    const proximas = actividades.filter(
      (a) => a.fecha >= hoy && a.estado !== "cancelada" && a.estado !== "completada"
    ).length;
    const porConfirmar = actividades.filter(
      (a) => a.fecha >= hoy && (a.estado === "programada" || a.estado === "borrador")
    ).length;
    return { deHoy, deSemana, proximas, porConfirmar };
  }, [actividades, hoy]);

  const semanas = useMemo(() => matrizMes(mesCursor), [mesCursor]);
  // fmtFecha da "Julio 2026" / "July 2026" respetando el idioma actual.
  const tituloMes = useMemo(() => fmtFecha(`${mesCursor}-01`).mesAnio, [mesCursor]);

  const diasSemana = t("agenda.diasSemana", { returnObjects: true }) as string[];

  const proximas = useMemo(
    () => actividades
      .filter((a) => a.fecha >= hoy)
      .sort((a, b) => (a.fecha === b.fecha
        ? (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
        : a.fecha.localeCompare(b.fecha))),
    [actividades, hoy]
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteActividad(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("agenda.toastEliminada"));
    onChanged();
  }

  function etiquetaTipo(a: Actividad): string {
    if (a.tipo === "otra" && a.tipo_personalizado) return a.tipo_personalizado;
    return t(`agenda.tipos.${a.tipo}`);
  }

  function abrirNueva(fecha: string | null) {
    setModal({ open: true, actividad: null, fecha });
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("secretaria.agenda.titulo")}</div>
          <div className="page-sub">{t("secretaria.agenda.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={() => abrirNueva(null)}>
            <IconPlus size={14} /> {t("agenda.nuevaActividad")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="stat-card accent" style={accent("var(--accent-3)")}>
            <div className="stat-head">
              <span className="stat-label">{t("agenda.statHoy")}</span>
              <div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats.deHoy}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-4)")}>
            <div className="stat-head">
              <span className="stat-label">{t("agenda.statSemana")}</span>
              <div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats.deSemana}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-1)")}>
            <div className="stat-head">
              <span className="stat-label">{t("agenda.statProximas")}</span>
              <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats.proximas}</div>
          </div>
          <div className="stat-card accent" style={accent("var(--accent-5)")}>
            <div className="stat-head">
              <span className="stat-label">{t("agenda.statPorConfirmar")}</span>
              <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">{stats.porConfirmar}</div>
          </div>
        </div>

        <div className="agenda-toolbar">
          <div className="agenda-nav">
            <button className="icon-btn" aria-label={t("agenda.mesAnterior")} onClick={() => setMesCursor(prevMonth(mesCursor))}>
              <IconChevronLeft size={16} />
            </button>
            <button className="btn secondary sm" onClick={() => setMesCursor(currentMonth())}>{t("agenda.hoy")}</button>
            <button className="icon-btn" aria-label={t("agenda.mesSiguiente")} onClick={() => setMesCursor(nextMonth(mesCursor))}>
              <IconChevronRight size={16} />
            </button>
            <span className="agenda-mes-titulo">{tituloMes}</span>
          </div>
          <div className="chip-toggle" role="tablist" aria-label={t("agenda.cambiarVista")}>
            <button
              className={`chip ${vista === "mes" ? "active" : ""}`}
              role="tab"
              aria-selected={vista === "mes"}
              onClick={() => setVista("mes")}
            >
              {t("agenda.vistaMes")}
            </button>
            <button
              className={`chip ${vista === "lista" ? "active" : ""}`}
              role="tab"
              aria-selected={vista === "lista"}
              onClick={() => setVista("lista")}
            >
              {t("agenda.vistaLista")}
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : actividades.length === 0 ? (
          <div className="agenda-vacio">
            <EmptyState
              icon={<IconCalendar size={22} strokeWidth={1.6} />}
              titulo={t("agenda.vacioTitulo")}
              sub={t("agenda.vacioSub")}
            />
            <button className="btn primary" onClick={() => abrirNueva(null)}>{t("agenda.crearPrimera")}</button>
          </div>
        ) : vista === "mes" ? (
          <div className="agenda-cal card">
            <div className="agenda-dow">
              {diasSemana.map((d, i) => (
                <div key={i} className="agenda-dow-cell">{d}</div>
              ))}
            </div>
            <div className="agenda-grid">
              {semanas.flat().map((fecha, i) => {
                if (!fecha) return <div key={i} className="agenda-cell empty" />;
                const dia = Number(fecha.slice(8, 10));
                const items = porFecha.get(fecha) ?? [];
                const esHoy = fecha === hoy;
                return (
                  <div
                    key={i}
                    className={`agenda-cell${esHoy ? " today" : ""}`}
                    onClick={() => abrirNueva(fecha)}
                    role="button"
                    tabIndex={0}
                    aria-label={fmtFechaCorta(fecha)}
                    onKeyDown={(e) => { if (e.key === "Enter") abrirNueva(fecha); }}
                  >
                    <div className="agenda-cell-num">{dia}</div>
                    <div className="agenda-cell-items">
                      {items.slice(0, 3).map((a) => (
                        <button
                          key={a.id}
                          className={`agenda-evt estado-${a.estado}`}
                          title={etiquetaTipo(a)}
                          onClick={(e) => { e.stopPropagation(); setModal({ open: true, actividad: a, fecha: null }); }}
                        >
                          {!a.dia_completo && a.hora_inicio && <span className="agenda-evt-hora">{a.hora_inicio}</span>}
                          <span className="agenda-evt-nombre">{a.nombre}</span>
                        </button>
                      ))}
                      {items.length > 3 && <div className="agenda-mas">+{items.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : proximas.length === 0 ? (
          <EmptyState
            icon={<IconCalendar size={22} strokeWidth={1.6} />}
            titulo={t("agenda.sinProximas")}
            sub={t("agenda.sinProximasSub")}
          />
        ) : (
          <div className="data-table roomy">
            <div className="thead" style={{ gridTemplateColumns: "130px 1.6fr 1fr 130px 110px 40px" }}>
              <div className="th">{t("agenda.colFecha")}</div>
              <div className="th">{t("agenda.colActividad")}</div>
              <div className="th">{t("agenda.colResponsable")}</div>
              <div className="th">{t("agenda.colLugar")}</div>
              <div className="th">{t("agenda.colEstado")}</div>
              <div className="th"></div>
            </div>
            {proximas.map((a) => (
              <div
                key={a.id}
                className="tr"
                style={{ gridTemplateColumns: "130px 1.6fr 1fr 130px 110px 40px", cursor: "pointer" }}
                onClick={() => setModal({ open: true, actividad: a, fecha: null })}
              >
                <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  <div>{fmtFechaCorta(a.fecha)}</div>
                  {!a.dia_completo && a.hora_inicio && (
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{a.hora_inicio}{a.hora_fin ? `–${a.hora_fin}` : ""}</div>
                  )}
                  {a.dia_completo && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{t("agenda.diaCompletoCorto")}</div>}
                </div>
                <div className="td" style={{ minWidth: 0 }}>
                  <div className="p-name truncate">{a.nombre}</div>
                  <div className="p-mail truncate">{etiquetaTipo(a)}</div>
                </div>
                <div className="td truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                  {a.responsable_persona || a.responsable_ministerio || "—"}
                </div>
                <div className="td truncate" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{a.lugar || "—"}</div>
                <div className="td">
                  <span className={`tag estado-tag estado-${a.estado}`}>{t(`agenda.estados.${a.estado}`)}</span>
                </div>
                <div className="td" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    onEdit={() => setModal({ open: true, actividad: a, fecha: null })}
                    onDelete={() => setPendingDelete(a)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.open && (
        <ActividadModal
          church={church}
          actividad={modal.actividad}
          fechaInicial={modal.fecha}
          onClose={() => setModal({ open: false, actividad: null, fecha: null })}
          onSaved={onChanged}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t("agenda.eliminarTitulo")}
          message={t("agenda.eliminarMensaje", { nombre: pendingDelete.nombre })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
