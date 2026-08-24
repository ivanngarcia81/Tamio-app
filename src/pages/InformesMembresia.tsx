import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPhone, esMac, textoCorto, esIPad } from "../movil";
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
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cargarUmbrales, UMBRALES_DEFAULT, type Umbrales } from "../services/informes/umbrales";
import { exportarInformeCsv } from "../services/informes/exportInforme";
import { printInformeGeneral } from "../services/informes/printInforme";
import { CARGOS, INSTRUMENTOS, MINISTERIOS } from "../components/FichaMiembroModal";
import FichaMiembroModal from "../components/FichaMiembroModal";
import SeguimientoModal from "../components/SeguimientoModal";
import { EmptyState } from "../components/TxList";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import { MacBuscador, MacFiltros, MacSegmentado, type CampoFiltro } from "../components/mac/MacFiltros";
import Pagination from "../components/Pagination";
import RowMenu from "../components/RowMenu";
import { showToast } from "../toast";
import { IconChevronLeft, IconCheck, IconEdit, IconMiembros, IconMore, IconPrinter, IconSearch, IconWarn } from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import Portal from "../components/Portal";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { ActionField, FilaNativa, IosChevron, Section, SwitchField } from "../components/ios/FormularioIOS";
import { IOSPickerField } from "../components/ios/IOSPickerField";
import HeaderMenu from "../components/HeaderMenu";
import CountUp from "../components/CountUp";
import { IOSPickerChip } from "../components/ios/IOSPickerField";
import type { IOSPickerOption } from "../components/ios/IOSPickerSheet";

const COLS = "1.5fr 150px 1.4fr 140px 72px";
/* En el partido del iPad el panel mide ~660–1000px: el nombre manda. Con el
   reparto de arriba, "Ana Martínez" salía "Ana Ma…" — el nombre es LA
   columna de esta tabla y era la única que se truncaba. */
const COLS_IPAD_TABLA = "minmax(0, 1.9fr) 128px minmax(0, 1.1fr) 116px 52px";
/* En Mac cada dato tiene su columna y la fila cabe en 26 px. Antes el estado
   iba debajo del nombre, las dos fechas apiladas en una celda y la asistencia
   con su última visita debajo: tres celdas de dos líneas que dejaban la fila
   en ~100 px. Mismos datos, ninguno se pierde — solo dejan de amontonarse. */
const COLS_MAC = "minmax(0,1.3fr) 88px 104px 104px minmax(0,1.1fr) 78px 104px 52px";
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

/** El resto de estados (inactivo/visitante/enProceso/trasladado/retirado/
 *  fallecido/baja) son administrativos, no una cola de trabajo con
 *  "pendiente" como Cartas/Traslados — así que solo "activo" se destaca en
 *  verde y el resto se queda en gris neutro. */
