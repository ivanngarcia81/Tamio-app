/**
 * PlantillaEditorIOS.tsx — la plantilla de carta, hecha para el pulgar
 * (maquetas C8, C10 y C13; C11 y C12 viven en `ios/EditorHuecosIOS`).
 *
 * Hasta ahora el teléfono abría `PlantillaModal` tal cual: una ventana de 720
 * px con su rejilla de dos columnas, sus ocho campos con etiqueta encima y
 * caja debajo, y un `contentEditable` de 160 px con un desplegable de
 * variables al lado. En 393 px eso es un formulario de escritorio encogido.
 *
 * Dos decisiones sostienen el rediseño, y las dos vienen del handoff:
 *
 *   · **Las variables dejan de ser un valor y pasan a ser una acción.** Se
 *     llaman «huecos», viven en su propia hoja agrupada por origen del dato, y
 *     una vez insertadas se leen como pastilla verde con el nombre en español
 *     —nunca más `{{miembro_nombre}}` en medio de la frase—. El texto guardado
 *     no cambia: eso lo resuelve `services/cartas/huecos.ts`.
 *   · **El cuerpo sale de la hoja.** Es el único texto largo con formato de la
 *     app, así que se empuja a pantalla completa con la barra de formato y
 *     «Insertar hueco» pegadas al teclado.
 *
 * Lo que la maqueta dibuja como cuatro pantallas distintas es aquí un solo
 * componente con una pila: `pantalla` dice cuál está encima. No son rutas —se
 * abren sobre la lista de plantillas y se cierran volviendo—, y así el
 * borrador vive en un único sitio: cancelar en cualquier nivel no ha guardado
 * nada todavía.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deletePlantilla, insertPlantilla, updatePlantilla,
  type Church, type Member, type NewPlantilla, type Plantilla,
} from "../db";
import { contextoDe, type VariableId } from "../services/cartas/plantillas";
import {
  contarHuecos, etiquetaHueco as i18nEtiqueta, huecosSinDato, partirEnHuecos, resumenCuerpo,
} from "../services/cartas/huecos";
import { abrirCartaParaImprimir } from "../services/cartas/cartaDoc";
import { fmtFechaLarga } from "../services/print/printUtils";
import { TIPOS_CARTA } from "./CartaEditor";
import EditorHuecosIOS from "./ios/EditorHuecosIOS";
import { IOSPantallaTexto } from "./ios/IOSPantallaTexto";
import SeccionIOS, { IosChevron } from "./ios/SeccionIOS";
import { IconChevronLeft, IconSearch } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import Portal from "./Portal";
import { showToast } from "../toast";
import { playSound } from "../sound";

interface Props {
  church: Church;
  plantilla: Plantilla | null;
  /** Copia inicial (duplicar): misma información, nombre "(copia)". */
  base?: Plantilla | null;
  /** Las demás plantillas: dan el recuento de «YA EN USO» de C10. */
  plantillas: Plantilla[];
  /** Para el miembro de ejemplo de la vista previa (C13). */
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

type Pantalla = null | "tipo" | "asunto" | "cuerpo" | "saludo" | "despedida" | "previa";

/** Pastillas en un texto plano (el asunto de la fila de C8). */
function ConHuecos({ texto, faltan }: { texto: string; faltan: ReadonlySet<string> }) {
  return (
    <>
      {partirEnHuecos(texto, faltan).map((tr, i) =>
        tr.tipo === "texto"
          ? <span key={i}>{tr.texto}</span>
          : <span key={i} className={`hueco${tr.falta ? " hueco--falta" : ""}`}>{i18nEtiqueta(tr.clave)}</span>
      )}
    </>
  );
}

