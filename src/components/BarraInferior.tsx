import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { areaDeRuta, barraDeRol, type Area, type Contador } from "../navegacion";
import type { Role } from "../role";
import { IconBank, IconCalendar, IconMail, IconReportes } from "../icons";
import { HomeIcon, PendingIcon, SecretaryIcon, SettingsIcon, TreasuryIcon } from "./icons/IOSIcons";

interface Props {
  role: Role;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
}

/** Icono por ruta, para las ranuras que apuntan a una pantalla concreta
 *  (atajos, o la única sección visible de un área — ver `comoArea` en
 *  navegacion.ts). Mismos iconos que ya usa `Sidebar.tsx` para cada ruta,
 *  así la barra inferior y la barra lateral se leen como el mismo mapa.
 *
 *  "/" y "/configuracion" son la excepción: en el teléfono llevan el glifo
 *  RELLENO de `IOSIcons.tsx` (25px, fill), la convención de iOS para
 *  íconos de tab bar — de contorno se leía como web. `/depositos`,
 *  `/reportes`, `/agenda` e `/inbox` se quedan con el de trazo de siempre:
 *  solo aparecen como atajo en configuraciones de rol menos comunes (una
 *  sola sección visible en un área, o Mensajes en vez de Bandeja) y el
 *  paquete de íconos entregado no traía un relleno para ellos — inventar
 *  uno nuevo se salía de "solo íconos, los que vienen en el paquete". */
const ICONOS_RUTA: Record<string, ReactNode> = {
  "/": <HomeIcon size={25} />,
  "/bandeja": <PendingIcon size={25} />,
  "/depositos": <IconBank size={20} strokeWidth={1.8} />,
  "/reportes": <IconReportes size={20} strokeWidth={1.8} />,
  "/agenda": <IconCalendar size={20} strokeWidth={1.8} />,
  "/inbox": <IconMail size={20} strokeWidth={1.8} />,
  "/configuracion": <SettingsIcon size={25} />,
};

/** Icono por ÁREA, para la ranura que representa el área entera (Tesorería,
 *  Secretaría) y no una pantalla suya en particular — su ruta es solo la
 *  primera sección visible, así que un icono de ruta ahí confundiría más de
 *  lo que aclara. Relleno, mismo motivo que arriba. */
const ICONOS_AREA: Record<Area["id"], ReactNode> = {
  tesoreria: <TreasuryIcon size={25} />,
  secretaria: <SecretaryIcon size={25} />,
};

/**
 * Barra de pestañas del teléfono. **Sustituye a la barra lateral**, no la
 * acompaña: en móvil el `Sidebar`, la hamburguesa y el telón se ocultan por
 * CSS y toda la navegación pasa por aquí más el carrusel de secciones.
 *
 * Cinco ranuras como mucho, y quién ocupa cada una lo decide `barraDeRol()`
 * en `navegacion.ts` — ahí está explicado por qué la tercera es un atajo y no
 * una mudanza.
 *
 * El botón de crear NO está aquí: vive en `BotonCrear`, porque el iPad lo
 * lleva y esta barra no.
 */
export default function BarraInferior({
  role, memberCount, pendingCount, unreadCount,
}: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const ranuras = barraDeRol(role);

  const numero = (c?: Contador): number => {
    if (c === "miembros") return memberCount;
    if (c === "pendientes") return pendingCount;
    if (c === "noLeidos") return unreadCount;
    return 0;
  };

  // Una pestaña de área se marca activa en TODAS sus secciones, no solo en la
  // que abre. Si no, al pasar de Ingresos a Gastos por el carrusel la barra se
  // apagaba entera y el usuario dejaba de saber dónde está.
  const areaActual = areaDeRuta(pathname);

  // Los atajos (Pending review, Bank deposit, Agenda…) apuntan a una pantalla
  // que TAMBIÉN es sección de su área — /bandeja está en Tesorería, /agenda en
  // Secretaría. Sin este freno, al aterrizar justo en la página de un atajo se
  // encendían las dos pestañas a la vez (la del atajo por ruta exacta y la del
  // área por pertenencia): "Treasury" y "Pending review" verdes juntas, y
  // ninguna de las dos diciendo de verdad dónde estás. El atajo, al ser más
  // específico, se queda con la ruta exacta y el área cede.
  const rutasDeAtajo = new Set(ranuras.filter((r) => r.atajo).map((r) => r.destino.ruta));

  return (
    <nav className="barra-inferior" aria-label={t("nav.abrirMenu")}>
      {ranuras.map(({ destino, atajo }) => {
          // Una pestaña de ÁREA se enciende en todas sus secciones. Un ATAJO
          // no: apunta a una pantalla concreta, y como esa pantalla pertenece
          // a un área, heredar la regla del área lo dejaba encendido a la vez
          // que la pestaña del área —dos pestañas verdes al mismo tiempo, y
          // ninguna de las dos diciendo dónde estás—.
          const areaDelDestino = atajo ? null : areaDeRuta(destino.ruta);
          const activo =
            pathname === destino.ruta ||
            (areaDelDestino !== null && areaDelDestino.id === areaActual?.id && !rutasDeAtajo.has(pathname));
          const n = numero(destino.contador);
          // Una pestaña de ÁREA (no atajo, con área propia) usa el icono del
          // área entera; el resto —Inicio, Ajustes, cada atajo— el de su ruta.
          const icono = areaDelDestino !== null ? ICONOS_AREA[areaDelDestino.id] : ICONOS_RUTA[destino.ruta];
          return (
            <NavLink
              key={destino.clave + destino.ruta}
              to={destino.ruta}
              className="barra-item"
              aria-selected={activo}
            >
              <span className="barra-icon" aria-hidden>{icono}</span>
              <span className="barra-label">{t(destino.claveCorta ?? destino.clave)}</span>
              {n > 0 && <span className="barra-badge">{n > 99 ? "99+" : n}</span>}
            </NavLink>
          );
        })}
    </nav>
  );
}
