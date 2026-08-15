import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { areaDeRuta, seccionesVisibles, type Contador } from "../navegacion";
import type { Role } from "../role";

interface Props {
  role: Role;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
}

/**
 * Segundo nivel de navegación en el teléfono: las secciones del área en la
 * que se está, en un selector de "desliza para elegir" — como una rueda de
 * picker. El círculo de vidrio se queda fijo en el centro; lo que se mueve
 * es la tira de secciones por debajo, y la que quede bajo el selector al
 * soltar es la que se abre. Tocar una sección funciona igual, deslizándola
 * al centro.
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
  const navigate = useNavigate();
  const contenedor = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLElement>());
  // Mientras la ruta cambia por fuera (barra inferior, atrás del navegador…)
  // el efecto de abajo desliza la sección nueva al centro — y ese propio
  // deslizamiento no debe leerse como "el usuario eligió otra sección" y
  // disparar una segunda navegación. Esta bandera corta ese eco.
  const propio = useRef(false);

  const area = areaDeRuta(pathname);
  const secciones = area ? seccionesVisibles(area, role) : [];

  // La sección activa se trae al centro. Cubre tanto la navegación externa
  // (entrar a Agenda desde la barra inferior, por ejemplo) como la respuesta
  // visual a un toque directo sobre una sección.
  //
  // `behavior: "instant"`, no "smooth": con `scroll-snap-type` activo, una
  // animación suave programática compite con el encaje nativo del propio
  // WebKit (el motor de iOS) por quién manda en la posición final, y a veces
  // gana el snap a mitad de camino — el resultado es que la sección se queda
  // centrada en el sitio equivocado. Pasa a veces sí y a veces no (es una
  // carrera, no un cálculo incorrecto), que es justo el síntoma que se vio.
  // El deslizamiento con el dedo, que es la interacción principal, no pasa
  // por aquí y sigue tan fluido como siempre.
  useEffect(() => {
    const el = items.current.get(pathname);
    if (!el) return;
    propio.current = true;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
    // La píldora de vidrio no se mueve, pero sí se ajusta de ancho a la
    // sección que le toca ("Ingresos" y "Por revisar" no miden igual). El
    // ancho se publica como variable CSS para que la anime el propio CSS.
    const caja = el.getBoundingClientRect();
    contenedor.current?.style.setProperty("--ancho-selector", `${Math.round(caja.width)}px`);
    const t = setTimeout(() => { propio.current = false; }, 100);
    return () => clearTimeout(t);
  }, [pathname]);

  // Al soltar el dedo, qué sección quedó bajo el selector fijo del centro —
  // esa es la que se abre. Se calcula al ASENTARSE el scroll (con una espera
  // corta sin eventos nuevos), no en cada fotograma del gesto.
  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    let temporizador: ReturnType<typeof setTimeout>;
    function alAsentar() {
      if (propio.current) return;
      const centro = el!.getBoundingClientRect().left + el!.clientWidth / 2;
      let mejor: { ruta: string; distancia: number } | null = null;
      for (const [ruta, nodo] of items.current) {
        const r = nodo.getBoundingClientRect();
        const distancia = Math.abs(r.left + r.width / 2 - centro);
        if (!mejor || distancia < mejor.distancia) mejor = { ruta, distancia };
      }
      if (mejor && mejor.ruta !== pathname) navigate(mejor.ruta);
    }
    function alDeslizar() {
      clearTimeout(temporizador);
      temporizador = setTimeout(alAsentar, 120);
    }
    el.addEventListener("scroll", alDeslizar, { passive: true });
    return () => { el.removeEventListener("scroll", alDeslizar); clearTimeout(temporizador); };
  }, [pathname, navigate]);

  if (secciones.length < 2) return null;

  const numero = (c?: Contador): number => {
    if (c === "miembros") return memberCount;
    if (c === "pendientes") return pendingCount;
    if (c === "noLeidos") return unreadCount;
    return 0;
  };

  return (
    <div className="carrusel-secciones" ref={contenedor}>
      {/* La píldora de vidrio: un elemento APARTE, clavado en el centro, que
          no se mueve nunca. Los nombres se deslizan por debajo. Antes el
          resalte iba pegado al nombre activo, así que se paseaba con él —
          que es justo lo que no hace ni Copilot ni Proyecto B. Su ancho lo
          fija el efecto de arriba, copiando el de la sección activa. */}
      <span className="carrusel-selector" aria-hidden="true" />
      <div className="carrusel-pista" ref={pista}>
        <span className="carrusel-relleno" aria-hidden="true" />
        {secciones.map((s) => {
          const n = numero(s.contador);
          return (
            <button
              key={s.ruta}
              ref={(nodo) => {
                if (nodo) items.current.set(s.ruta, nodo);
                else items.current.delete(s.ruta);
              }}
              type="button"
              className={`carrusel-item${pathname === s.ruta ? " activo" : ""}`}
              onClick={() => navigate(s.ruta)}
            >
              {t(s.clave)}
              {n > 0 && <span className="carrusel-badge">{n > 99 ? "99+" : n}</span>}
            </button>
          );
        })}
        <span className="carrusel-relleno" aria-hidden="true" />
      </div>
    </div>
  );
}
