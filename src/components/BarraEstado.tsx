/**
 * BarraEstado.tsx — la franja de 26 px al pie de la ventana en el Mac.
 *
 * POR QUÉ EXISTE. Al pasar las pantallas a la toolbar de 52 px, nueve de ellas
 * tuvieron que apagar su `page-sub` en Mac (`{!esMac() && <div
 * className="page-sub">…`): la frase que explicaba la pantalla —"Registro de
 * las reuniones y acuerdos de la iglesia"— no cabe en una barra donde el
 * título comparte renglón con los botones. El dato se perdió, no se movió.
 *
 * Aquí vuelve, en el sitio donde macOS pone siempre ese tipo de resumen: el
 * pie de la ventana (Finder cuenta los elementos y el espacio libre; Mail, los
 * mensajes sin leer). Izquierda, el recuento de LO QUE SE ESTÁ VIENDO;
 * derecha, el estado de la sincronización.
 *
 * SOLO MAC. En el iPhone y el iPad no hay barra de estado: el espacio vertical
 * es el recurso escaso y ahí el resumen vive dentro de la propia pantalla.
 * El CSS la apaga fuera de `:root.mac`, así que este componente puede
 * montarse siempre sin condicionales repartidos por el shell.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ejecutarSync, useSync, type SyncEstado } from "../syncManager";

/** El texto que publica la pantalla activa, y el hueco donde lo deja. */
const Contexto = createContext<((texto: string | null) => void) | null>(null);

export default function BarraEstadoProvider({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <Contexto.Provider value={setTexto}>
      {children}
      <BarraEstado texto={texto} />
    </Contexto.Provider>
  );
}

/**
 * Publica el resumen de esta pantalla mientras esté montada.
 *
 * Se pasa el texto ya formado —y no las piezas— porque cada pantalla cuenta
 * cosas distintas ("18 ingresos en agosto · $18,240.00", "3 por revisar") y un
 * formateador genérico acabaría siendo un `switch` sobre la ruta, que es justo
 * el acoplamiento que este hueco evita.
 *
 * `null` deja la barra vacía sin ocultarla: una franja que aparece y
 * desaparece al cambiar de pantalla movería el contenido 26 px cada vez.
 */
export function useBarraEstado(texto: string | null) {
  const publicar = useContext(Contexto);
  useEffect(() => {
    publicar?.(texto);
    return () => publicar?.(null);
  }, [publicar, texto]);
}

function BarraEstado({ texto }: { texto: string | null }) {
  const { t, i18n } = useTranslation();
  const snap = useSync();

  /* Un latido para que "hace 2 minutos" siga siendo verdad. `useSync` solo
     redibuja cuando cambia la sincronización, así que sin esto el texto se
     quedaría congelado en "hace unos segundos" hasta la siguiente. Cada 30 s
     y no cada segundo: la unidad más fina que se enseña es el minuto. */
  const [, latir] = useState(0);
  useEffect(() => {
    const id = setInterval(() => latir((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="barra-estado">
      <span className="barra-estado-resumen">{texto ?? ""}</span>
      {snap.estado !== "desactivado" && (
        <button
          type="button"
          className="barra-estado-sync"
          onClick={() => { void ejecutarSync(); }}
          disabled={snap.estado === "sincronizando"}
          title={t("sync.hintAuto")}
        >
          {textoSync(t, i18n.language, snap.estado, snap.ultima)}
        </button>
      )}
    </div>
  );
}

/** "Actualizado hace 2 minutos", o el estado cuando no hay nada que fechar.
 *
 *  El tiempo relativo se calcula con `Intl.RelativeTimeFormat`, que ya sabe
 *  decirlo en los dos idiomas: escribirlo a mano habría necesitado las reglas
 *  de plural de cada uno en i18n para algo que el navegador trae hecho. */
function textoSync(
  t: (clave: string, opciones?: Record<string, unknown>) => string,
  idioma: string,
  estado: SyncEstado,
  ultima: number | null,
): string {
  if (estado === "sincronizando" || estado === "offline" || estado === "error") {
    return t(`sync.estado.${estado}`);
  }
  if (ultima == null) return t("sync.estado.inactivo");

  const segundos = Math.round((Date.now() - ultima) / 1000);
  const rtf = new Intl.RelativeTimeFormat(idioma || "es", { numeric: "auto" });
  const relativo =
    segundos < 60 ? rtf.format(-segundos, "second")
      : segundos < 3600 ? rtf.format(-Math.round(segundos / 60), "minute")
        : segundos < 86400 ? rtf.format(-Math.round(segundos / 3600), "hour")
          : rtf.format(-Math.round(segundos / 86400), "day");
  return t("sync.actualizado", { cuando: relativo });
}
