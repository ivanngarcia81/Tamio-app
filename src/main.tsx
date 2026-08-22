import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./i18n";

// Clase de plataforma para el CSS: iPadOS se reporta como "MacIntel" pero con
// pantalla táctil, por eso el segundo chequeo. En escritorio no agrega nada.
const esIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (esIOS) document.documentElement.classList.add("movil");

// Clase aparte para el iPhone específicamente (ni iPad ni Mac). El sidebar
// con su split view es cosa de iPad/Mac; en iPhone no corresponde nunca, en
// ningún ancho. Antes de esto, el sidebar se activaba por ANCHO de ventana
// (el mismo rango que usa iPad), así que un iPhone en horizontal —más ancho
// que el umbral— se comportaba como un iPad angosto: sidebar encima, y
// "Cerrar sesión" (que solo vivía ahí) se volvía inalcanzable en vertical
// sin ese giro. Detectar por PLATAFORMA, no por ancho, corrige eso de raíz:
// un iPhone nunca es un iPad, gírelo como lo gire.
const esIPhone = /iPhone|iPod/.test(navigator.userAgent);
if (esIPhone) document.documentElement.classList.add("iphone");

// Y el iPad, que hasta ahora no tenía nombre propio: era `.movil` sin ser
// `.iphone`, es decir, se describía por lo que NO es. Eso bastaba mientras el
// iPad se conformara con el layout de escritorio más las superficies de iOS,
// pero deja de bastar en cuanto tiene decisiones suyas —barra de 56px en vez
// de la cabecera apilada del teléfono, sidebar de 318px, la hoja de "Nuevo"—
// que no valen ni para el iPhone (demasiado ancho) ni para el Mac (dedo, no
// ratón). Con `:root.ipad` esas reglas se escriben una vez y no alcanzan a
// nadie más. Un iPad es un `.movil` que no es `.iphone`: la misma cuenta que
// hacía `esMovil() && !esIPhone()` repartida por los componentes.
const esIPad = esIOS && !esIPhone;
if (esIPad) document.documentElement.classList.add("ipad");

// Y la tercera: escritorio. Hasta ahora "Mac" era la AUSENCIA de `.movil`, y
// eso servía mientras el CSS de escritorio fuera el de partida. Deja de
// servir en cuanto el escritorio tiene reglas PROPIAS: escribirlas sin
// selector las metería también en el iPad, que comparte con el Mac cada
// pantalla y cada componente (el sidebar, sin ir más lejos) y necesita lo
// contrario — objetivos de 44 pt, no filas de 28 px de ratón. Con la clase,
// toda regla de Mac empieza por `:root.mac` y no puede alcanzar a un táctil
// ni por accidente.
const esEscritorio = !esIOS;
if (esEscritorio) document.documentElement.classList.add("mac");

// Y una cuarta clase que, a diferencia de las tres de arriba, SÍ cambia
// durante la sesión: `ipad-ancho` marca al iPad cuando está en una anchura
// REGULAR (700px o más), que es donde vive el rediseño. Existe porque el
// bloque `@media (min-width: 601px) and (max-width: 1023px)` de styles.css
// —el cajón lateral con forma de teléfono— caía encima de los tres iPads
// que en vertical miden menos de 1024 (mini 744, 10.9" 820, 11" 834): con
// el rediseño puesto a partir de 700, esos tres seguían pintando filas de
// sidebar de 40px, tarjetas de resumen de dos en dos y tablas colapsadas a
// tres columnas. Una media query no puede preguntar por una clase, así que
// la pregunta se hace aquí y el CSS la lee con `:not(.ipad-ancho)`.
//
// Con listener y no una lectura suelta: este valor cambia al GIRAR el iPad
// y al repartir la pantalla (Split View baja de 700 y el diseño compacto
// vuelve a ser el correcto), que es justo lo que un `innerWidth` leído una
// vez al arrancar no se entera.
if (esIPad) {
  const anchoRegular = window.matchMedia("(min-width: 700px)");
  const marcarAncho = () =>
    document.documentElement.classList.toggle("ipad-ancho", anchoRegular.matches);
  marcarAncho();
  anchoRegular.addEventListener("change", marcarAncho);
}

// Foco de ventana. En macOS la selección del sidebar se apaga a gris cuando
// la ventana pasa a segundo plano; es de las señales que más delatan a una
// app web cuando falta. Va en el DOM y no en estado de React a propósito:
// con `useState` cada cambio de foco re-renderiza la Shell entera, y esto es
// un atributo que solo lee el CSS.
if (esEscritorio) {
  const marcarFoco = (activa: boolean) =>
    document.documentElement.setAttribute("data-ventana-activa", String(activa));
  marcarFoco(document.hasFocus());
  window.addEventListener("focus", () => marcarFoco(true));
  window.addEventListener("blur", () => marcarFoco(false));
}

// Errores que ocurren FUERA del árbol de React: al cargar los módulos, o en
// una promesa que nadie atrapa. El ErrorBoundary no los ve —solo captura lo
// que falla al pintar sus hijos— así que sin esto siguen dando una ventana en
// blanco y muda. Se escribe directamente en el DOM, sin React, porque puede
// que React ni haya llegado a montarse.
function mostrarFalloTemprano(titulo: string, detalle: string): void {
  const raiz = document.getElementById("root");
  if (!raiz || raiz.dataset.fallo === "1") return; // no tapar el primer error
  raiz.dataset.fallo = "1";
  raiz.innerHTML = "";
  const caja = document.createElement("div");
  caja.className = "pantalla-error";
  const h = document.createElement("h2");
  h.textContent = titulo;
  const p = document.createElement("p");
  p.textContent = "Tus datos no se han perdido. Copia este texto y pásalo por el chat.";
  const pre = document.createElement("pre");
  pre.textContent = detalle;
  caja.append(h, p, pre);
  raiz.appendChild(caja);
}

window.addEventListener("error", (e) => {
  mostrarFalloTemprano("Tamio no pudo arrancar", `${e.message}\n${e.filename}:${e.lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  mostrarFalloTemprano(
    "Tamio no pudo arrancar",
    r instanceof Error ? `${r.message}\n${r.stack ?? ""}` : String(r)
  );
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
