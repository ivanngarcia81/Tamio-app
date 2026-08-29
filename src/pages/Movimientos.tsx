import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { esIPad, esIPhone, esMac, textoCorto } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { MacBuscador, MacSegmentado } from "../components/mac/MacFiltros";
import {
  catNombre, categoriaInfo, colorCategoria, currentMonth, countTxDeSerie, deleteMovimientoRecurrente, deleteTx, deleteTxDeSerie,
  fmtFecha, fmtMoney, getCategoriasGasto, getCategoriasIngreso, listMovimientosRecurrentes,
  listTx, mesLegible, metodoNombre, monthTotals, nextMonth, prevMonth, txEnCorte, undeleteTx,
  type Church, type MovimientoRecurrente, type MonthTotals, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";
import { MenuAnchor } from "../components/MenuAnchor";
import DetalleMovimiento from "../components/DetalleMovimiento";
import ComprobantePreview from "../components/ComprobantePreview";
import ConfirmDialog from "../components/ConfirmDialog";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { useScrollInfinito } from "../hooks/useScrollInfinito";
import { useBarraEstado } from "../components/BarraEstado";
import EditRecurrenteModal from "../components/EditRecurrenteModal";
import { showToast } from "../toast";
import { playSound } from "../sound";
import TxTable from "../components/TxTable";
import {
  IconChevronDown, IconChevronLeft, IconChevronRight, IconClose, IconEdit, IconGasto, IconIngreso,
  IconPlus, IconPrinter, IconRepeat, IconSearch, IconWarn,
} from "../icons";
import { ShareIcon } from "../components/icons/IOSIcons";
import { printRegister } from "../services/print/printRegister";
import CountUp from "../components/CountUp";
import { CERO, sumar } from "../dinero";

interface Props {
  church: Church;
  tipo: "ingreso" | "gasto";
  refreshKey: number;
  onNew: () => void;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
  /** Permiso de la iglesia (migración 49). Lo calcula App con el rol; aquí
   *  llega ya resuelto para que la página no tenga que saber de roles. */
  puedeEliminar?: boolean;
}

const PAGE_SIZE = 40;

export default function Movimientos({ church, tipo, refreshKey, onNew, onEditTx, onChanged, puedeEliminar = true }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // El carrusel de secciones ya muestra "Ingresos"/"Gastos" como pastilla
  // activa (ver Cartas.tsx) — el título grande de aquí abajo sobra ahí. El
  // resto de la cabecera (mes anterior/siguiente, compartir) se queda: no
  // tiene equivalente en el carrusel ni en la barra inferior.
  const enIPhone = esIPhone();
  const enMac = esMac();
  /* Maestro-detalle del iPad (docs/ipad-rediseno.md): a partir de 700px la
     página se parte en lista + detalle. Con 1000px o más caben las dos
     columnas a la vez; entre 700 y 1149 —todo iPad en vertical, más el mini
     en horizontal— el detalle EMPUJA a la lista, como un push de navegación
     de iOS. La media query vive en un hook y no en un `innerWidth` leído una
     vez porque el giro del iPad cruza el umbral con la página ya montada.
     Los 700 son el mismo número que el CSS: el iPad más chico a pantalla
     completa es el mini con 744, y por debajo ya es Split View angosto. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Buscador de iPhone: en reposo lupa y texto van centrados; al enfocarlo se
  // van a la izquierda y aparece "Cancelar". Mismo bloque que Actas y
  // Membresía.
  const [buscando, setBuscando] = useState(false);
  const refBuscar = useRef<HTMLInputElement>(null);
  const [recurrentes, setRecurrentes] = useState<MovimientoRecurrente[]>([]);
  const [pendingDeleteRec, setPendingDeleteRec] = useState<MovimientoRecurrente | null>(null);
  const [pendingDeleteSerie, setPendingDeleteSerie] = useState<{ def: MovimientoRecurrente; generados: number } | null>(null);
  const [editingRec, setEditingRec] = useState<MovimientoRecurrente | null>(null);
  const [mes, setMes] = useState(currentMonth());
  /* Los dos mandos del handoff que la lista del iPad no tenía: el chip de mes
     —que en el diseño vive EN la barra de filtros y no en la cabecera— y el
     chip de estado, que aísla lo que espera visto bueno. */
  const [menuMes, setMenuMes] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);
  /* "Sin depositar": el chip que el handoff pide en Ingresos y que hasta la
     1.2.9 no se pudo pintar porque nadie guardaba qué movimientos habían ido
     al banco. Con los cortes (migración 38) ya se sabe: un ingreso cobrado en
     efectivo o en cheque que no está en ningún corte es dinero que sigue en
     la caja. Las transferencias y las tarjetas nunca lo están — ese dinero
     entra al banco solo. */
  const [soloSinDepositar, setSoloSinDepositar] = useState(false);
  const [enCorte, setEnCorte] = useState<Set<number>>(new Set());
  useEffect(() => {
    let cancelado = false;
    txEnCorte(church.id)
      .then((s) => { if (!cancelado) setEnCorte(s); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const esMesActual = mes >= currentMonth();

  /* La fila abierta en el maestro-detalle. Se guarda el ID y no el objeto:
     así, cuando una edición recarga `txs`, el detalle se re-busca y enseña lo
     recién guardado en vez de una copia congelada — y si la fila se borró,
     desaparece sola. `ultimoSel` conserva el último objeto REAL para que en
     el modo de empuje el panel no se vacíe a mitad de la animación de salida
     (al cerrar, `sel` ya es null pero el panel aún se ve mientras se va). */
  const [selId, setSelId] = useState<number | null>(null);
  const sel = selId != null ? txs.find((x) => x.id === selId) ?? null : null;
  const ultimoSel = useRef<Tx | null>(null);
  if (sel) ultimoSel.current = sel;
  const [pendingDeleteSel, setPendingDeleteSel] = useState<Tx | null>(null);
  const [previewSel, setPreviewSel] = useState<string | null>(null);
  // Cambiar de página (Ingresos↔Gastos) o de mes cierra el detalle: la fila
  // abierta ya no está en la lista que se ve. Buscar o filtrar NO lo cierra.
  useEffect(() => setSelId(null), [tipo, mes]);

  /** El mismo borrado con "Deshacer" de TxTable, para el botón Eliminar del
   *  panel de detalle (que no pasa por TxTable). Borrado suave: deshacer
   *  restaura la MISMA fila, con su mismo uid. */
  async function borrarSelConDeshacer(borrado: Tx) {
    setPendingDeleteSel(null);
    setSelId(null);
    await deleteTx(borrado.id, borrado.church_id);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.movimientoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        await undeleteTx(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listTx(church.id, { tipo, mes, limit: 1000 }),
      monthTotals(church.id, mes),
      listMovimientosRecurrentes(church.id, tipo),
    ])
      .then(([nuevosTxs, nuevosTotales, nuevosRecurrentes]) => {
        if (cancelado) return;
        setTxs(nuevosTxs);
        setTotales(nuevosTotales);
        setRecurrentes(nuevosRecurrentes);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, tipo, refreshKey, mes]);

  // El filtro/búsqueda o el cambio de mes siempre regresan a la página 1.
  useEffect(() => setPage(1), [tipo, mes, filtroCat, query, soloPendientes, soloSinDepositar]);

  async function confirmDeleteRecurrente() {
    if (!pendingDeleteRec) return;
    // Si la serie ya generó movimientos, se pregunta qué hacer con ellos
    // ANTES de borrar la definición (al borrarla pierden su recurrente_id).
    const generados = await countTxDeSerie(pendingDeleteRec.id, church.id);
    // Sin permiso de borrado no se pregunta: borrar la serie CON sus
    // movimientos es el mismo poder por otra puerta. Se borra solo la
    // definición y los movimientos ya generados se quedan donde están.
    if (generados > 0 && puedeEliminar) {
      setPendingDeleteSerie({ def: pendingDeleteRec, generados });
      setPendingDeleteRec(null);
      return;
    }
    await deleteMovimientoRecurrente(pendingDeleteRec.id, church.id);
    setPendingDeleteRec(null);
    showToast(t("recurrente.toastEliminado"));
    playSound("eliminar");
    listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
  }

  /** Segundo paso del borrado: conServie=true borra también los movimientos
   *  generados (suave, para que el sync lo propague). */
  async function eliminarSerie(conMovimientos: boolean) {
    if (!pendingDeleteSerie) return;
    const { def } = pendingDeleteSerie;
    if (conMovimientos && puedeEliminar) await deleteTxDeSerie(def.id, church.id);
    await deleteMovimientoRecurrente(def.id, church.id);
    setPendingDeleteSerie(null);
    showToast(conMovimientos ? t("recurrente.toastSerieEliminada") : t("recurrente.toastEliminado"));
    playSound("eliminar");
    listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
    onChanged();
  }

  const esIngreso = tipo === "ingreso";
  const titulo = esIngreso ? t("nav.ingresos") : t("nav.gastos");
  const categorias = esIngreso ? getCategoriasIngreso() : getCategoriasGasto();
  const porCategoria = esIngreso
    ? totales?.porCategoriaIngreso ?? {}
    : totales?.porCategoriaGasto ?? {};
  const totalMes = esIngreso ? totales?.ingresos ?? CERO : totales?.gastos ?? CERO;

  /* Pie de ventana (solo Mac): cuántos movimientos hay en el mes que se está
     mirando y cuánto suman. Es el dato que la toolbar de 52 px ya no puede
     enseñar entero — ahí solo cabe "18 registrados". */
  useBarraEstado(t(esIngreso ? "barraEstado.ingresos" : "barraEstado.gastos", {
    count: txs.length,
    mes: mesLegible(mes),
    total: `${fmtMoney(totalMes)} ${church.moneda}`,
  }));

  // Las tarjetas de resumen muestran las categorías CON movimiento, de mayor
  // a menor. Antes tomaban las tres primeras del catálogo, así que podían
  // enseñar dos categorías en cero mientras escondían una con gasto real.
  // Solo hay tres huecos: si hay más categorías con movimiento se muestran
  // las dos mayores y el resto se agrupa, para que lo visible siga sumando
  // el total del mes.
  const tarjetasCategoria = useMemo(() => {
    const conMovimiento = categorias
      .map((c) => ({
        id: c.id,
        nombre: catNombre(c.id),
        color: colorCategoria(tipo, c.id),
        monto: porCategoria[c.id] ?? CERO,
      }))
      .filter((c) => c.monto > 0)
      .sort((a, b) => b.monto - a.monto);
    if (conMovimiento.length <= 3) return conMovimiento;
    const resto = conMovimiento.slice(2);
    return [
      ...conMovimiento.slice(0, 2),
      {
        id: "__otras",
        nombre: t("mov.otrasCategorias", { count: resto.length }),
        color: "#64748b",
        monto: sumar(...resto.map((c) => c.monto)),
      },
    ];
  }, [categorias, porCategoria, tipo, t]);

  /* Los doce meses que ofrece el chip: el año en curso hasta el mes de hoy,
     más los del año anterior si el mes elegido cayó ahí. Se ofrece un rango y
     no "todos los meses con movimiento" porque un mes vacío también se
     consulta —para comprobar justamente que está vacío. */
  const mesesMenu = useMemo(() => {
    const out: string[] = [];
    const [y, m] = currentMonth().split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(y, m - 1 - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    if (!out.includes(mes)) out.push(mes);
    return out;
  }, [mes]);

  const q = query.trim().toLowerCase();
  const coincide = (tx: Tx) =>
    !q ||
    tx.concepto.toLowerCase().includes(q) ||
    (tx.detalle ?? "").toLowerCase().includes(q) ||
    (tx.beneficiario ?? "").toLowerCase().includes(q) ||
    (tx.member_nombre ?? "").toLowerCase().includes(q) ||
    /* Por folio, que es la razón de tenerlo: alguien dice "revisa el 0042"
       por teléfono y hay que poder encontrarlo. Basta con teclear las cuatro
       cifras — `includes` casa "0042" dentro de "2026-0042". */
    (tx.folio ?? "").toLowerCase().includes(q);
  const buscados = txs.filter(coincide);
  const esSinDepositar = (x: Tx) =>
    x.tipo === "ingreso" && x.estado === "aprobado"
    && (x.metodo_pago === "efectivo" || x.metodo_pago === "cheque")
    && !enCorte.has(x.id);
  const porEstado = soloPendientes ? buscados.filter((x) => x.estado === "pendiente") : buscados;
  const porDeposito = soloSinDepositar ? porEstado.filter(esSinDepositar) : porEstado;
  const visibles = filtroCat ? porDeposito.filter((t) => t.categoria === filtroCat) : porDeposito;
  const conteo = (id: string) => porEstado.filter((t) => t.categoria === id).length;
  /* Cuántos esperan visto bueno, para el chip. Se cuenta sobre `buscados` y
     NO sobre `porEstado`: si se contara sobre lo ya filtrado, el chip diría
     siempre el total de lo que él mismo dejó pasar. */
  const nPendientes = buscados.filter((x) => x.estado === "pendiente").length;
  const nSinDepositar = buscados.filter(esSinDepositar).length;
  /* Las categorías que se ofrecen para filtrar: EXACTAMENTE la misma lista que
     ya calculaban los chips —solo las que tienen movimientos, más la activa
     aunque quede en cero, para que no desaparezca bajo el dedo al filtrar—.
     Aquí solo se le pone nombre para poder reutilizarla en las dos formas. */
  const catsVisibles = categorias.filter((c) => conteo(c.id) > 0 || filtroCat === c.id);

  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  /* En el teléfono la "página" no se mueve: CRECE. Es el mismo corte del mismo
     array —ni una consulta nueva— pero abierto por arriba, que es lo que
     convierte el paginador en scroll infinito (rediseño de iOS 26, GUIA §4:
     "Quitar `<Pagination>` y cargar con IntersectionObserver al final").
     En Mac y iPad el paginador se queda: con ratón y teclado, saltar a la
     página 7 de un tirón sigue siendo mejor que desplazarse seis. */
  const pagina = enIPhone
    ? visibles.slice(0, page * PAGE_SIZE)
    : visibles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const centinela = useScrollInfinito(
    enIPhone && page < totalPages,
    () => setPage((p) => Math.min(p + 1, totalPages)),
  );

  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printEmpty, setPrintEmpty] = useState(false);

  /** "Compartir" del handoff, sobre UN movimiento: el mismo registro que ya
   *  sabe imprimir la pantalla, con una sola fila. Sale por `entrega`, que en
   *  iPad es la hoja nativa (Archivos, AirDrop, Mail, Imprimir). No hay
   *  formato nuevo que mantener: es el registro de siempre, acotado. */
  async function compartirMovimiento(tx: Tx) {
    setPrintError(null);
    setPrinting(true);
    try {
      await printRegister({
        church,
        titulo,
        filtroDescripcion: `${fmtFecha(tx.fecha).nombreDia} · ${catNombre(tx.categoria)}`,
        periodoISO: tx.fecha.slice(0, 7),
        movimientos: [tx],
      });
    } catch (e) {
      setPrintError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setPrinting(false);
    }
  }

  async function handlePrint() {
    setPrintError(null);
    if (visibles.length === 0) {
      setPrintEmpty(true);
      return;
    }
    setPrintEmpty(false);
    setPrinting(true);
    try {
      const catLabel = filtroCat ? catNombre(filtroCat) : t("mov.todasCategorias");
      await printRegister({
        church,
        titulo,
        filtroDescripcion: `${mesLegible(mes)} · ${catLabel}`,
        periodoISO: mes,
        movimientos: visibles,
      });
    } catch (e) {
      setPrintError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setPrinting(false);
    }
  }

  /* ---- Piezas que se pintan en más de un sitio ----
     El resumen del mes y la tarjeta de recurrentes salen en el layout de
     siempre Y en el maestro-detalle del iPad (en columnas viven en el panel
     derecho mientras no hay fila abierta; en el modo de empuje, arriba de la
     lista). Extraídos a constantes para que sean EL MISMO marcado y no dos
     copias que divergen. */
  const resumenEscritorio = (
    <div className="dash-canvas">
      <div className="summary-4 enter">
        <div className="stat-card">
          <div className="stat-head">
            <span className="stat-label">{t("mov.totalDelMes")}</span>
          </div>
          <div className="stat-value md">
            <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
          </div>
        </div>
        {tarjetasCategoria.map((c) => {
          const pct = totalMes > 0 ? Math.round((c.monto / totalMes) * 1000) / 10 : 0;
          return (
            <div className="stat-card" key={c.id}>
              <div className="stat-head">
                <span className="stat-label">{c.nombre}</span>
                <span className="cat-dot" style={{ background: c.color }} aria-hidden="true" />
              </div>
              <div className="stat-value md">
                <CountUp value={c.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
              </div>
              <div className="stat-bar">
                <div className="stat-bar-fill" style={{ width: `${pct}%`, background: c.color }} />
              </div>
              <div className="stat-pct">{t("mov.pctDelTotal", { pct })}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const tarjetaRecurrentes = recurrentes.length > 0 && (
    <div className="card card-fijos">
      <div className="card-head">
        <span className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <IconRepeat size={14} strokeWidth={2} /> {t("recurrente.titulo")}
        </span>
        <span className="card-meta">{t("recurrente.sub")}</span>
      </div>
      {recurrentes.map((r) => {
        const cat = categoriaInfo(tipo, r.categoria);
        return (
          /* Las columnas se declaran en CSS y no aquí en línea: eran un
             flexbox, así que cada celda medía lo que medía su texto y
             "Transferencia" y "Cheque" no empezaban en el mismo sitio de una
             fila a otra. Con una rejilla se alinean, que es lo que hace que
             dos filas se lean como una tabla y no como dos frases. */
          <div key={r.id} className="recurrente-fila">
            <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
            <span className="truncate rec-concepto" title={r.concepto}>
              {r.concepto}
              {r.beneficiario && <span className="rec-quien">{r.beneficiario}</span>}
            </span>
            <span className="rec-dia">{t("recurrente.diaDeCadaMes", { dia: r.dia })}</span>
            <span className="rec-metodo">{metodoNombre(r.metodo_pago)}</span>
            <span className="rec-monto">
              {t("recurrente.porMes", { monto: fmtMoney(r.monto) })}
            </span>
            <span
              className="row-icon-btn"
              title={t("common.editar")}
              onClick={() => setEditingRec(r)}
            >
              <IconEdit size={12} strokeWidth={2.2} />
            </span>
            <span
              className="row-icon-btn"
              title={t("recurrente.eliminarTitulo")}
              onClick={() => setPendingDeleteRec(r)}
            >
              <IconClose size={12} strokeWidth={2.2} />
            </span>
          </div>
        );
      })}
    </div>
  );

  const estadoVacio = (
    <EmptyState
      titulo={
        q && buscados.length === 0
          ? t("mov.sinResultadosBusqueda")
          : txs.length > 0
          ? t("mov.sinResultadosFiltro")
          : esMesActual
            ? (esIngreso ? t("mov.aunNoHayIngresos") : t("mov.aunNoHayGastos"))
            : t(esIngreso ? "mov.sinIngresosEn" : "mov.sinGastosEn", { mes: mesLegible(mes) })
      }
      sub={
        q && buscados.length === 0
          ? t("mov.pruebaOtroTermino")
          : txs.length > 0
          ? t("mov.pruebaOtraCategoria")
          : esMesActual
            ? (esIngreso ? t("mov.registraPrimerIngreso") : t("mov.registraPrimerGasto"))
            : t("mov.pruebaOtroMes")
      }
      icon={esIngreso ? <IconIngreso size={22} strokeWidth={1.6} /> : <IconGasto size={22} strokeWidth={1.6} />}
      accion={txs.length === 0 && esMesActual
        ? { label: esIngreso ? t("mov.nuevoIngreso") : t("mov.nuevoGasto"), onClick: onNew }
        : undefined}
      duplicaCrear
    />
  );

  /* Los grupos por día de la lista del maestro-detalle. La misma cuenta que
     hace TxList; aquí sobre `visibles` (ya buscados y filtrados) y sin
     paginar: la lista es una columna continua que se desplaza, como la app
     de Mail, y el pie ya dice cuántos son. */
  const gruposDia: { dia: string; items: Tx[] }[] = [];
  if (partido) {
    for (const tx of visibles) {
      const dia = tx.fecha.slice(0, 10);
      const ultimo = gruposDia[gruposDia.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.items.push(tx);
      else gruposDia.push({ dia, items: [tx] });
    }
  }
  const ahora = new Date();
  const hoyISO = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;

  return (
    <>
      {/* En Mac esta cabecera ES la toolbar de la ventana: el atributo la
          marca como tal (styles.css, bloque de Mac) y a la vez le da la zona
          de arrastre de la ventana. Solo en Mac: el manejador de arrastre que
          Tauri inyecta escucha `mousedown`, y en iOS el toque genera eventos
          de ratón sintéticos, así que en la tableta y el teléfono estaría
          pidiendo arrastrar una ventana que no existe. Por eso mismo
          `.titlebar-drag` se oculta en `:root.movil` (styles.css ~6422). */}
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{titulo}</div>
            <div className="page-sub">{t("mov.registrados", { count: txs.length })}</div>
          </div>
        )}
        <div className="header-actions">
          {/* En el teléfono este selector NO va aquí: el mes ya está escrito
              en el rótulo de la cifra («Ingresos de agosto 2026»), y tenerlo
              dos veces en la misma pantalla —una como texto y otra como
              control— era leer la misma fecha dos veces. Abajo, el rótulo ES
              el control. */}
          {!enIPhone && (
            <div className="month-nav">
              <span className="icon-btn" title={t("mov.mesAnterior")} onClick={() => setMes(prevMonth(mes))}>
                <IconChevronLeft size={16} />
              </span>
              <span className="month-nav-label">{mesLegible(mes)}</span>
              <span
                className={`icon-btn${esMesActual ? " disabled" : ""}`}
                title={t("mov.mesSiguiente")}
                onClick={() => !esMesActual && setMes(nextMonth(mes))}
              >
                <IconChevronRight size={16} />
              </span>
            </div>
          )}
          {/* El buscador vive en la toolbar, que es donde va en cualquier app
              de Mac; en el teléfono y el iPad se queda dentro del contenido,
              al alcance del pulgar. */}
          {enMac && (
            <MacBuscador
              value={query}
              onChange={setQuery}
              placeholder={t("mov.buscarPlaceholder")}
            />
          )}
          <button className="btn secondary btn-compartir-cabecera" onClick={handlePrint} disabled={printing}>
            <span className="solo-escritorio"><IconPrinter size={14} /></span>
            <span className="solo-movil"><ShareIcon size={22} /></span>
            <span className="btn-compartir-texto">{printing ? t("common.preparando") : t("common.imprimir")}</span>
          </button>
          <button className="btn primary btn-nuevo-cabecera" onClick={onNew}>
            <IconPlus size={14} /> {esIngreso ? t("mov.nuevoIngreso") : t("mov.nuevoGasto")}
          </button>
        </div>
      </div>

      {(printError || printEmpty) && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconWarn size={13} /> {printError ?? t("mov.noHayRegistros")}
          </div>
        </div>
      )}

      {/* ---- Maestro-detalle (iPad a partir de 1024px) ----
          La página se parte en dos: lista de movimientos a la izquierda,
          detalle a la derecha. En columnas (≥1000px) conviven; en el modo
          angosto (el 13" en vertical) el detalle empuja a la lista, y el
          resumen del mes baja a la cabeza de la propia lista para no quedar
          inalcanzable detrás del panel. */}
      {partido ? (
        <div className={`md-split md-movimientos${selId != null ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                <div className="md-filtros">
                  {/* El segmentado del handoff: Ingresos y Gastos son la MISMA
                      pantalla con dos contenidos, y en el diseño se cambia
                      desde arriba de la lista en vez de volver al menú. Son
                      dos rutas de verdad (`<Link>`), no un estado local: el
                      resto de la app enlaza a /ingresos y /gastos y el atrás
                      del sistema tiene que seguir funcionando. */}
                  <div className="md-seg-tipo" role="group" aria-label={t("mov.tipoAria")}>
                    <Link to="/ingresos" className={esIngreso ? "sel" : ""} aria-current={esIngreso || undefined}>
                      {t("nav.ingresos")}
                    </Link>
                    <Link to="/gastos" className={!esIngreso ? "sel" : ""} aria-current={!esIngreso || undefined}>
                      {t("nav.gastos")}
                    </Link>
                  </div>
                  <label className="md-buscar">
                    <IconSearch size={15} strokeWidth={2} />
                    <input
                      value={query}
                      placeholder={t("mov.buscarPlaceholder")}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={t("mov.buscarPlaceholder")}
                    />
                  </label>
                  <div className="md-chips">
                    {/* El chip del mes, relleno y con chevrón: el mando
                        principal de la fila, como en el diseño. En el iPad la
                        navegación ‹ › de la cabecera se esconde por CSS — el
                        mismo mando dos veces en la misma pantalla es peor que
                        cualquiera de los dos por separado. */}
                    <MenuAnchor
                      open={menuMes}
                      onOpenChange={setMenuMes}
                      ariaLabel={t("mov.elegirMes")}
                      button={<span className="chip chip-mes">{mesLegible(mes)}<IconChevronDown size={11} strokeWidth={2.4} /></span>}
                      items={mesesMenu.map((m) => ({ label: mesLegible(m), onPress: () => setMes(m) }))}
                    />
                    {catsVisibles.length >= 2 && (
                      <>
                        <button
                          type="button"
                          className={`chip${filtroCat === null ? " active" : ""}`}
                          onClick={() => setFiltroCat(null)}
                        >
                          {t("common.todos")} <span className="count">{porEstado.length}</span>
                        </button>
                        {catsVisibles.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`chip${filtroCat === c.id ? " active" : ""}`}
                            onClick={() => setFiltroCat(filtroCat === c.id ? null : c.id)}
                          >
                            {catNombre(c.id)} <span className="count">{conteo(c.id)}</span>
                          </button>
                        ))}
                      </>
                    )}
                    {/* El chip de estado. En el handoff dice "Sin depositar"
                        en ingresos y "Pendientes" en gastos; aquí es
                        "Pendientes" en las dos, porque lo que la base sabe es
                        `estado`. "Sin depositar" pediría saber qué
                        movimientos entraron en qué depósito, y esa relación no
                        existe todavía (ver docs/ipad-rediseno.md §15). Solo
                        sale si hay algo pendiente: un filtro que nunca
                        encuentra nada es ruido en la barra. */}
                    {nPendientes > 0 && (
                      <button
                        type="button"
                        className={`chip chip-aviso${soloPendientes ? " active" : ""}`}
                        aria-pressed={soloPendientes}
                        onClick={() => setSoloPendientes((v) => !v)}
                      >
                        {t("tx.pendientes")} <span className="count">{nPendientes}</span>
                      </button>
                    )}
                    {/* Solo en Ingresos y solo si hay algo: un filtro que
                        nunca encuentra nada es ruido en la barra. */}
                    {tipo === "ingreso" && nSinDepositar > 0 && (
                      <button
                        type="button"
                        className={`chip${soloSinDepositar ? " active" : ""}`}
                        aria-pressed={soloSinDepositar}
                        title={t("depositos.sinDepositarAyuda")}
                        onClick={() => setSoloSinDepositar((v) => !v)}
                      >
                        {t("depositos.sinDepositar")} <span className="count">{nSinDepositar}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="md-filas">
                  {angosto && (
                    <div className="md-extra">
                      {resumenEscritorio}
                      {tarjetaRecurrentes}
                    </div>
                  )}
                  {visibles.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposDia.map((g) => {
                      const f = fmtFecha(g.items[0].fecha);
                      const esHoy = g.dia === hoyISO;
                      return (
                        <div key={g.dia}>
                          <div className="md-grupo">
                            {esHoy ? `${t("mov.hoy")} · ` : ""}{f.nombreDia} {f.dia}
                          </div>
                          {g.items.map((tx) => {
                            const cat = categoriaInfo(tx.tipo, tx.categoria);
                            const metodo = metodoNombre(tx.metodo_pago);
                            const hora = fmtFecha(tx.fecha).hora;
                            const persona = tx.member_nombre ?? tx.beneficiario;
                            const conceptoRedundante =
                              tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
                            /* Titular al estilo del diseño de iPad:
                               "Diezmo · María Hernández" en ingresos,
                               "Mantenimiento · Pintura del anexo" en gastos.
                               La categoría abre porque es lo que agrupa; el
                               resto baja a la línea secundaria. */
                            const titular = esIngreso
                              ? persona ? `${cat.nombre} · ${persona}` : tx.concepto
                              : conceptoRedundante ? cat.nombre : `${cat.nombre} · ${tx.concepto}`;
                            const sub = (esIngreso
                              ? [persona && !conceptoRedundante ? tx.concepto : null, !persona ? cat.nombre : null, metodo, hora || null]
                              : [tx.beneficiario, metodo, hora || null]
                            ).filter(Boolean).join(" · ");
                            return (
                              <div
                                key={tx.id}
                                className={`md-fila${selId === tx.id ? " sel" : ""}`}
                                onClick={() => setSelId(tx.id)}
                              >
                                {/* El cuadrito de categoría, en las DOS listas.
                                    Estaba solo en gastos, con el argumento de
                                    que los ingresos son cuatro categorías y se
                                    distinguen por el nombre; el handoff lo
                                    pinta en las dos, y con razón: es lo que
                                    deja recorrer la columna con la vista sin
                                    leer. El color sale de `colorCategoria`,
                                    el mismo que pinta el chip. */}
                                <span
                                  className="md-cat-dot"
                                  style={{ background: colorCategoria(tipo, tx.categoria) }}
                                  aria-hidden="true"
                                />
                                <span className="md-fila-textos">
                                  <span className="md-fila-titular">
                                    {tx.recurrente_id != null && (
                                      <span className="md-fila-rec" title={t("recurrente.marcaEnTabla")}>
                                        <IconRepeat size={12} strokeWidth={2.2} />
                                      </span>
                                    )}
                                    <span className="truncate">{titular}</span>
                                  </span>
                                    {sub && <span className="md-fila-sub truncate">{sub}</span>}
                                </span>
                                {/* Monto y, debajo, la etiqueta de aviso del
                                    handoff. Sustituye al punto ámbar que iba
                                    pegado al titular: un punto hay que saber
                                    interpretarlo, y en una fila de 64px cabe
                                    la palabra. */}
                                <span className="md-fila-cola">
                                  <span className="md-fila-monto">{fmtMoney(tx.monto)}</span>
                                  {tx.estado === "pendiente" && (
                                    <span className="md-fila-aviso">{t("tx.pendiente")}</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("mov.registrados", { count: visibles.length })}</span>
                  <span className="md-pie-total">
                    {fmtMoney(sumar(...visibles.map((x) => x.monto)))} {church.moneda}
                  </span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  /* En el modo de empuje el panel conserva el último detalle
                     mientras se desliza fuera; en columnas, al no haber
                     animación de salida, cerrar vuelve directo al resumen. */
                  const detTx = angosto ? sel ?? ultimoSel.current : sel;
                  if (detTx) {
                    return (
                      <DetalleMovimiento
                        tx={detTx}
                        tituloLista={titulo}
                        onVolver={() => setSelId(null)}
                        onEditar={onEditTx}
                        onEliminar={puedeEliminar ? setPendingDeleteSel : undefined}
                        onVerComprobante={setPreviewSel}
                        onVerFicha={(mid) => navigate("/miembros", { state: { verMiembro: mid } })}
                        onCompartir={compartirMovimiento}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("mov.eligeMovimiento")}</h3>
                        <p>{t("mov.eligeMovimientoSub")}</p>
                      </div>
                      {resumenEscritorio}
                      {tarjetaRecurrentes}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content content-lienzo">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {enIPhone ? (
              <>
                {/* Rediseño v2: el total del periodo sale de la tarjeta y se
                    convierte en la CIFRA de la pantalla, sobre el gris del
                    fondo. Es la instrucción del handoff —«el total del periodo
                    como cifra grande sobre la lista, no como tarjeta»— y la
                    maqueta la mide: rótulo de 13 gris, importe de 32/700 con
                    cifras tabulares, y el conteo a la derecha alineado por su
                    línea base. Un total metido en una fila de lista pesa lo
                    mismo que la categoría de debajo; sacado, manda. */}
                <div className="ios-cifra-periodo">
                  <div className="ios-cifra-bloque">
                    {/* El rótulo ES el selector de mes: dice de qué periodo es
                        la cifra y lo cambia, que era lo que hacían dos
                        controles distintos escribiendo la misma fecha. Una
                        flecha a cada lado, pegadas al texto y no repartidas a
                        los extremos de la pantalla: el grupo entero mide lo
                        que mide el rótulo. */}
                    <span className="ios-cifra-rotulo ios-mes-paso">
                      <button
                        type="button"
                        className="ios-mes-flecha"
                        aria-label={t("mov.mesAnterior")}
                        onClick={() => setMes(prevMonth(mes))}
                      >
                        <IconChevronLeft size={13} strokeWidth={2.6} />
                      </button>
                      <span className="ios-mes-texto">
                        {t(esIngreso ? "mov.ingresosDe" : "mov.gastosDe", { mes: mesLegible(mes) })}
                      </span>
                      <button
                        type="button"
                        className="ios-mes-flecha"
                        aria-label={t("mov.mesSiguiente")}
                        disabled={esMesActual}
                        onClick={() => setMes(nextMonth(mes))}
                      >
                        <IconChevronRight size={13} strokeWidth={2.6} />
                      </button>
                    </span>
                    <span className="ios-cifra-num">
                      <CountUp value={totalMes} format={fmtMoney} paso={100} />
                    </span>
                  </div>
                  <span className="ios-cifra-conteo">{t("mov.nRegistros", { count: txs.length })}</span>
                </div>
              <div className="ios-panel">
                <div className="ios-panel-head"><h2>{t("mov.seccionResumen")}</h2></div>
                {/* Las categorías se quedan —el handoff mueve el TOTAL, no el
                    desglose— pero ya sin la fila «Total del mes» delante, que
                    ahora vive arriba. Cada categoría es una fila con su punto
                    de color, su importe y el porcentaje en la secundaria; la
                    barra de proporción se fue porque el porcentaje lo dice con
                    más precisión y en una fila de 44px no cabía. */}
                <div className="ios-listcard">
                  {tarjetasCategoria.map((c) => {
                    const pct = totalMes > 0 ? Math.round((c.monto / totalMes) * 1000) / 10 : 0;
                    return (
                      <div className="ios-txrow" key={c.id}>
                        <div className="ios-txrow-main">
                          <div className="ios-txrow-title">{c.nombre}</div>
                          <div className="tx-secundaria-movil">
                            <span className="ios-punto" style={{ background: c.color }} aria-hidden="true" />
                            {t("mov.pctDelTotal", { pct })}
                          </div>
                        </div>
                        <div className="ios-txrow-trailing">
                          <span className="tx-amount">
                            <CountUp value={c.monto} format={fmtMoney} paso={100} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
            ) : resumenEscritorio}

            {tarjetaRecurrentes}

            {enIPhone ? (
              /* Campo de 36 px con relleno gris y sin borde, y las categorías
                 DEBAJO a todo el ancho: el patrón de la barra de alcance de
                 Mail. El borde de 1 px del campo de escritorio es lo que más
                 lo delataba como web, y los chips al lado dejaban el activo
                 como una pastilla negra. */
              <div className="ios-buscar-bloque">
                <div className={`ios-buscar${buscando ? " es-activo" : ""}`}>
                  <label className="ios-buscar-campo">
                    <IconSearch size={15} strokeWidth={2} />
                    <input
                      ref={refBuscar}
                      value={query}
                      placeholder={t("common.buscarCorto")}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => setBuscando(true)}
                      aria-label={t("mov.buscarPlaceholder")}
                    />
                  </label>
                  {buscando && (
                    <button
                      type="button"
                      className="ios-buscar-cancelar"
                      onClick={() => { setQuery(""); setBuscando(false); refBuscar.current?.blur(); }}
                    >
                      {t("common.cancelar")}
                    </button>
                  )}
                </div>

                {/* Mismo criterio que Actas: con dos casillas o menos —"Todos"
                    y una sola categoría— no hay elección que ofrecer; a partir
                    de cinco el segmentado no cabe en 390 px sin bajar el texto
                    de 13 px, y se vuelve a la fila que se desliza. La lista de
                    categorías es la MISMA que ya se calculaba, sin cambiar el
                    criterio de cuáles salen. */}
                {catsVisibles.length >= 2 && (
                  catsVisibles.length <= 3 ? (
                    <div className="ios-alcance" role="tablist">
                      <span
                        className="ios-alcance-pulgar"
                        style={{
                          width: `calc((100% - 4px) / ${catsVisibles.length + 1})`,
                          transform: `translateX(${(filtroCat === null ? 0 : catsVisibles.findIndex((c) => c.id === filtroCat) + 1) * 100}%)`,
                        }}
                      />
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtroCat === null}
                        className="ios-alcance-opcion"
                        onClick={() => setFiltroCat(null)}
                      >
                        {t("common.todos")}
                      </button>
                      {catsVisibles.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="tab"
                          aria-selected={filtroCat === c.id}
                          className="ios-alcance-opcion"
                          onClick={() => setFiltroCat(c.id)}
                        >
                          {catNombre(c.id)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="ios-filtros">
                      <button
                        type="button"
                        className={`chip${filtroCat === null ? " active" : ""}`}
                        onClick={() => setFiltroCat(null)}
                      >
                        {t("common.todos")}
                      </button>
                      {catsVisibles.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`chip${filtroCat === c.id ? " active" : ""}`}
                          onClick={() => setFiltroCat(filtroCat === c.id ? null : c.id)}
                        >
                          {catNombre(c.id)}
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : !enMac ? (
            <div className="tx-head" style={{ marginBottom: 10 }}>
              <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
                <IconSearch size={15} strokeWidth={2} />
                <input
                  className="form-input"
                  placeholder={textoCorto(t("common.buscarCorto"), t("mov.buscarPlaceholder"))}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            ) : null}

            <div className="tx-head">
              <div className="tx-title">{esIngreso ? t("mov.todosIngresos") : t("mov.todosGastos")}</div>
              {/* Los contadores no son filtros de popover: son vistas de la
                  misma lista, y en macOS eso es un segmentado al lado del
                  encabezado de la tabla, no una fila de pastillas. */}
              {enMac ? (
                <MacSegmentado
                  value={filtroCat ?? ""}
                  onChange={(v) => setFiltroCat(v === "" ? null : v)}
                  aria={t("mov.filtrarCategoria")}
                  opciones={[
                    { id: "", label: <>{t("common.todos")} <span className="mac-seg-n">{buscados.length}</span></> },
                    ...categorias
                      .filter((c) => conteo(c.id) > 0 || filtroCat === c.id)
                      .map((c) => ({ id: c.id, label: <>{catNombre(c.id)} <span className="mac-seg-n">{conteo(c.id)}</span></> })),
                  ]}
                />
              ) : enIPhone ? (
                /* En el teléfono los filtros se mudaron ARRIBA, bajo el
                   buscador, como barra de alcance. Dejarlos también aquí
                   sería el mismo filtro dos veces. */
                null
              ) : (
              <div className="tx-filters">
                <div
                  className={`chip${filtroCat === null ? " active" : ""}`}
                  onClick={() => setFiltroCat(null)}
                >
                  {t("common.todos")} <span className="count">{buscados.length}</span>
                </div>
                {/* Solo las categorías con movimientos en el mes. Antes se
                    pintaban las doce y nueve marcaban 0, así que la fila se
                    comía todo el ancho y bajaba del título — de ahí que Gastos
                    e Ingresos parecieran maquetados distinto, cuando el marcado
                    es el mismo. La activa se conserva aunque quede en cero, para
                    que el chip no desaparezca bajo el cursor al filtrar. */}
                {categorias
                  .filter((c) => conteo(c.id) > 0 || filtroCat === c.id)
                  .map((c) => {
                    const n = conteo(c.id);
                    const activa = filtroCat === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`chip${activa ? " active" : ""}`}
                        onClick={() => setFiltroCat(activa ? null : c.id)}
                      >
                        {catNombre(c.id)} <span className="count">{n}</span>
                      </div>
                    );
                  })}
              </div>
              )}
            </div>

            {visibles.length === 0 ? estadoVacio : (
              <>
                <TxTable
                  tipo={tipo}
                  txs={pagina}
                  onEdit={onEditTx}
                  /* Maqueta T4. En el teléfono, tocar un movimiento lo ABRE.
                     Hasta ahora no hacía nada: la única forma de mirar un
                     gasto era deslizar la fila y darle a «Editar», o sea
                     entrar al formulario para leer. Y la pantalla que hace
                     falta ya existía —`DetalleMovimiento`, la columna del
                     iPad—, encerrada tras `partido`. */
                  onAbrir={enIPhone ? (tx) => setSelId(tx.id) : undefined}
                  onChanged={onChanged}
                  puedeEliminar={puedeEliminar}
                />
                {enIPhone
                  ? <div ref={centinela} aria-hidden="true" />
                  : <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
              </>
            )}
          </>
        )}
      </div>
      )}

      {/* El movimiento abierto, como PANTALLA (maqueta T4). Es el mismo panel
          que el iPad pinta en su columna derecha: mismo importe grande, misma
          ficha, mismo comprobante, mismas acciones. Lo único que cambia es el
          envoltorio —aquí ocupa el teléfono entero, con su banda y su
          «volver»— y eso lo pone el CSS, no un segundo componente que
          enseñaría lo mismo con otro código. */}
      {enIPhone && sel && (
        <div className="pantalla-ios" role="dialog" aria-modal="true" aria-label={sel.concepto}>
          {/* El «volver» va en la banda, no en el cuerpo. `DetalleMovimiento`
              trae el suyo —`.dm-volver`, para el modo de empuje del iPad—,
              pero ese se desplaza con el contenido; aquí tiene que quedarse
              arriba. El del panel se apaga por CSS en esta pantalla. */}
          <div className="pi-banda pi-banda--nav">
            <div className="pi-nav">
              <button type="button" className="pi-volver" onClick={() => setSelId(null)}>
                <IconChevronLeft size={17} strokeWidth={2.4} /> {titulo}
              </button>
            </div>
          </div>
          <div className="pi-cuerpo pi-cuerpo--dm">
            <DetalleMovimiento
              tx={sel}
              tituloLista={titulo}
              onVolver={() => setSelId(null)}
              onEditar={onEditTx}
              onEliminar={puedeEliminar ? setPendingDeleteSel : undefined}
              onVerComprobante={setPreviewSel}
              onVerFicha={(mid) => navigate("/miembros", { state: { verMiembro: mid } })}
              onCompartir={compartirMovimiento}
            />
          </div>
        </div>
      )}

      {pendingDeleteRec && (
        <ConfirmDialog
          title={t("recurrente.eliminarTitulo")}
          message={t("recurrente.eliminarMensaje", { concepto: pendingDeleteRec.concepto })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDeleteRecurrente}
          onCancel={() => setPendingDeleteRec(null)}
        />
      )}

      {pendingDeleteSerie && (
        <ConfirmDialog
          title={t("recurrente.serieTitulo")}
          message={t("recurrente.serieMensaje", { concepto: pendingDeleteSerie.def.concepto, count: pendingDeleteSerie.generados })}
          confirmLabel={t("recurrente.serieBorrarTodo", { count: pendingDeleteSerie.generados })}
          danger
          onConfirm={() => void eliminarSerie(true)}
          onCancel={() => void eliminarSerie(false)}
        />
      )}

      {pendingDeleteSel && (
        <ConfirmDialog
          title={t("tx.eliminarTitulo")}
          message={t("tx.eliminarMensaje", { concepto: pendingDeleteSel.concepto, monto: `${fmtMoney(pendingDeleteSel.monto)} ${pendingDeleteSel.moneda}` })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={() => void borrarSelConDeshacer(pendingDeleteSel)}
          onCancel={() => setPendingDeleteSel(null)}
        />
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}

      {editingRec && (
        <EditRecurrenteModal
          church_id={church.id}
          recurrente={editingRec}
          onClose={() => setEditingRec(null)}
          onSaved={() => {
            showToast(t("recurrente.toastActualizado"));
            playSound("guardado");
            listMovimientosRecurrentes(church.id, tipo).then(setRecurrentes).catch(console.error);
          }}
        />
      )}
    </>
  );
}
