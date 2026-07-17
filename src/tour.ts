import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { TFunction } from "i18next";

/** Tutorial guiado (coach marks) sobre el sidebar, que siempre está montado.
 *  Los pasos cuyo elemento no existe para el rol actual (p. ej. el grupo de
 *  Secretaría cuando entra el tesorero) se descartan automáticamente. */
export function iniciarTour(t: TFunction): void {
  const candidatos: DriveStep[] = [
    { popover: { title: t("tour.introTitulo"), description: t("tour.introTexto") } },
    { element: '[data-tour="marca"]', popover: { title: t("tour.marcaTitulo"), description: t("tour.marcaTexto"), side: "right", align: "start" } },
    { element: '[data-tour="inicio"]', popover: { title: t("tour.inicioTitulo"), description: t("tour.inicioTexto"), side: "right", align: "start" } },
    { element: '[data-tour="tesoreria"]', popover: { title: t("tour.tesoreriaTitulo"), description: t("tour.tesoreriaTexto"), side: "right", align: "start" } },
    { element: '[data-tour="secretaria"]', popover: { title: t("tour.secretariaTitulo"), description: t("tour.secretariaTexto"), side: "right", align: "start" } },
    { element: '[data-tour="ayuda"]', popover: { title: t("tour.ayudaTitulo"), description: t("tour.ayudaTexto"), side: "right", align: "start" } },
    { element: '[data-tour="config"]', popover: { title: t("tour.configTitulo"), description: t("tour.configTexto"), side: "right", align: "start" } },
    { popover: { title: t("tour.finTitulo"), description: t("tour.finTexto") } },
  ];
  const steps = candidatos.filter((s) => !s.element || document.querySelector(s.element as string));
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