function badgeClaseEstadoMiembro(estado: string): string {
  return estado === "activo" ? "ios-badge--ok" : "";
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

/** Hoja de vista + periodo del teléfono. Sustituye a las dos primeras barras
 *  de la pantalla; no calcula nada, solo mueve los mismos setters que movían
 *  los chips, así que el periodo sigue saliendo del mismo `useMemo`. */
function IOSHojaControl({
  vista, onVista, periodoTipo, onPeriodoTipo,
  mesSel, onMes, anioSel, onAnio, trimestreSel, onTrimestre,
  rangoDesde, onDesde, rangoHasta, onHasta,
  pendientesSeguimiento, onCerrar,
}: {
  vista: Vista;
  onVista: (v: Vista) => void;
  periodoTipo: PeriodoTipo;
  onPeriodoTipo: (p: PeriodoTipo) => void;
  mesSel: string; onMes: (v: string) => void;
  anioSel: string; onAnio: (v: string) => void;
  trimestreSel: 1 | 2 | 3 | 4; onTrimestre: (v: 1 | 2 | 3 | 4) => void;
  rangoDesde: string; onDesde: (v: string) => void;
  rangoHasta: string; onHasta: (v: string) => void;
  pendientesSeguimiento: number;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCerrar);

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div className="ios-sheet" role="dialog" aria-label={t("informes.titulo")}>
          <div className="ios-nav">
            <span className="ios-back" />
            <h1 className="ios-nav-title">{t("informes.titulo")}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={onCerrar}>{t("common.listo")}</button>
            </span>
          </div>
          <div className="ios-sheet-body">
            <Section header={t("informes.hojaVista")}>
              {(["miembros", "asistencia", "seguimiento", "general"] as Vista[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="ios-field ios-field--link"
                  onClick={() => { onVista(v); onCerrar(); }}
                >
                  <span className="ios-field-label">{t(`informes.vista.${v}`)}</span>
                  {v === "seguimiento" && pendientesSeguimiento > 0 && (
                    <span className="ios-insignia es-pendiente">{pendientesSeguimiento}</span>
                  )}
                  {v === vista && <IconCheck size={17} />}
                </button>
              ))}
            </Section>

            <Section header={t("informes.hojaPeriodo")}>
              <IOSPickerField
                label={t("informes.hojaPeriodo")}
                options={(["mes", "trimestre", "anio", "rango", "todo"] as PeriodoTipo[]).map((p) => ({
                  value: p, label: t(`informes.periodo.${p}`),
                }))}
                value={periodoTipo}
                onSelect={(v) => onPeriodoTipo(v as PeriodoTipo)}
              />
              {periodoTipo === "mes" && (
                <FilaNativa label={t("informes.periodo.mes")} tipo="month" valor={mesSel} onChange={onMes} />
              )}
              {(periodoTipo === "trimestre" || periodoTipo === "anio") && (
                <label className="ios-field">
                  <span className="ios-field-label">{t("informes.periodo.anio")}</span>
                  <input
                    className="ios-field-input nm-nativo"
                    type="number"
                    inputMode="numeric"
                    min={2000}
                    max={2100}
                    value={anioSel}
                    onChange={(e) => onAnio(e.target.value)}
                  />
                </label>
              )}
              {periodoTipo === "trimestre" && (
                <IOSPickerField
                  label={t("informes.periodo.trimestre")}
                  options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `T${n}` }))}
                  value={String(trimestreSel)}
                  onSelect={(v) => onTrimestre(Number(v) as 1 | 2 | 3 | 4)}
                />
              )}
              {periodoTipo === "rango" && (
                <>
                  <FilaNativa label={t("cartas.fechaDesde")} tipo="date" valor={rangoDesde} onChange={onDesde} />
                  <FilaNativa label={t("cartas.fechaHasta")} tipo="date" valor={rangoHasta} onChange={onHasta} />
                </>
              )}
            </Section>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function InformesMembresia({ church, refreshKey, onEdit, onChanged }: Props) {
  const { t } = useTranslation();
  // El carrusel de secciones ya muestra "Reporte de Miembros" como pastilla
  // activa (ver Cartas.tsx/Movimientos.tsx/Miembros.tsx) — el título grande
  // de aquí abajo sobra ahí.
  const enIPhone = esIPhone();
  const enMac = esMac();
  /* El maestro-detalle del handoff 2: índice de 330 (Periodo + los cuatro
     informes) y el detalle con su propia barrita. Solo iPad partido. */
  const enIPad = esIPad();
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const partido = enIPad && anchoPartido;
  const [panelAbierto, setPanelAbierto] = useState(false);
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
  /* Hojas del teléfono: la de vista+periodo y la de los filtros que quedan.
     En Mac no existen — ahí manda `MacFiltros`, que no se toca. */
  const [hojaControl, setHojaControl] = useState(false);
  const [hojaFiltros, setHojaFiltros] = useState(false);
  const [seguimiento, setSeguimiento] = useState<Member | null>(null);

  const periodo: Periodo = useMemo(() => {
    if (periodoTipo === "mes") return periodoDeMes(mesSel);
    if (periodoTipo === "trimestre") return periodoDeTrimestre(Number(anioSel), trimestreSel);
    if (periodoTipo === "anio") return periodoDeAnio(Number(anioSel));
    if (periodoTipo === "rango") return { desde: rangoDesde || null, hasta: rangoHasta || null };
    return PERIODO_TODO;
  }, [periodoTipo, mesSel, anioSel, trimestreSel, rangoDesde, rangoHasta]);

  /** "Año 2026", "Marzo 2026", "T2 2026", "Todo" — lo que se lee en la fila
   *  de control del teléfono. El periodo ya está calculado arriba; esto solo
   *  le pone nombre, sin tocar de dónde salen las fechas. */
  const periodoTexto = useMemo(() => {
    if (periodoTipo === "mes") {
      // "2026-03" → "marzo de 2026", en el idioma del aparato.
      const [a, m] = mesSel.split("-");
      return new Date(Number(a), Number(m) - 1, 1)
        .toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    if (periodoTipo === "trimestre") return `${t("informes.periodo.trimestre")} ${trimestreSel} · ${anioSel}`;
    if (periodoTipo === "anio") return `${t("informes.periodo.anio")} ${anioSel}`;
    if (periodoTipo === "rango") return `${rangoDesde || "—"} → ${rangoHasta || "—"}`;
    return t("informes.periodo.todo");
  }, [periodoTipo, mesSel, anioSel, trimestreSel, rangoDesde, rangoHasta, t]);

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

  /** Cuántos de los cuatro filtros "finos" están puestos. Solo alimenta el
   *  punto junto a "Más filtros": sin él, un filtro dentro de la hoja no se
   *  ve desde fuera, que es el problema que tenía la barra deslizable. */
  const nFiltrosFinos = [filtroEstado, filtroMinisterio, filtroCargo, filtroInstrumento]
    .filter((v) => v !== "todos").length;

  const hayFiltros = query || tarjeta !== "todos" || filtroEstado !== "todos" || filtroMinisterio !== "todos" ||
    filtroCargo !== "todos" || filtroInstrumento !== "todos" || soloRacha || soloIncompletos;

  /* Pie de ventana (solo Mac). Se reutilizan las claves que ya escribe el
     control de iPhone (`informes.conteoFiltrado` / `conteoTotal`): es
     exactamente el mismo recuento, y dos textos distintos para el mismo
     número acabarían diciendo cosas distintas. */
  useBarraEstado(hayFiltros && vista === "miembros"
    ? t("informes.conteoFiltrado", { visibles: filas.length, total: miembros.length })
    : t("informes.conteoTotal", { count: vista === "miembros" ? filas.length : miembros.length }));

  // Catálogos de los filtros, en un solo sitio: los consumen tanto los
  // `<option>` de Mac como los chips de iPhone. Aquí el centinela de "sin
  // filtrar" es "todos" (no ""), de ahí el `emptyValue` de los chips.
  const opcEstadoFiltro: IOSPickerOption[] = useMemo(() => [
    { value: "todos", label: t("informes.filtroTodosEstados") },
    ...["activo", "inactivo", "visitante", "enProceso", "trasladado", "retirado", "fallecido"]
      .map((e) => ({ value: e, label: t(`membresia.estado.${e}`) })),
  ], [t]);
  const opcMinisterioFiltro: IOSPickerOption[] = useMemo(() => [
    { value: "todos", label: t("informes.filtroMinisterio") },
    ...MINISTERIOS.map((m) => ({ value: m, label: t(`ficha.ministerio.${m}`) })),
  ], [t]);
  const opcCargoFiltro: IOSPickerOption[] = useMemo(() => [
    { value: "todos", label: t("informes.filtroCargo") },
    ...CARGOS.map((c) => ({ value: c, label: t(`ficha.cargo.${c}`) })),
  ], [t]);
  const opcInstrumentoFiltro: IOSPickerOption[] = useMemo(() => [
    { value: "todos", label: t("informes.filtroInstrumento") },
    ...INSTRUMENTOS.map((i) => ({ value: i, label: t(`ficha.instrumento.${i}`) })),
  ], [t]);
  const opcTrimestre: IOSPickerOption[] = useMemo(
    () => [1, 2, 3, 4].map((q) => ({ value: String(q), label: t("informes.trimestreN", { n: q }) })),
    [t]
  );

  function limpiarFiltros() {
    setQuery(""); setTarjeta("todos"); setFiltroEstado("todos"); setFiltroMinisterio("todos");
    setFiltroCargo("todos"); setFiltroInstrumento("todos"); setSoloRacha(false); setSoloIncompletos(false);
  }

  /* Los mismos valores y setters que ya usaban los cuatro `<select>` y las dos
     pastillas de la fila de filtros; solo cambia dónde se pintan. El "todos"
     es aquí el valor vacío, así que el contador del botón no lo cuenta. */
  const camposFiltro: CampoFiltro[] = [
    { tipo: "opciones", id: "estado", label: t("membresia.colEstado"), valor: filtroEstado, vacio: "todos",
      opciones: opcEstadoFiltro, onChange: setFiltroEstado },
    { tipo: "opciones", id: "ministerio", label: t("informes.colMinisterio"), valor: filtroMinisterio, vacio: "todos",
      opciones: opcMinisterioFiltro, onChange: setFiltroMinisterio },
    { tipo: "opciones", id: "cargo", label: t("ficha.cargosLabel"), valor: filtroCargo, vacio: "todos",
      opciones: opcCargoFiltro, onChange: setFiltroCargo },
    { tipo: "opciones", id: "instrumento", label: t("informes.colInstrumento"), valor: filtroInstrumento, vacio: "todos",
      opciones: opcInstrumentoFiltro, onChange: setFiltroInstrumento },
    { tipo: "interruptor", id: "racha", label: t("informes.filtroRacha"), valor: soloRacha, onChange: setSoloRacha },
    { tipo: "interruptor", id: "incompletos", label: t("informes.filtroIncompletos"), valor: soloIncompletos, onChange: setSoloIncompletos },
  ];

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
              <div style={{ width: `${Math.round((it.n / max) * 100)}%`, height: "100%", background: "var(--brand)", borderRadius: 4 }} />
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

  /* El cuerpo de la vista elegida. Extraído a constante para que el modo
     partido (iPad) y la página plana (Mac/iPhone) pinten LOS MISMOS nodos —
     el patrón de todas las pantallas partidas: extraer, no copiar. */
  const cuerpoVista = (
    <>
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
                        <div style={{ width: "70%", maxWidth: 40, height: `${Math.round((x.n / maxNuevos) * 90)}%`, minHeight: 3, background: "var(--brand)", borderRadius: "4px 4px 0 0" }} />
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
              ) : enIPhone ? (
                <div className="ios-listcard">
                  {movimientos.map((mv) => (
                    <div className="ios-txrow" key={mv.folio}>
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title">{mv.persona}</div>
                        <div className="tx-secundaria-movil">
                          {mv.tipo === "recibido" ? t("informes.movRecibido") : t("informes.movEnviado")} · {mv.iglesia} · {fmtFechaCorta(mv.fecha)}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing">
                        <span className="ios-badge">{mv.estado}</span>
                      </div>
                    </div>
                  ))}
                </div>
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
          ) : enIPhone ? (
            <div className="ios-listcard">
              {gruposSeguimiento.map(({ miembro: m, alertas }) => (
                <div className="ios-txrow ios-txrow--clickable" key={m.id} onClick={() => setSeguimiento(m)}>
                  <div className="ios-txrow-main">
                    <div className="ios-txrow-title">{m.nombre}</div>
                    <div className="tx-secundaria-movil">{alertas.map((al) => etiquetaAlerta(al)).join(" · ")}</div>
                  </div>
                  {!m.seguimiento_revisado_en && (
                    <div className="ios-txrow-trailing">
                      <span className="ios-badge ios-badge--pending">{t("seguimiento.sinRevisar")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
            {enIPhone ? (
              <div className="ios-panel">
                <div className="ios-panel-head"><h2>{t("informes.seccionResumen")}</h2></div>
                <div className="ios-panel-grid">
                  {tarjetas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`ios-stat${tarjeta === c.id ? " es-filtro" : ""}`}
                      title={c.id === "frecuentes" ? t("informes.cardFrecuentesRegla", { n: umbrales.rachaServicios }) : undefined}
                      aria-pressed={tarjeta === c.id}
                      onClick={() => setTarjeta((cur) => (cur === c.id ? "todos" : c.id))}
                    >
                      <div className="ios-stat-top">
                        <span className="ios-stat-label">{c.label}</span>
                        {/* La ✕ no es un botón aparte: la tarjeta entera ya
                            alterna, y anidar un botón dentro de otro no es
                            HTML válido. Es la señal de que un segundo toque
                            la quita. */}
                        {tarjeta === c.id && <span className="ios-stat-quitar" aria-hidden="true">✕</span>}
                      </div>
                      <span className="ios-stat-num"><CountUp value={c.valor} format={String} /></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
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
                    <div className="stat-value md"><CountUp value={c.valor} format={String} /></div>
                  </button>
                ))}
              </div>
              </div>
            )}

            {/* Filtros combinables */}
            {enIPhone ? (
              <>
                {/* Lo que está filtrando, dicho en palabras. Antes había que
                    deducirlo de un chip teñido que podía estar fuera de la
                    parte visible de una barra que se deslizaba. */}
                {tarjeta !== "todos" && (
                  <div className="inf-filtrando">
                    <span>{t("informes.mostrando", { que: (tarjetas.find((c) => c.id === tarjeta)?.label ?? "").toLowerCase() })}</span>
                    <button type="button" onClick={() => setTarjeta("todos")}>{t("informes.quitar")}</button>
                  </div>
                )}
                <div className="search-input-wrap" style={{ marginTop: 6, marginBottom: 10 }}>
                  <IconSearch size={15} strokeWidth={2} />
                  <input className="form-input" placeholder={textoCorto(t("common.buscarCorto"), t("informes.buscar"))} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="inf-resultados">
                  <span>{t("informes.conteoTotal", { count: filas.length })}</span>
                  <button type="button" onClick={() => setHojaFiltros(true)}>
                    {t("informes.masFiltros")}
                    {nFiltrosFinos > 0 && <span className="inf-punto" aria-hidden="true" />}
                  </button>
                </div>
                {hojaFiltros && (
                  <Portal>
                    <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setHojaFiltros(false); }}>
                      <div className="ios-sheet" role="dialog" aria-label={t("informes.masFiltros")}>
                        <div className="ios-nav">
                          <span className="ios-back" />
                          <h1 className="ios-nav-title">{t("informes.masFiltros")}</h1>
                          <span className="ios-nav-status">
                            <button type="button" className="ios-nav-action" onClick={() => setHojaFiltros(false)}>{t("common.listo")}</button>
                          </span>
                        </div>
                        <div className="ios-sheet-body">
                          <Section footer={t("informes.masFiltrosPie")}>
                            <IOSPickerField label={t("membresia.colEstado")} options={opcEstadoFiltro} value={filtroEstado} onSelect={setFiltroEstado} />
                            <IOSPickerField label={t("informes.colMinisterio")} options={opcMinisterioFiltro} value={filtroMinisterio} onSelect={setFiltroMinisterio} />
                            <IOSPickerField label={t("ficha.cargosLabel")} options={opcCargoFiltro} value={filtroCargo} onSelect={setFiltroCargo} />
                            <IOSPickerField label={t("informes.colInstrumento")} options={opcInstrumentoFiltro} value={filtroInstrumento} onSelect={setFiltroInstrumento} />
                          </Section>
                          {/* `soloIncompletos` se fue del teléfono: la tarjeta
                              "Expedientes incompletos" tiene la MISMA condición
                              (`camposFaltantes(m).length > 0`), comprobado línea
                              a línea. El estado y su setter siguen ahí porque
                              Mac los usa.

                              `soloRacha` NO se fue, y la diferencia es real: la
                              tarjeta "Con ausencias frecuentes" exige además que
                              el miembro esté ACTIVO y el interruptor no. O sea
                              que un inactivo con racha sale aquí y no en la
                              tarjeta — que es una señal útil: alguien marcado
                              como inactivo que en realidad sigue viniendo.
                              Queda hasta que se decida si esa diferencia
                              importa. */}
                          <Section footer={t("informes.rachaPie", { n: umbrales.rachaServicios })}>
                            <SwitchField
                              label={t("informes.filtroRacha")}
                              checked={soloRacha}
                              onChange={setSoloRacha}
                            />
                          </Section>
                          {hayFiltros && (
                            <Section>
                              <ActionField label={t("informes.limpiar")} destructive onPress={() => { limpiarFiltros(); setHojaFiltros(false); }} />
                            </Section>
                          )}
                        </div>
                      </div>
                    </div>
                  </Portal>
                )}
              </>
            ) : enMac ? null : (
              /* `gap` con dos valores: 12 entre renglones y 8 entre piezas del
                 mismo renglón. Con un solo 8, los chips que se van a la
                 segunda línea quedaban pegados a los selectores de arriba. */
              <div className="tx-head" style={{ flexWrap: "wrap", gap: "12px 8px", marginTop: 10 }}>
                <div className="search-input-wrap" style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
                  <IconSearch size={15} strokeWidth={2} />
                  <input className="form-input" placeholder={textoCorto(t("common.buscarCorto"), t("informes.buscar"))} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <select className="form-input" style={{ width: "auto" }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label={t("membresia.colEstado")}>
                  {opcEstadoFiltro.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroMinisterio} onChange={(e) => setFiltroMinisterio(e.target.value)} aria-label={t("informes.colMinisterio")}>
                  {opcMinisterioFiltro.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroCargo} onChange={(e) => setFiltroCargo(e.target.value)} aria-label={t("ficha.cargosLabel")}>
                  {opcCargoFiltro.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select className="form-input" style={{ width: "auto", maxWidth: 160 }} value={filtroInstrumento} onChange={(e) => setFiltroInstrumento(e.target.value)} aria-label={t("informes.colInstrumento")}>
                  {opcInstrumentoFiltro.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className={`chip${soloRacha ? " active" : ""}`} onClick={() => setSoloRacha((v) => !v)}>{t("informes.filtroRacha")}</button>
                <button className={`chip${soloIncompletos ? " active" : ""}`} onClick={() => setSoloIncompletos((v) => !v)}>{t("informes.filtroIncompletos")}</button>
                {hayFiltros && <button className="chip" onClick={limpiarFiltros}>{t("informes.limpiar")}</button>}
              </div>
            )}

            {/* Tabla principal */}
            {miembros.length === 0 ? (
              <EmptyState titulo={t("informes.vacioTitulo")} sub={t("informes.vacioSub")} icon={<IconMiembros size={20} strokeWidth={1.8} />} />
            ) : filas.length === 0 ? (
              <EmptyState titulo={t("informes.sinResultadosTitulo")} sub={t("informes.sinResultadosSub")} icon={<IconSearch size={20} strokeWidth={1.8} />} />
            ) : enIPhone ? (
              <div className="ios-listcard">
                {pagina.map(({ miembro: m, asistencia: a }) => {
                  const e = estadoEfectivo(m);
                  const incompleto = camposFaltantes(m).length > 0;
                  const servicioTxt = [
                    chipsDe(t, m.ministerios, "ficha.ministerio"),
                    chipsDe(t, m.cargos, "ficha.cargo"),
                    chipsDe(t, m.instrumentos, "ficha.instrumento"),
                  ].filter(Boolean).join(" · ");
                  return (
                    /* El lápiz se va del teléfono: aquí editar se hace
                       deslizando la fila, como en el resto de las listas, y
                       tenerlo además como icono era la misma acción dos
                       veces quitándole sitio al nombre. En Mac se queda —ahí
                       no hay gesto y es la única forma de llegar. */
                    <div className="ios-txrow ios-txrow--clickable" data-fila key={m.id} onClick={() => setFicha(m)}>
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title" title={m.nombre}>
                          {incompleto && <span className="informes-aviso" title={t("informes.incompletoTitle")}><IconWarn size={11} strokeWidth={2.2} /></span>}
                          <span className="truncate">{m.nombre}</span>
                        </div>
                        {/* Con el filtro "Incompletos" puesto, la segunda
                            línea dice QUÉ le falta a cada uno. Es a lo que se
                            entra desde esa tarjeta: el ministerio y el
                            porcentaje no responden a esa pregunta. */}
                        <div className="tx-secundaria-movil">
                          {tarjeta === "incompletos"
                            ? camposFaltantes(m).map((c) => t(`informes.campo.${c}`, { defaultValue: c })).join(" · ")
                            : <>{servicioTxt || "—"}{a && a.pct !== null ? ` · ${a.pct}%` : ""}</>}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing">
                        <span className={`ios-badge ${badgeClaseEstadoMiembro(e)}`}>{t(`membresia.estado.${e}`)}</span>
                      </div>
                      {/* Sin `onDelete`: esta pantalla es de consulta y no
                          borra miembros en ninguna plataforma. */}
                      <RowMenu onEdit={() => onEdit(m)} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="data-table roomy tabla-informe-miembros">
                <div className="thead" style={{ gridTemplateColumns: enMac ? COLS_MAC : partido ? COLS_IPAD_TABLA : COLS, position: "sticky", top: 0, zIndex: 1, background: "var(--surface)" }}>
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("nombre")}>{t("informes.colMiembro")}{flecha("nombre")}</button>
                  {enMac && <div className="th">{t("membresia.colEstado")}</div>}
                  {enMac && <div className="th">{t("informes.colCongregacion")}</div>}
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("ingreso")}>{enMac ? t("informes.colDesde") : t("informes.colFechas")}{flecha("ingreso")}</button>
                  <div className="th">{t("informes.colServicio")}</div>
                  <button className="th" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit", textAlign: "left" }} onClick={() => ordenarPor("asistencia")}>{t("informes.colAsistencia")}{flecha("asistencia")}</button>
                  {enMac && <div className="th">{t("informes.colUltima")}</div>}
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
                    <div className="tr" key={m.id} style={{ gridTemplateColumns: enMac ? COLS_MAC : partido ? COLS_IPAD_TABLA : COLS, cursor: "pointer" }} onClick={() => setFicha(m)}>
                      <div className="td" style={{ minWidth: 0 }}>
                        <div className="p-name truncate" title={m.nombre}>
                          {incompleto && <span className="informes-aviso" title={t("informes.incompletoTitle")}><IconWarn size={11} strokeWidth={2.2} /></span>}
                          {m.nombre}
                        </div>
                        {!enMac && <span className={`tag ${BADGE_ESTADO[e] ?? "otros"}`}>{t(`membresia.estado.${e}`)}</span>}
                      </div>
                      {enMac && (
                        <div className="td" style={{ minWidth: 0 }}>
                          <span className={`tag ${BADGE_ESTADO[e] ?? "otros"}`}>{t(`membresia.estado.${e}`)}</span>
                        </div>
                      )}
                      {enMac && (
                        <div className="td num-celda">{m.fecha_congregacion ? fmtFechaCorta(m.fecha_congregacion) : "—"}</div>
                      )}
                      <div className="td num-celda" style={enMac ? undefined : { fontSize: 12, color: "var(--text-2)" }}>
                        {enMac ? (
                          m.fecha_ingreso ? fmtFechaCorta(m.fecha_ingreso) : "—"
                        ) : (
                          <>
                            <div>{m.fecha_congregacion ? fmtFechaCorta(m.fecha_congregacion) : "—"}</div>
                            <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                              {m.fecha_ingreso ? t("informes.miembroDesde", { fecha: fmtFechaCorta(m.fecha_ingreso) }) : t("informes.sinFechaMembresia")}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="td" style={{ fontSize: enMac ? undefined : 12, color: enMac ? undefined : "var(--text-2)", minWidth: 0 }}>
                        <div className="truncate" title={servicioTxt}>{servicioTxt || "—"}</div>
                      </div>
                      <div className="td num-celda" style={enMac ? undefined : { fontSize: 12.5 }}>
                        {a && a.pct !== null ? (
                          enMac ? `${a.pct}%` : (
                            <>
                              <div style={{ fontWeight: 700 }}>{a.pct}%</div>
                              <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>
                                {a.ultimaAsistencia ? fmtFechaCorta(a.ultimaAsistencia) : t("informes.nuncaAsistio")}
                              </div>
                            </>
                          )
                        ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </div>
                      {enMac && (
                        <div className="td num-celda">
                          {a?.ultimaAsistencia ? fmtFechaCorta(a.ultimaAsistencia) : "—"}
                        </div>
                      )}
                      <div className="td td-acciones" onClick={(ev) => ev.stopPropagation()}>
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
            {/* Hay cultos en el periodo pero ninguno registró la lista de
                asistencia por miembro. Sin este aviso la pantalla parece rota:
                la bitácora informa asistentes y aquí sale "—" para todos. */}
            {asistenciaRaw.length === 0 && (
              <div className="form-warning" style={{ marginBottom: 14 }}>
                {t("informes.avisoSinListaAsistencia", { n: servicios.length })}
              </div>
            )}

            {/* Indicadores generales + destacados: panel de resumen. */}
            <div className="dash-canvas">
            {enIPhone ? (
              <div className="ios-panel">
                <div className="ios-panel-head"><h2>{t("informes.seccionResumen")}</h2></div>
                <div className="ios-panel-grid">
                  <div className="ios-stat" style={{ cursor: "default" }}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("informes.totalServicios")}</span></div>
                    <span className="ios-stat-num"><CountUp value={asistGeneral.totalServicios} format={String} /></span>
                  </div>
                  <div className="ios-stat" style={{ cursor: "default" }}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("informes.asistenciaTotal")}</span></div>
                    <span className="ios-stat-num"><CountUp value={asistGeneral.asistenciaTotal} format={String} /></span>
                  </div>
                  <div className="ios-stat" style={{ cursor: "default" }}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("informes.promedioServicio")}</span></div>
                    <span className="ios-stat-num"><CountUp value={asistGeneral.promedioPorServicio} format={String} /></span>
                  </div>
                  <div className="ios-stat" style={{ cursor: "default" }}>
                    <div className="ios-stat-top"><span className="ios-stat-label">{t("informes.pctGeneral")}</span></div>
                    <span className="ios-stat-num">{asistGeneral.pctGeneral !== null ? <CountUp value={asistGeneral.pctGeneral} format={(n) => `${n}%`} /> : "—"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="summary-4 enter" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("informes.totalServicios")}</span></div>
                  <div className="stat-value md"><CountUp value={asistGeneral.totalServicios} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-2)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("informes.asistenciaTotal")}</span></div>
                  <div className="stat-value md"><CountUp value={asistGeneral.asistenciaTotal} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("informes.promedioServicio")}</span></div>
                  <div className="stat-value md"><CountUp value={asistGeneral.promedioPorServicio} format={String} /></div>
                </div>
                <div className="stat-card accent" style={{ "--accent-color": "var(--accent-5)" } as CSSProperties}>
                  <div className="stat-head"><span className="stat-label">{t("informes.pctGeneral")}</span></div>
                  <div className="stat-value md">{asistGeneral.pctGeneral !== null ? <CountUp value={asistGeneral.pctGeneral} format={(n) => `${n}%`} /> : "—"}</div>
                </div>
              </div>
            )}

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
            {enIPhone ? (
              <div className="ios-listcard">
                {asistenciaMiembros.map(({ miembro: m, datos: a }) => (
                  <div className="ios-txrow ios-txrow--clickable" key={m.id} onClick={() => setFicha(m)}>
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title">{m.nombre}</div>
                      <div className="tx-secundaria-movil">
                        {t("informes.deN", { asis: a!.asistidos, total: a!.enRoster })}
                        {" · "}
                        {a!.ultimaAsistencia ? fmtFechaCorta(a!.ultimaAsistencia) : t("informes.nuncaAsistio")}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      {a!.racha >= umbrales.rachaServicios && (
                        <span className="ios-badge ios-badge--pending">{t("informes.ausenciasN", { n: a!.racha })}</span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{a!.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
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
            )}
          </>
        )}
    </>
  );

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("informes.titulo")}</div>
            {!enMac && <div className="page-sub">{t("informes.sub")}</div>}
          </div>
        )}
        <div className="header-actions solo-escritorio inf-fuera-partido">
          {/* De las TRES navegaciones apiladas que tenía la pantalla —periodo,
              pestañas y fila de filtros— el periodo sube a la toolbar como
              segmentado y los filtros se pliegan en su botón. Abajo quedan las
              pestañas, que es la única navegación que de verdad cambia lo que
              se está mirando. */}
          {enMac && (
            <>
              <MacSegmentado
                value={periodoTipo}
                onChange={setPeriodoTipo}
                aria={t("informes.periodo.mes")}
                opciones={(["mes", "trimestre", "anio", "rango", "todo"] as PeriodoTipo[]).map((p) => ({
                  id: p, label: t(`informes.periodo.${p}`),
                }))}
              />
              {vista === "miembros" && (
                <>
                  <MacBuscador value={query} onChange={setQuery} placeholder={t("informes.buscar")} ancho={160} />
                  <MacFiltros campos={camposFiltro} onRestablecer={limpiarFiltros} />
                </>
              )}
            </>
          )}
          <button className="btn secondary" onClick={imprimirGeneral} disabled={loading || miembros.length === 0}>
            <IconPrinter size={13} /> {t("informes.imprimirGeneral")}
          </button>
          <button className="btn secondary" onClick={exportar} disabled={filas.length === 0}>
            {t("informes.exportar")}
          </button>
        </div>
        <div className="header-actions solo-movil inf-fuera-partido">
          <button
            type="button"
            className="btn-compartir-cabecera"
            onClick={exportar}
            disabled={filas.length === 0}
            aria-label={t("informes.exportar")}
          >
            <ShareIcon size={22} />
          </button>
          <HeaderMenu
            icon={<IconMore size={20} />}
            ariaLabel={t("common.masAcciones")}
            sections={[
              { items: [
                { label: t("informes.imprimirGeneral"), icon: <IconPrinter size={13} />, disabled: loading || miembros.length === 0, onClick: imprimirGeneral },
              ] },
            ]}
          />
        </div>
      </div>

      {partido ? (
        /* ---- Maestro-detalle (handoff 2) ----
           El índice de 330 lleva DOS grupos: el PERIODO (los cinco cortes,
           con sus campos debajo) y los CUATRO informes con su subtítulo —
           navegación a la izquierda, documento a la derecha, con la barrita
           de Imprimir/Exportar pegada al informe que se está viendo. */
        <div className={`md-split md-informes${panelAbierto ? " md-abierto" : ""}`}>
          <div className="md-lista md-indice inf-indice">
            <div className="inf-grupo periodo">
              <div className="md-indice-grupo">{t("informes.grupoPeriodo")}</div>
              <div className="inf-chips">
                {(["mes", "trimestre", "anio", "rango", "todo"] as PeriodoTipo[]).map((p) => (
                  <button key={p} className={`chip${periodoTipo === p ? " active" : ""}`} onClick={() => setPeriodoTipo(p)}>
                    {t(`informes.periodo.${p}`)}
                  </button>
                ))}
              </div>
              <div className="inf-per-campos">
                {periodoTipo === "mes" && (
                  <input type="month" className="form-input" value={mesSel} onChange={(e) => setMesSel(e.target.value)} aria-label={t("informes.periodo.mes")} />
                )}
                {(periodoTipo === "trimestre" || periodoTipo === "anio") && (
                  <input type="number" className="form-input" value={anioSel} min={2000} max={2100} onChange={(e) => setAnioSel(e.target.value)} aria-label={t("informes.periodo.anio")} />
                )}
                {periodoTipo === "trimestre" && (
                  <select className="form-input" value={trimestreSel} onChange={(e) => setTrimestreSel(Number(e.target.value) as 1 | 2 | 3 | 4)} aria-label={t("informes.periodo.trimestre")}>
                    {opcTrimestre.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {periodoTipo === "rango" && (
                  <>
                    <input type="date" className="form-input" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} aria-label={t("cartas.fechaDesde")} />
                    <input type="date" className="form-input" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} aria-label={t("cartas.fechaHasta")} />
                  </>
                )}
              </div>
            </div>

            <div className="inf-grupo">
              <div className="md-indice-grupo">{t("informes.grupoInformes")}</div>
              {(["general", "miembros", "asistencia", "seguimiento"] as Vista[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`md-indice-item inf-item${vista === v ? " sel" : ""}`}
                  onClick={() => { setVista(v); setPanelAbierto(true); }}
                >
                  <span className="inf-item-textos">
                    <span className="inf-item-titulo">{t(`informes.vista.${v}`)}</span>
                    <span className="inf-item-sub">
                      {v === "general" ? t("informes.idxGeneral")
                        : v === "miembros" ? t("informes.idxMiembros", { count: miembros.length })
                        : v === "asistencia" ? (asistGeneral.totalServicios > 0
                            ? t("informes.idxAsistencia", { n: asistGeneral.totalServicios, pct: asistGeneral.pctGeneral ?? 0 })
                            : t("informes.idxAsistenciaVacia"))
                        : t("informes.idxSeguimiento")}
                    </span>
                  </span>
                  {v === "seguimiento" && gruposSeguimiento.length > 0 && (
                    <span className="mb-globo">{gruposSeguimiento.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="md-detalle inf-detalle">
            <div className="inf-barrita">
              <button type="button" className="inf-volver" onClick={() => setPanelAbierto(false)}>
                <IconChevronLeft size={17} strokeWidth={2.4} /> {t("informes.titulo")}
              </button>
              <span className="inf-barrita-textos">
                <span className="inf-barrita-titulo">{t(`informes.vista.${vista}`)}</span>
                <span className="inf-barrita-sub">{periodoTexto}</span>
              </span>
              <button className="btn secondary" onClick={imprimirGeneral} disabled={loading || miembros.length === 0}>
                <IconPrinter size={13} /> {t("informes.imprimirGeneral")}
              </button>
              <button className="btn secondary" onClick={exportar} disabled={filas.length === 0}>
                {t("informes.exportar")}
              </button>
            </div>
            <div className="inf-cuerpo">{cuerpoVista}</div>
          </div>
        </div>
      ) : (
      <div className="content content-lienzo">
        {/* En el teléfono, UNA fila de control en vez de las dos barras de
            arriba (periodo y vista). Eran unos 260 px de mandos antes del
            primer dato, y la de filtros —que se deslizaba— escondía lo puesto
            fuera del borde: un filtro en el cuarto chip dejaba la lista
            incompleta sin que nada lo dijera. */}
        {enIPhone && (
          <>
            <button type="button" className="inf-control" onClick={() => setHojaControl(true)}>
              <span className="inf-control-texto">
                <span className="inf-control-titulo">{t(`informes.vista.${vista}`)} · {periodoTexto}</span>
                <span className="inf-control-sub">
                  {hayFiltros && vista === "miembros"
                    ? t("informes.conteoFiltrado", { visibles: filas.length, total: miembros.length })
                    : t("informes.conteoTotal", { count: vista === "miembros" ? filas.length : miembros.length })}
                </span>
              </span>
              <IosChevron />
            </button>

            {hojaControl && (
              <IOSHojaControl
                vista={vista}
                onVista={(v) => setVista(v)}
                periodoTipo={periodoTipo}
                onPeriodoTipo={setPeriodoTipo}
                mesSel={mesSel} onMes={setMesSel}
                anioSel={anioSel} onAnio={setAnioSel}
                trimestreSel={trimestreSel} onTrimestre={setTrimestreSel}
                rangoDesde={rangoDesde} onDesde={setRangoDesde}
                rangoHasta={rangoHasta} onHasta={setRangoHasta}
                pendientesSeguimiento={gruposSeguimiento.length}
                onCerrar={() => setHojaControl(false)}
              />
            )}
          </>
        )}

        {/* Selector de periodo — fuente de verdad */}
        {!enIPhone && (
        <div className="tx-head" style={{ flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          {!enMac && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["mes", "trimestre", "anio", "rango", "todo"] as PeriodoTipo[]).map((p) => (
              <button key={p} className={`chip${periodoTipo === p ? " active" : ""}`} onClick={() => setPeriodoTipo(p)}>
                {t(`informes.periodo.${p}`)}
              </button>
            ))}
          </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {periodoTipo === "mes" && (
              <input type="month" className="form-input" style={{ width: "auto" }} value={mesSel} onChange={(e) => setMesSel(e.target.value)} aria-label={t("informes.periodo.mes")} />
            )}
            {(periodoTipo === "trimestre" || periodoTipo === "anio") && (
              <input type="number" className="form-input" style={{ width: 100 }} value={anioSel} min={2000} max={2100} onChange={(e) => setAnioSel(e.target.value)} aria-label={t("informes.periodo.anio")} />
            )}
            {periodoTipo === "trimestre" && (enIPhone ? (
              /* Este no es un filtro que se ponga y se quite: el trimestre
                 SIEMPRE tiene valor, así que el chip va siempre teñido y
                 mostrando cuál es — que es justo lo que interesa leer. */
              <IOSPickerChip
                label={t("informes.periodo.trimestre")}
                options={opcTrimestre}
                value={String(trimestreSel)}
                onSelect={(v) => setTrimestreSel(Number(v) as 1 | 2 | 3 | 4)}
              />
            ) : (
              <select className="form-input" style={{ width: "auto" }} value={trimestreSel} onChange={(e) => setTrimestreSel(Number(e.target.value) as 1 | 2 | 3 | 4)} aria-label={t("informes.periodo.trimestre")}>
                {opcTrimestre.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            {periodoTipo === "rango" && (
              <>
                <input type="date" className="form-input" style={{ width: "auto" }} value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} aria-label={t("cartas.fechaDesde")} title={t("cartas.fechaDesde")} />
                <input type="date" className="form-input" style={{ width: "auto" }} value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} aria-label={t("cartas.fechaHasta")} title={t("cartas.fechaHasta")} />
              </>
            )}
          </div>
        </div>
        )}

        {/* Pestañas: registro de miembros, asistencia y seguimiento */}
        {!enIPhone && (
        <div className="chip-toggle" style={{ flexWrap: "wrap", margin: "14px 0 4px" }}>
          {(["miembros", "asistencia", "seguimiento", "general"] as Vista[]).map((v) => (
            <button key={v} className={`chip${vista === v ? " active" : ""}`} onClick={() => setVista(v)}>
              {t(`informes.vista.${v}`)}
              {v === "seguimiento" && gruposSeguimiento.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{gruposSeguimiento.length}</span>}
            </button>
          ))}
        </div>
        )}

        {cuerpoVista}
      </div>
      )}

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
