import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  currentYear, fmtFechaCorta, hoyISO, listActividades, listMembersRegistro, membresiaStats,
  type Actividad, type Church, type MembresiaStats,
} from "../db";
import { camposFaltantes } from "../services/informes/membresia";
import { expandirTodas } from "../services/agenda/recurrencia";
import LoadingState from "../components/LoadingState";
import CountUp from "../components/CountUp";
import {
  IconCalendar, IconClipboardList, IconIdBadge, IconMail, IconMiembros, IconWarn,
} from "../icons";

function accent(color: string): CSSProperties {
  return { "--accent-color": color } as CSSProperties;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

interface Props {
  church: Church;
  refreshKey: number;
}

export default function InicioSecretaria({ church, refreshKey }: Props) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<MembresiaStats | null>(null);
  const [incompletos, setIncompletos] = useState(0);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const hoy = hoyISO();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      membresiaStats(church.id, currentYear()),
      listMembersRegistro(church.id),
      listActividades(church.id),
    ])
      .then(([s, miembros, acts]) => {
        if (cancelado) return;
        setStats(s);
        setIncompletos(miembros.filter((m) => camposFaltantes(m).length > 0).length);
        setActividades(acts);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  const proximas = useMemo(() => {
    return expandirTodas(actividades, hoy, addDays(hoy, 60))
      .filter((o) => o.estado !== "cancelada")
      .sort((a, b) => (a.fecha === b.fecha
        ? (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
        : a.fecha.localeCompare(b.fecha)));
  }, [actividades, hoy]);

  const proximas5 = proximas.slice(0, 5);

  function etiquetaTipo(a: Actividad): string {
    if (a.tipo === "otra" && a.tipo_personalizado) return a.tipo_personalizado;
    return t(`agenda.tipos.${a.tipo}`);
  }

  const accesos = [
    { to: "/membresia", icon: <IconIdBadge size={16} />, label: t("nav.membresia") },
    { to: "/cartas", icon: <IconMail size={16} />, label: t("nav.cartas") },
    { to: "/agenda", icon: <IconCalendar size={16} />, label: t("nav.agenda") },
    { to: "/reporte-miembros", icon: <IconClipboardList size={16} />, label: t("nav.reporteMiembros") },
  ];

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("inicioSec.titulo")}</div>
          <div className="page-sub">{church.nombre}</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <LoadingState />
        ) : (
          <div className="dash-canvas">
            <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div className="stat-card accent" style={accent("var(--accent-1)")}>
                <div className="stat-head">
                  <span className="stat-label">{t("inicioSec.statActivos")}</span>
                  <div className="stat-icon neutral"><IconMiembros size={15} strokeWidth={1.8} /></div>
                </div>
                <div className="stat-value md"><CountUp value={stats?.activos ?? 0} format={String} /></div>
              </div>
              <div className="stat-card accent" style={accent("var(--accent-4)")}>
                <div className="stat-head">
                  <span className="stat-label">{t("inicioSec.statAltas", { anio: currentYear() })}</span>
                  <div className="stat-icon neutral"><IconIdBadge size={15} strokeWidth={1.8} /></div>
                </div>
                <div className="stat-value md"><CountUp value={stats?.altasAnio ?? 0} format={String} /></div>
              </div>
              <div className="stat-card accent" style={accent("var(--accent-5)")}>
                <div className="stat-head">
                  <span className="stat-label">{t("inicioSec.statIncompletos")}</span>
                  <div className="stat-icon neutral"><IconWarn size={15} strokeWidth={1.8} /></div>
                </div>
                <div className="stat-value md"><CountUp value={incompletos} format={String} /></div>
              </div>
              <div className="stat-card accent" style={accent("var(--accent-3)")}>
                <div className="stat-head">
                  <span className="stat-label">{t("inicioSec.statProximas")}</span>
                  <div className="stat-icon neutral"><IconCalendar size={15} strokeWidth={1.8} /></div>
                </div>
                <div className="stat-value md"><CountUp value={proximas.length} format={String} /></div>
              </div>
            </div>

            <div className="inicio-sec-grid">
              <div className="card pad-lg">
                <div className="card-head">
                  <div className="card-head-titles">
                    <div className="card-title-lg">{t("inicioSec.proximasTitulo")}</div>
                  </div>
                  <Link to="/agenda" className="btn ghost sm">{t("inicioSec.verAgenda")}</Link>
                </div>
                {proximas5.length === 0 ? (
                  <div className="form-hint" style={{ marginTop: 8 }}>{t("inicioSec.sinProximas")}</div>
                ) : (
                  <div className="agenda-grupo" style={{ marginTop: 8 }}>
                    {proximas5.map((a) => (
                      <Link key={`${a._master.id}:${a._fechaOriginal}`} to="/agenda" className="agenda-fila">
                        <div className="agenda-fila-fecha">
                          <div>{fmtFechaCorta(a.fecha)}</div>
                          <div className="agenda-fila-hora">
                            {a.dia_completo ? t("agenda.diaCompletoCorto") : (a.hora_inicio ? a.hora_inicio : "—")}
                          </div>
                        </div>
                        <div className="agenda-fila-main">
                          <div className="agenda-fila-nombre">{a.nombre}</div>
                          <div className="agenda-fila-meta">{etiquetaTipo(a)}{a.lugar ? ` · ${a.lugar}` : ""}</div>
                        </div>
                        <span className={`tag estado-tag estado-${a.estado}`}>{t(`agenda.estados.${a.estado}`)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="card pad-lg">
                <div className="card-head">
                  <div className="card-head-titles">
                    <div className="card-title-lg">{t("inicioSec.accesosTitulo")}</div>
                  </div>
                </div>
                <div className="inicio-sec-accesos">
                  {accesos.map((a) => (
                    <Link key={a.to} to={a.to} className="inicio-sec-acceso">
                      <span className="inicio-sec-acceso-icon">{a.icon}</span>
                      {a.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
