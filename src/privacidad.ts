/**
 * privacidad.ts — "Ocultar montos al bloquear".
 *
 * Cuando la app se va a segundo plano, iOS le hace una **instantánea** para
 * enseñarla en el selector de aplicaciones. En una app de contabilidad de
 * iglesia esa instantánea es el saldo del mes a la vista de cualquiera que
 * coja el iPad — que en una iglesia lo coge mucha gente.
 *
 * **Se cubre el contenido entero, no solo las cifras**, y no por comodidad:
 * los montos se pintan con más de veinte clases distintas repartidas por toda
 * la app (`md-fila-monto`, `dep-cifra-val`, `ios-stat-num`, `r-amt`, `val`,
 * `v`…). Una lista de selectores se queda corta el día que alguien añade la
 * veintiuna, y en ESTA función quedarse corto significa enseñar justo lo que
 * se prometió tapar. Cubrir el contenedor no se puede quedar corto.
 *
 * La barra lateral no se cubre: enseña el nombre de la iglesia y los menús,
 * nada de dinero, y dejarla visible hace que en el selector de apps se
 * reconozca que eso es Tamio.
 */

const CLAVE = "tamio-ocultar-montos";
const ATRIBUTO = "data-privado";

export function ocultarMontosActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function setOcultarMontos(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE, activo ? "1" : "0");
  } catch { /* noop */ }
  // Apagarlo con la app tapada tiene que destaparla ya, no en el próximo
  // cambio de foco.
  if (!activo) document.documentElement.removeAttribute(ATRIBUTO);
}

function tapar(): void {
  if (ocultarMontosActivado()) document.documentElement.setAttribute(ATRIBUTO, "1");
}

function destapar(): void {
  document.documentElement.removeAttribute(ATRIBUTO);
}

/**
 * Engancha los avisos del sistema. Se llama una vez al arrancar.
 *
 * Son tres y hacen falta los tres: `visibilitychange` cubre el cambio de app
 * y el bloqueo de pantalla; `pagehide` cubre el caso en que el WebView se
 * congela sin pasar por el anterior; y `blur` cubre el multitarea del iPad,
 * donde la app pierde el foco sin llegar a esconderse —arrastrar otra encima
 * en Split View, por ejemplo—. Devuelve la función para desengancharlos.
 */
export function vigilarPrivacidad(): () => void {
  const alCambiar = () => (document.visibilityState === "hidden" ? tapar() : destapar());
  window.addEventListener("visibilitychange", alCambiar);
  document.addEventListener("visibilitychange", alCambiar);
  window.addEventListener("pagehide", tapar);
  window.addEventListener("blur", tapar);
  window.addEventListener("focus", destapar);
  return () => {
    window.removeEventListener("visibilitychange", alCambiar);
    document.removeEventListener("visibilitychange", alCambiar);
    window.removeEventListener("pagehide", tapar);
    window.removeEventListener("blur", tapar);
    window.removeEventListener("focus", destapar);
  };
}
