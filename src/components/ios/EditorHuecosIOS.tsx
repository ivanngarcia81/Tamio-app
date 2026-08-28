/**
 * EditorHuecosIOS.tsx — el cuerpo de la carta, en su propia pantalla (maqueta
 * C12), con la hoja de «Insertar hueco» (maqueta C11) encima.
 *
 * El cuerpo es el único texto largo con formato de la app. Dentro de la lista
 * agrupada del editor de plantilla no le quedaban dos renglones útiles con el
 * teclado puesto; en pantalla propia, con el texto directo sobre blanco —como
 * Notas— quedan seis o siete. Por eso la fila de la plantilla lo enseña
 * resumido («4 párrafos · 6 huecos») y empuja aquí.
 *
 * La barra sobre el teclado hace el trabajo que en el escritorio hacía un
 * desplegable: «Insertar hueco» a la izquierda, donde el pulgar la alcanza sin
 * tapar el cursor, y el formato a la derecha.
 *
 * El mismo componente sirve para el ASUNTO (`unaLinea`): también admite
 * huecos, pero no lleva formato ni párrafos. La maqueta no dibuja esa
 * pantalla —dibuja el asunto como fila de dos líneas con su pastilla dentro—,
 * pero sin ella el asunto sería el único campo del formulario que no se puede
 * escribir desde el teléfono.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "../Portal";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import { IconChevronLeft, IconPlus } from "../../icons";
import type { VariableId } from "../../services/cartas/plantillas";
import {
  GRUPOS_HUECOS, etiquetaHueco, htmlPastilla, llavesEnHtml, llavesEnTexto, pastillasEnHtml,
} from "../../services/cartas/huecos";

/** Los cuatro botones de formato de la maqueta, en su orden. */
const FORMATO = [
  { id: "bold", glifo: "B", peso: 700 },
  { id: "italic", glifo: "I", cursiva: true },
  { id: "underline", glifo: "U", subrayado: true },
  { id: "insertUnorderedList", glifo: "•" },
] as const;

