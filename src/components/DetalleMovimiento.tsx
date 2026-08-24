import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, fmtFecha, fmtFechaCorta, fmtMoney, metodoNombre, METODOS_PAGO, utcALocal, type Tx,
} from "../db";
import { IconChevronLeft, IconClip, IconEdit, IconRepeat, IconTrash } from "../icons";
import { ShareIcon } from "./icons/IOSIcons";

interface Props {
  tx: Tx;
  /** Título de la lista de la que se vino ("Ingresos"/"Gastos"): es el texto
   *  del botón de volver, como hace Mail con el buzón. El botón solo se pinta
   *  en el modo de empuje (iPad angosto); en columnas lo esconde el CSS. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (tx: Tx) => void;
  /** Opcional: sin permiso de borrado (migración 49) el botón no se pinta.
   *  Va como función ausente y no como bandera para que el compilador impida
   *  ofrecer el botón sin tener a quién llamar. */
  onEliminar?: (tx: Tx) => void;
  onVerComprobante: (path: string) => void;
  /** "Ver ficha" en la fila del aportante (diseño de iPad): salta a la ficha
   *  del miembro en Aportantes. Solo tiene sentido en ingresos con miembro
   *  vinculado; quien no lo pasa (la Bandeja) no pinta el enlace. */
  onVerFicha?: (memberId: number) => void;
  /** "Compartir" del handoff: entrega el movimiento por la hoja nativa. Quien
   *  no lo pasa (la Bandeja, donde se está revisando y no repartiendo) no
   *  pinta el botón. */
  onCompartir?: (tx: Tx) => void;
  /** Sustituye la fila de botones por otra. Lo usa la Bandeja, donde el
   *  mismo movimiento se mira para APROBARLO, no para editarlo o borrarlo:
   *  ahí las acciones son "Marcar revisado" y "Editar", y "Eliminar" no
   *  pinta nada. La ficha —importe, campos, comprobante— es la misma, que
   *  es justo el motivo de reutilizar este componente en vez de escribir un
   *  segundo panel que enseñe lo mismo con otro código. */
  acciones?: ReactNode;
}

/**
 * DetalleMovimiento — la columna derecha del maestro-detalle del iPad.
 *
 * Es la pantalla que en el Mac y el iPhone no existe: ahí tocar un movimiento
 * abre directamente el formulario de edición. En un iPad en horizontal hay
 * sitio para MIRAR antes de editar — el importe grande, la ficha de campos y
 * el comprobante — y editar pasa a ser un botón, no el único destino posible.
 *
 * Solo enseña datos que existen, y esa regla es la que decide qué parte del
 * "Rastro de auditoría" del handoff se construye y cuál no:
 *
 *   · **Creado** — `created_at`, columna real desde la migración 2. ✓
 *   · **Editado** — `updated_at`, real desde la 20; null en filas viejas, y
 *     entonces la línea no se pinta en vez de mentir con la fecha de alta. ✓
 *   · **Estado** — `estado` (aprobado / pendiente), real. ✓
 *   · **"por Iván García"** — NO. `transactions` no guarda quién registró:
 *     no hay columna de usuario. El handoff lo pide en dos sitios (aquí y en
 *     el pie de la cabecera) y necesita una migración; queda apuntado, no
 *     inventado. Ver docs/ipad-rediseno.md §15.
 *   · **"Depositado / incluido en el corte"** — NO. Los depósitos bancarios
 *     no están enlazados a los movimientos que los componen.
 */
