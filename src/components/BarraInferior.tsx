import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { areaDeRuta, barraDeRol, type Contador } from "../navegacion";
import type { Role } from "../role";

interface Props {
  role: Role;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
}

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
            (areaDelDestino !== null && areaDelDestino.id === areaActual?.id);
          const n = numero(destino.contador);
          return (
            <NavLink
              key={destino.clave + destino.ruta}
              to={destino.ruta}
              className={`barra-item${activo ? " activo" : ""}`}
            >
              <span className="barra-punto" aria-hidden />
              <span className="barra-label">{t(destino.claveCorta ?? destino.clave)}</span>
              {n > 0 && <span className="barra-badge">{n > 99 ? "99+" : n}</span>}
            </NavLink>
          );
        })}
    </nav>
  );
}
