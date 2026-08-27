import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { areaDeRuta, areasVisibles, primeraSeccion } from "../navegacion";
import type { Permisos, Role } from "../role";

interface Props {
  role: Role;
  permisos: Permisos;
}

/**
 * El nombre del área, a la izquierda de la fila de acciones del teléfono.
 *
 * Es la pieza que le faltaba a la cabecera de marca: con la banda verde, la
 * fila de arriba se quedaba con los glifos de la derecha y nada más, y la
 * maqueta («la cabecera y el carrusel, solos») la dibuja con el área a la
 * izquierda ocupando todo el hueco libre —`flex:1`— y un galón que dice que
 * se puede tocar.
 *
 * Tocarlo salta a la OTRA área, a su primera sección. No es un menú: con dos
 * áreas, un menú de dos entradas cuesta un toque de más para decir lo mismo.
 * Con una sola área visible —un tesorero, una secretaria— el galón no se
 * pinta y el nombre deja de ser un botón: no hay ningún otro sitio al que
 * llevar.
 *
 * Vive aquí y no dentro de cada `.header` por lo mismo que `.titulo-fijo`: es
 * cáscara, no contenido de la página. Y solo se pinta dentro de un área —
 * Inicio, Mensajes, Ayuda y Ajustes no pertenecen a ninguna, así que ahí la
 * fila se queda con sus glifos, igual que en la maqueta de Inicio.
 */
export default function AreaCabecera({ role, permisos }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const area = areaDeRuta(pathname);
  if (!area) return null;

  const areas = areasVisibles(role, permisos);
  const otra = areas.find((a) => a.id !== area.id);
  const nombre = t(area.clave);

  if (!otra) return <span className="area-cabecera">{nombre}</span>;

  return (
    <button
      type="button"
      className="area-cabecera es-boton"
      onClick={() => navigate(primeraSeccion(otra, role, permisos))}
      aria-label={t("nav.irA", { area: t(otra.clave) })}
    >
      {nombre}
      <svg width="10" height="7" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 1.5 6 6.5l5-5" />
      </svg>
    </button>
  );
}
