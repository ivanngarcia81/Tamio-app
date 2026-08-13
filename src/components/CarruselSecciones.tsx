import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { areaDeRuta, seccionesVisibles, type Contador } from "../navegacion";
import type { Role } from "../role";

interface Props {
  role: Role;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
}

/**
 * Segundo nivel de navegación en el teléfono: las secciones del área en la que
 * se está, en una tira que se desliza a lo ancho.
 *
 * **Siempre están todas las del área, en el mismo orden.** Aunque alguna tenga
 * además su atajo en la barra de abajo, aquí no falta ninguna: una lista que
 * cambia de contenido según dónde estés obliga a buscar dos veces.
 *
 * Fuera de las áreas —Inicio, Mensajes, Ayuda, Ajustes— no se pinta nada. Esas
 * pantallas no tienen hermanas, y una tira con un solo elemento es ruido.
 */
export default function CarruselSecciones({ role, memberCount, pendingCount, unreadCount }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const tira = useRef<HTMLDivElement>(null);

  const area = areaDeRuta(pathname);
  const secciones = area ? seccionesVisibles(area, role) : [];

  // La pestaña activa se trae a la vista. Sin esto, entrar en Agenda —la
  // última de Secretaría— deja la tira mostrando las tres primeras y parece
  // que no hay ninguna seleccionada.
  useEffect(() => {
    const activa = tira.current?.querySelector<HTMLElement>(".carrusel-item.activo");
    activa?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  if (secciones.length < 2) return null;

  const numero = (c?: Contador): number => {
    if (c === "miembros") return memberCount;
    if (c === "pendientes") return pendingCount;
    if (c === "noLeidos") return unreadCount;
    return 0;
  };

  return (
    <div className="carrusel-secciones" ref={tira}>
      {secciones.map((s) => {
        const n = numero(s.contador);
        return (
          <NavLink
            key={s.ruta}
            to={s.ruta}
            className={`carrusel-item${pathname === s.ruta ? " activo" : ""}`}
          >
            {t(s.clave)}
            {n > 0 && <span className="carrusel-badge">{n > 99 ? "99+" : n}</span>}
          </NavLink>
        );
      })}
    </div>
  );
}
