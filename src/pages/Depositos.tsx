import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  candidatosSegundaFirma, cerrarCorte, countDepositos, countPendingTx, currentMonth, currentYear,
  deleteCorte, depositosSinCorte, efectivoDisponibleHasta, firmarCorte, fmtFechaCorta, fmtMoney,
  hoyISO, listCortes, insertCorte, listDepositos, listTx, mesLegible, monthDepositos,
  movimientosDeCorte, quitarFirmaCorte, txEnCorte,
  type Church, type Corte, type Deposito, type Tx, type Usuario,
} from "../db";
import SegundaFirmaIOS from "../components/SegundaFirmaIOS";
import { EmptyState } from "../components/TxList";
import DepositoTable from "../components/DepositoTable";
import DepositoModal from "../components/DepositoModal";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import SeccionIOS from "../components/ios/SeccionIOS";
import { agruparPorMes } from "../components/ios/agrupado";
import { useScrollInfinito } from "../hooks/useScrollInfinito";
import { IconBank, IconChevronLeft, IconClock, IconPlus } from "../icons";
import CountUp from "../components/CountUp";
import { CERO, sumar, type Centavos } from "../dinero";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";
import { esIPad, esIPhone, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleDeposito from "../components/DetalleDeposito";
import PendientesDeposito, { type DiaEnCaja } from "../components/PendientesDeposito";
import NuevoCorteIOS from "../components/NuevoCorteIOS";
import ComprobantePreview from "../components/ComprobantePreview";
import ConfirmDialog from "../components/ConfirmDialog";
import { deleteDeposito, undeleteDeposito } from "../db";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconSearch } from "../icons";

