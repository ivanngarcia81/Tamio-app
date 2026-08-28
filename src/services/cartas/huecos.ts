/**
 * huecos.ts — «variable» pasa a llamarse HUECO, y deja de ser un valor para
 * ser una acción.
 *
 * En el escritorio una variable es un token que se escoge en un desplegable y
 * queda escrito en el texto como `{{miembro_nombre}}`. A 16 px en un teléfono
 * eso rompe la frase: las llaves y el guion bajo se comen el renglón y no se
 * distingue dónde acaba el hueco y empieza lo escrito.
 *
 * La maqueta (detalle tipográfico del handoff de Plantilla) resuelve las dos
 * mitades del problema por separado:
 *
 *   · **Cómo se dibuja.** Pastilla verde, nombre en español, sin llaves, y
 *     que se comporte como UN carácter para el cursor: se selecciona y se
 *     borra entera, nunca a medias. Eso es `pastillasEnHtml`, que sustituye
 *     `{{clave}}` por un `<span data-hueco>` no editable; el navegador ya
 *     trata un `contenteditable="false"` dentro de un editable como un átomo.
 *   · **Qué se guarda.** Nada de esto toca el texto almacenado: al salir del
 *     editor `llavesEnHtml` deshace la sustitución y la plantilla vuelve a
 *     tener sus `{{clave}}`. Ni la base ni `aplicarVariables` ni las cartas ya
 *     escritas se enteran de que existió la pastilla.
 *
 * El ámbar es la tercera pieza: un hueco que, con los datos que hay, se
 * quedaría sin llenar —una iglesia de destino en una plantilla que no es de
 * traslado— se pinta en ámbar mientras se ESCRIBE la plantilla, y no cuando
 * ya salió la carta impresa.
 */
import i18n from "../../i18n";
import { VARIABLES, type ContextoPlantilla, type VariableId } from "./plantillas";

/** Sintaxis interna. Es la misma de `aplicarVariables`: una sola definición
 *  de «qué es un hueco» para dibujarlo, contarlo y sustituirlo. */
const RE_HUECO = /\{\{\s*([a-z_]+)\s*\}\}/g;

export type GrupoHuecos = { id: string; claves: VariableId[] };

/** Los quince huecos, agrupados por DE DÓNDE SALE EL DATO —la iglesia, el
 *  documento, el miembro, el traslado—, que es la pregunta que se hace quien
 *  busca uno. Ordenados alfabéticamente serían un diccionario: útil para
 *  quien ya sabe el nombre, inútil para quien busca «lo de la fecha». */
export const GRUPOS_HUECOS: GrupoHuecos[] = [
  { id: "iglesia", claves: ["iglesia_nombre", "iglesia_direccion", "iglesia_telefono", "iglesia_correo", "ciudad", "pastor_nombre", "secretaria_nombre"] },
  { id: "documento", claves: ["numero_documento", "fecha_emision", "fecha_actual"] },
  { id: "miembro", claves: ["miembro_nombre", "fecha_membresia", "estado_membresia"] },
  { id: "traslado", claves: ["iglesia_destino", "iglesia_procedencia"] },
];

/** Nombre en español del hueco: el mismo que ya usaba el desplegable de
 *  escritorio, para que las dos plataformas lo llamen igual. */
export function etiquetaHueco(clave: string): string {
  return i18n.t(`plantillas.variable.${clave}`);
}

function esClave(c: string): c is VariableId {
  return (VARIABLES as readonly string[]).includes(c);
}

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "hueco"; clave: VariableId; falta: boolean };

/** Parte un texto plano —el asunto, el saludo— en trozos alternos de texto y
 *  hueco, para poder pintarlo con pastillas en React sin `dangerouslySet…`. */
export function partirEnHuecos(texto: string, faltan?: ReadonlySet<string>): Trozo[] {
  const trozos: Trozo[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(RE_HUECO)) {
    const i = m.index ?? 0;
    if (i > ultimo) trozos.push({ tipo: "texto", texto: texto.slice(ultimo, i) });
    const clave = m[1];
    if (esClave(clave)) trozos.push({ tipo: "hueco", clave, falta: faltan?.has(clave) ?? false });
    else trozos.push({ tipo: "texto", texto: m[0] });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) trozos.push({ tipo: "texto", texto: texto.slice(ultimo) });
  return trozos;
}

/** Cuántos huecos hay en estos textos y cuántos podrían llenarse con el
 *  contexto dado. Es la cifra de la vista previa: «9 de 9». */
