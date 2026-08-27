import { useState } from "react";
import { useTranslation } from "react-i18next";
import { categoriaInfo, deleteTx, fmtFecha, fmtFechaCorta, fmtMoney, undeleteTx, metodoAbr, metodoNombre, METODOS_PAGO, type Tx } from "../db";
import { sumar } from "../dinero";
import { tonoCategoria } from "../colores";
import { agruparPorDia } from "./ios/agrupado";
import SeccionIOS from "./ios/SeccionIOS";
import { IconArrowDown, IconArrowUp, IconClip, IconEdit, IconRepeat } from "../icons";
import { esIPhone, esMac } from "../movil";
import RowMenu from "./RowMenu";
import { hayFilaAbierta } from "./useFilaDeslizable";
import { useContextMenu, type CtxMenuItem } from "./ContextMenu";
import ComprobantePreview from "./ComprobantePreview";
import { showToast } from "../toast";
import { playSound } from "../sound";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  tipo: "ingreso" | "gasto";
  txs: Tx[];
  onEdit: (tx: Tx) => void;
  /** Tocar la fila abre el movimiento (maqueta T4). Solo lo pasa el teléfono:
   *  en Mac la fila se opera con el menú y en el iPad el detalle vive en la
   *  columna de al lado, así que quien no lo pasa deja la fila como estaba. */
  onAbrir?: (tx: Tx) => void;
  onChanged: () => void;
  /** Permiso de la iglesia (migración 49). Cuando está apagado, Eliminar no
   *  se ofrece —ni en el menú, ni en el deslizamiento, ni con clic derecho—.
   *  `RowMenu` ya sabía vivir sin borrado (Informes de membresía), así que
   *  basta con no darle las dos funciones. */
  puedeEliminar?: boolean;
}

/* Ingresos y Gastos son páginas gemelas y comparten reparto: el concepto ocupa
   la columna elástica y la categoría una fija. Antes iban al revés en Gastos,
   así que las dos tablas se leían distinto sin motivo. */
const COLS_INGRESO = "110px 1fr 140px 170px 150px 168px 110px 104px";
const COLS_GASTO = COLS_INGRESO;

/* En el Mac, columnas más estrechas — y esto NO es cosmético.
   Las de arriba suman 952 px de ancho FIJO. Medido con Playwright: en una
   ventana de 1240 px la tabla mide 954, así que a la columna elástica —el
   concepto, que es lo que identifica la fila— le quedan 2 px, y el texto se
   dibuja con CERO. La app te decía que hubo un gasto de $3,450 y nunca de
   qué. Solo se recupera por encima de ~1400 px de ventana.
   Es el mismo fallo que ya se corrigió en la Agenda del iPhone, donde el
   nombre del evento salía a 0 px.
   Con este reparto (780 px fijos) el concepto se queda en 176 px a 1240.
   El mínimo de 160 px es el que impide que el fallo vuelva en ventanas más
   chicas: por debajo de ~1210 px ya no hay holgura que repartir, y sin suelo
   la columna volvería a cerrarse a cero. Con él, la tabla se desplaza en
   horizontal —que para eso lleva `overflow-x: auto` desde siempre— en vez de
   esconder el dato. 160 y no 180 porque a 1240, que es una ventana muy
   corriente, 176 px de holgura entran justos y así no aparece una barra de
   desplazamiento que no hace falta. */
/* 104 y no 92 en la fecha: "Aug 15, 2026" mide 78 px con el peso 600 de esa
   celda, y con los 8+8 de relleno pedía 94 — o sea que la columna se quedaba
   DOS píxeles corta y la fecha partía en dos líneas. Eso hacía dos cosas a la
   vez: apretaba el texto contra los bordes de la fila y, en las filas que
   además traen hora, la estiraba a 49 px mientras las demás medían 34. Con
   104 la fecha entra de una línea en los dos idiomas ("30 sept 2026" mide 76)
   y TODAS las filas miden lo mismo. Los 12 px salen de la columna elástica:
   medido, a 1240 px de ventana pasa de 208 a 194, y a 1100 —el mínimo de la
   ventana— toca su suelo de 160 exacto, que es el que impide que el concepto
   vuelva a cerrarse a cero. */
const COLS_MAC = "104px minmax(160px, 1fr) 124px 148px 126px 128px 86px 76px";