export default function PlantillaEditorIOS({ church, plantilla, base, plantillas, members, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const origen = plantilla ?? base ?? null;

  const [nombre, setNombre] = useState(
    plantilla?.nombre ?? (base ? t("plantillas.nombreCopia", { nombre: base.nombre }) : "")
  );
  const [tipo, setTipo] = useState(origen?.tipo ?? "personalizada");
  const [asunto, setAsunto] = useState(origen?.asunto ?? "");
  const [saludo, setSaludo] = useState(origen?.saludo ?? "");
  const [despedida, setDespedida] = useState(origen?.despedida ?? "");
  const [cuerpo, setCuerpo] = useState(origen?.cuerpo_html ?? "");
  const [activa, setActiva] = useState(origen ? origen.activa === 1 : true);
  const [predeterminada, setPredeterminada] = useState(plantilla ? plantilla.predeterminada === 1 : false);

  const [pantalla, setPantalla] = useState<Pantalla>(null);
  /** «Ver los huecos disponibles» abre el cuerpo con la hoja ya puesta: el
   *  «+» de cada fila sigue significando lo que dice —insertar donde está el
   *  cursor— en vez de ser un catálogo que no hace nada. */
  const [abrirHuecos, setAbrirHuecos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ejemplo, setEjemplo] = useState(0);
  /* Escape cierra la hoja de arriba, no toda la pila: mientras haya una
     pantalla empujada, esta escucha se calla (ver la nota de EditorHuecosIOS). */
  useEscapeClose(useCallback(() => { if (pantalla === null) onClose(); }, [pantalla, onClose]));

  /* El miembro de ejemplo de la vista previa. Real, no inventado: con un
     nombre de verdad se ve si el asunto cabe en un renglón. */
  const candidatos = useMemo(() => members.filter((m) => m.activo === 1), [members]);
  const miembroEjemplo = candidatos.length > 0 ? candidatos[ejemplo % candidatos.length] : null;

  const ctx = useMemo(() => {
    const c = contextoDe(church, {
      miembro: miembroEjemplo,
      folio: t("plantillas.folioEjemplo"),
      fechaEmision: new Date().toISOString().slice(0, 10),
    });
    if (!miembroEjemplo) c.miembro_nombre = t("plantillas.ejemploMiembro");
    return c;
  }, [church, miembroEjemplo, t]);

  const textos = useMemo(() => [asunto, saludo, cuerpo, despedida], [asunto, saludo, cuerpo, despedida]);
  /* Los huecos que HOY no podrían llenarse: van en ámbar mientras se escribe
     la plantilla, no cuando la carta ya salió impresa. La iglesia de destino
     de un traslado es el caso normal —solo se sabe al emitir. */
  const faltan = useMemo(() => huecosSinDato(textos, ctx), [textos, ctx]);
  const cuenta = useMemo(() => contarHuecos(textos, ctx), [textos, ctx]);
  const resumen = useMemo(() => resumenCuerpo(cuerpo), [cuerpo]);

  /** El recuento de plantillas por tipo, para el grupo «YA EN USO» de C10.
   *
   *  Cuenta TAMBIÉN la que se está editando. Descontarla parecía más honesto
   *  —«cuántas otras hay»— y hacía justo lo contrario: el tipo de esta
   *  plantilla, que es por definición un tipo en uso, bajaba a «TODOS LOS
   *  TIPOS» y la palomita aparecía en el grupo de los que nadie usa. */
  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plantillas) m.set(p.tipo, (m.get(p.tipo) ?? 0) + 1);
    return m;
  }, [plantillas]);

  function payload(): NewPlantilla | null {
    setError(null);
    if (!nombre.trim()) { setError(t("plantillas.nombreObligatorio")); return null; }
    return {
      nombre: nombre.trim(),
      tipo,
      asunto: asunto.trim() || null,
      saludo: saludo.trim() || null,
      cuerpo_html: cuerpo,
      despedida: despedida.trim() || null,
      activa,
      /* Una plantilla apagada no se ofrece al escribir, así que tampoco puede
         ser la predeterminada de su tipo: el interruptor se atenúa en su
         sitio (C8) y aquí se hace verdad. */
      predeterminada: activa && predeterminada,
    };
  }

  async function guardar() {
    const p = payload();
    if (!p) return;
    setSaving(true);
    try {
      if (plantilla) await updatePlantilla(plantilla.id, church.id, p);
      else await insertPlantilla(church.id, p);
      playSound("guardado");
      showToast(t("plantillas.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  /** Duplicar: se guarda lo que hay y se abre la copia. Desde el teléfono no
   *  hay menú «···» en la fila, así que la acción vive donde se edita. */
  async function duplicar() {
    const p = payload();
    if (!p) return;
    setSaving(true);
    try {
      await insertPlantilla(church.id, { ...p, nombre: t("plantillas.nombreCopia", { nombre: p.nombre }), predeterminada: false });
      playSound("guardado");
      showToast(t("plantillas.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!plantilla) { onClose(); return; }
    await deletePlantilla(plantilla.id, church.id);
    showToast(t("plantillas.toastEliminada"));
    onSaved();
    onClose();
  }

  return (
    <Portal>
      <div className="ios-sheet-overlay">
        <div className="ios-sheet pl-hoja" role="dialog" aria-label={plantilla ? t("plantillas.editarPlantilla") : t("plantillas.nuevaPlantilla")}>
          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose}>{t("common.cancelar")}</button>
            <h1 className="ios-nav-title">{plantilla ? t("plantillas.editarPlantilla") : t("plantillas.nuevaPlantilla")}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={guardar} disabled={saving}>{t("common.guardar")}</button>
            </span>
          </div>

          <div className="ios-sheet-body pl-cuerpo">
            <SeccionIOS
              titulo={t("plantillas.secDatos")}
              compacta
              pie={activa ? t("plantillas.piePredet") : t("plantillas.piePredetApagada")}
            >
              <div className="ios-txrow">
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("usuarios.colNombre")}</div></div>
                <div className="ios-txrow-trailing pl-trailing-ancho">
                  <input
                    className="pl-campo"
                    value={nombre}
                    aria-label={t("usuarios.colNombre")}
                    placeholder={t("plantillas.nombrePlaceholder")}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
              </div>

              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => setPantalla("tipo")}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("cartas.tipoCarta")}</div></div>
                <div className="ios-txrow-trailing">
                  <span className="ios-fila-valor">{t(`cartas.tipoDoc.${tipo}`)}</span>
                  <IosChevron />
                </div>
              </button>

              <Interruptor label={t("plantillas.activa")} valor={activa} onCambio={setActiva} />
              <Interruptor
                label={t("plantillas.predeterminada")}
                valor={activa && predeterminada}
                apagado={!activa}
                onCambio={setPredeterminada}
              />
            </SeccionIOS>

            <SeccionIOS titulo={t("plantillas.secContenido")} pie={t("plantillas.pieContenido")}>
              {/* La única fila de dos líneas del grupo: el asunto lleva una
                  pastilla dentro y no cabría a la derecha. */}
              <button type="button" className="ios-txrow ios-txrow--clickable pl-fila-asunto" onClick={() => setPantalla("asunto")}>
                <div className="ios-txrow-main">
                  <div className="pl-etiqueta">{t("cartas.asunto")}</div>
                  <div className="pl-valor-largo">
                    {asunto ? <ConHuecos texto={asunto} faltan={faltan} /> : <span className="pl-vacio">{t("plantillas.sinAsunto")}</span>}
                  </div>
                </div>
              </button>

              <button type="button" className="ios-txrow ios-txrow--clickable pl-fila-corta" onClick={() => setPantalla("saludo")}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("cartas.saludo")}</div></div>
                <div className="ios-txrow-trailing"><span className="ios-fila-valor">{saludo}</span></div>
              </button>

              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => setPantalla("cuerpo")}>
                <div className="ios-txrow-main">
                  <div className="ios-txrow-title">{t("cartas.cuerpo")}</div>
                  {/* Dos cuentas y no una cadena con dos números: «1 huecos»
                      es exactamente la clase de detalle que delata que la
                      pantalla se armó sin mirarla. */}
                  <div className="pl-sub">
                    {t("plantillas.parrafos", { count: resumen.parrafos })}
                    {" · "}
                    {t("plantillas.huecosCuenta", { count: resumen.huecos })}
                  </div>
                </div>
                <div className="ios-txrow-trailing"><IosChevron /></div>
              </button>

              <button type="button" className="ios-txrow ios-txrow--clickable pl-fila-corta" onClick={() => setPantalla("despedida")}>
                <div className="ios-txrow-main"><div className="ios-txrow-title">{t("cartas.despedida")}</div></div>
                <div className="ios-txrow-trailing"><span className="ios-fila-valor">{despedida}</span></div>
              </button>
            </SeccionIOS>

            <SeccionIOS compacta pie={t("plantillas.pieEliminar")}>
              <button
                type="button"
                className="ios-txrow ios-txrow--clickable"
                onClick={() => { setAbrirHuecos(true); setPantalla("cuerpo"); }}
              >
                <div className="ios-txrow-main"><div className="ios-txrow-title es-accion">{t("plantillas.verHuecos")}</div></div>
                <div className="ios-txrow-trailing"><span className="ios-fila-valor pl-cifra">15</span></div>
              </button>
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={duplicar} disabled={saving}>
                <div className="ios-txrow-main"><div className="ios-txrow-title es-accion">{t("plantillas.duplicarPlantilla")}</div></div>
              </button>
              {plantilla && (
                <button type="button" className="ios-txrow ios-txrow--clickable" onClick={eliminar}>
                  <div className="ios-txrow-main"><div className="ios-txrow-title es-destructiva">{t("plantillas.eliminarPlantilla")}</div></div>
                </button>
              )}
            </SeccionIOS>

            {error && <p className="ios-section-footer pl-error">{error}</p>}
          </div>

          <div className="pl-pie">
            <button type="button" className="pl-previa" onClick={() => setPantalla("previa")}>{t("cartas.vistaPrevia")}</button>
            <button type="button" className="pl-guardar" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {pantalla === "tipo" && (
        <HojaTipos
          valor={tipo}
          porTipo={porTipo}
          onElegir={(v) => { setTipo(v); setPantalla(null); }}
          onVolver={() => setPantalla(null)}
        />
      )}

      {(pantalla === "cuerpo" || pantalla === "asunto") && (
        <EditorHuecosIOS
          key={pantalla}
          titulo={pantalla === "cuerpo" ? t("cartas.cuerpo") : t("cartas.asunto")}
          volver={t("plantillas.volverPlantilla")}
          valor={pantalla === "cuerpo" ? cuerpo : asunto}
          unaLinea={pantalla === "asunto"}
          faltan={faltan}
          ejemplos={ctx}
          abrirHuecos={abrirHuecos}
          onListo={(v) => {
            if (pantalla === "cuerpo") setCuerpo(v); else setAsunto(v);
            setAbrirHuecos(false);
            setPantalla(null);
          }}
          onCancelar={() => { setAbrirHuecos(false); setPantalla(null); }}
        />
      )}

      {pantalla === "saludo" && (
        <IOSPantallaTexto
          title={t("cartas.saludo")}
          valor={saludo}
          onListo={(v) => { setSaludo(v); setPantalla(null); }}
          onCancel={() => setPantalla(null)}
        />
      )}
      {pantalla === "despedida" && (
        <IOSPantallaTexto
          title={t("cartas.despedida")}
          valor={despedida}
          onListo={(v) => { setDespedida(v); setPantalla(null); }}
          onCancel={() => setPantalla(null)}
        />
      )}

      {pantalla === "previa" && (
        <VistaPrevia
          church={church}
          ctx={ctx}
          asunto={asunto}
          saludo={saludo}
          cuerpo={cuerpo}
          despedida={despedida}
          miembro={miembroEjemplo?.nombre ?? t("plantillas.ejemploMiembro")}
          cuenta={cuenta}
          puedeCambiar={candidatos.length > 1}
          onOtro={() => setEjemplo((n) => n + 1)}
          onCerrar={() => setPantalla(null)}
        />
      )}
    </Portal>
  );
}

