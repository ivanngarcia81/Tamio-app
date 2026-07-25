import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { es } from "./es";
import { en } from "./en";

/** "auto" sigue el idioma del sistema operativo (como el tema claro/oscuro). */
export type LangPref = "auto" | "es" | "en";
export type Lang = "es" | "en";

const STORAGE_KEY = "tesoreria-lang";

export function systemLang(): Lang {
  const nav = (navigator.language || "es").toLowerCase();
  return nav.startsWith("es") ? "es" : "en";
}

export function initialLangPref(): LangPref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en" || saved === "auto") return saved;
  } catch { /* noop */ }
  return "auto";
}

export function resolveLang(pref: LangPref): Lang {
  return pref === "auto" ? systemLang() : pref;
}

export function saveLangPref(pref: LangPref): void {
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* noop */ }
}

/** Idioma activo, para código fuera de React (formateo de fechas, PDFs). */
export function currentLang(): Lang {
  return i18n.language === "en" ? "en" : "es";
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: resolveLang(initialLangPref()),
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

// El menú nativo de macOS se arma en Rust y arranca en español: aquí se le
// avisa el idioma real al iniciar y cada vez que cambia en Configuración.
function syncMenuLanguage(lng: string) {
  invoke("menu_language", { lang: lng === "en" ? "en" : "es" }).catch(() => {});
}
i18n.on("languageChanged", syncMenuLanguage);
syncMenuLanguage(i18n.language);

export default i18n;