export default function TxTable({ tipo, txs, onEdit, onAbrir, onChanged, puedeEliminar = true }: Props) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<Tx | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { abrirMenu, menu } = useContextMenu();
  const esIngreso = tipo === "ingreso";
  const enIPhone = esIPhone();
  const cols = esMac() ? COLS_MAC : esIngreso ? COLS_INGRESO : COLS_GASTO;

  function itemsDe(tx: Tx): CtxMenuItem[] {
    const items: CtxMenuItem[] = [{ label: t("common.editar"), onClick: () => onEdit(tx) }];
    if (tx.comprobante_path) {
      items.push({ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) });
    }
    if (puedeEliminar) {
      items.push({ label: t("common.eliminar"), danger: true, onClick: () => setPendingDelete(tx) });
    }
    return items;
  }

  /** Borra ya, con "Deshacer". Lo llaman el diálogo de confirmación y el
   *  deslizamiento completo de la fila en el móvil (ver `onBorrarDirecto`
   *  en RowMenu): ese gesto no pasa por diálogo a propósito. */
  async function borrarConDeshacer(borrado: Tx) {
    await deleteTx(borrado.id, borrado.church_id);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.movimientoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        // Borrado suave: se restaura la MISMA fila (mismo uid), no una nueva.
        await undeleteTx(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const borrado = pendingDelete;
    setPendingDelete(null);
    await borrarConDeshacer(borrado);
  }

  /* Una fila, con todo lo que ya sabía hacer: menú contextual, deslizar para
     borrar, comprobante y el reparto en celdas del escritorio. Sale del `map`
     y pasa a ser una función porque en el teléfono el rediseño reparte las
     filas en SECCIONES por día —un `map` por sección— y si no, habría dos
     copias de ciento ochenta líneas de fila que habría que cambiar a la par.
     Ni una línea de dentro cambia. */
  function fila(tx: Tx) {
      const cat = categoriaInfo(tx.tipo, tx.categoria);
      const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
      const persona = tx.member_nombre ?? tx.beneficiario ?? "—";
      const hora = fmtFecha(tx.fecha).hora;

      const metodoTexto = metodo ? metodoNombre(metodo.id) : tx.metodo_pago;
      /* En el teléfono el titular de la fila pasa a ser la PERSONA
         (miembro o beneficiario), no el concepto: en altas rápidas el
         concepto suele ser literalmente el nombre de la categoría
         ("Tithe"/"Diezmo"), que ya se lee en la secundaria — repetirlo
         en negrita no informa nada, y de paso enterraba el nombre (el
         dato que de verdad identifica la fila) al final de una línea
         que se corta con "…" antes de llegar a él. En Mac no cambia:
         concepto y persona ya viven en columnas separadas, sin eco. */
      const personaTitular = persona !== "—" ? persona : null;
      const conceptoRedundante = tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
      /* En el teléfono la fecha SALE de la secundaria: desde el rediseño la
         fila vive dentro de una sección que ya dice de qué día es, y repetir
         "17 ago 2026" en cada fila de la sección "Hoy" solo gastaba el ancho
         que necesita el nombre. En el iPad, que no agrupa, se queda. */
      const secundariaMovil = [
        enIPhone ? null : fmtFechaCorta(tx.fecha),
        personaTitular && !conceptoRedundante ? tx.concepto : null,
        cat.nombre,
        metodoTexto,
      ].filter(Boolean).join(" · ");

      if (enIPhone) {
        return (
          <div
            className={`ios-txrow${onAbrir ? " ios-txrow--clickable" : ""}`}
            data-fila
            key={tx.id}
            role={onAbrir ? "button" : undefined}
            tabIndex={onAbrir ? 0 : undefined}
            onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}
            onClick={onAbrir
              ? (e) => {
                  /* Con una fila deslizada abierta, el toque solo la cierra
                     —lo hace el propio gesto— y NO abre el movimiento: si
                     abriera, descubrir «Eliminar» y arrepentirse tocando
                     fuera acabaría en otra pantalla.
                     Y los controles de la derecha (el clip del comprobante,
                     los tres puntitos) tienen lo suyo que hacer: un clic en
                     ellos no es un clic en la fila. */
                  if (hayFilaAbierta()) return;
                  if ((e.target as HTMLElement).closest(".row-icon-btn, .more, .row-menu-dropdown, .fila-acciones")) return;
                  onAbrir(tx);
                }
              : undefined}
            onKeyDown={onAbrir
              ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(tx); } }
              : undefined}
          >
            <span className={`tx-icon ${tx.tipo === "ingreso" ? "income" : "expense"}`} aria-hidden="true">
              {tx.tipo === "ingreso" ? <IconArrowUp size={13} strokeWidth={2.2} /> : <IconArrowDown size={13} strokeWidth={2.2} />}
            </span>
            <div className="ios-txrow-main">
              <div className="ios-txrow-title" title={personaTitular ?? tx.concepto}>
                {tx.recurrente_id != null && (
                  <span style={{ color: "var(--text-3)", flexShrink: 0, display: "inline-flex", marginRight: 4 }} title={t("recurrente.marcaEnTabla")}>
                    <IconRepeat size={12} strokeWidth={2.2} />
                  </span>
                )}
                <span className="truncate">{personaTitular ?? tx.concepto}</span>
                {tx.estado === "pendiente" && <span className="tx-punto-pendiente" title={t("tx.pendiente")} />}
              </div>
              {/* El punto de color de la categoría delante de la secundaria.
                  En la tabla la categoría es un chip `.tag`; en 393px ese chip
                  se comía la mitad del ancho de la fila, así que en el teléfono
                  el color pasa a un punto de 7px y el nombre viaja como texto
                  dentro de la propia secundaria. */}
              <div className="tx-secundaria-movil" title={secundariaMovil}>
                <span className="ios-punto" style={{ background: tonoCategoria(cat.id) }} aria-hidden="true" />
                {secundariaMovil}
              </div>
            </div>
            <div className="ios-txrow-trailing">
              {tx.comprobante_path && (
                <span className="row-icon-btn" title={t("tx.verComprobante")} onClick={() => setPreview(tx.comprobante_path!)}>
                  <IconClip size={13} strokeWidth={2} />
                </span>
              )}
              <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                {/* En el teléfono el ingreso va sin el «+» delante: la maqueta
                    escribe «$5,125.00» a secas y reserva el signo —y el rojo— para
                    lo que sale. Con el importe ya en el color del texto (bloque 17
                    de styles.css), ese «+» era la última marca que quedaba de un
                    semáforo que el rediseño quitó. */}
                {tx.tipo === "ingreso" ? "" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                <span className="cur">{tx.moneda}</span>
              </span>
            </div>
            <RowMenu
              onEdit={() => onEdit(tx)}
              onDelete={puedeEliminar ? () => setPendingDelete(tx) : undefined}
              onBorrarDirecto={puedeEliminar ? () => void borrarConDeshacer(tx) : undefined}
              extraItems={tx.comprobante_path
                ? [{ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) }]
                : undefined}
            />
          </div>
        );
      }

      const celdaConcepto = (
        <div className="td">
          <div className="truncate" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }} title={personaTitular ?? tx.concepto}>
            <span
              className={`tx-icon tx-concepto-icono ${tx.tipo === "ingreso" ? "income" : "expense"}`}
              aria-hidden="true"
            >
              {tx.tipo === "ingreso" ? <IconArrowUp size={10} strokeWidth={2.2} /> : <IconArrowDown size={10} strokeWidth={2.2} />}
            </span>
            {tx.recurrente_id != null && (
              <span style={{ color: "var(--text-3)", flexShrink: 0, display: "inline-flex" }} title={t("recurrente.marcaEnTabla")}>
                <IconRepeat size={11} strokeWidth={2.2} />
              </span>
            )}
            <span className="truncate solo-escritorio">{tx.concepto}</span>
            <span className="truncate solo-movil">{personaTitular ?? tx.concepto}</span>
            {tx.estado === "pendiente" && <span className="tx-punto-pendiente" title={t("tx.pendiente")} />}
          </div>
          {tx.detalle && (
            <div className="truncate solo-escritorio" style={{ fontSize: "calc(11.5px * var(--fs-escala))", color: "var(--text-3)" }} title={tx.detalle}>
              {tx.detalle}
            </div>
          )}
          <div className="tx-secundaria-movil solo-movil" title={secundariaMovil}>{secundariaMovil}</div>
        </div>
      );
      const celdaFecha = (
        <div className="td">
          <div className="tx-fecha" style={{ fontWeight: 600 }}>{fmtFechaCorta(tx.fecha)}</div>
          <div className="solo-escritorio" style={{ fontSize: "calc(11.5px * var(--fs-escala))", color: "var(--text-3)" }}>{hora}</div>
        </div>
      );
      const celdaCategoria = (
        <div className="td">
          <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
        </div>
      );

      return (
        <div className="tr" data-fila key={tx.id} style={{ gridTemplateColumns: cols }} onContextMenu={(e) => abrirMenu(e, itemsDe(tx))}>
          {celdaFecha}
          {celdaConcepto}
          {celdaCategoria}
          <div className="td">
            {tx.member_nombre ? (
              <div className="person" style={{ minWidth: 0 }}>
                <div className="mini-avatar c1" style={{ width: 26, height: 26, fontSize: "calc(10px * var(--fs-escala))" }}>
                  {tx.member_nombre.slice(0, 2).toUpperCase()}
                </div>
                <span className="truncate" style={{ fontSize: "calc(12.5px * var(--fs-escala))", minWidth: 0, flex: "1 1 auto" }} title={tx.member_nombre}>
                  {tx.member_nombre}
                </span>
              </div>
            ) : (
              <span className="truncate" style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }} title={persona}>
                {persona}
              </span>
            )}
          </div>
          <div className="td">
            <span className="method" style={{ justifySelf: "start" }} title={metodo ? metodoNombre(metodo.id) : tx.metodo_pago}>
              {metodo && <span className={`m-badge ${metodo.id}`}>{metodoAbr(metodo.id)}</span>}
              <span className="truncate" style={{ display: "inline-block" }}>{metodo ? metodoNombre(metodo.id) : tx.metodo_pago}</span>
            </span>
          </div>
          <div className="td td-monto" style={{ textAlign: "right" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
              {/* En el teléfono esta flecha se duplica junto al concepto
                  (arriba, .tx-concepto-icono) y esta copia se oculta: la
                  columna de importe queda con cifras puras, alineadas a
                  la derecha, sin nada que le reste ancho útil. En Mac se
                  queda igual que siempre, junto al importe. */}
              <span
                className={`tx-icon solo-escritorio ${tx.tipo === "ingreso" ? "income" : "expense"}`}
                style={{ width: 20, height: 20 }}
              >
                {tx.tipo === "ingreso" ? <IconArrowUp size={10} strokeWidth={2.2} /> : <IconArrowDown size={10} strokeWidth={2.2} />}
              </span>
              <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                <span className="cur">{tx.moneda}</span>
              </span>
            </span>
          </div>
          <div className="td">
            <span className={`status-pill ${tx.estado}`}>
              {tx.estado === "aprobado" ? t("tx.aprobado") : tx.estado === "pendiente" ? t("tx.pendiente") : t("tx.rechazado")}
            </span>
          </div>
          <div className="td td-acciones">
            <span className="row-actions">
              {tx.comprobante_path && (
                <span className="row-icon-btn" title={t("tx.verComprobante")} onClick={() => setPreview(tx.comprobante_path!)}>
                  <IconClip size={13} strokeWidth={2} />
                </span>
              )}
              <span className="row-icon-btn solo-escritorio" title={t("common.editar")} onClick={() => onEdit(tx)}>
                <IconEdit size={13} strokeWidth={2} />
              </span>
            </span>
            <RowMenu
              onEdit={() => onEdit(tx)}
              onDelete={puedeEliminar ? () => setPendingDelete(tx) : undefined}
              onBorrarDirecto={puedeEliminar ? () => void borrarConDeshacer(tx) : undefined}
              extraItems={tx.comprobante_path
                ? [{ label: t("tx.verComprobante"), onClick: () => setPreview(tx.comprobante_path!) }]
                : undefined}
            />
          </div>
        </div>
      );
  }

  /* Las secciones por día del teléfono (rediseño de iOS 26, GUIA §4). En el
     escritorio la tabla es una sola rejilla con su cabecera de columnas y su
     paginador; en el teléfono una tabla no cabe, así que la lista se corta por
     día y cada corte lleva en su encabezado el TOTAL de ese día — que es el
     dato que se busca al abrir Ingresos ("¿cuánto entró hoy?") y que la tabla
     nunca dio sin sumar a mano.

     Solo se agrupa aquí, en el teléfono; `txs` llega ya ordenado por fecha
     descendente desde la consulta de la página, así que `agruparPorDia`
     —que respeta el orden de entrada— no reordena nada. */
  const secciones = enIPhone ? agruparPorDia(txs, (tx) => tx.fecha) : [];

  return (
    <>
      {enIPhone ? (
        secciones.map((seccion) => (
          <SeccionIOS
            key={seccion.clave}
            titulo={seccion.etiqueta}
            total={fmtMoney(sumar(...seccion.items.map((tx) => tx.monto)))}
          >
            {seccion.items.map(fila)}
          </SeccionIOS>
        ))
      ) : (
        <div className="data-table roomy tabla-tx">
          <div className="thead" style={{ gridTemplateColumns: cols }}>
            <div className="th">{t("tx.colFecha")}</div>
            <div className="th">{esIngreso ? t("tx.colConcepto") : t("tx.colDescripcion")}</div>
            <div className="th">{t("tx.colCategoria")}</div>
            <div className="th">{esIngreso ? t("tx.colMiembro") : t("tx.colBeneficiario")}</div>
            <div className="th">{t("tx.colMetodo")}</div>
            <div className="th" style={{ textAlign: "right" }}>{t("tx.colMonto")}</div>
            <div className="th">{t("tx.colEstado")}</div>
            <div className="th"></div>
          </div>
          {txs.map(fila)}
        </div>
      )}


      {menu}
      {preview && <ComprobantePreview path={preview} onClose={() => setPreview(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title={t("tx.eliminarTitulo")}
          message={t("tx.eliminarMensaje", { concepto: pendingDelete.concepto, monto: `${fmtMoney(pendingDelete.monto)} ${pendingDelete.moneda}` })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