/** Fila con interruptor. Apagada, la fila se atenúa EN SU SITIO en vez de
 *  desaparecer: una fila que aparece y desaparece al tocar la de arriba se
 *  lee como un fallo, y el pie del grupo ya explica la consecuencia. */
function Interruptor({ label, valor, apagado, onCambio }: {
  label: string; valor: boolean; apagado?: boolean; onCambio: (v: boolean) => void;
}) {
  return (
    <div className={`ios-txrow${apagado ? " pl-apagada" : ""}`}>
      <div className="ios-txrow-main"><div className="ios-txrow-title">{label}</div></div>
      <div className="ios-txrow-trailing">
        <button
          type="button"
          className="ios-switch"
          role="switch"
          aria-checked={valor}
          aria-label={label}
          disabled={apagado}
          onClick={() => onCambio(!valor)}
        />
      </div>
    </div>
  );
}

/** Una fila del catálogo de tipos. Fuera de `HojaTipos` a propósito: dentro,
 *  cada letra tecleada en el buscador la redefiniría y React desmontaría y
 *  volvería a montar las catorce filas en vez de recolocarlas. */
function FilaTipo({ ti, elegido, cuenta, onElegir }: {
  ti: string; elegido: boolean; cuenta?: number; onElegir: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button type="button" className="ios-txrow ios-txrow--clickable" onClick={() => onElegir(ti)}>
      <div className="ios-txrow-main"><div className="ios-txrow-title">{t(`cartas.tipoDoc.${ti}`)}</div></div>
      <div className="ios-txrow-trailing">
        {cuenta != null && <span className="ios-fila-valor">{t("plantillas.cuentaTipo", { n: cuenta })}</span>}
        {elegido && <span className="pl-palomita" aria-hidden="true">✓</span>}
      </div>
    </button>
  );
}