export default function EditorHuecosIOS({
  titulo, volver, valor, unaLinea, faltan, ejemplos, abrirHuecos, onListo, onCancelar,
}: {
  titulo: string;
  /** Etiqueta del «volver»: de dónde se empujó esta pantalla. */
  volver: string;
  /** El valor GUARDADO, con sus `{{clave}}`. */
  valor: string;
  /** Asunto: una sola línea, sin formato ni párrafos. */
  unaLinea?: boolean;
  /** Huecos que con los datos de hoy no podrían llenarse: van en ámbar. */
  faltan: ReadonlySet<string>;
  /** Valor real de cada hueco, para la fila de ejemplo de la hoja C11. */
  ejemplos: Partial<Record<VariableId, string>>;
  /** Entrar con la hoja de huecos ya puesta: es lo que hace «Ver los huecos
   *  disponibles» de C8, para que su «+» siga insertando de verdad. */
  abrirHuecos?: boolean;
  /** Devuelve el valor GUARDADO, con sus `{{clave}}` de vuelta. */
  onListo: (v: string) => void;
  onCancelar: () => void;
}) {
  const { t } = useTranslation();
  const refCuerpo = useRef<HTMLDivElement>(null);
  const rango = useRef<Range | null>(null);
  const [insertando, setInsertando] = useState(abrirHuecos ?? false);
  /* Escape cierra LA DE ARRIBA. `useEscapeClose` no apila —cada uso escucha
     la ventana por su cuenta—, así que con la hoja de huecos abierta las dos
     escuchas se dispararían y el mismo Escape cerraría la hoja y descartaría
     el texto. La de abajo se calla mientras haya otra encima. */
  useEscapeClose(useCallback(() => { if (!insertando) onCancelar(); }, [insertando, onCancelar]));

  /* El HTML se pinta una sola vez y a mano: es un `contentEditable`, así que
     React no puede ser su dueño —volver a pintarlo en cada tecla le movería
     el cursor al principio. */
  useEffect(() => {
    if (refCuerpo.current) refCuerpo.current.innerHTML = pastillasEnHtml(valor, faltan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Dónde está el cursor. Hace falta guardarlo porque abrir la hoja de huecos
     le quita el foco al editor y con él la selección: sin esto, el hueco se
     insertaría siempre al final. */
  useEffect(() => {
    function recordar() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (refCuerpo.current?.contains(r.commonAncestorContainer)) rango.current = r.cloneRange();
    }
    document.addEventListener("selectionchange", recordar);
    return () => document.removeEventListener("selectionchange", recordar);
  }, []);

  function insertar(clave: VariableId) {
    setInsertando(false);
    const el = refCuerpo.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (rango.current && sel) {
      sel.removeAllRanges();
      sel.addRange(rango.current);
    }
    document.execCommand("insertHTML", false, htmlPastilla(clave, faltan.has(clave)));
  }

  function aplicarFormato(cmd: string) {
    refCuerpo.current?.focus();
    const sel = window.getSelection();
    if (rango.current && sel) { sel.removeAllRanges(); sel.addRange(rango.current); }
    document.execCommand(cmd);
  }

  function listo() {
    const html = refCuerpo.current?.innerHTML ?? "";
    onListo(unaLinea ? llavesEnTexto(html) : llavesEnHtml(html));
  }

  return (
    <Portal>
      <div className="ios-sheet-overlay">
        <div className="ios-sheet ios-sheet--texto" role="dialog" aria-label={titulo}>
          <div className="ios-nav">
            <button type="button" className="ios-back" onClick={onCancelar}>
              <IconChevronLeft size={15} strokeWidth={2.2} />
              <span className="ios-back-label">{volver}</span>
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={listo}>{t("common.listo")}</button>
            </span>
          </div>

          <div
            ref={refCuerpo}
            contentEditable
            role="textbox"
            aria-multiline={!unaLinea}
            aria-label={titulo}
            className={`eh-cuerpo${unaLinea ? " eh-cuerpo--linea" : ""}`}
            onKeyDown={(e) => { if (unaLinea && e.key === "Enter") e.preventDefault(); }}
          />

          <div className="eh-barra">
            <button type="button" className="eh-chip" onClick={() => setInsertando(true)}>
              <IconPlus size={15} strokeWidth={2.2} />{t("plantillas.insertarHueco")}
            </button>
            <span className="eh-espacio" />
            {!unaLinea && FORMATO.map((f) => (
              <button
                key={f.id}
                type="button"
                className="eh-formato"
                aria-label={t(`plantillas.formato.${f.id}`)}
                style={{
                  fontWeight: "peso" in f ? f.peso : undefined,
                  fontStyle: "cursiva" in f ? "italic" : undefined,
                  textDecoration: "subrayado" in f ? "underline" : undefined,
                }}
                /* `mousedown` y no `click`: el editor pierde el foco al soltar,
                   y con él la selección sobre la que hay que aplicar. */
                onMouseDown={(e) => { e.preventDefault(); aplicarFormato(f.id); }}
              >
                {f.glifo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {insertando && (
        <HojaHuecos ejemplos={ejemplos} faltan={faltan} onElegir={insertar} onCerrar={() => setInsertando(false)} />
      )}
    </Portal>
  );
}

/**
 * C11 · Insertar hueco.
 *
 * Quince huecos no son una lista de valores: son quince acciones sobre el
 * cursor, y por eso van en verde con un «+» a la derecha y no con palomita.
 * Se agrupan por DE DÓNDE SALE EL DATO y cada fila enseña debajo el valor
 * real que tomaría hoy, que es la única forma de saber si el hueco es el que
 * hace falta.
 *
 * La hoja no ocupa toda la altura a propósito: deja ver el texto de arriba
 * para no perder el sitio del cursor.
 */
function HojaHuecos({ ejemplos, faltan, onElegir, onCerrar }: {
  ejemplos: Partial<Record<VariableId, string>>;
  faltan: ReadonlySet<string>;
  onElegir: (clave: VariableId) => void;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCerrar);
  return (
    <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="ios-sheet ios-sheet--huecos" role="dialog" aria-label={t("plantillas.insertarHueco")}>
        <span className="eh-agarre" aria-hidden="true" />
        <div className="ios-nav">
          <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCerrar}>{t("common.cancelar")}</button>
          <h1 className="ios-nav-title">{t("plantillas.insertarHueco")}</h1>
          <span className="ios-nav-status" />
        </div>
        <div className="ios-sheet-body eh-lista">
          <p className="ios-section-footer eh-intro">{t("plantillas.huecosIntro")}</p>
          {GRUPOS_HUECOS.map((g) => (
            <section className="ios-section" key={g.id}>
              <h2 className="ios-section-header">{t(`plantillas.grupoHueco.${g.id}`)}</h2>
              <div className="ios-listcard">
                {g.claves.map((clave) => (
                  <button type="button" className="ios-txrow ios-txrow--clickable eh-fila" key={clave} onClick={() => onElegir(clave)}>
                    <div className="ios-txrow-main">
                      <div className="ios-txrow-title es-accion">{etiquetaHueco(clave)}</div>
                      <div className={`eh-ejemplo${faltan.has(clave) ? " es-falta" : ""}`}>
                        {ejemplos[clave] || t("plantillas.huecoSinDato")}
                      </div>
                    </div>
                    <div className="ios-txrow-trailing">
                      <IconPlus size={19} strokeWidth={1.9} />
                    </div>
                  </button>
                ))}
              </div>
              <p className="ios-section-footer">{t(`plantillas.pieGrupoHueco.${g.id}`)}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
