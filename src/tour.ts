import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { TFunction } from "i18next";
import { esIPhone } from "./movil";

/** ¿Este paso tiene algo que señalar AHORA MISMO?
 *
 *  Antes bastaba con que el elemento existiera, y eso rompía el tutorial en
 *  el teléfono sin avisar: el sidebar sigue montado ahí, solo que con
 *  `display: none` (styles.css ~7757), así que `querySelector` lo encontraba
 *  igual. driver.js acababa resaltando una caja de 0×0 en la esquina
 *  superior izquierda y colgando el globo a su derecha, fuera de todo.
 *
 *  `getClientRects()` vacío es exactamente "no ocupa sitio en la página",
 *  que es la pregunta que había que hacer. */
function seVe(selector: string): boolean {
  const el = document.querySelector(selector);
  return !!el && el.getClientRects().length > 0;
}

/** Tutorial guiado (coach marks). En Mac/iPad recorre el sidebar; en iPhone,
 *  la barra de pestañas, que es lo que lo sustituye. Los pasos cuyo elemento
 *  no se ve —el grupo de Secretaría con un tesorero, o el sidebar entero en
 *  el teléfono— se descartan solos. */
export function iniciarTour(t: TFunction): void {
  const enIPhone = esIPhone();

  // En el teléfono los globos van ARRIBA del elemento: la barra vive pegada
  // al borde inferior y un globo "a la derecha" se saldría de la pantalla.
  const lado = enIPhone ? "top" : "right";
  const alineado = enIPhone ? "center" : "start";
  const ancla = (nombre: string) => (enIPhone ? `[data-tour-barra="${nombre}"]` : `[data-tour="${nombre}"]`);

  const candidatos: DriveStep[] = [
    { popover: { title: t("tour.introTitulo"), description: t("tour.introTexto") } },
    // "Tu iglesia" y "Ayuda" son filas del sidebar y no tienen pestaña
    // propia en el teléfono: ahí el recorrido pasa de largo en vez de
    // señalar algo que no está.
    ...(enIPhone ? [] : [{ element: ancla("marca"), popover: { title: t("tour.marcaTitulo"), description: t("tour.marcaTexto"), side: lado, align: alineado } } as DriveStep]),
    { element: ancla("inicio"), popover: { title: t("tour.inicioTitulo"), description: t("tour.inicioTexto"), side: lado, align: alineado } },
    { element: ancla("tesoreria"), popover: { title: t("tour.tesoreriaTitulo"), description: t("tour.tesoreriaTexto"), side: lado, align: alineado } },
    { element: ancla("secretaria"), popover: { title: t("tour.secretariaTitulo"), description: t("tour.secretariaTexto"), side: lado, align: alineado } },
    ...(enIPhone ? [] : [{ element: ancla("ayuda"), popover: { title: t("tour.ayudaTitulo"), description: t("tour.ayudaTexto"), side: lado, align: alineado } } as DriveStep]),
    { element: ancla("config"), popover: { title: t("tour.configTitulo"), description: t("tour.configTexto"), side: lado, align: alineado } },
    { popover: { title: t("tour.finTitulo"), description: t("tour.finTexto") } },
  ];
  const steps = candidatos.filter((s) => !s.element || seVe(s.element as string));
  const d = driver({
    showProgress: true,
    overlayColor: "rgba(0, 0, 0, 0.55)",
    nextBtnText: t("tour.siguiente"),
    prevBtnText: t("tour.anterior"),
    doneBtnText: t("tour.listo"),
    progressText: "{{current}} / {{total}}",
    steps,
  });
  d.drive();
}

// v2: la v1 podía marcarse por error en la pantalla de login; al cambiar la
// clave, el tour se relanza una vez ya dentro de la app.
const CLAVE = "tamio-tour-hecho-v2";

/** true si el usuario aún no ha visto (ni saltado) el tutorial guiado. */
export function tourPendiente(): boolean {
  try { return localStorage.getItem(CLAVE) !== "1"; } catch { return false; }
}

export function marcarTourHecho(): void {
  try { localStorage.setItem(CLAVE, "1"); } catch { /* noop */ }
}