/**
 * C10 · Los catorce tipos.
 *
 * Catorce filas iguales serían un directorio, así que los tipos que la
 * iglesia YA usa suben a un grupo propio con el número de plantillas que
 * tiene cada uno. Buscar aparece porque catorce es justo el umbral donde
 * recorrer con el pulgar cuesta más que teclear tres letras.
 */
function HojaTipos({ valor, porTipo, onElegir, onVolver }: {
  valor: string;
  porTipo: Map<string, number>;
  onElegir: (v: string) => void;
  onVolver: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onVolver);
  const [q, setQ] = useState("");
  const refBuscar = useRef<HTMLInputElement>(null);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filtra = (ti: string) => !q.trim() || norm(t(`cartas.tipoDoc.${ti}`)).includes(norm(q.trim()));

  /* «Personalizada» va al final: es la única sin membrete propio ni folio
     automático, así que no compite con las demás por el orden. */
  const usados = TIPOS_CARTA.filter((ti) => porTipo.has(ti) && filtra(ti));
  const restantes = TIPOS_CARTA.filter((ti) => !porTipo.has(ti) && filtra(ti));

  return (
    <div className="ios-sheet-overlay">
      <div className="ios-sheet pl-hoja" role="dialog" aria-label={t("cartas.tipoCarta")}>
        <div className="ios-nav">
          <button type="button" className="ios-back" onClick={onVolver}>
            <IconChevronLeft size={15} strokeWidth={2.2} />
            <span className="ios-back-label">{t("plantillas.volverPlantilla")}</span>
          </button>
          <h1 className="ios-nav-title">{t("cartas.tipoCarta")}</h1>
          <span className="ios-nav-status" />
        </div>

        <div className="pl-buscar" onClick={() => refBuscar.current?.focus()}>
          <IconSearch size={15} strokeWidth={2} />
          <input
            ref={refBuscar}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.buscarCorto")}
            aria-label={t("common.buscarCorto")}
          />
        </div>

        <div className="ios-sheet-body pl-cuerpo">
          {usados.length > 0 && (
            <SeccionIOS titulo={t("plantillas.yaEnUso")} compacta pie={t("plantillas.pieYaEnUso")}>
              {usados.map((ti) => (
                <FilaTipo key={ti} ti={ti} elegido={ti === valor} cuenta={porTipo.get(ti)} onElegir={onElegir} />
              ))}
            </SeccionIOS>
          )}
          {restantes.length > 0 && (
            <SeccionIOS titulo={t("plantillas.todosLosTipos")} compacta pie={t("plantillas.pieTodosLosTipos")}>
              {restantes.map((ti) => <FilaTipo key={ti} ti={ti} elegido={ti === valor} onElegir={onElegir} />)}
            </SeccionIOS>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * C13 · Vista previa.
 *
 * La hoja se dibuja como papel —membrete, folio, dos firmas— y lo sustituido
 * se queda en verde para poder auditar de un barrido qué venía de un hueco.
 * Debajo, la única cifra que importa: nueve de nueve llenos.
 *
 * No es el `iframe` con el documento de impresión que usa el escritorio: a
 * 393 px una carta tamaño oficio entra al 45% y no se lee. Es el mismo texto,
 * a tamaño de teléfono, con los huecos marcados —que es justo lo que el
 * `iframe` no puede enseñar, porque ahí ya son texto plano.
 */
function VistaPrevia({ church, ctx, asunto, saludo, cuerpo, despedida, miembro, cuenta, puedeCambiar, onOtro, onCerrar }: {
  church: Church;
  ctx: Partial<Record<VariableId, string>>;
  asunto: string; saludo: string; cuerpo: string; despedida: string;
  miembro: string;
  cuenta: { total: number; llenos: number };
  puedeCambiar: boolean;
  onOtro: () => void;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCerrar);
  const refPapel = useRef<HTMLDivElement>(null);

  const dir = [church.direccion, [church.ciudad, church.region].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const contacto = [dir, church.telefono].filter(Boolean).join(" · ");
  const lugarFecha = [church.ciudad, fmtFechaLarga(new Date())].filter(Boolean).join(", ");

  const firmas = [
    church.pastor_nombre ? { nombre: church.pastor_nombre, cargo: church.pastor_cargo ?? t("rol.pastor") } : null,
    church.secretaria_nombre ? { nombre: church.secretaria_nombre, cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria") } : null,
  ].filter((f): f is { nombre: string; cargo: string } => f !== null);

  /** El cuerpo, con cada hueco sustituido por su valor en verde (o el nombre
   *  del hueco en ámbar si no hay dato). Se camina el HTML igual que en el
   *  editor, así que negritas y listas siguen siendo negritas y listas. */
  useEffect(() => {
    if (refPapel.current) refPapel.current.innerHTML = sustituirMarcado(cuerpo, ctx);
  }, [cuerpo, ctx]);

  async function compartir() {
    const doc = `<!doctype html><meta charset="utf-8"><title>${t("cartas.vistaPrevia")}</title>` +
      `<div>${sustituirMarcado(cuerpo, ctx)}</div>`;
    await abrirCartaParaImprimir(doc, t("plantillas.folioEjemplo"));
  }

  return (
    <div className="ios-sheet-overlay">
      <div className="ios-sheet pl-hoja" role="dialog" aria-label={t("cartas.vistaPrevia")}>
        <div className="ios-nav">
          <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCerrar}>{t("common.cerrar")}</button>
          <h1 className="ios-nav-title">{t("cartas.vistaPrevia")}</h1>
          <span className="ios-nav-status">
            <button type="button" className="ios-nav-action" onClick={compartir}>{t("common.compartir")}</button>
          </span>
        </div>

        <p className="pl-aviso"><span className="pl-punto" aria-hidden="true" />{t("plantillas.previaAviso", { nombre: miembro })}</p>

        <div className="ios-sheet-body pl-cuerpo">
          <div className="pl-papel">
            <div className="pl-membrete">
              <span className="pl-iglesia">{church.nombre}</span>
              {contacto && <span className="pl-contacto">{contacto}</span>}
            </div>
            <div className="pl-meta">
              <span>{t("cartas.etiquetaFolio")} <b>{t("plantillas.folioEjemplo")}</b></span>
              <span>{lugarFecha}</span>
            </div>
            {asunto && <div className="pl-asunto">{t("cartas.asunto")}: <Sustituido texto={asunto} ctx={ctx} /></div>}
            {saludo && <div><Sustituido texto={saludo} ctx={ctx} /></div>}
            <div ref={refPapel} className="pl-papel-cuerpo" />
            {despedida && <div className="pl-despedida"><Sustituido texto={despedida} ctx={ctx} /></div>}
            {firmas.length > 0 && (
              <div className="pl-firmas">
                {firmas.map((f) => (
                  <span className="pl-firma" key={f.nombre}>
                    <span className="pl-firma-nombre">{f.nombre}</span>
                    <span className="pl-firma-cargo">{f.cargo}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <SeccionIOS compacta pie={t("plantillas.pieProbar")}>
            <div className="ios-txrow">
              <div className="ios-txrow-main"><div className="ios-txrow-title">{t("plantillas.huecosLlenos")}</div></div>
              <div className="ios-txrow-trailing">
                <span className={`ios-fila-valor${cuenta.llenos < cuenta.total ? " pl-incompleto" : ""}`}>
                  {t("plantillas.deTotal", { llenos: cuenta.llenos, total: cuenta.total })}
                </span>
              </div>
            </div>
            {puedeCambiar && (
              <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onOtro}>
                <div className="ios-txrow-main"><div className="ios-txrow-title es-accion">{t("plantillas.probarOtro")}</div></div>
                <div className="ios-txrow-trailing"><IosChevron /></div>
              </button>
            )}
          </SeccionIOS>
        </div>
      </div>
    </div>
  );
}

/** Un texto plano con los huecos ya sustituidos y marcados. */
function Sustituido({ texto, ctx }: { texto: string; ctx: Partial<Record<VariableId, string>> }) {
  return (
    <>
      {partirEnHuecos(texto).map((tr, i) => {
        if (tr.tipo === "texto") return <span key={i}>{tr.texto}</span>;
        const v = ctx[tr.clave];
        return v
          ? <span key={i} className="pl-lleno">{v}</span>
          : <span key={i} className="hueco hueco--falta">{i18nEtiqueta(tr.clave)}</span>;
      })}
    </>
  );
}

/** Lo mismo sobre HTML: el cuerpo conserva sus negritas y sus listas. */
function sustituirMarcado(html: string, ctx: Partial<Record<VariableId, string>>): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const textos: Text[] = [];
  const it = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) textos.push(n as Text);
  for (const nodo of textos) {
    const trozos = partirEnHuecos(nodo.nodeValue ?? "");
    if (trozos.every((tr) => tr.tipo === "texto")) continue;
    const frag = doc.createDocumentFragment();
    for (const tr of trozos) {
      if (tr.tipo === "texto") { frag.appendChild(doc.createTextNode(tr.texto)); continue; }
      const v = ctx[tr.clave];
      const span = doc.createElement("span");
      span.className = v ? "pl-lleno" : "hueco hueco--falta";
      span.textContent = v || i18nEtiqueta(tr.clave);
      frag.appendChild(span);
    }
    nodo.parentNode?.replaceChild(frag, nodo);
  }
  return doc.body.innerHTML;
}
