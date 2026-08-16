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