export function contarHuecos(textos: string[], ctx: ContextoPlantilla): { total: number; llenos: number } {
  let total = 0;
  let llenos = 0;
  for (const texto of textos) {
    for (const m of (texto ?? "").matchAll(RE_HUECO)) {
      total++;
      const v = ctx[m[1] as VariableId];
      if (v !== undefined && v !== "") llenos++;
    }
  }
  return { total, llenos };
}

/** Las claves que faltarían con este contexto: las que se pintan en ámbar. */
export function huecosSinDato(textos: string[], ctx: ContextoPlantilla): Set<VariableId> {
  const falta = new Set<VariableId>();
  for (const texto of textos) {
    for (const m of (texto ?? "").matchAll(RE_HUECO)) {
      const clave = m[1];
      if (esClave(clave) && !ctx[clave]) falta.add(clave);
    }
  }
  return falta;
}

/** Párrafos y huecos del cuerpo, para el resumen de la fila («4 párrafos ·
 *  6 huecos»). El cuerpo es HTML del editor: los párrafos son sus bloques. */
export function resumenCuerpo(html: string): { parrafos: number; huecos: number } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const bloques = doc.body.querySelectorAll("p, div, li");
  const texto = doc.body.textContent ?? "";
  return {
    parrafos: bloques.length > 0 ? bloques.length : texto.trim() ? 1 : 0,
    huecos: [...texto.matchAll(RE_HUECO)].length,
  };
}

/** El HTML guardado, listo para el editor: cada `{{clave}}` se vuelve una
 *  pastilla no editable. Se camina el árbol en vez de pasar una expresión
 *  regular por la cadena entera porque un atributo con llaves —hoy no lo hay,
 *  mañana quién sabe— dejaría de ser texto y pasaría a ser marcado. */
export function pastillasEnHtml(html: string, faltan?: ReadonlySet<string>): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const textos: Text[] = [];
  const it = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) textos.push(n as Text);

  for (const nodo of textos) {
    const texto = nodo.nodeValue ?? "";
    if (!RE_HUECO.test(texto)) { RE_HUECO.lastIndex = 0; continue; }
    RE_HUECO.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    for (const trozo of partirEnHuecos(texto, faltan)) {
      if (trozo.tipo === "texto") frag.appendChild(doc.createTextNode(trozo.texto));
      else frag.appendChild(nodoPastilla(doc, trozo.clave, trozo.falta));
    }
    nodo.parentNode?.replaceChild(frag, nodo);
  }
  return doc.body.innerHTML;
}

function nodoPastilla(doc: Document, clave: VariableId, falta: boolean): HTMLElement {
  const span = doc.createElement("span");
  span.className = falta ? "hueco hueco--falta" : "hueco";
  span.setAttribute("data-hueco", clave);
  span.setAttribute("contenteditable", "false");
  span.textContent = etiquetaHueco(clave);
  return span;
}

/** El HTML del editor, listo para guardar: cada pastilla vuelve a ser
 *  `{{clave}}`. Es la inversa exacta de `pastillasEnHtml`, y la razón de que
 *  la clave viaje en `data-hueco` y no en la etiqueta visible: el texto que
 *  se guarda no depende del idioma en el que se editó. */
export function llavesEnHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const el of [...doc.body.querySelectorAll("[data-hueco]")]) {
    const clave = el.getAttribute("data-hueco") ?? "";
    el.parentNode?.replaceChild(doc.createTextNode(`{{${clave}}}`), el);
  }
  return doc.body.innerHTML;
}

/** Lo mismo para una línea suelta (el asunto): sin bloques, texto plano.
 *
 *  El `\u00a0` no es cosmética: un `contentEditable` mete espacios duros para
 *  que no se colapsen mientras se escribe, y guardarlos convertiría el asunto
 *  en una cadena que no parte por ningún lado —ni al imprimir la carta ni en
 *  la fila que la resume—. Salen como espacios normales. */
export function llavesEnTexto(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${llavesEnHtml(html)}</body>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
}

/** El HTML de la pastilla, como cadena, para insertarlo con `execCommand`. */
export function htmlPastilla(clave: VariableId, falta: boolean): string {
  const doc = document.implementation.createHTMLDocument("");
  const cont = doc.createElement("div");
  cont.appendChild(nodoPastilla(doc, clave, falta));
  return cont.innerHTML;
}
