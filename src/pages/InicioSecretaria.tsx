import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  currentYear, fmtFechaCorta, hoyISO, listActividades, listMembersRegistro, membresiaStats, mesCorto,
  type Actividad, type Church, type Member, type MembresiaStats,
} from "../db";
import { camposFaltantes } from "../services/informes/membresia";
import { expandirTodas } from "../services/agenda/recurrencia";
import LoadingState from "../components/LoadingState";
import CountUp from "../components/CountUp";
import {
  IconArrowUp, IconCalendar, IconClipboardList, IconIdBadge, IconMail, IconMiembros, IconWarn,
} from "../icons";
import { esIPhone, esMac } from "../movil";
import { IosChevron } from "../components/ios/FormularioIOS";
import { FilaActividad } from "./Agenda";

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
  const enIPhone = esIPhone();
  const navigate = useNavigate();
  const [stats, setStats] = useState<MembresiaStats | null>(null);
  const [incompletos, setIncompletos] = useState(0);
  /* El padrón entero, que ya se pedía para contar expedientes incompletos.
     Se guarda porque las barras de altas por mes de la maqueta H3 salen de
     `fecha_ingreso`, y contarlas aquí evita una consulta que diría lo mismo
     que la que ya se hizo. */
  const [miembros, setMiembros] = useState<Member[]>([]);
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
        setMiembros(miembros);
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

  /* ---- Las barras de altas por mes (maqueta H3) ----

     Del 1 de enero al mes en curso, un tramo por mes. «Los meses en cero se
     dejan a la vista»: saltárselos haría que marzo y julio parecieran
     consecutivos, y en una serie de altas los meses vacíos son justamente lo
     que se viene a ver.

     Solo cuenta a quien tiene `fecha_ingreso` en el año en curso, que es la
     misma regla con la que `membresiaStats` calcula `altasAnio`: si las
     barras contaran de otra forma, su suma no cuadraría con la cifra que
     tienen al lado. */
  const altasPorMes = useMemo(() => {
    const anio = currentYear();
    const hasta = Number(hoy.slice(5, 7));
    const cuenta = new Array(hasta).fill(0);
    for (const m of miembros) {
      const f = m.fecha_ingreso;
      if (!f || f.slice(0, 4) !== anio) continue;
      const i = Number(f.slice(5, 7)) - 1;
      if (i >= 0 && i < hasta) cuenta[i] += 1;
    }
    return cuenta.map((n, i) => ({
      etiqueta: mesCorto(`${anio}-${String(i + 1).padStart(2, "0")}`),
      altas: n,
    }));
  }, [miembros, hoy]);
  const topeAltas = Math.max(1, ...altasPorMes.map((m) => m.altas));

  /* El membrete de la maqueta: «Getsemaní, Saltillo · 2026». La ciudad puede
     no estar puesta —es opcional en la ficha de la iglesia—, y entonces el
     membrete es el nombre y el año, sin una coma colgando. */
  const membrete = [
    [church.nombre, church.ciudad].filter(Boolean).join(", "),
    currentYear(),
  ].join(" · ");

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
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {/* En el teléfono esta cabecera estaba VACÍA: Inicio de secretaría era
            la única pantalla de la app cuya barra no decía dónde estabas, y
            `.titulo-fijo` —la copia que se queda arriba al desplazar— no
            tenía texto que copiar. La maqueta H3 le pone el mismo Large Title
            que las demás, con el membrete debajo. */}
        <div>
          <div className="page-title">{t("inicioSec.titulo")}</div>
          <div className="page-sub">{enIPhone ? membrete : church.nombre}</div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <LoadingState />
        ) : enIPhone ? (
          <>
            {/* «Las cuatro cifras de InicioSecretaria en una sola tarjeta
                gráfica, igual que en Tesorería.»

                Lo que había era la misma rejilla de cuatro tarjetas KPI del
                escritorio metida en 393 px: cuatro números del mismo tamaño,
                ninguno LA cifra. Aquí manda «miembros activos» —con el total
                del padrón al lado, que es lo que le da sentido a un 6— y las
                otras tres bajan al pie con su punto de color.

                Comparte las clases de la tarjeta de Tesorería a propósito: es
                la misma pieza en las dos portadas, y que se vean iguales es
                justamente lo que dice el handoff. */}
            <div className="ios-tarjeta-cifras">
              <div className="itc-cabeza">
                <span className="itc-bloque">
                  <span className="itc-rotulo">{t("inicioSec.statActivos")}</span>
                  <span className="itc-num">
                    <CountUp value={stats?.activos ?? 0} format={String} />
                    <span className="itc-de">{t("inicioSec.deTotal", { total: stats?.total ?? 0 })}</span>
                  </span>
                </span>
                {(stats?.altasAnio ?? 0) > 0 && (
                  <span className="itc-pastilla itc-pastilla--alta">
                    <IconArrowUp size={9} strokeWidth={2.2} />
                    {t("inicioSec.nAltas", { n: stats?.altasAnio ?? 0 })}
                  </span>
                )}
              </div>
              {/* Dos condiciones, y las dos por lo mismo: una franja de 96 px
                  que no dibuja nada es peor que no tenerla. Con un solo mes
                  transcurrido no hay serie que comparar, y con el año entero
                  sin altas las doce barras serían la misma raya al ras —una
                  gráfica de nada, ocupando el sitio de algo—. */}
              {altasPorMes.length > 1 && (stats?.altasAnio ?? 0) > 0 && (
                <div className="itc-barras" aria-hidden="true">
                  {altasPorMes.map((m) => (
                    <span className="itc-barra" key={m.etiqueta}>
                      <span className="itc-barra-par">
                        <i
                          className={`itc-barra-alta${m.altas === 0 ? " es-cero" : ""}`}
                          style={{ height: `${Math.round((m.altas / topeAltas) * 100)}%` }}
                        />
                      </span>
                      <span className={`itc-barra-rot${m.altas > 0 ? " es-viva" : ""}`}>{m.etiqueta}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="itc-pie">
                <span className="itc-cifra">
                  <span className="itc-etiqueta">
                    <i className="itc-punto itc-punto--alta" />{t("inicioSec.cortoAltas", { anio: currentYear() })}
                  </span>
                  <span className="itc-valor">{stats?.altasAnio ?? 0}</span>
                </span>
                {/* Ámbar, «que es el único que lleva a arreglar algo»: los
                    otros dos son cuentas, este es trabajo pendiente. */}
                <Link to="/reporte-miembros" className="itc-cifra itc-cifra--enlace">
                  <span className="itc-etiqueta">
                    <i className="itc-punto itc-punto--aviso" />{t("inicioSec.cortoIncompletos")}
                  </span>
                  <span className={`itc-valor${incompletos > 0 ? " es-aviso" : ""}`}>
                    {incompletos > 0 ? t("inicioSec.nSinLlenar", { n: incompletos }) : t("membresia.expCompleto")}
                  </span>
                </Link>
                <span className="itc-cifra itc-cifra--fin">
                  <span className="itc-etiqueta">
                    <i className="itc-punto itc-punto--caja" />{t("inicioSec.cortoProximas")}
                  </span>
                  <span className="itc-valor">{proximas.length}</span>
                </span>
              </div>
            </div>
            <p className="ios-section-footer itc-pie-texto">{t("inicioSec.pieTarjeta")}</p>

            <div className="ios-panel">
              <div className="ios-panel-head">
                <h2>{t("inicioSec.proximasTitulo")}</h2>
                <button type="button" className="ios-panel-action" onClick={() => navigate("/agenda")}>
                  {t("inicioSec.verAgenda")}
                </button>
              </div>
              {proximas5.length === 0 ? (
                <div className="ios-panel-empty">{t("inicioSec.sinProximas")}</div>
              ) : (
                <div className="ios-listcard">
                  {/* La MISMA fila de Agenda, no una copia: son las mismas
                      ocurrencias de `expandirTodas`. Esta pantalla no carga
                      los miembros, así que el responsable se omite — es el
                      único dato de la línea secundaria que no tiene. */}
                  {proximas5.map((a) => (
                    <FilaActividad
                      key={`${a._master.id}:${a._fechaOriginal}`}
                      a={a}
                      onOpen={() => navigate("/agenda")}
                      etiquetaTipo={etiquetaTipo}
                      nombreResponsable={() => null}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* «Los accesos como grupo "Ir a".» Eran tarjetas con icono en
                recuadro; en iOS un destino es una fila con galón, y cuatro
                filas de 44 px ocupan menos que cuatro tarjetas y se tocan
                igual de bien. El icono se va: la palabra ya nombra el sitio. */}
            <div className="ios-panel">
              <div className="ios-panel-head"><h2>{t("inicioSec.accesosTitulo")}</h2></div>
              <div className="ios-listcard">
                {accesos.map((a) => (
                  <Link key={a.to} to={a.to} className="ios-txrow ios-txrow--clickable">
                    <div className="ios-txrow-main"><div className="ios-txrow-title">{a.label}</div></div>
                    <div className="ios-txrow-trailing"><IosChevron /></div>
                  </Link>
                ))}
              </div>
            </div>
          </>
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
