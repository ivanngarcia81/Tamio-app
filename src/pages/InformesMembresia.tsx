import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  currentMonth, currentYear, fmtFechaCorta, listAsistenciaLigera, listMembersRegistro,
  listServiciosLigero, listTrasladosEntrada, listTrasladosSalida,
  type AsistenciaLigera, type Church, type Member, type ServicioLigero, type TrasladoEntrada, type TrasladoSalida,
} from "../db";
import {
  alertasSeguimiento, asistenciaPorMiembro, camposFaltantes, esNuevoEnPeriodo, estadoEfectivo, enPeriodo,
  periodoDeAnio, periodoDeMes, periodoDeTrimestre, PERIODO_TODO, resumenAsistencia,
  resumenMembresia, sinAsistirReciente, topAsistencia,
  type Alerta, type Periodo,
} from "../services/informes/membresia";
import { cargarUmbrales, UMBRALES_DEFAULT, type Umbrales } from "../services/informes/umbrales";
import { exportarInformeCsv } from "../services/informes/exportInforme";
import { printInformeGeneral } from "../services/informes/printInforme";
import { CARGOS, INSTRUMENTOS, MINISTERIOS } from "../components/FichaMiembroModal";
import FichaMiembroModal from "../components/FichaMiembroModal";
import SeguimientoModal from "../components/SeguimientoModal";
import { EmptyState } from "../components/TxList";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { IconEdit, IconMiembros, IconPrinter, IconSearch } from "../icons";

const COLS = "1.5fr 150px 1.4fr 140px 44px";
const PAGE_SIZE = 25;

type PeriodoTipo = "mes" | "trimestre" | "anio" | "rango" | "todo";
type Vista = "miembros" | "asistencia" | "seguimiento" | "general";

const ALERTA_TAG: Record<string, string> = {
  rachaServicios: "pastores",
  diasSinAsistir: "eventos",
  nuevoSeguimiento: "donacion",
  expedienteIncompleto: "servicios",
};
type TarjetaFiltro =
  | "todos" | "activos" | "inactivos" | "nuevos" | "recibidos" | "trasladados"
  | "frecuentes" | "incompletos";
type OrdenCampo = "nombre" | "estado" | "ingreso" | "asistencia";

const BADGE_ESTADO: Record<string, string> = {
  activo: "activo", inactivo: "servicios", visitante: "donacion", enProceso: "musicos",
  trasladado: "baja", retirado: "baja", fallecido: "baja", baja: "baja",
};

function accent(color: string): CSSProperties {
  return { "--accent-color": color, textAlign: "left", cursor: "pointer", font: "inherit" } as CSSProperties;
}