const PAGE_SIZE = 40;

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Depositos({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [totalMes, setTotalMes] = useState<Centavos>(CERO);
  const [conteoMes, setConteoMes] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  /* ---- Maestro-detalle del iPad ----
     Mismos dos umbrales que Ingresos y Aportantes, y por la misma razón: a
     partir de 700px la pantalla se parte, y a partir de 1000 las dos columnas
     conviven en vez de empujarse. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  /* El detalle es un ID que se re-busca en cada recarga, no una copia
     congelada: así una edición refresca el panel en sitio y un borrado lo
     cierra solo. Es el patrón de `Movimientos.tsx`. */
  const [selId, setSelId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  /* El segmentado Pendientes · Depositados del handoff. "Depositados" es lo
     que la app tiene: un depósito registrado ES un depósito hecho.
     "Pendientes" —preparar el corte antes de ir al banco— es el paso que
     falta; la pestaña se construye y explica qué le falta, con la cifra REAL
     de efectivo por depositar, que sí se sabe calcular. */
  const [vista, setVista] = useState<"pendientes" | "depositados">("depositados");
  const [porDepositar, setPorDepositar] = useState<Centavos | null>(null);
  useEffect(() => {
    /* Apertura + aprobados − ya depositado: la misma cuenta que usa el Inicio
       para su "Saldo en caja". Es el número que la pestaña Pendientes SÍ
       puede dar aunque no sepa repartirlo en cortes. */
    efectivoDisponibleHasta(church, hoyISO()).then(setPorDepositar).catch(console.error);
  }, [church, refreshKey]);

  /* ---- Pendientes: el dinero en caja, agrupado por día (handoff 3) ----
     Los movimientos son reales: ingresos aprobados cobrados en efectivo o en
     cheque. Lo que NO existe es saber cuál de ellos ya fue al banco —ni
     `transactions` ni `depositos_bancarios` guardan ese vínculo—, así que la
     lista no puede esconder lo ya depositado y lo dice en su propio aviso.
     Ver `PendientesDeposito.tsx`. */
  const navigate = useNavigate();
  const [enCaja, setEnCaja] = useState<Tx[]>([]);
  const [porRevisar, setPorRevisar] = useState(0);
  /** Los cortes ya creados y los movimientos que están dentro de alguno. */
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [enCorte, setEnCorte] = useState<Set<number>>(new Set());
  const [movsCorte, setMovsCorte] = useState<Tx[]>([]);
  const [depSinCorte, setDepSinCorte] = useState(0);
  /** Qué hay abierto en Pendientes: un corte ya entregado, o un día de caja. */
  const [selPend, setSelPend] = useState<{ tipo: "corte"; id: number } | { tipo: "dia"; fecha: string } | null>(null);
  /** Ids marcados de un día de caja. Empieza con TODO marcado, que es el caso
   *  normal: se lleva al banco lo que hay, y se desmarca la excepción. */
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [hojaCorte, setHojaCorte] = useState(false);
  /* ---- La segunda firma del corte (migración 47) ----
     El corte que se está firmando y quiénes pueden hacerlo. Los candidatos se
     piden al abrir la hoja y no antes: son una consulta al directorio que la
     pantalla no necesita hasta ese momento. */
  const [firmando, setFirmando] = useState<Corte | null>(null);
  const [candidatos, setCandidatos] = useState<Usuario[]>([]);

  async function abrirSegundaFirma(corte: Corte) {
    try {
      setCandidatos(await candidatosSegundaFirma(church.id, corte.registrado_por));
    } catch (e) {
      console.error(e);
      setCandidatos([]);
    }
    setFirmando(corte);
  }

  async function guardarFirma(
    corte: Corte,
    v: { nombre: string; rol: string | null; modo: "conteo" | "revision"; conteo: Centavos | null },
  ) {
    try {
      await firmarCorte(corte.id, church.id, v);
      playSound("guardado");
      showToast(t("dobleFirma.toastFirmado", { nombre: v.nombre }));
      onChanged();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setFirmando(null);
  }

  /** Contó y no cuadró: la cifra se guarda y la firma NO se da. */
  async function guardarDescuadre(corte: Corte, conteo: Centavos) {
    try {
      await firmarCorte(corte.id, church.id, { nombre: null, rol: null, modo: "conteo", conteo });
      showToast(t("dobleFirma.toastDescuadre"));
      onChanged();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setFirmando(null);
  }

  async function quitarFirma(corte: Corte) {
    try {
      await quitarFirmaCorte(corte.id, church.id);
      onChanged();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }
  const [prefill, setPrefill] = useState<{ monto: Centavos; cuenta: string; fecha: string; periodo: string } | null>(null);
  /**
   * Qué corte hay que cerrar cuando se guarde el depósito que se está
   * llenando. Dos formas: uno que YA existe (se entregó y ahora llega al
   * banco), o uno que hay que crear en ese momento (nadie lo llevó, se fue
   * directo al banco).
   *
   * **El corte nuevo se crea DENTRO de `alGuardar`, no antes.** Crearlo al
   * abrir el formulario dejaba un corte huérfano cada vez que alguien
   * cancelaba: el dinero salía de la caja sin que se hubiera depositado nada.
   * Lo cazó el arnés al reutilizar la misma pantalla para dos comprobaciones.
   */
  const [corteACerrar, setCorteACerrar] = useState<
    { tipo: "existente"; id: number } | { tipo: "nuevo"; fecha: string; nombre: string; ids: number[] } | null
  >(null);
  const [recargaCortes, setRecargaCortes] = useState(0);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      listTx(church.id, { tipo: "ingreso", limit: 400 }),
      countPendingTx(church.id),
      listCortes(church.id),
      txEnCorte(church.id),
      depositosSinCorte(church.id),
    ])
      .then(([txs, n, cs, dentro, sinCorte]) => {
        if (cancelado) return;
        setEnCaja(txs.filter((x) => x.estado === "aprobado"
          && (x.metodo_pago === "efectivo" || x.metodo_pago === "cheque")));
        setPorRevisar(n);
        setCortes(cs);
        setEnCorte(dentro);
        setDepSinCorte(sinCorte);
      })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id, refreshKey, recargaCortes]);

  const abiertos = useMemo(() => cortes.filter((c) => c.estado === "abierto"), [cortes]);

  /** Los días con dinero que TODAVÍA está en la caja: lo que no entró en
   *  ningún corte. Un día con todo entregado desaparece de aquí solo. */
  const dias = useMemo<DiaEnCaja[]>(() => {
    const mapa = new Map<string, Tx[]>();
    for (const m of enCaja) {
      if (enCorte.has(m.id)) continue;
      const dia = m.fecha.slice(0, 10);
      const g = mapa.get(dia);
      if (g) g.push(m); else mapa.set(dia, [m]);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([fecha, movs]) => ({
        fecha,
        titulo: t("depositos.corteDel", { fecha: fmtFechaCorta(fecha) }),
        movs,
      }));
  }, [enCaja, enCorte, t]);

  const corteAbierto = selPend?.tipo === "corte" ? abiertos.find((c) => c.id === selPend.id) ?? null : null;
  const dia = selPend?.tipo === "dia" ? dias.find((d) => d.fecha === selPend.fecha) ?? null : null;

  /* Los movimientos de un corte ya entregado se piden a la base: no salen de
     `enCaja`, porque ese dinero ya NO está en la caja. */
  useEffect(() => {
    if (!corteAbierto) { setMovsCorte([]); return; }
    let cancelado = false;
    movimientosDeCorte(corteAbierto.id, church.id)
      .then((ms) => { if (!cancelado) setMovsCorte(ms); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [corteAbierto?.id, church.id, recargaCortes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Al abrir un día se marca todo lo suyo. En un efecto y no al pulsar la
     fila, porque el día también puede llegar elegido de vuelta de una
     recarga. */
  useEffect(() => {
    if (!dia) return;
    setMarcados(new Set(dia.movs.map((m) => m.id)));
  }, [dia?.fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarMov(id: number) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  /** El responsable del corte más reciente: se propone en el siguiente. */
  const responsablePrevio = cortes.find((c) => c.responsable)?.responsable ?? "";

  /** La cuenta del último depósito: es la que se va a proponer. */
  const cuentaSugerida = useMemo(() => {
    const ult = depositos.reduce<Deposito | null>(
      (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor), null);
    return ult?.cuenta_banco ?? "";
  }, [depositos]);

  const totalMarcado = useMemo(
    () => sumar(...(dia?.movs ?? []).filter((m) => marcados.has(m.id)).map((m) => m.monto)),
    [dia, marcados],
  );

  /* Entrar en Pendientes sin nada elegido abre el corte más reciente: es el
     que se viene a revisar, y un panel vacío en una pantalla de dos columnas
     es medio iPad desperdiciado. */
  useEffect(() => {
    if (vista !== "pendientes" || selPend != null) return;
    /* Primero un corte ya entregado: ese dinero está fuera de la caja y es lo
       que hay que cerrar. Si no hay ninguno, el día más reciente. */
    if (abiertos.length > 0) setSelPend({ tipo: "corte", id: abiertos[0].id });
    else if (dias.length > 0) setSelPend({ tipo: "dia", fecha: dias[0].fecha });
  }, [vista, selPend, abiertos, dias]);

  /** Lo que se va a depositar: de un corte ya entregado, todo lo suyo; de un
   *  día en caja, lo que esté marcado. */
  const totalPanel = corteAbierto ? sumar(...movsCorte.map((m) => m.monto)) : totalMarcado;

  /**
   * "Marcar depositado" — abre el formulario con lo que ya se sabe, y deja
   * apuntado qué corte hay que cerrar cuando se guarde.
   *
   * Desde un **día en caja** no hubo entrega a nadie: alguien contó el dinero
   * y fue al banco. Aun así se crea el corte, en silencio y sin responsable,
   * porque es lo que guarda QUÉ movimientos entraron. Sin él, el depósito
   * quedaría otra vez siendo una cifra suelta y "Movimientos incluidos"
   * volvería a estar vacío — que es justo lo que esta pieza vino a arreglar.
   */
  function marcarDepositado() {
    if (corteAbierto) {
      setCorteACerrar({ tipo: "existente", id: corteAbierto.id });
    } else if (dia) {
      const ids = dia.movs.filter((m) => marcados.has(m.id)).map((m) => m.id);
      if (ids.length === 0) return;
      setCorteACerrar({ tipo: "nuevo", fecha: dia.fecha, nombre: dia.titulo, ids });
    } else {
      return;
    }
    setPrefill({
      monto: totalPanel,
      cuenta: corteAbierto?.cuenta_banco || cuentaSugerida,
      fecha: hoyISO(),
      periodo: currentMonth(),
    });
    setEditing(null);
    setModalOpen(true);
  }

  /** Deshacer un corte: el dinero vuelve a la caja. Para el dedo equivocado,
   *  que en una pantalla de dinero es el error más común de todos. */
  async function deshacerCorte(c: Corte) {
    await deleteCorte(c.id, church.id);
    setSelPend(null);
    setRecargaCortes((n) => n + 1);
    playSound("eliminar");
    showToast(t("depositos.toastCorteDeshecho"));
  }
  const [previewSel, setPreviewSel] = useState<string | null>(null);
  const [pendingDeleteSel, setPendingDeleteSel] = useState<Deposito | null>(null);

  /* Pie de ventana (solo Mac): los del mes y su suma. `conteoMes` y
     `totalMes` ya venían calculados para las tarjetas de arriba. */
  useBarraEstado(t("barraEstado.depositos", {
    count: conteoMes,
    mes: mesLegible(mes),
    total: `${fmtMoney(totalMes)} ${church.moneda}`,
  }));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listDepositos(church.id),
      monthDepositos(church.id, mes),
      countDepositos(church.id, mes),
    ])
      .then(([nuevosDepositos, nuevoTotal, nuevoConteo]) => {
        if (cancelado) return;
        setDepositos(nuevosDepositos);
        setTotalMes(nuevoTotal);
        setConteoMes(nuevoConteo);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, mes]);

  useEffect(() => setPage(1), [refreshKey]);

  // La fila tenía una sola tarjeta y tres cuartos vacíos. Estos dos derivados
  // salen de `depositos`, que ya se carga entero: no hacen falta consultas
  // nuevas. El año se mide por PERÍODO, igual que el resto de los totales.
  const anio = currentYear();
  const totalAnio = sumar(
    ...depositos.filter((d) => d.periodo.startsWith(anio)).map((d) => d.monto),
  );
  /* Scroll infinito en vez de paginador, como en Movimientos: la rebanada es
     la misma del mismo array, pero abierta por arriba (`0 → page*PAGE_SIZE`).
     Ver `useScrollInfinito` para por qué no se re-observa en cada render. */
  const totalPaginas = Math.max(1, Math.ceil(depositos.length / PAGE_SIZE));
  const centinela = useScrollInfinito(
    enIPhone && page < totalPaginas,
    () => setPage((p) => Math.min(p + 1, totalPaginas)),
  );

  const ultimo = depositos.reduce<Deposito | null>(
    (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor),
    null,
  );

  function abrirNuevo() {
    setEditing(null);
    setPrefill(null);
    setModalOpen(true);
  }
  useAbrirCrearDesdeMas(abrirNuevo);

  function abrirEditar(dep: Deposito) {
    setEditing(dep);
    setPrefill(null);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditing(null);
    setPrefill(null);
    setCorteACerrar(null);
  }

  /* ---- Piezas del maestro-detalle ---- */

  const sel = selId == null ? null : depositos.find((d) => d.id === selId) ?? null;
  /* En el modo de empuje el panel conserva el último detalle mientras se
     desliza fuera; en columnas, sin animación de salida, cerrar vuelve
     directo al estado vacío. */
  const ultimoSel = useRef<Deposito | null>(null);
  if (sel) ultimoSel.current = sel;

  const q = query.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      depositos.filter(
        (d) =>
          !q ||
          d.cuenta_banco.toLowerCase().includes(q) ||
          (d.referencia ?? "").toLowerCase().includes(q) ||
          (d.notas ?? "").toLowerCase().includes(q) ||
          fmtFechaCorta(d.fecha).toLowerCase().includes(q),
      ),
    [depositos, q],
  );

  /* Agrupados por PERÍODO y no por fecha: es como suman los totales de esta
     pantalla y como agrupan los reportes, así que la lista se lee con el
     mismo criterio con el que se cuadran las cifras de arriba. */
  const gruposPeriodo = useMemo(() => {
    const mapa = new Map<string, Deposito[]>();
    for (const d of visibles) {
      const g = mapa.get(d.periodo);
      if (g) g.push(d);
      else mapa.set(d.periodo, [d]);
    }
    return [...mapa.entries()].map(([periodo, items]) => ({ periodo, items }));
  }, [visibles]);

  const totalVisible = sumar(...visibles.map((d) => d.monto));

  /** Borra ya, con "Deshacer" — el mismo trato que da `DepositoTable`, para
   *  que borrar desde el panel y borrar desde la fila hagan lo mismo. */
  async function borrarSel(borrado: Deposito) {
    await deleteDeposito(borrado.id, borrado.church_id);
    setPendingDeleteSel(null);
    if (selId === borrado.id) setSelId(null);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.depositoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        await undeleteDeposito(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  /* Las tres tarjetas del mes, extraídas a una constante: el maestro-detalle
     las pinta en DOS sitios —en el panel sin fila abierta y, en el modo de
     empuje, a la cabeza de la lista— y tienen que ser los mismos nodos, no
     una copia que se desviaría al primer cambio. Mismo trato que el resumen
     del mes de Ingresos. */
  const resumenEscritorio = (
    <div className="summary-4 enter">
      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.depositosDelMes")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">
          {t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}
        </div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.totalAnio")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">{anio}</div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.ultimoDeposito")}</span>
          <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          {ultimo
            ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
            : <span style={{ color: "var(--text-3)" }}>—</span>}
        </div>
        <div className="stat-foot">
          {ultimo
            ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
            : t("depositos.sinDepositos")}
        </div>
      </div>
    </div>
  );

  const estadoVacio = (
    <EmptyState
      pagina
      titulo={t("depositos.emptyTitulo")}
      sub={t("depositos.emptySub")}
      icon={<IconBank size={22} strokeWidth={1.6} />}
      accion={{ label: t("depositos.nuevoDeposito"), onClick: abrirNuevo }}
      duplicaCrear
    />
  );

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("depositos.titulo")}</div>
            {/* En Mac el subtítulo comparte renglón con los botones, así que
                lleva un DATO corto y no la frase que explica la pantalla —esa
                se fue al pie de la ventana, junto al recuento (BarraEstado).
                Mismo criterio que las otras nueve pantallas convertidas. */}
            {/* El subtítulo del handoff 3: cuántos cortes esperan y a qué
                cuenta van. Es dato real —los cortes son días con dinero en
                caja, la cuenta es la del último depósito— y dice más que la
                frase fija que explicaba la pantalla. En Mac sigue el mes,
                que es donde comparte renglón con los botones. */}
            <div className="page-sub">
              {esMac()
                ? mesLegible(mes)
                : cortes.length > 0
                  ? [t("depositos.cortesPendientes", { count: cortes.length }), cuentaSugerida]
                      .filter(Boolean).join(" · ")
                  : t("depositos.sub")}
            </div>
          </div>
        )}
        {/* El botón se queda: `.btn-nuevo-cabecera` ya lo oculta en el
            teléfono, donde crear un depósito lo cubre el "+" flotante — el
            `useAbrirCrearDesdeMas(abrirNuevo)` de arriba es justo lo que
            conecta ese "+" con este mismo modal. */}
        <div className="header-actions">
          <button className="btn primary btn-nuevo-cabecera" onClick={abrirNuevo}>
            <IconPlus size={14} /> {t("depositos.nuevoDeposito")}
          </button>
        </div>
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          El handoff parte esta pantalla en una lista de 378px y un panel.
          En columnas conviven; en el modo de empuje —todo iPad en vertical y
          el mini en horizontal— la lista ocupa el ancho y el resumen del mes
          baja a su cabeza, para que no quede inalcanzable detrás del panel. */}
      {partido ? (
        <div className={`md-split md-depositos${selId != null ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                <div className="md-filtros">
                  {/* El segmentado del handoff, encima del buscador. */}
                  <div className="md-seg-tipo" role="group" aria-label={t("depositos.vistaAria")}>
                    {(["pendientes", "depositados"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={vista === v ? "sel" : ""}
                        aria-pressed={vista === v}
                        onClick={() => setVista(v)}
                      >
                        {t(`depositos.filtro_${v}`)}
                      </button>
                    ))}
                  </div>
                  <label className="md-buscar">
                    <IconSearch size={15} strokeWidth={2} />
                    <input
                      value={query}
                      placeholder={t("depositos.buscarPlaceholder")}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("depositos.buscarPlaceholder")}
                    />
                  </label>
                </div>

                <div className="md-filas">
                  {angosto && <div className="md-extra">{resumenEscritorio}</div>}
                  {vista === "pendientes" ? (
                    /* Dos grupos, y el orden importa: arriba el dinero que ya
                       SALIÓ de la caja y está en manos de alguien —eso es lo
                       que hay que cerrar—, debajo lo que sigue en la caja. */
                    abiertos.length === 0 && dias.length === 0 ? (
                      <div className="fm-vacio fm-vacio--pendiente dep-pendientes">
                        <span className="fm-vacio-titulo">{t("depositos.sinCortesTitulo")}</span>
                        <span className="fm-vacio-sub">
                          {t("depositos.sinCortesSub", {
                            monto: `${fmtMoney(porDepositar ?? CERO)} ${church.moneda}`,
                          })}
                        </span>
                      </div>
                    ) : (
                      <>
                        {abiertos.length > 0 && (
                          <>
                            <div className="md-grupo">{t("depositos.grupoEntregado")}</div>
                            {abiertos.map((c) => (
                              <div
                                key={c.id}
                                className={`md-fila${selPend?.tipo === "corte" && selPend.id === c.id ? " sel" : ""}`}
                                onClick={() => setSelPend({ tipo: "corte", id: c.id })}
                              >
                                <div className="md-fila-textos">
                                  <div className="md-fila-titular">{c.nombre}</div>
                                  <div className="md-fila-sub truncate">
                                    {[c.responsable, c.cuenta_banco].filter(Boolean).join(" · ")
                                      || fmtFechaCorta(c.fecha)}
                                  </div>
                                </div>
                                <span className="md-fila-cola">
                                  <span className="dep-estado dep-estado--pendiente">{t("depositos.sinDepositar")}</span>
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {dias.length > 0 && (
                          <>
                            <div className="md-grupo">{t("depositos.grupoEnCaja")}</div>
                            {dias.map((d) => (
                              <div
                                key={d.fecha}
                                className={`md-fila${selPend?.tipo === "dia" && selPend.fecha === d.fecha ? " sel" : ""}`}
                                onClick={() => setSelPend({ tipo: "dia", fecha: d.fecha })}
                              >
                                <div className="md-fila-textos">
                                  <div className="md-fila-titular">{d.titulo}</div>
                                  <div className="md-fila-sub truncate">
                                    {t("depositos.movsDelCorte", { count: d.movs.length })}
                                  </div>
                                </div>
                                <span className="md-fila-cola">
                                  <span className="md-fila-monto">
                                    {fmtMoney(sumar(...d.movs.map((m) => m.monto)))}
                                  </span>
                                  <span className="dep-estado dep-estado--caja">{t("depositos.enCaja")}</span>
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        <div className="dep-lista-pie">
                          {t("depositos.cortesPie", { monto: `${fmtMoney(porDepositar ?? CERO)} ${church.moneda}` })}
                        </div>
                      </>
                    )
                  ) : visibles.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposPeriodo.map((g) => (
                      <div key={g.periodo}>
                        <div className="md-grupo">{mesLegible(g.periodo)}</div>
                        {g.items.map((d) => (
                          <div
                            key={d.id}
                            className={`md-fila${selId === d.id ? " sel" : ""}`}
                            onClick={() => setSelId(d.id)}
                          >
                            <div className="md-fila-textos">
                              <div className="md-fila-titular">
                                {t("depositos.corteDel", { fecha: fmtFechaCorta(d.fecha) })}
                              </div>
                              <div className="md-fila-sub truncate">
                                {[d.cuenta_banco, d.referencia].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            {/* Monto y estado, como el diseño. Aquí el estado
                                es siempre "Depositado": una fila de esta tabla
                                es un depósito ya hecho. El "Sin depositar" del
                                handoff vive en la pestaña Pendientes, que es
                                la que espera motor. */}
                            <span className="md-fila-cola">
                              <span className="md-fila-monto">{fmtMoney(d.monto)}</span>
                              <span className="dep-estado">{t("depositos.filtro_depositados")}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* El pie cuenta y suma lo VISIBLE, no lo que hay: con una
                    búsqueda puesta, el total del historial contradiría a la
                    lista que tienes delante. Mismo trato que en Ingresos. */}
                {vista === "depositados" && visibles.length > 0 && (
                  <div className="md-pie">
                    <span>{t("depositos.conteoVisible", { count: visibles.length })}</span>
                    <span className="md-pie-total">{fmtMoney(totalVisible)} {church.moneda}</span>
                  </div>
                )}
              </div>

              <div className="md-detalle">
                {(() => {
                  /* Pendientes tiene su propio panel: no es un depósito lo que
                     se mira, es el dinero que todavía no lo es. */
                  if (vista === "pendientes") {
                    /* Un corte ya entregado: su composición es fija —el dinero
                       ya salió— y lo único que queda es cerrarlo o deshacerlo. */
                    if (corteAbierto) {
                      return (
                        <PendientesDeposito
                          church={church}
                          dia={{ fecha: corteAbierto.fecha, titulo: corteAbierto.nombre, movs: movsCorte }}
                          entregado={corteAbierto}
                          sel={new Set(movsCorte.map((m) => m.id))}
                          onToggle={() => { }}
                          porRevisar={porRevisar}
                          efectivoEnCaja={porDepositar ?? CERO}
                          depSinCorte={depSinCorte}
                          cuenta={corteAbierto.cuenta_banco || cuentaSugerida}
                          fechaRegistro={fmtFechaCorta(hoyISO())}
                          periodo={mes}
                          tituloLista={t("depositos.titulo")}
                          onVolver={() => setSelPend(null)}
                          onIrPorRevisar={() => navigate("/bandeja")}
                          onNuevoCorte={() => setHojaCorte(true)}
                          onMarcarDepositado={marcarDepositado}
                          onDeshacer={() => void deshacerCorte(corteAbierto)}
                          onSegundaFirma={() => void abrirSegundaFirma(corteAbierto)}
                          onQuitarFirma={corteAbierto.segunda_firma
                            ? () => void quitarFirma(corteAbierto)
                            : undefined}
                        />
                      );
                    }
                    if (!dia) {
                      if (angosto) return null;
                      return (
                        <div className="md-vacio">
                          <div className="md-vacio-hint">
                            <h3>{t("depositos.eligeCorte")}</h3>
                            <p>{t("depositos.eligeCorteSub")}</p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <PendientesDeposito
                        church={church}
                        dia={dia}
                        sel={marcados}
                        onToggle={alternarMov}
                        porRevisar={porRevisar}
                        efectivoEnCaja={porDepositar ?? CERO}
                        depSinCorte={depSinCorte}
                        cuenta={cuentaSugerida}
                        fechaRegistro={fmtFechaCorta(hoyISO())}
                        periodo={mes}
                        tituloLista={t("depositos.titulo")}
                        onVolver={() => setSelPend(null)}
                        onIrPorRevisar={() => navigate("/bandeja")}
                        onNuevoCorte={() => setHojaCorte(true)}
                        onMarcarDepositado={marcarDepositado}
                      />
                    );
                  }
                  const det = angosto ? sel ?? ultimoSel.current : sel;
                  if (det) {
                    return (
                      <DetalleDeposito
                        dep={det}
                        church={church}
                        tituloLista={t("depositos.titulo")}
                        onVolver={() => setSelId(null)}
                        onEditar={abrirEditar}
                        onEliminar={setPendingDeleteSel}
                        onVerComprobante={setPreviewSel}
                        onCambiado={() => { setSelId(null); setRecargaCortes((n) => n + 1); onChanged(); }}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("depositos.eligeDeposito")}</h3>
                        <p>{t("depositos.eligeDepositoSub")}</p>
                      </div>
                      {resumenEscritorio}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content content-lienzo">
        {enIPhone && (
          /* Rediseño v2: la cifra que de verdad se consulta —cuánto efectivo
             hay por depositar— arriba y sola, con su explicación debajo. Es
             literalmente lo que pide el handoff para esta pantalla, y la
             regla del pie es la del repo: la app no sabe qué billete fue al
             banco, sabe qué corte se hizo. Estaba escondida en el pie de un
             grupo («Efectivo estimado en caja: …»), que es donde menos pesa. */
          <>
            <div className="ios-cifra-periodo ios-cifra-periodo--sola">
              <div className="ios-cifra-bloque">
                <span className="ios-cifra-rotulo">{t("depositos.enCajaRotulo")}</span>
                <span className="ios-cifra-num">
                  <CountUp value={porDepositar ?? CERO} format={fmtMoney} paso={100} />
                </span>
              </div>
            </div>
            <p className="ios-section-footer ios-cifra-pie">{t("depositos.enCajaPie")}</p>
          </>
        )}

        {enIPhone ? (
          /* Rediseño de iOS 26 (GUIA §4): las tres tarjetas de resumen pasan
             a ser las tres filas de una lista agrupada. En dos columnas la
             tercera dejaba un hueco, y las cifras competían entre sí por ser
             la principal; en lista se leen de un vistazo, en orden, y cada una
             conserva su pie —cuántos y de qué mes, qué año, cuándo y a qué
             cuenta fue el último—, que es lo que dice de qué período habla. */
          <SeccionIOS titulo={t("depositos.seccionResumen")}>
            <div className="ios-txrow">
              <div className="ios-txrow-main">
                <div className="ios-txrow-title">{t("depositos.depositosDelMes")}</div>
                <div className="tx-secundaria-movil">{t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}</div>
              </div>
              <div className="ios-txrow-trailing">
                <span className="tx-amount">
                  <CountUp value={totalMes} format={fmtMoney} paso={100} />
                </span>
              </div>
            </div>
            <div className="ios-txrow">
              <div className="ios-txrow-main">
                <div className="ios-txrow-title">{t("depositos.totalAnio")}</div>
                <div className="tx-secundaria-movil">{anio}</div>
              </div>
              <div className="ios-txrow-trailing">
                <span className="tx-amount">
                  <CountUp value={totalAnio} format={fmtMoney} paso={100} />
                </span>
              </div>
            </div>
            <div className="ios-txrow">
              <div className="ios-txrow-main">
                <div className="ios-txrow-title">{t("depositos.ultimoDeposito")}</div>
                <div className="tx-secundaria-movil">
                  {ultimo
                    ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
                    : t("depositos.sinDepositos")}
                </div>
              </div>
              <div className="ios-txrow-trailing">
                {ultimo
                  ? <span className="tx-amount"><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /></span>
                  : <span className="ios-fila-valor">—</span>}
              </div>
            </div>
          </SeccionIOS>
        ) : (
          resumenEscritorio
        )}

        {/* En el teléfono el "Historial" ya no es un título suelto sobre una
            tabla: cada MES es su propia sección, con su encabezado, tal como
            pide la guía. El título de la pantalla lo da el Large Title. */}
        {enIPhone ? null : (
          <div className="tx-head">
            <div className="tx-title">{t("depositos.historial")}</div>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : depositos.length === 0 ? (
          estadoVacio
        ) : enIPhone ? (
          <>
            {agruparPorMes(depositos.slice(0, page * PAGE_SIZE), (d) => d.fecha).map((seccion) => (
              <SeccionIOS key={seccion.clave} titulo={seccion.etiqueta}>
                <DepositoTable
                  depositos={seccion.items}
                  onEdit={abrirEditar}
                  /* Maqueta T6: tocar un corte lo abre. Igual que en
                     movimientos, la pantalla ya existía —`DetalleDeposito`,
                     la columna del iPad— y en el teléfono no había forma de
                     llegar a ella: el desglose, quién contó el dinero y la
                     segunda firma solo se veían en un iPad. */
                  onAbrir={(d) => setSelId(d.id)}
                  onChanged={onChanged}
                  sinCaja
                />
              </SeccionIOS>
            ))}
            <div ref={centinela} aria-hidden="true" />
          </>
        ) : (
          <>
            <DepositoTable
              depositos={depositos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
              onEdit={abrirEditar}
              onChanged={onChanged}
            />
            <Pagination
              page={page}
              totalPages={totalPaginas}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
      )}

      {/* El corte abierto, como pantalla (maqueta T6). Mismo panel que el
          iPad, mismo envoltorio que el movimiento abierto: `.pantalla-ios` con
          la banda sosteniendo el «volver». */}
      {enIPhone && sel && (
        <div className="pantalla-ios" role="dialog" aria-modal="true" aria-label={sel.cuenta_banco}>
          <div className="pi-banda pi-banda--nav">
            <div className="pi-nav">
              <button type="button" className="pi-volver" onClick={() => setSelId(null)}>
                <IconChevronLeft size={17} strokeWidth={2.4} /> {t("nav.depositos")}
              </button>
            </div>
          </div>
          <div className="pi-cuerpo pi-cuerpo--dm">
            <DetalleDeposito
              dep={sel}
              church={church}
              tituloLista={t("nav.depositos")}
              onVolver={() => setSelId(null)}
              onEditar={abrirEditar}
              onEliminar={setPendingDeleteSel}
              onVerComprobante={setPreviewSel}
              onCambiado={onChanged}
            />
          </div>
        </div>
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}

      {pendingDeleteSel && (
        <ConfirmDialog
          title={t("depositos.eliminarTitulo")}
          message={t("depositos.eliminarMensaje", {
            monto: `${fmtMoney(pendingDeleteSel.monto)} ${pendingDeleteSel.moneda}`,
            cuenta: pendingDeleteSel.cuenta_banco,
          })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={() => void borrarSel(pendingDeleteSel)}
          onCancel={() => setPendingDeleteSel(null)}
        />
      )}

      {hojaCorte && dia && (
        <NuevoCorteIOS
          church={church}
          movs={dia.movs}
          sel={marcados}
          onToggle={alternarMov}
          nombre={dia.titulo}
          cuenta={cuentaSugerida}
          fecha={dia.fecha}
          responsablePrevio={responsablePrevio}
          onClose={() => setHojaCorte(false)}
          onCreado={() => { setSelPend(null); setRecargaCortes((n) => n + 1); }}
        />
      )}

      {/* La segunda firma. El total que tiene que adivinar sale de los
          movimientos del corte, no de una cifra tecleada: es lo mismo que la
          pantalla suma, así que no puede descuadrarse consigo misma.

          `soloRevision` cuando el corte ya está depositado: el dinero está en
          el banco y contar deja de ser posible. Decirlo es más honesto que
          ofrecer un conteo que nadie puede hacer. */}
      {firmando && (
        <SegundaFirmaIOS
          corte={firmando}
          total={sumar(...movsCorte.map((m) => m.monto))}
          moneda={church.moneda}
          candidatos={candidatos}
          soloRevision={firmando.estado === "depositado"}
          onFirmar={(v) => void guardarFirma(firmando, v)}
          onDescuadre={(conteo) => void guardarDescuadre(firmando, conteo)}
          onClose={() => setFirmando(null)}
        />
      )}

      {modalOpen && (
        <DepositoModal
          church={church}
          editing={editing}
          prefill={prefill}
          /* Cerrar el corte contra ESTE depósito, con su id recién creado. */
          alGuardar={async (depositoId) => {
            if (corteACerrar != null && depositoId != null) {
              const id = corteACerrar.tipo === "existente"
                ? corteACerrar.id
                : await insertCorte(
                    church.id,
                    { fecha: corteACerrar.fecha, nombre: corteACerrar.nombre, cuenta_banco: cuentaSugerida || null },
                    corteACerrar.ids,
                  );
              if (id != null) await cerrarCorte(id, church.id, depositoId);
            }
            setCorteACerrar(null);
            setSelPend(null);
            setRecargaCortes((n) => n + 1);
          }}
          onClose={cerrarModal}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