export default function DetalleMovimiento({ tx, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante, onVerFicha, onCompartir, acciones }: Props) {
  const { t } = useTranslation();
  const esIngreso = tx.tipo === "ingreso";
  const cat = categoriaInfo(tx.tipo, tx.categoria);
  const metodo = METODOS_PAGO.find((m) => m.id === tx.metodo_pago);
  const metodoTexto = metodo ? metodoNombre(metodo.id) : tx.metodo_pago;
  const hora = fmtFecha(tx.fecha).hora;
  const persona = esIngreso ? tx.member_nombre ?? tx.beneficiario : tx.beneficiario;

  /* El titular del handoff: "Diezmo · María Hernández", el MISMO que arma la
     fila de la lista. Se calcula igual a propósito — si el panel titulara de
     otra forma, tocar una fila parecería abrir otra cosa. */
  const conceptoRedundante = tx.concepto.trim().toLowerCase() === cat.nombre.trim().toLowerCase();
  const titular = esIngreso
    ? persona ? `${cat.nombre} · ${persona}` : tx.concepto
    : conceptoRedundante ? cat.nombre : `${cat.nombre} · ${tx.concepto}`;

  /* El rastro de auditoría, solo con lo que la base guarda de verdad.
     `created_at` y `updated_at` los escribe SQLite con `datetime('now')`, o
     sea UTC y con segundos: `utcALocal` los pasa a hora local sin segundos —
     el mismo formato que la fecha del movimiento, dos líneas más arriba en
     este mismo panel. Sin esa vuelta, un gasto registrado a las 19:00 en
     México aparecía "registrado" al día siguiente.
     Y el "editado" solo sale si de verdad hubo edición: los dos sellos se
     comparan ya convertidos, al minuto. */
  const creado = utcALocal(tx.created_at);
  const editado = utcALocal(tx.updated_at);
  const sello = (iso: string) => {
    const h = fmtFecha(iso).hora;
    return fmtFechaCorta(iso) + (h ? `, ${h}` : "");
  };
  const rastro: { clave: string; titulo: string; detalle: string; tono: "ink" | "aviso" | "gris" }[] = [];
  if (creado) {
    rastro.push({ clave: "creado", tono: "ink", titulo: t("dm.rastroCreado"), detalle: sello(creado) });
  }
  if (editado && editado !== creado) {
    rastro.push({ clave: "editado", tono: "gris", titulo: t("dm.rastroEditado"), detalle: sello(editado) });
  }
  rastro.push({
    clave: "estado",
    tono: tx.estado === "pendiente" ? "aviso" : "gris",
    titulo: tx.estado === "pendiente" ? t("tx.pendiente") : t("tx.aprobado"),
    detalle: tx.estado === "pendiente" ? t("dm.rastroEnBandeja") : t("dm.rastroSinPendiente"),
  });
  if (tx.recurrente_id != null) {
    rastro.push({ clave: "rec", tono: "gris", titulo: t("recurrente.titulo"), detalle: t("dm.rastroGenerado") });
  }

  /** El nombre de archivo del comprobante, sin la ruta. */
  const comprobanteNombre = tx.comprobante_path?.split(/[\\/]/).pop() ?? "";

  /** Una fila etiqueta·valor de la ficha; con valor vacío no se pinta, para
   *  que un gasto sin notas no enseñe una fila que dice "Notas: —". */
  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo">
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  return (
    <div className="dm">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <div className="dm-chips">
          <span className={`tag ${cat.tagClass}`}>{cat.nombre}</span>
          <span className={`status-pill ${tx.estado}`}>
            {tx.estado === "aprobado" ? t("tx.aprobado") : tx.estado === "pendiente" ? t("tx.pendiente") : t("tx.rechazado")}
          </span>
          {tx.recurrente_id != null && (
            <span className="dm-chip-rec" title={t("recurrente.marcaEnTabla")}>
              <IconRepeat size={12} strokeWidth={2.2} /> {t("recurrente.titulo")}
            </span>
          )}
        </div>
        {/* El h1 de 32px del handoff. Iba faltando: el panel abría con el
            importe y nunca decía QUÉ movimiento se estaba mirando — había que
            deducirlo de la fila que quedaba resaltada a la izquierda, y en el
            modo de empuje esa fila ni se ve. */}
        <h1 className="dm-titular">{titular}</h1>
        <h2 className={`dm-monto ${esIngreso ? "positive" : "negative"}`}>
          {esIngreso ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
          <span className="dm-moneda">{tx.moneda}</span>
        </h2>
        <p className="dm-sub">
          {[fmtFechaCorta(tx.fecha), hora || null, metodoTexto].filter(Boolean).join(" · ")}
        </p>
        {/* El folio del handoff ("Folio 1042"), con motor desde la migración
            48 y con la forma del resto de la app: `2026-0042`.

            Sin folio no se pinta la línea, y eso NO es un descuido: los
            movimientos anteriores a esa migración no se numeraron —el pasado
            no se numera hacia atrás, porque habría que inventar un orden
            dentro de cada día— y una fila vacía se leería como un folio
            perdido. */}
        {tx.folio && <p className="dm-sub dm-folio">{t("tx.folioN", { folio: tx.folio })}</p>}
        {/* "Registrado por · Rosa Elena Vega · tesorera", del handoff 1. Lo
            pone la app con quien tenía la sesión abierta al guardar, así que
            no se teclea ni se puede atribuir a otro; y es una INSTANTÁNEA —lo
            que se hizo siendo tesorera se hizo siendo tesorera, aunque esa
            persona cambie de rol o deje la iglesia—.
            Sin nombre no se pinta la línea: lo anterior a la migración 39 y
            lo registrado en modo local no tienen a quién atribuirse, y decir
            "no lo sé" callando es mejor que un hueco con nombre de nadie. */}
        {tx.registrado_por && (
          <p className="dm-sub dm-registrado">
            {t("tx.registradoPor", {
              quien: [tx.registrado_por, tx.registrado_rol ? t(`rol.${tx.registrado_rol}`, { defaultValue: tx.registrado_rol }) : null]
                .filter(Boolean).join(" · "),
            })}
          </p>
        )}
        <div className="dm-acciones">
          {tx.comprobante_path && (
            <button type="button" className="btn secondary" onClick={() => onVerComprobante(tx.comprobante_path!)}>
              <IconClip size={14} strokeWidth={2} /> {t("tx.verComprobante")}
            </button>
          )}
          {onCompartir && (
            <button type="button" className="btn secondary" onClick={() => onCompartir(tx)}>
              <ShareIcon size={15} /> {t("common.compartir")}
            </button>
          )}
          {acciones ?? (
            <>
              {onEliminar && (
                <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(tx)}>
                  <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
                </button>
              )}
              <button type="button" className="btn primary" onClick={() => onEditar(tx)}>
                <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dm-ficha">
        {fila(t("recordModal.fecha"), [fmtFechaCorta(tx.fecha), hora || null].filter(Boolean).join(", "))}
        {/* La fila del aportante lleva "Ver ficha" cuando el ingreso está
            vinculado a un miembro — el salto del diseño de iPad a su ficha
            en Aportantes. Con beneficiario suelto no hay ficha que abrir. */}
        {esIngreso && persona && tx.member_id != null && onVerFicha ? (
          <div className="dm-campo">
            <span className="dm-campo-etiqueta">{t("recordModal.aportante")}</span>
            <span className="dm-campo-valor">{persona}</span>
            <button type="button" className="dm-ver-ficha" onClick={() => onVerFicha(tx.member_id!)}>
              {t("common.verFicha")}
            </button>
          </div>
        ) : (
          fila(esIngreso ? t("recordModal.aportante") : t("recordModal.beneficiario"), persona)
        )}
        {fila(t("recordModal.rfc"), tx.beneficiario_rfc)}
        {fila(t("recordModal.metodoPago"), metodoTexto)}
        {fila(t("recordModal.categoria"), tx.subcategoria ? `${cat.nombre} · ${tx.subcategoria}` : cat.nombre)}
        {fila(t("recordModal.concepto"), tx.concepto)}
        {fila(t("recordModal.notas"), tx.detalle)}
        {tx.emitir_constancia ? fila(t("recordModal.constanciaCorta"), t("common.si")) : null}
      </div>

      {/* Las dos tarjetas del pie del handoff, a dos columnas. */}
      <div className="dm-pie-tarjetas">
        <div className="dm-tarjeta">
          <span className="dm-tarjeta-titulo">{t("dm.rastro")}</span>
          <div className="dm-rastro">
            {rastro.map((r) => (
              <span className="dm-rastro-item" key={r.clave}>
                <span className={`dm-rastro-punto ${r.tono}`} aria-hidden="true" />
                <span className="dm-rastro-textos">
                  <span className="dm-rastro-titulo">{r.titulo}</span>
                  <span className="dm-rastro-detalle">{r.detalle}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="dm-tarjeta dm-tarjeta--comp">
          <span className="dm-tarjeta-titulo">
            {tx.comprobante_path ? t("recordModal.comprobante") : t("dm.comprobantePendiente")}
          </span>
          {tx.comprobante_path ? (
            <div className="dm-comp-hay">
              <span className="dm-comp-icono"><IconClip size={20} strokeWidth={1.7} /></span>
              <span className="dm-comp-archivo">{comprobanteNombre}</span>
              <span className="dm-comp-enlaces">
                <button type="button" onClick={() => onVerComprobante(tx.comprobante_path!)}>{t("common.ver")}</button>
                <button type="button" onClick={() => onEditar(tx)}>{t("dm.reemplazar")}</button>
              </span>
            </div>
          ) : (
            /* El recuadro punteado del diseño. Es un HUECO, no un botón de
               subir: el comprobante se adjunta en el formulario, y por eso el
               pie lleva ahí a "Editar" en vez de abrir un selector de archivo
               que dejaría la ficha a medio guardar. */
            <div className="dm-comp-falta">
              <span className="dm-comp-falta-texto">{t("dm.sinComprobante")}</span>
              <button type="button" className="dm-comp-adjuntar" onClick={() => onEditar(tx)}>
                {t("dm.adjuntar")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
