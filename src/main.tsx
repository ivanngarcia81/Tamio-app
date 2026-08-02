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