function parseLista(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function chipsDe(t: (k: string) => string, json: string, prefijo: string): string {
  return parseLista(json).map((v) => (v.startsWith(prefijo) ? v : `${prefijo}.${v}`)).map((k) => t(k)).join(" · ");
}

interface Props {
  church: Church;
  refreshKey: number;
  onEdit: (m: Member) => void;
  onChanged: () => void;
}

export default function InformesMembresia({ church, refreshKey, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const [miembros, setMiembros] = useState<Member[]>([]);
  const [servicios, setServicios] = useState<ServicioLigero[]>([]);
  const [asistenciaRaw, setAsistenciaRaw] = useState<AsistenciaLigera[]>([]);
  const [trasladosSalida, setTrasladosSalida] = useState<TrasladoSalida[]>([]);
  const [trasladosEntrada, setTrasladosEntrada] = useState<TrasladoEntrada[]>([]);
  const [umbrales, setUmbrales] = useState<Umbrales>(UMBRALES_DEFAULT);
  const [loading, setLoading] = useState(true);

  // Periodo (fuente de verdad del encabezado).
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("anio");
  const [mesSel, setMesSel] = useState(currentMonth());
  const [anioSel, setAnioSel] = useState(currentYear());
  const [trimestreSel, setTrimestreSel] = useState<1 | 2 | 3 | 4>(1);
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");

  // Filtros que refinan dentro del periodo.
  const [query, setQuery] = useState("");
  const [tarjeta, setTarjeta] = useState<TarjetaFiltro>("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroMinisterio, setFiltroMinisterio] = useState("todos");
  const [filtroCargo, setFiltroCargo] = useState("todos");
  const [filtroInstrumento, setFiltroInstrumento] = useState("todos");
  const [soloRacha, setSoloRacha] = useState(false);
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [orden, setOrden] = useState<{ campo: OrdenCampo; dir: 1 | -1 }>({ campo: "nombre", dir: 1 });
  const [page, setPage] = useState(1);
  const [ficha, setFicha] = useState<Member | null>(null);
  const [vista, setVista] = useState<Vista>("miembros");
  const [seguimiento, setSeguimiento] = useState<Member | null>(null);

  const periodo: Periodo = useMemo(() => {
    if (periodoTipo === "mes") return periodoDeMes(mesSel);
    if (periodoTipo === "trimestre") return periodoDeTrimestre(Number(anioSel), trimestreSel);
    if (periodoTipo === "anio") return periodoDeAnio(Number(anioSel));
    if (periodoTipo === "rango") return { desde: rangoDesde || null, hasta: rangoHasta || null };
    return PERIODO_TODO;
  }, [periodoTipo, mesSel, anioSel, trimestreSel, rangoDesde, rangoHasta]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    (async () => {
      const [ms, serv, asis, ts, te, u] = await Promise.all([
        listMembersRegistro(church.id),
        listServiciosLigero(church.id, periodo.desde, periodo.hasta),
        listAsistenciaLigera(church.id, periodo.desde, periodo.hasta),
        listTrasladosSalida(church.id),
        listTrasladosEntrada(church.id),
        cargarUmbrales(church.id),
      ]);
      if (cancelado) return;
      setMiembros(ms);
      setServicios(serv);
      setAsistenciaRaw(asis);
      setTrasladosSalida(ts);
      setTrasladosEntrada(te);
      setUmbrales(u);
    })()
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, periodo.desde, periodo.hasta]);

  useEffect(() => setPage(1), [query, tarjeta, filtroEstado, filtroMinisterio, filtroCargo, filtroInstrumento, soloRacha, soloIncompletos, periodo.desde, periodo.hasta]);

  // Datos derivados memoizados: nunca se recalculan por render.
  const asistencia = useMemo(() => asistenciaPorMiembro(asistenciaRaw), [asistenciaRaw]);
  const resumen = useMemo(
    () => resumenMembresia(miembros, periodo, trasladosSalida, trasladosEntrada, asistencia, umbrales),
    [miembros, periodo, trasladosSalida, trasladosEntrada, asistencia, umbrales]
  );

  const idsRecibidos = useMemo(() => new Set(
    trasladosEntrada.filter((te) => te.estado === "completado" && te.member_id && enPeriodo(te.fecha_recepcion ?? te.creado_en.slice(0, 10), periodo)).map((te) => te.member_id!)
  ), [trasladosEntrada, periodo]);
  // Igual que el resumen: la fuente del badge (baja por traslado en el periodo).
  const idsTrasladados = useMemo(() => new Set(
    miembros.filter((m) => m.activo === 0 && m.motivo_baja === "traslado" && enPeriodo(m.fecha_baja, periodo)).map((m) => m.id)
  ), [miembros, periodo]);

  const filas = useMemo(() => {
    const q = query.trim().toLowerCase();
    let lista = miembros.map((m) => ({ miembro: m, asistencia: asistencia.get(m.id) }));

    // Filtro de tarjeta (además de los selectores).
    lista = lista.filter(({ miembro: m, asistencia: a }) => {
      const e = estadoEfectivo(m);
      switch (tarjeta) {
        case "activos": return e === "activo";
        case "inactivos": return e === "inactivo";
        case "nuevos": return esNuevoEnPeriodo(m, periodo, umbrales);
        case "recibidos": return idsRecibidos.has(m.id);
        case "trasladados": return idsTrasladados.has(m.id);
        case "frecuentes": return estadoEfectivo(m) === "activo" && !!a && a.racha >= umbrales.rachaServicios;
        case "incompletos": return camposFaltantes(m).length > 0;
        default: return true;
      }
    });

    lista = lista.filter(({ miembro: m, asistencia: a }) => {
      if (q && !m.nombre.toLowerCase().includes(q) && !(m.email ?? "").toLowerCase().includes(q)) return false;
      if (filtroEstado !== "todos" && estadoEfectivo(m) !== filtroEstado) return false;
      if (filtroMinisterio !== "todos" && !parseLista(m.ministerios).includes(filtroMinisterio)) return false;
      if (filtroCargo !== "todos" && !parseLista(m.cargos).includes(filtroCargo)) return false;
      if (filtroInstrumento !== "todos" && !parseLista(m.instrumentos).includes(filtroInstrumento)) return false;
      if (soloRacha && !(a && a.racha >= umbrales.rachaServicios)) return false;
      if (soloIncompletos && camposFaltantes(m).length === 0) return false;
      return true;
    });

    const { campo, dir } = orden;
    lista.sort((x, y) => {
      let c = 0;
      if (campo === "nombre") c = x.miembro.nombre.localeCompare(y.miembro.nombre);
      else if (campo === "estado") c = estadoEfectivo(x.miembro).localeCompare(estadoEfectivo(y.miembro));
      else if (campo === "ingreso") c = (x.miembro.fecha_ingreso ?? "").localeCompare(y.miembro.fecha_ingreso ?? "");
      else if (campo === "asistencia") c = (x.asistencia?.pct ?? -1) - (y.asistencia?.pct ?? -1);
      return c * dir;
    });
    return lista;
  }, [miembros, asistencia, query, tarjeta, filtroEstado, filtroMinisterio, filtroCargo, filtroInstrumento, soloRacha, soloIncompletos, orden, periodo, umbrales, idsRecibidos, idsTrasladados]);

  const totalPages = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const pagina = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hayFiltros = query || tarjeta !== "todos" || filtroEstado !== "todos" || filtroMinisterio !== "todos" ||
    filtroCargo !== "todos" || filtroInstrumento !== "todos" || soloRacha || soloIncompletos;

  function limpiarFiltros() {
    setQuery(""); setTarjeta("todos"); setFiltroEstado("todos"); setFiltroMinisterio("todos");
    setFiltroCargo("todos"); setFiltroInstrumento("todos"); setSoloRacha(false); setSoloIncompletos(false);
  }

  function ordenarPor(campo: OrdenCampo) {
    setOrden((o) => (o.campo === campo ? { campo, dir: o.dir === 1 ? -1 : 1 } : { campo, dir: 1 }));
  }

  async function exportar() {
    const ok = await exportarInformeCsv(filas);
    if (ok) showToast(t("informes.toastExportado"));
  }

  const distCargoGeneral = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const m of miembros) for (const k of parseLista(m.cargos)) conteo.set(k, (conteo.get(k) ?? 0) + 1);
    return Array.from(conteo.entries()).map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n);
  }, [miembros]);

  const etiquetaPeriodo = useMemo(() => {
    if (periodoTipo === "mes") return mesSel;
    if (periodoTipo === "trimestre") return t("informes.trimestreN", { n: trimestreSel }) + " " + anioSel;
    if (periodoTipo === "anio") return String(anioSel);
    if (periodoTipo === "rango") return `${rangoDesde || "…"} – ${rangoHasta || "…"}`;
    return t("informes.periodo.todo");
  }, [periodoTipo, mesSel, trimestreSel, anioSel, rangoDesde, rangoHasta, t]);

  async function imprimirGeneral() {
    try {
      await printInformeGeneral(church, {
        periodoLabel: etiquetaPeriodo,
        resumen,
        pctAsistencia: asistGeneral.pctGeneral,
        distMinisterio,
        distCargo: distCargoGeneral,
        movimientos,
      });
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    }
  }

  const flecha = (campo: OrdenCampo) => (orden.campo === campo ? (orden.dir === 1 ? " ↑" : " ↓") : "");

  // ----- Datos de la vista de asistencia -----
  const hoyISO = new Date().toISOString().slice(0, 10);
  const asistGeneral = useMemo(() => resumenAsistencia(servicios, asistenciaRaw), [servicios, asistenciaRaw]);
  const mejores = useMemo(() => topAsistencia(miembros, asistencia, umbrales), [miembros, asistencia, umbrales]);
  const sinAsistir = useMemo(
    () => miembros
      .filter((m) => m.activo === 1)
      .map((m) => ({ miembro: m, datos: asistencia.get(m.id) }))
      .filter((x) => x.datos && sinAsistirReciente(x.datos, hoyISO, umbrales))
      .sort((a, b) => (b.datos!.racha - a.datos!.racha)),
    [miembros, asistencia, umbrales, hoyISO]
  );
  const asistenciaMiembros = useMemo(
    () => miembros
      .map((m) => ({ miembro: m, datos: asistencia.get(m.id) }))
      .filter((x) => x.datos && x.datos.enRoster > 0)
      .sort((a, b) => (b.datos!.pct ?? 0) - (a.datos!.pct ?? 0) || a.miembro.nombre.localeCompare(b.miembro.nombre)),
    [miembros, asistencia]
  );

  // ----- Seguimiento: alertas agrupadas por miembro -----
  const gruposSeguimiento = useMemo(() => {
    const alertas = alertasSeguimiento(miembros, periodo, asistencia, hoyISO, umbrales);
    const porMiembro = new Map<number, { miembro: Member; alertas: Alerta[] }>();
    for (const al of alertas) {
      let g = porMiembro.get(al.miembro.id);
      if (!g) { g = { miembro: al.miembro, alertas: [] }; porMiembro.set(al.miembro.id, g); }
      g.alertas.push(al);
    }
    // Más alertas primero; luego los no revisados antes que los revisados.
    return Array.from(porMiembro.values()).sort((a, b) =>
      b.alertas.length - a.alertas.length ||
      Number(!!a.miembro.seguimiento_revisado_en) - Number(!!b.miembro.seguimiento_revisado_en)
    );
  }, [miembros, periodo, asistencia, hoyISO, umbrales]);

  function etiquetaAlerta(al: Alerta): string {
    if (al.tipo === "rachaServicios") return t("seguimiento.alerta.racha", { n: al.detalle });
    if (al.tipo === "diasSinAsistir") return t("seguimiento.alerta.dias");
    if (al.tipo === "nuevoSeguimiento") return t("seguimiento.alerta.nuevo");
    return t("seguimiento.alerta.incompleto");
  }

  // ----- Vista general: distribuciones discretas + movimientos -----
  function distribucion(claves: (m: Member) => string[]): { clave: string; n: number }[] {
    const conteo = new Map<string, number>();
    for (const m of miembros) for (const k of claves(m)) conteo.set(k, (conteo.get(k) ?? 0) + 1);
    return Array.from(conteo.entries()).map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n);
  }
  const distEstado = useMemo(() => distribucion((m) => [estadoEfectivo(m)]), [miembros]);
  const distMinisterio = useMemo(() => distribucion((m) => parseLista(m.ministerios)), [miembros]);
  const distExpediente = useMemo(
    () => [
      { clave: "completo", n: miembros.filter((m) => camposFaltantes(m).length === 0).length },
      { clave: "incompleto", n: miembros.filter((m) => camposFaltantes(m).length > 0).length },
    ],
    [miembros]
  );
  const nuevosPorMes = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const m of miembros) {
      const f = umbrales.nuevoPorCongregacion ? m.fecha_congregacion : m.fecha_ingreso;
      if (f && enPeriodo(f, periodo)) {
        const mm = f.slice(0, 7);
        conteo.set(mm, (conteo.get(mm) ?? 0) + 1);
      }
    }
    return Array.from(conteo.entries()).map(([mes, n]) => ({ mes, n })).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [miembros, periodo, umbrales.nuevoPorCongregacion]);

  const nombreMiembro = (id: number | null) => (id === null ? null : miembros.find((m) => m.id === id)?.nombre ?? null);
  const movimientos = useMemo(() => {
    const recibidos = trasladosEntrada
      .filter((te) => enPeriodo(te.fecha_recepcion ?? te.creado_en.slice(0, 10), periodo))
      .map((te) => ({
        folio: te.folio, tipo: "recibido" as const, persona: te.nombre,
        fecha: te.fecha_recepcion ?? te.creado_en.slice(0, 10),
        iglesia: te.iglesia_procedencia ?? "—", estado: t(`traslados.estadoTE.${te.estado}`),
      }));
    const enviados = trasladosSalida
      .filter((ts) => enPeriodo(ts.fecha_entrega ?? ts.fecha_solicitud, periodo))
      .map((ts) => ({
        folio: ts.folio, tipo: "enviado" as const, persona: nombreMiembro(ts.member_id) ?? "—",
        fecha: ts.fecha_entrega ?? ts.fecha_solicitud,
        iglesia: ts.iglesia_destino ?? "—", estado: t(`traslados.estadoTS.${ts.estado}`),
      }));
    return [...recibidos, ...enviados].sort((a, b) => b.fecha.localeCompare(a.fecha));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trasladosEntrada, trasladosSalida, periodo, t, miembros]);

  const maxNuevos = Math.max(1, ...nuevosPorMes.map((x) => x.n));

  function Distrib({ titulo, items, etiqueta }: { titulo: string; items: { clave: string; n: number }[]; etiqueta: (k: string) => string }) {
    const max = Math.max(1, ...items.map((i) => i.n));
    return (
      <div className="card">
        <div className="card-head"><span className="card-title">{titulo}</span></div>
        {items.length === 0 ? (
          <div style={{ padding: "8px 0", color: "var(--text-3)", fontSize: 13 }}>{t("informes.sinDatos")}</div>
        ) : items.map((it) => (
          <div key={it.clave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ fontSize: 12.5, width: 130, flex: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etiqueta(it.clave)}</span>
            <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((it.n / max) * 100)}%`, height: "100%", background: "var(--ink)", borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, width: 32, textAlign: "right", flex: "none", fontVariantNumeric: "tabular-nums" }}>{it.n}</span>
          </div>
        ))}
      </div>
    );
  }

  const tarjetas: { id: TarjetaFiltro; label: string; valor: number; color: string }[] = [
    { id: "todos", label: t("informes.cardTotal"), valor: resumen.total, color: "var(--accent-4)" },
    { id: "activos", label: t("informes.cardActivos"), valor: resumen.activos, color: "var(--accent-2)" },
    { id: "inactivos", label: t("informes.cardInactivos"), valor: resumen.inactivos, color: "var(--accent-3)" },
    { id: "nuevos", label: t("informes.cardNuevos"), valor: resumen.nuevosEnPeriodo, color: "var(--accent-1)" },
    { id: "recibidos", label: t("informes.cardRecibidos"), valor: resumen.recibidosPorTraslado, color: "var(--accent-5)" },
    { id: "trasladados", label: t("informes.cardTrasladados"), valor: resumen.trasladados, color: "var(--accent-3)" },
    { id: "frecuentes", label: t("informes.cardFrecuentes"), valor: resumen.ausenciasFrecuentes, color: "var(--accent-3)" },
    { id: "incompletos", label: t("informes.cardIncompletos"), valor: resumen.incompletos, color: "var(--accent-5)" },
  ];

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("informes.titulo")}</div>
          <div className="page-sub">{t("informes.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn secondary" onClick={imprimirGeneral} disabled={loading || miembros.length === 0}>
            <IconPrinter size={13} /> {t("informes.imprimirGeneral")}
          </button>
          <button className="btn secondary" onClick={exportar} disabled={filas.length === 0}>
            {t("informes.exportar")}
          </button>
        </div>
      </div>

      <div className="content">
        {/* Selector de periodo — fuente de verdad */}
        <div className="tx-head" style={{ flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["mes", "trimestre", "anio", "rango", "todo"] as PeriodoTipo[]).map((p) => (
              <button key={p} className={`chip${periodoTipo === p ? " active" : ""}`} onClick={() => setPeriodoTipo(p)}>
                {t(`informes.periodo.${p}`)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {periodoTipo === "mes" && (
              <input type="month" className="form-input" style={{ width: "auto" }} value={mesSel} onChange={(e) => setMesSel(e.target.value)} aria-label={t("informes.periodo.mes")} />
            )}
            {(periodoTipo === "trimestre" || periodoTipo === "anio") && (
              <input type="number" className="form-input" style={{ width: 100 }} value={anioSel} min={2000} max={2100} onChange={(e) => setAnioSel(e.target.value)} aria-label={t("informes.periodo.anio")} />
            )}
            {periodoTipo === "trimestre" && (
              <select className="form-input" style={{ width: "auto" }} value={trimestreSel} onChange={(e) => setTrimestreSel(Number(e.target.value) as 1 | 2 | 3 | 4)} aria-label={t("informes.periodo.trimestre")}>
                {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{t("informes.trimestreN", { n: q })}</option>)}
              </select>
            )}
            {periodoTipo === "rango" && (
              <>
                <input type="date" className="form-input" style={{ width: "auto" }} value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} aria-label={t("cartas.fechaDesde")} title={t("cartas.fechaDesde")} />
                <input type="date" className="form-input" style={{ width: "auto" }} value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} aria-label={t("cartas.fechaHasta")} title={t("cartas.fechaHasta")} />
              </>
            )}
          </div>
        </div>

        {/* Pestañas: registro de miembros, asistencia y seguimiento */}
        <div style={{ display: "flex", gap: 6, margin: "14px 0 4px" }}>
          {(["miembros", "asistencia", "seguimiento", "general"] as Vista[]).map((v) => (
            <button key={v} className={`chip${vista === v ? " active" : ""}`} onClick={() => setVista(v)}>
              {t(`informes.vista.${v}`)}
              {v === "seguimiento" && gruposSeguimiento.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{gruposSeguimiento.length}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : vista === "general" ? (
          miembros.length === 0 ? (
            <EmptyState titulo={t("informes.vacioTitulo")} sub={t("informes.vacioSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
          ) : (
            <div className="enter">
              <div className="dash-canvas">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                <Distrib titulo={t("informes.distEstado")} items={distEstado} etiqueta={(k) => t(`membresia.estado.${k}`)} />
                <Distrib titulo={t("informes.distMinisterio")} items={distMinisterio} etiqueta={(k) => (MINISTERIOS.includes(k as typeof MINISTERIOS[number]) ? t(`ficha.ministerio.${k}`) : k)} />
                <Distrib titulo={t("informes.distExpediente")} items={distExpediente} etiqueta={(k) => t(`informes.exp.${k}`)} />
              </div>

              {/* Nuevos por mes en el periodo */}
              <div className="card">
                <div className="card-head"><span className="card-title">{t("informes.nuevosPorMes")}</span></div>
                {nuevosPorMes.length === 0 ? (
                  <div style={{ padding: "8px 0", color: "var(--text-3)", fontSize: 13 }}>{t("informes.sinDatos")}</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, paddingTop: 8 }}>
                    {nuevosPorMes.map((x) => (
                      <div key={x.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 24 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{x.n}</span>
                        <div style={{ width: "70%", maxWidth: 40, height: `${Math.round((x.n / maxNuevos) * 90)}%`, minHeight: 3, background: "var(--ink)", borderRadius: "4px 4px 0 0" }} />
                        <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{x.mes.slice(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>

              {/* Movimientos de membresía */}
              <div className="tx-head" style={{ marginTop: 18 }}>
                <span className="card-title">{t("informes.movimientos")}</span>
                <Link to="/cartas" className="btn secondary" style={{ textDecoration: "none" }}>{t("informes.irCartas")}</Link>
              </div>
              {movimientos.length === 0 ? (
                <EmptyState titulo={t("informes.sinMovimientos")} sub={t("informes.sinMovimientosSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
              ) : (
                <div className="data-table roomy">
                  <div className="thead" style={{ gridTemplateColumns: "120px 130px 1.4fr 110px 130px" }}>
                    <div className="th">{t("actas.colFolio")}</div>
                    <div className="th">{t("informes.movTipo")}</div>
                    <div className="th">{t("informes.movPersona")}</div>
                    <div className="th">{t("tx.colFecha")}</div>
                    <div className="th">{t("membresia.colEstado")}</div>
                  </div>
                  {movimientos.map((mv) => (
                    <div key={mv.folio} className="tr" style={{ gridTemplateColumns: "120px 130px 1.4fr 110px 130px" }}>
                      <div className="td" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12.5, fontWeight: 600 }}>{mv.folio}</div>
                      <div className="td">
                        <span className={`tag ${mv.tipo === "recibido" ? "activo" : "donacion"}`}>
                          {mv.tipo === "recibido" ? t("informes.movRecibido") : t("informes.movEnviado")}
                        </span>
                      </div>
                      <div className="td" style={{ minWidth: 0 }}>
                        <div className="p-name truncate">{mv.persona}</div>
                        <div className="p-mail truncate">{mv.iglesia}</div>
                      </div>
                      <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fmtFechaCorta(mv.fecha)}</div>
                      <div className="td" style={{ fontSize: 12, color: "var(--text-2)" }}><div className="truncate">{mv.estado}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : vista === "seguimiento" ? (
          gruposSeguimiento.length === 0 ? (
            <EmptyState titulo={t("seguimiento.vacioTitulo")} sub={t("seguimiento.vacioSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
          ) : (
            <div className="data-table roomy enter">
              <div className="thead" style={{ gridTemplateColumns: "1.5fr 2fr 150px 90px" }}>
                <div className="th">{t("informes.colMiembro")}</div>
                <div className="th">{t("seguimiento.colAlertas")}</div>
                <div className="th">{t("seguimiento.colRevisado")}</div>
                <div className="th"></div>
              </div>
              {gruposSeguimiento.map(({ miembro: m, alertas }) => (
                <div key={m.id} className="tr" style={{ gridTemplateColumns: "1.5fr 2fr 150px 90px", cursor: "pointer" }} onClick={() => setSeguimiento(m)}>
                  <div className="td" style={{ minWidth: 0 }}>
                    <div className="p-name truncate">{m.nombre}</div>
                    <span className={`tag ${BADGE_ESTADO[estadoEfectivo(m)] ?? "otros"}`}>{t(`membresia.estado.${estadoEfectivo(m)}`)}</span>
                  </div>
                  <div className="td" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {alertas.map((al, i) => (
                      <span key={i} className={`tag ${ALERTA_TAG[al.tipo] ?? "otros"}`}>{etiquetaAlerta(al)}</span>
                    ))}
                  </div>
                  <div className="td" style={{ fontSize: 12, color: m.seguimiento_revisado_en ? "var(--text-2)" : "var(--text-3)" }}>
                    {m.seguimiento_revisado_en ? m.seguimiento_revisado_en.slice(0, 10) : t("seguimiento.sinRevisar")}
                  </div>
                  <div className="td" style={{ textAlign: "center" }} onClick={(ev) => ev.stopPropagation()}>
                    <button className="btn secondary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setSeguimiento(m)}>
                      {t("seguimiento.abrir")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : vista === "miembros" ? (
          <>
            {/* Tarjetas de resumen clicables — agrupadas en el lienzo. */}
            <div className="dash-canvas">
            <div className="summary-8 enter">
              {tarjetas.map((c) => (
                <button
                  key={c.id}
                  className={`stat-card accent${tarjeta === c.id ? " is-selected" : ""}`}
                  style={accent(c.color)}
                  title={c.id === "frecuentes" ? t("informes.cardFrecuentesRegla", { n: umbrales.rachaServicios }) : undefined}
                  aria-pressed={tarjeta === c.id}
                  onClick={() => setTarjeta((cur) => (cur === c.id ? "todos" : c.id))}
                >
                  <div className="stat-head"><span className="stat-label">{c.label}</span></div>
                  <div className="stat-value md">{c.valor}</div>
                </button>
              ))}
            </div>
            </div>

            {/* Filtros combinables */}
            <div className="tx-head" style={{ flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              <div className="search-input-wrap" style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input className="form-input" placeholder={t("informes.buscar")} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="form-input" style={{ width: "auto" }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label={t("membresia.colEstado")}>
                <option value="todos">{t("informes.filtroTodosEstados")}</option>
                {["activo", "inactivo", "visitante", "enProceso", "trasladado", "retirado", "fallecido"].map((e) => (
                  <option key={e} value={e}>{t(`membresia.estado.${e}`)}</option>
                ))}
              </select>
              <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroMinisterio} onChange={(e) => setFiltroMinisterio(e.target.value)} aria-label={t("informes.colMinisterio")}>
                <option value="todos">{t("informes.filtroMinisterio")}</option>
                {MINISTERIOS.map((m) => <option key={m} value={m}>{t(`ficha.ministerio.${m}`)}</option>)}
              </select>
              <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroCargo} onChange={(e) => setFiltroCargo(e.target.value)} aria-label={t("ficha.cargosLabel")}>
                <option value="todos">{t("informes.filtroCargo")}</option>
                {CARGOS.map((c) => <option key={c} value={c}>{t(`ficha.cargo.${c}`)}</option>)}
              </select>
              <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroInstrumento} onChange={(e) => setFiltroInstrumento(e.target.value)} aria-label={t("informes.colInstrumento")}>
                <option value="todos">{t("informes.filtroInstrumento")}</option>
                {INSTRUMENTOS.map((i) => <option key={i} value={i}>{t(`ficha.instrumento.${i}`)}</option>)}
              </select>
              <button className={`chip${soloRacha ? " active" : ""}`} onClick={() => setSoloRacha((v) => !v)}>{t("informes.filtroRacha")}</button>
              <button className={`chip${soloIncompletos ? " active" : ""}`} onClick={() => setSoloIncompletos((v) => !v)}>{t("informes.filtroIncompletos")}</button>
              {hayFiltros && <button className="chip" onClick={limpiarFiltros}>{t("informes.limpiar")}</button>}
            </div>

            {/* Tabla principal */}
            {miembros.length === 0 ? (
              <EmptyState titulo={t("informes.vacioTitulo")} sub={t("informes.vacioSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
            ) : filas.length === 0 ? (
              <EmptyState titulo={t("informes.sinResultadosTitulo")} sub={t("informes.sinResultadosSub")} icon={<IconSearch size={20} strokeWidth={1.8} />} />
            ) : (
              <div className="data-table roomy">
                <div className="thead" style={{ gridTemplateColumns: COLS, position: "sticky", top: 0, zIndex: 1, background: "var(--surface)" }}>
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("nombre")}>{t("informes.colMiembro")}{flecha("nombre")}</button>
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("ingreso")}>{t("informes.colFechas")}{flecha("ingreso")}</button>
                  <div className="th">{t("informes.colServicio")}</div>
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("asistencia")}>{t("informes.colAsistencia")}{flecha("asistencia")}</button>
                  <div className="th"></div>
                </div>
                {pagina.map(({ miembro: m, asistencia: a }) => {
                  const e = estadoEfectivo(m);
                  const incompleto = camposFaltantes(m).length > 0;
                  const servicioTxt = [
                    chipsDe(t, m.ministerios, "ficha.ministerio"),
                    chipsDe(t, m.cargos, "ficha.cargo"),
                    chipsDe(t, m.instrumentos, "ficha.instrumento"),
                  ].filter(Boolean).join(" · ");
                  return (
                    <div className="tr" key={m.id} style={{ gridTemplateColumns: COLS, cursor: "pointer" }} onClick={() => setFicha(m)}>
                      <div className="td" style={{ minWidth: 0 }}>
                        <div className="p-name truncate" title={m.nombre}>
                          {incompleto && <span title={t("informes.incompletoTitle")} style={{ marginRight: 5 }}>⚠️</span>}
                          {m.nombre}
                        </div>
                        <span className={`tag ${BADGE_ESTADO[e] ?? "otros"}`}>{t(`membresia.estado.${e}`)}</span>
                      </div>
                      <div className="td" style={{ fontSize: 12, color: "var(--text-2)" }}>
                        <div>{m.fecha_congregacion ? fmtFechaCorta(m.fecha_congregacion) : "—"}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                          {m.fecha_ingreso ? t("informes.miembroDesde", { fecha: fmtFechaCorta(m.fecha_ingreso) }) : t("informes.sinFechaMembresia")}
                        </div>
                      </div>
                      <div className="td" style={{ fontSize: 12, color: "var(--text-2)", minWidth: 0 }}>
                        <div className="truncate" title={servicioTxt}>{servicioTxt || "—"}</div>
                      </div>
                      <div className="td" style={{ fontSize: 12.5 }}>
                        {a && a.pct !== null ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{a.pct}%</div>
                            <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                              {a.ultimaAsistencia ? fmtFechaCorta(a.ultimaAsistencia) : t("informes.nuncaAsistio")}
                            </div>
                          </>
                        ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </div>
                      <div className="td" style={{ textAlign: "center" }} onClick={(ev) => ev.stopPropagation()}>
                        <span className="row-icon-btn" title={t("common.editar")} onClick={() => onEdit(m)}>
                          <IconEdit size={13} strokeWidth={2} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        ) : servicios.length === 0 ? (
          <EmptyState titulo={t("informes.asistVacioTitulo")} sub={t("informes.asistVacioSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
        ) : (
          <>
            {/* Indicadores generales + destacados: panel de resumen. */}
            <div className="dash-canvas">
            <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
                <div className="stat-head"><span className="stat-label">{t("informes.totalServicios")}</span></div>
                <div className="stat-value md">{asistGeneral.totalServicios}</div>
              </div>
              <div className="stat-card accent" style={{ "--accent-color": "var(--accent-2)" } as CSSProperties}>
                <div className="stat-head"><span className="stat-label">{t("informes.asistenciaTotal")}</span></div>
                <div className="stat-value md">{asistGeneral.asistenciaTotal}</div>
              </div>
              <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
                <div className="stat-head"><span className="stat-label">{t("informes.promedioServicio")}</span></div>
                <div className="stat-value md">{asistGeneral.promedioPorServicio}</div>
              </div>
              <div className="stat-card accent" style={{ "--accent-color": "var(--accent-5)" } as CSSProperties}>
                <div className="stat-head"><span className="stat-label">{t("informes.pctGeneral")}</span></div>
                <div className="stat-value md">{asistGeneral.pctGeneral !== null ? `${asistGeneral.pctGeneral}%` : "—"}</div>
              </div>
            </div>

            {/* Mejores asistencias + sin asistir recientemente */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              <div className="card">
                <div className="card-head"><span className="card-title">{t("informes.mejoresTitulo")}</span></div>
                {mejores.length === 0 ? (
                  <div style={{ padding: "8px 0", color: "var(--text-3)", fontSize: 13 }}>{t("informes.sinDatos")}</div>
                ) : mejores.map(({ miembro: m, datos: a }) => (
                  <div key={m.id} className="roster-row" style={{ cursor: "pointer" }} onClick={() => setFicha(m)}>
                    <span className="roster-name">{m.nombre}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: "none" }}>{a.pct}%</span>
                    <span style={{ color: "var(--text-3)", fontSize: 11.5, flex: "none", width: 90, textAlign: "right" }}>
                      {t("informes.deN", { asis: a.asistidos, total: a.enRoster })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-head"><span className="card-title">{t("informes.sinAsistirTitulo")}</span></div>
                {sinAsistir.length === 0 ? (
                  <div style={{ padding: "8px 0", color: "var(--text-3)", fontSize: 13 }}>{t("informes.sinAsistirVacio")}</div>
                ) : sinAsistir.slice(0, 12).map(({ miembro: m, datos: a }) => (
                  <div key={m.id} className="roster-row" style={{ cursor: "pointer" }} onClick={() => setFicha(m)}>
                    <span className="roster-name">{m.nombre}</span>
                    <span className="tag baja" style={{ flex: "none" }}>{t("informes.ausenciasN", { n: a!.racha })}</span>
                    <span style={{ color: "var(--text-3)", fontSize: 11.5, flex: "none", width: 90, textAlign: "right" }}>
                      {a!.ultimaAsistencia ? fmtFechaCorta(a!.ultimaAsistencia) : t("informes.nuncaAsistio")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Asistencia por miembro */}
            <div className="tx-head" style={{ marginTop: 18 }}>
              <span className="card-title">{t("informes.porMiembroTitulo")}</span>
            </div>
            <div className="data-table roomy">
              <div className="thead" style={{ gridTemplateColumns: "1.6fr 90px 90px 90px 130px" }}>
                <div className="th">{t("informes.colMiembro")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("informes.colAsistidos")}</div>
                <div className="th" style={{ textAlign: "right" }}>{t("informes.colAusentes")}</div>
                <div className="th" style={{ textAlign: "right" }}>%</div>
                <div className="th">{t("informes.colUltima")}</div>
              </div>
              {asistenciaMiembros.map(({ miembro: m, datos: a }) => (
                <div key={m.id} className="tr" style={{ gridTemplateColumns: "1.6fr 90px 90px 90px 130px", cursor: "pointer" }} onClick={() => setFicha(m)}>
                  <div className="td" style={{ minWidth: 0 }}>
                    <div className="p-name truncate">{m.nombre}</div>
                    {a!.racha >= umbrales.rachaServicios && (
                      <span className="tag baja">{t("informes.ausenciasN", { n: a!.racha })}</span>
                    )}
                  </div>
                  <div className="td" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a!.asistidos}</div>
                  <div className="td" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{a!.ausentes}</div>
                  <div className="td" style={{ textAlign: "right", fontWeight: 700 }}>{a!.pct}%</div>
                  <div className="td" style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                    {a!.ultimaAsistencia ? fmtFechaCorta(a!.ultimaAsistencia) : t("informes.nuncaAsistio")}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {ficha && (
        <FichaMiembroModal
          church={church}
          member={ficha}
          onClose={() => setFicha(null)}
          onSaved={() => { onChanged(); setFicha(null); }}
        />
      )}

      {seguimiento && (
        <SeguimientoModal
          church={church}
          member={seguimiento}
          alertas={(gruposSeguimiento.find((g) => g.miembro.id === seguimiento.id)?.alertas ?? []).map(etiquetaAlerta)}
          onClose={() => setSeguimiento(null)}
          onSaved={onChanged}
          onVerPerfil={() => { const m = seguimiento; setSeguimiento(null); setFicha(m); }}
        />
      )}
    </>
  );
}
