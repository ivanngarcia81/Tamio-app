import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, cortesSinSegundaFirma, currentMonth, fmtFecha, fmtFechaCorta, fmtMoney,
  listArchivedMembers, listMovimientosRecurrentes, listPendingTx, listTx, markTxRejected,
  markTxReviewed, restoreMember,
  type Church, type Corte, type Member, type MovimientoRecurrente, type Tx,
} from "../db";
import {
  calcularAlertas, conteoPorTipo, grupoDeAlerta, UMBRAL_COMPROBANTE,
  type Alerta, type TipoAlerta,
} from "../services/bandeja/alertas";
import PanelAlerta from "../components/PanelAlerta";
import { EmptyState } from "../components/TxList";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { esIPad, esIPhone, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleMovimiento from "../components/DetalleMovimiento";
import DetalleMiembro from "../components/DetalleMiembro";
import ComprobantePreview from "../components/ComprobantePreview";
import { IconCheck, IconEdit, IconRefreshCw } from "../icons";
import SeccionIOS, { IosChevron } from "../components/ios/SeccionIOS";
import { hayGesto, useFilaDeslizable } from "../components/useFilaDeslizable";

/**
 * Una fila de la Bandeja en el TELÉFONO.
 *
 * Sale a su propio componente por una razón de React y no de gusto:
 * `useFilaDeslizable` es un hook y no se puede llamar dentro del `.map` de una
 * lista. Es la misma forma que ya usa `FilaCategoria` en Ajustes.
 *
 * **Las tres acciones de la Bandeja, y por qué cada una está donde está.** En
 * el iPad hay panel y caben tres botones de texto —Aprobar, Editar, Devolver—.
 * En 393 px no caben, así que se reparten por lo que cada una es:
 *
 *   · **Tocar la fila** abre el destino que resuelve esa alerta. Es lo más
 *     frecuente y por eso ocupa toda la fila.
 *   · **Aprobar** es un botón redondo a la derecha: un toque, sin salir.
 *   · **Devolver** va DESLIZANDO. No es por falta de sitio —cabría un segundo
 *     círculo— sino porque devolver le rebota a alguien su trabajo, y dos
 *     círculos idénticos a 44 px de distancia convierten eso en un resbalón
 *     del pulgar. El iPad ya lo trata como secundario (`btn secondary`); aquí
 *     el gesto es lo que hace de "secundario". Y es la convención de iOS: en
 *     Mail y Mensajes la acción negativa de una fila vive en el deslizamiento.
 */
function FilaAlertaIOS({
  a, inicial, sub, destino, puedeAprobar, onAprobar, onDevolver, onRestaurar,
}: {
  a: Alerta;
  inicial: string;
  sub: string;
  destino: (() => void) | null;
  puedeAprobar: boolean;
  onAprobar: () => void;
  onDevolver: () => void;
  onRestaurar: () => void;
}) {
  const { t } = useTranslation();
  /* Solo se desliza lo que tiene movimiento detrás: devolver un recurrente
     vencido o un miembro archivado no significa nada. */
  const sePuedeDevolver = !!a.tx && hayGesto();
  const desliza = useFilaDeslizable(sePuedeDevolver, false, () => {});

  const fila = (
    <div
      className={`ios-txrow${destino ? " ios-txrow--clickable" : ""}`}
      ref={sePuedeDevolver ? desliza.ref : undefined}
      onClick={destino ? () => (desliza.x > 0 ? desliza.cerrar() : destino()) : undefined}
    >
      <span className={`al-marca${a.tipo === "pendiente" ? " urgente" : ""}`} aria-hidden="true">
        {a.tipo === "pendiente" ? "!" : inicial}
      </span>
      <div className="ios-txrow-main">
        <div className="ios-txrow-title">{t(`bandeja.alerta_${a.tipo}`)}</div>
        <div className="tx-secundaria-movil">{sub}</div>
      </div>
      <div className="ios-txrow-trailing">
        {a.miembro ? (
          <button
            type="button"
            className="ios-row-accion"
            aria-label={t("bandeja.restaurar")}
            title={t("bandeja.restaurar")}
            onClick={(e) => { e.stopPropagation(); onRestaurar(); }}
          >
            <span><IconRefreshCw size={15} strokeWidth={2.2} /></span>
          </button>
        ) : puedeAprobar ? (
          /* Aprobar, de un toque y sin salir de la lista. Es el mismo
             `.ios-row-accion` de «Restaurar» sin una clase propia: las dos son
             la acción positiva de su fila y se distinguen por el glifo, no por
             el color. Círculo de 30 dentro de un objetivo táctil de 44, y
             `stopPropagation` para que aprobar no abra además el destino. */
          <button
            type="button"
            className="ios-row-accion"
            aria-label={t("bandeja.aprobar")}
            title={t("bandeja.aprobar")}
            onClick={(e) => { e.stopPropagation(); onAprobar(); }}
          >
            <span><IconCheck size={15} strokeWidth={2.6} /></span>
          </button>
        ) : destino ? <IosChevron /> : null}
      </div>
    </div>
  );

  if (!sePuedeDevolver) return fila;

  return (
    <div className="ios-swipe">
      <button
        type="button"
        className="ios-swipe-delete al-swipe-devolver"
        onClick={() => { desliza.cerrar(); onDevolver(); }}
      >
        {t("bandeja.devolver")}
      </button>
      {fila}
    </div>
  );
}

interface Props {
  church: Church;
  refreshKey: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

const PAGE_SIZE = 15;

export default function Bandeja({ church, refreshKey, onEditTx, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  /* Maestro-detalle del iPad, los mismos dos umbrales que Movimientos y
     Aportantes (docs/ipad-rediseno.md): partido desde 700, columnas desde
     1000, y entre medias el detalle empuja. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1000px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [pendientes, setPendientes] = useState<Tx[]>([]);
  const [archivados, setArchivados] = useState<Member[]>([]);
  const [cortesSinFirma, setCortesSinFirma] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagPendientes, setPagPendientes] = useState(1);
  const [pagArchivados, setPagArchivados] = useState(1);
  const [recientes, setRecientes] = useState<Tx[]>([]);
  const [recurrentes, setRecurrentes] = useState<MovimientoRecurrente[]>([]);
  /* El chip de tipo del handoff: `null` = todas. */
  const [filtroTipo, setFiltroTipo] = useState<TipoAlerta | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listPendingTx(church.id),
      listArchivedMembers(church.id),
      /* Los movimientos recientes sobre los que se buscan las otras alertas.
         200 y no "todos": las cinco reglas miran duplicados, comprobantes y
         categorías de lo que se acaba de registrar, no del histórico entero —
         una bandeja que rescata un descuadre de hace tres años no es una
         bandeja, es una auditoría. */
      listTx(church.id, { limit: 200 }),
      listMovimientosRecurrentes(church.id),
      /* Los cortes que pidieron segunda firma y siguen sin ella (migración
         47). Sin techo de fecha, y a propósito: una firma que falta no
         caduca — el resto de las reglas miran lo reciente porque hablan de
         movimientos, y esto habla de un trámite abierto. */
      cortesSinSegundaFirma(church.id),
    ])
      .then(([nuevosPendientes, nuevosArchivados, nuevosRecientes, nuevosRec, nuevosCortes]) => {
        if (cancelado) return;
        setPendientes(nuevosPendientes);
        setArchivados(nuevosArchivados);
        setRecientes(nuevosRecientes);
        setRecurrentes(nuevosRec);
        setCortesSinFirma(nuevosCortes);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => { setPagPendientes(1); setPagArchivados(1); }, [refreshKey]);

  /* El asunto abierto. Aquí la lista es HETEROGÉNEA —un movimiento pendiente
     y un miembro archivado no son lo mismo— así que la selección guarda el
     tipo además del id, y de ahí sale qué panel se pinta. Como en las otras
     dos pantallas se guarda el ID y no el objeto: al resolver un asunto la
     recarga lo saca de su lista y el panel se cierra solo. */
  const [sel, setSel] = useState<{ tipo: "tx" | "miembro"; id: number } | null>(null);
  const selTx = sel?.tipo === "tx" ? pendientes.find((x) => x.id === sel.id) ?? null : null;
  const selMiembro = sel?.tipo === "miembro" ? archivados.find((m) => m.id === sel.id) ?? null : null;
  const ultimoSel = useRef<{ tx: Tx | null; miembro: Member | null }>({ tx: null, miembro: null });
  if (selTx) ultimoSel.current = { tx: selTx, miembro: null };
  if (selMiembro) ultimoSel.current = { tx: null, miembro: selMiembro };

  /* ---- Las alertas del handoff 2 ----
     El motor vive en `services/bandeja/alertas.ts`, puro y probado aparte;
     aquí solo se le dan las cuatro listas y se pinta lo que devuelve. La
     bandeja deja de ser "pendientes + archivados" y pasa a ser la lista de
     cosas que alguien tiene que mirar, que es lo que el diseño pide. */
  /* Los dos controles de tesorería (migración 45) salen de la iglesia, no de
     la constante: quien los apague en Ajustes deja de ver esas alertas aquí,
     que es justo lo que el interruptor promete. */
  const umbralIglesia = church.umbral_comprobante ?? UMBRAL_COMPROBANTE;
  const alertas: Alerta[] = useMemo(() => calcularAlertas({
    pendientes,
    recientes,
    archivados,
    recurrentes,
    hoyMes: currentMonth(),
    cortesSinFirma,
    umbralComprobante: umbralIglesia,
    avisarSinComprobante: church.avisar_sin_comprobante !== 0,
    avisarDuplicados: church.avisar_duplicados !== 0,
  }), [pendientes, recientes, archivados, recurrentes, cortesSinFirma, umbralIglesia,
       church.avisar_sin_comprobante, church.avisar_duplicados]);
  const conteos = useMemo(() => conteoPorTipo(alertas), [alertas]);
  const visiblesAl = filtroTipo ? alertas.filter((a) => a.tipo === filtroTipo) : alertas;

  /* La alerta abierta, por CLAVE y no por índice: al resolver una, la lista
     se recalcula y un índice apuntaría a la de al lado. */
  const [selAl, setSelAl] = useState<string | null>(null);
  const alertaSel = visiblesAl.find((a) => a.clave === selAl)
    ?? alertas.find((a) => a.clave === selAl)
    ?? null;
  const ultimaAl = useRef<Alerta | null>(null);
  if (alertaSel) ultimaAl.current = alertaSel;

  /**
   * Los botones del panel, distintos por alerta — es lo que el handoff pide
   * y lo que hace útil esta pantalla: la acción que resuelve ESTE caso, a un
   * toque, en vez de "editar" para todo.
   *
   * "Adjuntar", "Asignar categoría" y "Vincular miembro" llevan al formulario
   * de edición, que es donde esos tres campos se tocan; el nombre dice qué se
   * va a hacer allí, no cómo se llama la pantalla que abre.
   */
  /** Si el botón de aprobar de la fila del teléfono tiene sentido.
   *
   *  Solo `pendiente`, y el porqué es de comportamiento, no de gusto:
   *  `markTxReviewed` marca el movimiento como revisado, y de las siete
   *  alertas la ÚNICA que sale de ahí es `pendiente` (`listPendingTx`). Las
   *  demás se calculan de otra cosa —`sinComprobante` mira si hay comprobante,
   *  `categoriaVacia` si hay categoría, `duplicado` compara con su gemelo—
   *  sobre `listTx(limit 200)`, que no filtra por revisado.
   *
   *  Lo probé con el arnés antes de creérmelo: con el botón puesto en
   *  `sinComprobante`, aprobar dejaba la lista en 5 alertas de 5. Un botón que
   *  no cambia nada visible es peor que no tenerlo — el usuario lo pulsa, no
   *  pasa nada, y vuelve a pulsarlo.
   *
   *  (Los botones de texto del iPad/Mac ofrecen «Aprobar» también en
   *  `sinComprobante`, con el mismo resultado invisible. Es un defecto suyo,
   *  anterior a esto, y no lo toco aquí: cambiar el flujo de aprobación del
   *  escritorio es otra decisión y no la que se pidió.) */
  const sePuedeAprobar = (a: Alerta) => !!a.tx && a.tipo === "pendiente";

  /** A dónde lleva TOCAR la fila en el teléfono, o null si no lleva a ningún
   *  sitio.
   *
   *  Hasta el 28 de agosto de 2026 esto era `a.tx ? editor : null`, y por eso
   *  DOS de las siete alertas no se podían tocar: «corte sin segunda firma» y
   *  «recurrente vencido» no tienen movimiento detrás. En el iPad las dos
   *  llevaban a algún sitio desde siempre —el panel les pone un botón que
   *  cruza a la pantalla donde se resuelven—; en el teléfono eran dos filas
   *  muertas, y una fila que no responde al toque se lee como una app rota,
   *  no como una fila informativa.
   *
   *  No hay destino que inventar: son los mismos dos que el iPad ya usa.
   *
   *    · Un corte sin firmar se firma en Depósitos, donde está su hoja, y de
   *      paso quien firma ve el corte entero antes de decidir.
   *    · Un recurrente vencido no tiene movimiento sobre el que actuar: lo
   *      que falta es GENERARLO, y eso vive en Ingresos o en Gastos según de
   *      cuál sea la serie.
   *
   *  Un miembro archivado sigue sin destino a propósito: su acción entera es
   *  el botón de restaurar que la propia fila lleva a la derecha. */
  function destinoDe(a: Alerta): (() => void) | null {
    if (a.tx) return () => onEditTx(a.tx!);
    if (a.tipo === "firmaPendiente" && a.corte) return () => { window.location.hash = "#/depositos"; };
    if (a.tipo === "recurrenteVencido") {
      const ruta = a.recurrente?.tipo === "gasto" ? "gastos" : "ingresos";
      return () => { window.location.hash = `#/${ruta}`; };
    }
    return null;
  }

  function accionesDe(a: Alerta): ReactNode {
    const tx = a.tx;
    const aprobar = tx && (
      <button type="button" className="btn primary" onClick={() => void handleReviewed(tx)}>
        <IconCheck size={14} strokeWidth={2.4} /> {t("bandeja.aprobar")}
      </button>
    );
    const editar = (etiqueta: string) => tx && (
      <button type="button" className="btn secondary" onClick={() => onEditTx(tx)}>
        <IconEdit size={14} strokeWidth={2} /> {etiqueta}
      </button>
    );
    const devolver = tx && (
      <button type="button" className="btn secondary al-devolver" onClick={() => void handleRechazado(tx)}>
        {t("bandeja.devolver")}
      </button>
    );

    if (a.tipo === "miembroArchivado" && a.miembro) {
      const m = a.miembro;
      return (
        <button type="button" className="btn primary" onClick={() => void handleRestore(m)}>
          <IconRefreshCw size={14} strokeWidth={2.2} /> {t("bandeja.restaurar")}
        </button>
      );
    }
    if (a.tipo === "firmaPendiente" && a.corte) {
      /* Como el recurrente vencido: aquí no hay nada que firmar, la hoja vive
         en el corte. El botón lleva ahí en vez de fingir una acción local —y
         de paso, quien firma ve el corte entero antes de decidir. */
      return (
        <a className="btn primary" href="#/depositos">
          {t("bandeja.irAlCorte")}
        </a>
      );
    }
    if (a.tipo === "recurrenteVencido") {
      /* Aquí no hay movimiento sobre el que actuar: lo que falta es
         generarlo, y eso vive en la pantalla de Ingresos/Gastos con su
         serie. El botón lleva ahí en vez de fingir una acción local. */
      return (
        <a className="btn primary" href={`#/${a.recurrente?.tipo === "gasto" ? "gastos" : "ingresos"}`}>
          {t("bandeja.verRecurrentes")}
        </a>
      );
    }
    if (a.tipo === "sinComprobante") {
      /* Aquí NO va «Aprobar», y se quitó el 28 de agosto de 2026 después de
         comprobar por qué no hacía nada.
         
         Esta alerta sale de `resto` —`recientes` MENOS los pendientes—, así
         que por construcción habla de un movimiento que YA está aprobado:
         `markTxReviewed` le escribiría 'aprobado' encima de 'aprobado'. Y
         aunque cambiara el estado, daría igual: la alerta no cuelga del
         estado, cuelga de `!tx.comprobante_path`. Mientras falte el
         comprobante vuelve a salir en el siguiente cálculo.
         
         O sea que el usuario pulsaba, la lista salía idéntica, y volvía a
         pulsar. La rama del móvil lo midió con su arnés: con cinco alertas de
         éstas, aprobar dejaba la lista en 5 de 5, y por eso no puso el botón
         en el teléfono. Esto lo retira también del iPad y del Mac.
         
         Lo que resuelve esta alerta ya estaba al lado y se llama «Adjuntar y
         aprobar»: lleva al formulario donde se sube el archivo, que es lo
         único que la apaga. */
      return (<>{editar(t("bandeja.adjuntarYAprobar"))}{devolver}</>);
    }
    if (a.tipo === "categoriaVacia") return (<>{editar(t("bandeja.asignarCategoria"))}{devolver}</>);
    if (a.tipo === "miembroSinVincular") return (<>{editar(t("bandeja.vincularMiembro"))}{devolver}</>);
    if (a.tipo === "duplicado") return (<>{editar(t("common.editar"))}{devolver}</>);
    return (<>{aprobar}{editar(t("common.editar"))}{devolver}</>);
  }

  /** La inicial del círculo de la fila: la letra del tipo, como el diseño. */
  const inicialDe = (tipo: TipoAlerta) => t(`bandeja.inicial_${tipo}`);

  /** Lo que va bajo el titular de la fila: de qué objeto habla la alerta. */
  function subDeAlerta(a: Alerta): string {
    if (a.tx) {
      const cat = categoriaInfo(a.tx.tipo, a.tx.categoria);
      return [a.tx.concepto, cat.nombre, fmtMoney(a.tx.monto)].filter(Boolean).join(" · ");
    }
    if (a.miembro) return a.miembro.email ?? a.miembro.rfc ?? t("bandeja.sinCorreoRegistrado");
    if (a.recurrente) {
      return [a.recurrente.concepto, t("bandeja.mesesSinGenerar", { count: a.meses?.length ?? 0 })]
        .filter(Boolean).join(" · ");
    }
    if (a.corte) return [a.corte.nombre, fmtFechaCorta(a.corte.fecha)].filter(Boolean).join(" · ");
    return "";
  }

  async function handleRechazado(tx: Tx) {
    setSel(null);
    setSelAl(null);
    await markTxRejected(tx.id, church.id);
    showToast(t("toast.movimientoDevuelto"));
    playSound("guardado");
    onChanged();
  }

  /** "Aprobar todo" del handoff: solo sobre lo que de verdad se aprueba —los
   *  movimientos en estado pendiente—. Las otras cuatro alertas no son cosas
   *  que se aprueben (un duplicado no se "aprueba", se decide), así que el
   *  botón no las toca ni finge haberlas resuelto. */
  async function handleAprobarTodo() {
    const porAprobar = alertas.filter((a) => a.tipo === "pendiente" && a.tx).map((a) => a.tx!);
    if (porAprobar.length === 0) return;
    setSel(null);
    setSelAl(null);
    for (const tx of porAprobar) await markTxReviewed(tx.id, church.id);
    showToast(t("bandeja.aprobadosTodos", { count: porAprobar.length }));
    playSound("guardado");
    onChanged();
  }
  const [previewSel, setPreviewSel] = useState<string | null>(null);

  async function handleReviewed(tx: Tx) {
    // Resuelto el asunto, deja de estar en la bandeja: el panel se cierra.
    setSel((s) => (s?.tipo === "tx" && s.id === tx.id ? null : s));
    await markTxReviewed(tx.id, church.id);
    showToast(t("toast.marcadoRevisado"));
    playSound("guardado");
    onChanged();
  }

  async function handleRestore(m: Member) {
    setSel((s) => (s?.tipo === "miembro" && s.id === m.id ? null : s));
    await restoreMember(m.id, church.id);
    showToast(t("toast.miembroRestaurado"));
    playSound("guardado");
    onChanged();
  }

  /* Lo que la pantalla dice que hay tiene que ser lo que la lista enseña.
     Antes `total` sumaba pendientes + archivados, que son DOS de las siete
     reglas: con doce asuntos en la lista y ningún movimiento en estado
     pendiente, la cabecera decía "No tienes pendientes" encima de una lista
     llena. Ahora cuenta alertas, que es la unidad de esta pantalla. */
  const total = alertas.length;

  /* Pie de ventana (solo Mac): el mismo par que ya llevaba `page-sub`, que
     aquí sí cabe entero. */
  useBarraEstado(total === 0
    ? t("bandeja.sinPendientes")
    : `${t("bandeja.porRevisar", { count: total })} · ${t("bandeja.archivados", { count: archivados.length })}`);
  const totalPagPendientes = Math.max(1, Math.ceil(pendientes.length / PAGE_SIZE));
  const totalPagArchivados = Math.max(1, Math.ceil(archivados.length / PAGE_SIZE));
  const paginaPendientes = pendientes.slice((pagPendientes - 1) * PAGE_SIZE, pagPendientes * PAGE_SIZE);
  const paginaArchivados = archivados.slice((pagArchivados - 1) * PAGE_SIZE, pagArchivados * PAGE_SIZE);

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {enIPhone ? null : (
          /* En el teléfono NO se pinta `.page-title`, y a diferencia de Inicio
             aquí sí es lo correcto: Por revisar es una sección de Tesorería,
             así que lleva el carrusel fijo justo encima diciendo "Por
             revisar" en su píldora. Un Large Title debajo de esa píldora se
             lee como un eco, no como un título — se probó en una captura de
             393px y es exactamente lo que parecía.
             (Inicio sí lo lleva porque no pertenece a ningún área y por tanto
             no tiene carrusel: ahí la barra fija se quedaba muda al
             desplazar.)
             La maqueta pone el título ENCIMA del carrusel, que resuelve las
             dos cosas a la vez; mudar el carrusel al flujo del contenido es
             un cambio de la cáscara —`--carrusel-h`, el `padding-top` de
             `.main`, el arrastre a la pantalla vecina— y no entra aquí. */
          <div>
            <div className="page-title">{t("bandeja.titulo")}</div>
            <div className="page-sub">
              {total === 0
                ? t("bandeja.sinPendientes")
                : `${t("bandeja.porRevisar", { count: total })} · ${t("bandeja.archivados", { count: archivados.length })}`}
            </div>
          </div>
        )}
        {/* "Aprobar todo" en la barra fija, la esquina donde iOS pone la
            acción de la pantalla. Hasta ahora esta acción SOLO existía en el
            maestro-detalle del iPad (`al-cabecera`, más abajo): en el teléfono
            había que aprobar de una en una. Sale únicamente cuando hay algo
            que aprobar, como el chip del iPad. */}
        {enIPhone && conteos.get("pendiente") ? (
          <button
            type="button"
            className="ios-nav-btn"
            onClick={() => void handleAprobarTodo()}
          >
            {t("bandeja.aprobarTodo")}
          </button>
        ) : null}
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          La columna maestra junta los dos grupos que la página ya tenía
          —movimientos pendientes y miembros archivados— en una sola lista
          con dos cabeceras. El panel reutiliza los MISMOS componentes de
          Ingresos y Aportantes, cambiándoles solo los botones: aquí un
          movimiento se mira para aprobarlo, no para borrarlo.

          La taxonomía de alertas del handoff SÍ se calcula: las siete reglas
          viven en `services/bandeja/alertas.ts` y salen de columnas que ya
          existían —estado, comprobante_path, categoria, member_id, las
          fechas de los recurrentes—. Cuando se descartó (handoff 1) fue por
          no haber mirado el esquema, no porque faltara el dato. */}
      {partido ? (
        <div className={`md-split md-bandeja${sel ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                {/* La cabecera del handoff: cuántas hay y "Aprobar todo". */}
                <div className="al-cabecera">
                  <span className="al-conteo">{t("bandeja.nPendientes", { count: alertas.length })}</span>
                  {conteos.get("pendiente") ? (
                    <button type="button" className="chip" onClick={() => void handleAprobarTodo()}>
                      {t("bandeja.aprobarTodo")}
                    </button>
                  ) : null}
                </div>
                {/* Los chips por tipo. Solo salen los tipos que HAY: una
                    bandeja limpia no tiene por qué enseñar cinco filtros que
                    no encuentran nada. */}
                {conteos.size > 1 && (
                  <div className="md-chips al-chips">
                    <button
                      type="button"
                      className={`chip${filtroTipo === null ? " active" : ""}`}
                      onClick={() => setFiltroTipo(null)}
                    >
                      {t("common.todos")} <span className="count">{alertas.length}</span>
                    </button>
                    {[...conteos.entries()].map(([tipo, n]) => (
                      <button
                        key={tipo}
                        type="button"
                        className={`chip${filtroTipo === tipo ? " active" : ""}`}
                        onClick={() => setFiltroTipo(filtroTipo === tipo ? null : tipo)}
                      >
                        {t(`bandeja.alerta_${tipo}`)} <span className="count">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="md-filas">
                  {alertas.length === 0 ? (
                    <div className="md-filas-vacio">
                      <EmptyState pagina titulo={t("bandeja.sinPendientes")} sub={t("bandeja.emptySub")} />
                    </div>
                  ) : visiblesAl.length === 0 ? (
                    <div className="md-filas-vacio">{t("bandeja.sinDeEseTipo")}</div>
                  ) : (
                    visiblesAl.map((a) => (
                      <div
                        key={a.clave}
                        className={`md-fila al-fila${selAl === a.clave ? " sel" : ""}`}
                        onClick={() => {
                          setSelAl(a.clave);
                          /* La selección vieja se mantiene en paralelo porque
                             el panel reutiliza `DetalleMovimiento` y
                             `DetalleMiembro`, que reciben el objeto. */
                          if (a.tx) setSel({ tipo: "tx", id: a.tx.id });
                          else if (a.miembro) setSel({ tipo: "miembro", id: a.miembro.id });
                          else setSel(null);
                        }}
                      >
                        {/* El círculo de 34px del diseño con la inicial del
                            tipo. El de "pendiente" va en ámbar —es el que
                            pide decisión— y el resto en gris. */}
                        <span className={`al-marca${a.tipo === "pendiente" ? " urgente" : ""}`} aria-hidden="true">
                          {a.tipo === "pendiente" ? "!" : inicialDe(a.tipo)}
                        </span>
                        <span className="md-fila-textos">
                          <span className="md-fila-titular">
                            <span className="truncate">{t(`bandeja.alerta_${a.tipo}`)}</span>
                          </span>
                          <span className="md-fila-sub truncate">{subDeAlerta(a)}</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("bandeja.porRevisar", { count: alertas.length })}</span>
                  <span className="md-pie-total">{t("bandeja.archivados", { count: archivados.length })}</span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const a = angosto ? alertaSel ?? ultimaAl.current : alertaSel;
                  if (a) {
                    /* La cabecera del handoff —pastilla, titular, párrafo y
                       acciones— va ARRIBA, y debajo la ficha del objeto, que
                       ya la pintan bien `DetalleMovimiento` / `DetalleMiembro`.
                       No se duplica nada: cambia el encabezado según por qué
                       el asunto llegó a la bandeja. */
                    const cab = (
                      <PanelAlerta
                        alerta={a}
                        umbral={umbralIglesia}
                        moneda={church.moneda}
                        acciones={accionesDe(a)}
                      />
                    );
                    if (a.tx) {
                      return (
                        <div className="al-panel">
                          {cab}
                          <DetalleMovimiento
                            tx={a.tx}
                            tituloLista={t("bandeja.titulo")}
                            onVolver={() => { setSel(null); setSelAl(null); }}
                            onEditar={onEditTx}
                            onEliminar={() => {}}
                            onVerComprobante={setPreviewSel}
                            acciones={<></>}
                          />
                        </div>
                      );
                    }
                    if (a.miembro) {
                      return (
                        <div className="al-panel">
                          {cab}
                          <DetalleMiembro
                            church={church}
                            member={a.miembro}
                            tituloLista={t("bandeja.titulo")}
                            onVolver={() => { setSel(null); setSelAl(null); }}
                            onEditar={() => {}}
                            onEliminar={() => {}}
                            acciones={<></>}
                          />
                        </div>
                      );
                    }
                    /* Un recurrente vencido no tiene ficha que enseñar: el
                       movimiento todavía no existe, que es justo la alerta. */
                    return <div className="al-panel">{cab}</div>;
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{alertas.length === 0 ? t("bandeja.todoAlDia") : t("bandeja.eligeAsunto")}</h3>
                        <p>{alertas.length === 0 ? t("bandeja.emptySub") : t("bandeja.eligeAsuntoSub")}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : enIPhone ? (
        /* ---- Las siete alertas, en el teléfono ----
           Hasta aquí la pantalla enseñaba en el teléfono sus dos grupos
           viejos —movimientos pendientes y miembros archivados— mientras las
           SIETE alertas de `calcularAlertas` solo se pintaban en el iPad. No
           faltaba el dato: faltaba la pantalla. Los dos grupos viejos son dos
           de los siete tipos (`pendiente` y `miembroArchivado`), así que esta
           lista los contiene: no se pierde nada y aparecen las otras cinco.

           Los dos encabezados y sus pies son los del handoff. El reparto lo
           hace `grupoDeAlerta`, que vive junto a los tipos porque es de ellos:
           una DECISIÓN es una bifurcación que la app no puede resolver sola,
           un ARREGLO es un hueco que sí se sabe cómo llenar.

           Adónde lleva cada fila: si la alerta habla de un movimiento, al
           editor —que es donde se resuelve—; si habla de un miembro
           archivado, a su acción de restaurar, como hasta ahora. Las dos que
           hablan de un corte sin firma o de un recurrente vencido NO llevan a
           ningún sitio en el teléfono: el iPad las abre en su panel y aquí no
           hay panel. Se quedan como fila informativa, sin galón y sin toque,
           en vez de fingir un destino que no existe. Cuando el otro chat les
           dé pantalla, lo único que cambia aquí es el `onClick`. */
        <div className="content">
          {loading ? (
            <LoadingState />
          ) : alertas.length === 0 ? (
            <EmptyState pagina titulo={t("bandeja.sinPendientes")} sub={t("bandeja.emptySub")} />
          ) : (
            (["decision", "arreglo"] as const).map((grupo) => {
              const delGrupo = alertas.filter((a) => grupoDeAlerta(a.tipo) === grupo);
              if (delGrupo.length === 0) return null;
              return (
                <div key={grupo}>
                  <SeccionIOS titulo={t(grupo === "decision" ? "bandeja.grupoDecision" : "bandeja.grupoArreglo")}>
                    <div className="ios-listcard">
                      {delGrupo.map((a) => (
                        <FilaAlertaIOS
                          key={a.clave}
                          a={a}
                          inicial={inicialDe(a.tipo)}
                          sub={subDeAlerta(a)}
                          destino={destinoDe(a)}
                          puedeAprobar={sePuedeAprobar(a)}
                          onAprobar={() => void handleReviewed(a.tx!)}
                          onDevolver={() => void handleRechazado(a.tx!)}
                          onRestaurar={() => void handleRestore(a.miembro!)}
                        />
                      ))}
                    </div>
                  </SeccionIOS>
                  <p className="ios-section-footer">
                    {t(grupo === "decision" ? "bandeja.pieDecision" : "bandeja.pieArreglo")}
                  </p>
                </div>
              );
            })
          )}
        </div>
      ) : (
      /* Mac y ventana angosta que no es un iPhone. Este bloque ya no tiene
         ninguna rama de teléfono: el iPhone sale por la de arriba, con las
         siete alertas. Lo que había aquí —dos listas `.ios-listcard` con su
         paginación— quedó inalcanzable al añadirla y se borró en la pasada
         siguiente, no en la misma, para no esconder un borrado de cien líneas
         dentro de un rediseño. */
      <div className="content">
        {loading ? (
          <LoadingState />
        ) : total === 0 ? (
          <EmptyState
            pagina
            titulo={t("bandeja.sinPendientes")}
            sub={t("bandeja.emptySub")}
          />
        ) : (
          <>
            {/* El dato que llevaba `page-sub` ("N por revisar · M archivados")
                no se pierde al ocultar la cabecera: baja al encabezado de
                cada bloque, donde además dice a qué lista pertenece cada
                número. Se reutiliza la misma etiqueta de sección que Mac ya
                usa en vez de inventar una llave nueva. */}
            <div className="inbox-section-label">{t("bandeja.pendientesRevision")}</div>
            {pendientes.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: "calc(13px * var(--fs-escala))", marginBottom: 20 }}>
                {t("bandeja.noMovsRevisar")}
              </div>
            ) : (
              <>
                <div className="inbox-list" style={{ marginBottom: 8 }}>
                  {paginaPendientes.map((tx) => {
                    const cat = categoriaInfo(tx.tipo, tx.categoria);
                    const f = fmtFecha(tx.fecha);
                    return (
                      <div className="inbox-item" key={tx.id}>
                        <div className="inbox-icon warn">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </div>
                        <div className="inbox-body">
                          <div className="inbox-title-row">
                            <span className="inbox-type-tag warn">
                              {tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto")} · {cat.nombre}
                            </span>
                            <span className="inbox-time">{f.dia} {f.mesAnio} · {f.hora}</span>
                          </div>
                          <div className="inbox-desc"><strong>{tx.concepto}</strong></div>
                          {(tx.member_nombre || tx.beneficiario || tx.detalle) && (
                            <div style={{ marginTop: 4, fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                              {tx.member_nombre ?? tx.beneficiario ?? tx.detalle}
                            </div>
                          )}
                        </div>
                        <div className="inbox-side">
                          <div className="inbox-amount">
                            {tx.tipo === "ingreso" ? "+" : "−"}
                            {fmtMoney(tx.monto).replace("−", "")}
                            <span className="cur">{tx.moneda}</span>
                          </div>
                          <div className="inbox-actions">
                            <button className="btn secondary sm" onClick={() => onEditTx(tx)}>{t("common.editar")}</button>
                            <button className="btn primary sm" onClick={() => handleReviewed(tx)}>{t("bandeja.marcarRevisado")}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination page={pagPendientes} totalPages={totalPagPendientes} onPageChange={setPagPendientes} />
              </>
            )}

            <div className="inbox-section-label" style={{ marginTop: 20 }}>{t("bandeja.miembrosArchivadosLabel")}</div>
            {archivados.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: "calc(13px * var(--fs-escala))" }}>
                {t("bandeja.noMiembrosArchivados")}
              </div>
            ) : (
              <>
                <div className="inbox-list">
                  {paginaArchivados.map((m) => (
                    <div className="inbox-item resolved" key={m.id}>
                      <div className="inbox-icon done">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="inbox-body">
                        <div className="inbox-title-row">
                          <span className="inbox-type-tag done">{t("bandeja.archivado")}</span>
                        </div>
                        <div className="inbox-desc"><strong>{m.nombre}</strong></div>
                        <div style={{ marginTop: 4, fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
                          {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                        </div>
                      </div>
                      <div className="inbox-side">
                        <div className="inbox-actions">
                          <button className="btn secondary sm" onClick={() => handleRestore(m)}>{t("bandeja.restaurar")}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={pagArchivados} totalPages={totalPagArchivados} onPageChange={setPagArchivados} />
              </>
            )}
          </>
        )}
      </div>
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}
    </>
  );
}
