import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { IconPlus } from "../icons";
import { areaDeRuta, barraDeRol, type Contador } from "../navegacion";
import type { Role } from "../role";
import { EVENTO_FILA, hayFilaAbierta } from "./useFilaDeslizable";

interface Props {
  role: Role;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
  /** Abre la hoja de "¿Qué desea crear?". */
  onCrear: () => void;
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
 * El botón de crear va FLOTANDO sobre la barra y pegado al borde derecho, sin
 * quedar centrado sobre ninguna pestaña. Centrado sobre una se leería como
 * parte de esa pestaña; al borde se lee como lo que es, algo que flota sobre
 * la página. Y el borde derecho es la esquina que el pulgar alcanza sin
 * recolocar el teléfono.
 */
export default function BarraInferior({
  role, memberCount, pendingCount, unreadCount, onCrear,
}: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const ranuras = barraDeRol(role);

  // El botón de crear se aparta mientras hay una fila deslizada: sus botones
  // de Editar y Eliminar salen por este mismo borde derecho, y es el único
  // sitio de la app donde un toque equivocado borra algo.
  const [filaAbierta, setFilaAbierta] = useState(false);
  useEffect(() => {
    const mirar = () => setFilaAbierta(hayFilaAbierta());
    window.addEventListener(EVENTO_FILA, mirar);
    return () => window.removeEventListener(EVENTO_FILA, mirar);
  }, []);

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
    <>
      <nav className="barra-inferior" aria-label={t("nav.abrirMenu")}>
        {ranuras.map(({ destino }) => {
          const areaDelDestino = areaDeRuta(destino.ruta);
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
              <span className="barra-label">{t(destino.clave)}</span>
              {n > 0 && <span className="barra-badge">{n > 99 ? "99+" : n}</span>}
            </NavLink>
          );
        })}
      </nav>

      <button
        type="button"
        className={`btn-crear${filaAbierta ? " oculto" : ""}`}
        onClick={onCrear}
        aria-label={t("crear.titulo")}
      >
        <IconPlus size={24} strokeWidth={2.4} />
      </button>
    </>
  );
}
