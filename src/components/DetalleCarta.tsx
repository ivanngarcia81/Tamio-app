import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Carta, type Church } from "../db";
import { buildCartaHtml, parseFirmas } from "../services/cartas/cartaDoc";
import { IconChevronLeft, IconEdit, IconFileText, IconPrinter, IconTrash } from "../icons";
import LoadingState from "./LoadingState";

interface Props {
  church: Church;
  carta: Carta;
  /** Título de la lista ("Cartas"): el texto del botón de volver del modo de
   *  empuje. En columnas el CSS lo esconde, igual que en movimientos. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (c: Carta) => void;
  onImprimir: (c: Carta) => void;
  onDuplicar: (c: Carta) => void;
  /** Marcar entregada / cancelar (solo estados vivos) — abre la confirmación
   *  de la página, la misma de los menús de fila. */
  onEntregar: (c: Carta) => void;
  /** Borrador se elimina; el resto se archiva — la misma regla del menú de
   *  la fila. La etiqueta del botón lo dice. */
  onEliminarOArchivar: (c: Carta) => void;
}

const BADGE_ESTADO: Record<string, string> = {
  borrador: "administracion",
  preparacion: "servicios",
  revision: "musicos",
  firma: "eventos",
  aprobada: "donacion",
  lista: "diezmo",
  entregada: "activo",
  archivada: "baja",
  cancelada: "pastores",
};

/**
 * DetalleCarta — la columna derecha del maestro-detalle de Cartas.
 *
 * El panel enseña la carta COMO DOCUMENTO: el mismo HTML que produce
 * `buildCartaHtml` para imprimir y para la vista previa del editor, montado
 * en un iframe — así lo que se lee aquí es EXACTAMENTE lo que va a salir en
 * papel, membrete y firmas incluidos, sin una segunda maqueta que mantener.
 * Editar abre el editor de siempre; el panel es para leer y despachar.
 */
export default function DetalleCarta({ church, carta, tituloLista, onVolver, onEditar, onImprimir, onDuplicar, onEntregar, onEliminarOArchivar }: Props) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const viva = !["entregada", "archivada", "cancelada"].includes(carta.estado);

  /* La hoja carta mide 8.5in = 816px y el panel es más angosto: el iframe se
     pinta a tamaño real y se ESCALA a lo que mida el marco, como hace
     Vista Previa — reducir la hoja, nunca re-maquetarla. El alto del marco
     acompaña a la escala para no dejar un vacío debajo. */
  const HOJA_W = 816;
  const HOJA_H = 1056;
  const marcoRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = marcoRef.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, el.clientWidth / HOJA_W));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelado = false;
    setHtml(null);
    buildCartaHtml(church, carta, parseFirmas(carta.firmas))
      .then((h) => { if (!cancelado) setHtml(h); })
      .catch(console.error);
    return () => { cancelado = true; };
    // `modificado_en` refresca el documento cuando una edición guarda.
  }, [church, carta.id, carta.modificado_en]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dm dm-doc">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <div className="dm-chips">
          <span className={`tag ${BADGE_ESTADO[carta.estado] ?? "otros"}`}>{t(`cartas.estado.${carta.estado}`)}</span>
        </div>
        <h2 className="dm-doc-titulo">{carta.destinatario_nombre}</h2>
        <p className="dm-sub">
          {[carta.folio, t(`cartas.tipoDoc.${carta.tipo}`), fmtFechaCorta(carta.fecha_emision)].join(" · ")}
          {carta.asunto ? ` · ${carta.asunto}` : ""}
        </p>
        <div className="dm-acciones">
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminarOArchivar(carta)}>
            <IconTrash size={14} strokeWidth={2} /> {carta.estado === "borrador" ? t("common.eliminar") : t("cartas.archivar")}
          </button>
          <button type="button" className="btn secondary" onClick={() => onDuplicar(carta)}>
            <IconFileText size={14} strokeWidth={2} /> {t("cartas.duplicar")}
          </button>
          {viva && (
            <button type="button" className="btn secondary" onClick={() => onEntregar(carta)}>
              {t("cartas.marcarEntregadaAccion")}
            </button>
          )}
          <button type="button" className="btn secondary" onClick={() => onImprimir(carta)}>
            <IconPrinter size={14} /> {t("cartas.imprimirPdf")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(carta)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      <div className="dm-carta-marco" ref={marcoRef} style={{ height: Math.round(HOJA_H * escala) }}>
        {html === null ? (
          <LoadingState />
        ) : (
          <iframe
            title={carta.folio}
            srcDoc={html}
            className="dm-carta-doc"
            style={{ width: HOJA_W, height: HOJA_H, transform: `scale(${escala})`, transformOrigin: "top left" }}
          />
        )}
      </div>

      {(carta.entregada_a || carta.fecha_entrega || carta.observaciones) && (
        <div className="dm-ficha">
          {carta.entregada_a && (
            <div className="dm-campo">
              <span className="dm-campo-etiqueta">{t("cartas.entregadaA")}</span>
              <span className="dm-campo-valor">{carta.entregada_a}</span>
            </div>
          )}
          {carta.fecha_entrega && (
            <div className="dm-campo">
              <span className="dm-campo-etiqueta">{t("cartas.fechaEntrega")}</span>
              <span className="dm-campo-valor">{fmtFechaCorta(carta.fecha_entrega)}</span>
            </div>
          )}
          {carta.observaciones && (
            <div className="dm-campo">
              <span className="dm-campo-etiqueta">{t("cartas.observaciones")}</span>
              <span className="dm-campo-valor">{carta.observaciones}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
