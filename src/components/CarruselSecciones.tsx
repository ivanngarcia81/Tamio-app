import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { esIPhone } from "../movil";
import { areaDeRuta, seccionesVisibles, type Contador } from "../navegacion";
import type { Permisos, Role } from "../role";

interface Props {
  role: Role;
  /** Los permisos del rol (migración 49). */
  permisos: Permisos;
  memberCount: number;
  pendingCount: number;
  sinVerCount: number;
  /** Qué sección se está asomando por el lado mientras se arrastra, o null.
   *  Se llama SOLO cuando cambia —no en cada fotograma—, porque del otro lado
   *  hay un `setState` que redibuja el shell. */
  onVecina?: (ruta: string | null) => void;
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
export default function CarruselSecciones({ role, permisos, memberCount, pendingCount, sinVerCount, onVecina }: Props) {
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
  /** Posición de la sección anterior, para saber hacia qué lado se viaja. */
  const indiceAnterior = useRef<number | null>(null);
  /** La última vecina anunciada, para no repetir el aviso en cada fotograma. */
  const vecinaActual = useRef<string | null>(null);
  /* El callback en una ref: cambia de identidad en cada render del shell y no
     debe reiniciar el efecto del scroll por eso. */
  const avisar = useRef(onVecina);
  avisar.current = onVecina;

  const area = areaDeRuta(pathname);
  const secciones = area ? seccionesVisibles(area, role, permisos) : [];

  // Hacia qué lado va el viaje, para que la página entre desde ahí (lo pinta
  // el CSS leyendo `data-dir-nav`). Sin esto la página aparecería de golpe
  // mientras los nombres se deslizan, y las dos mitades no contarían la
  // misma historia. Fuera de un área se borra: Inicio o Ajustes no tienen
  // hermanas a izquierda ni derecha, así que no hay dirección que animar.
  //
  // useLayoutEffect y no useEffect: la página nueva (su .header/.content) se
  // monta en el MISMO commit que este cambio de ruta, y necesita conocer la
  // dirección ANTES de que el navegador pinte el primer fotograma de su
  // animación de entrada. Con useEffect llegaría un instante tarde.
  useLayoutEffect(() => {
    const indice = secciones.findIndex((s) => s.ruta === pathname);
    const raiz = document.documentElement;
    if (indice < 0) {
      delete raiz.dataset.dirNav;
      indiceAnterior.current = null;
      return;
    }
    const previo = indiceAnterior.current;
    if (previo !== null && previo !== indice) {
      raiz.dataset.dirNav = indice > previo ? "der" : "izq";
    }
    indiceAnterior.current = indice;
  }, [pathname, secciones]);

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

  /* El desenfoque del carrusel de Copilot: las secciones se difuminan, se
     apagan y encogen conforme se alejan del centro, y el nombre que está bajo
     la píldora es el único nítido. No es adorno: es lo que hace que la tira se
     lea como una rueda con profundidad y no como una fila de pastillas.

     Se calcula desde la POSICIÓN REAL del scroll en cada fotograma, no con una
     transición de CSS. El diseño de referencia mueve la tira con un
     `translateX` de JavaScript y anima el desenfoque en 520 ms; aquí quien
     manda es el dedo sobre un contenedor con scroll nativo, y una transición
     de medio segundo dejaría el desenfoque medio segundo por detrás del dedo.
     Sin transición, el valor sigue al gesto exactamente, que es justo lo que
     lo hace sentir nativo. Al tocar una sección el salto es instantáneo
     —`scrollIntoView` ya usa "instant" a propósito, ver arriba— y el
     desenfoque salta con él, en el mismo fotograma.

     Cada ítem recibe `--d` (0 en el centro, 1 en el borde) y el CSS decide qué
     hacer con él. Son seis secciones como mucho, así que el coste por
     fotograma es despreciable incluso con `filter`. */
  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    let pendiente = 0;

    function pintar() {
      pendiente = 0;
      const caja = el!.getBoundingClientRect();
      const centro = caja.left + caja.width / 2;
      /* `d` sale de la distancia del BORDE MÁS CERCANO del nombre al centro
         de la tira: 0 mientras el nombre pisa el centro (es el que está bajo
         la píldora), y sube conforme su borde se aleja de ella.

         Antes se calculaba con cuánto se SALÍA el nombre por el borde lejano
         de la tira. Medido en el teléfono, eso ataba el desenfoque al LARGO
         del nombre en vez de a su distancia, y borraba justo las vecinas que
         más falta hacen: en /reporte-miembros, "Certificates & transfers"
         (218 px de ancho) y "Agenda & calendar" tenían 80 px cada una dentro
         de la pantalla, pegadas a la píldora, y aun así salían a d=1 —
         opacidad 0,2 y 7 px de desenfoque, o sea invisibles. Con un nombre
         corto al lado ("Service log", 121 px) la misma posición daba d=0,41 y
         se leía perfectamente. Resultado: en unas secciones se asomaban las
         dos vecinas, en otras una, en otras ninguna — y una tira sin nada
         asomando no parece una tira, parece un título suelto.

         Midiendo desde el centro, la misma posición da el mismo desenfoque
         lleve el nombre once letras o veinticuatro. La banda franca deja
         nítido lo que está bajo la píldora; la rampa está calibrada para que
         la vecina inmediata caiga entre 0,3 y 0,7 —que es el rango en el que
         ya se leían bien las de Actas— y la segunda vecina, que arranca a más
         de 190 px del centro, siga saturando en 1. */
      const franca = 34;
      const rampa = 132;
      for (const nodo of items.current.values()) {
        const r = nodo.getBoundingClientRect();
        // 0 si el nombre cruza el centro; si no, cuánto le falta para llegar.
        const cerca = Math.max(0, r.left - centro, centro - r.right);
        const d = Math.min(1, Math.max(0, (cerca - franca) / rampa));
        nodo.style.setProperty("--d", d.toFixed(3));
      }
      publicarDesvio(centro);
    }

    /* La página acompaña al carrusel: mientras el dedo arrastra la tira, el
       contenido de debajo se desplaza y se apaga en la MISMA proporción, de
       modo que el gesto mueve las dos cosas a la vez en vez de mover los
       nombres y cambiar la página de golpe al soltar.

       `--nav-p` va de −1 a 1: 0 con la sección activa centrada, ±1 cuando la
       vecina ya ocupó el centro. El signo es el mismo que el del arrastre, así
       que la página va hacia donde va el dedo. */
    function publicarDesvio(centro: number) {
      const raiz = document.documentElement;
      const orden = secciones.map((sx) => items.current.get(sx.ruta)).filter(Boolean) as HTMLElement[];
      const activo = items.current.get(pathname);
      let p = 0;
      let rutaVecina: string | null = null;
      if (activo && orden.length > 1) {
        const ra = activo.getBoundingClientRect();
        const cx = ra.left + ra.width / 2;
        const desvio = cx - centro;
        const i = orden.indexOf(activo);
        // La vecina hacia la que se está arrastrando: si el activo se fue a la
        // izquierda del centro, la que viene es la siguiente.
        const j = desvio < 0 ? i + 1 : i - 1;
        const vecina = orden[j];
        if (vecina) {
          const rv = vecina.getBoundingClientRect();
          const paso = Math.abs(rv.left + rv.width / 2 - cx);
          if (paso > 1) p = Math.max(-1, Math.min(1, desvio / paso));
          rutaVecina = secciones[j]?.ruta ?? null;
        }
      }
      /* El `transform` SOLO existe mientras se arrastra, y por eso hay un
         atributo además de la variable. Un `transform` distinto de `none`
         —aunque sea `translateX(0)`— convierte al elemento en bloque
         contenedor de sus descendientes `position: fixed`: dejarlo puesto
         siempre repetiría el bug que documenta styles.css sobre `fill-mode`,
         donde el botón de compartir de la cabecera dejaba de posicionarse
         contra la ventana. Al volver a cero se quita y `transform` vuelve a
         `none`. */
      if (Math.abs(p) < 0.004) {
        raiz.removeAttribute("data-nav-arrastre");
        raiz.style.removeProperty("--nav-p");
        raiz.style.removeProperty("--nav-pa");
        raiz.style.removeProperty("--nav-vecina");
      } else {
        raiz.dataset.navArrastre = "";
        raiz.style.setProperty("--nav-p", p.toFixed(3));
        raiz.style.setProperty("--nav-pa", Math.abs(p).toFixed(3));
        /* Dónde va la vecina: entra desde el lado contrario y llega al centro
           justo cuando la actual acaba de salir. `p − signo(p)` vale ∓1 con el
           gesto sin empezar y 0 con la vecina ya centrada. */
        raiz.style.setProperty("--nav-vecina", (p - Math.sign(p)).toFixed(3));
      }

      /* Montar la vecina cuesta: correr sus consultas (Reportes hace ocho).
         Por eso no se monta con cualquier roce, sino cuando el arrastre ya
         pasó de un umbral — y se avisa SOLO al cambiar, que del otro lado hay
         un `setState`.
         Con "reducir movimiento" no se monta nunca: el CSS ya la esconde, y
         montarla para no enseñarla sería pagar sus consultas a cambio de
         nada. Se consulta aquí y no una vez al principio para que el cambio
         de ajuste surta efecto sin recargar.
         Y solo en el iPhone: el carrusel también aparece si se estrecha la
         ventana del Mac por debajo de 600 px (es una media query, no depende
         de la plataforma), pero la maquetación de la vecina es
         `:root.iphone`. Sin esta guarda, esa ventana estrecha montaría una
         segunda página sin posicionar, colgando debajo de la primera. */
      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const anunciar = esIPhone() && !quieto && Math.abs(p) >= 0.06 ? rutaVecina : null;
      if (anunciar !== vecinaActual.current) {
        vecinaActual.current = anunciar;
        avisar.current?.(anunciar);
      }
    }

    function alFotograma() {
      if (pendiente) return;
      pendiente = requestAnimationFrame(pintar);
    }

    pintar();
    el.addEventListener("scroll", alFotograma, { passive: true });
    window.addEventListener("resize", alFotograma);
    return () => {
      el.removeEventListener("scroll", alFotograma);
      window.removeEventListener("resize", alFotograma);
      if (pendiente) cancelAnimationFrame(pendiente);
      // Fuera del carrusel no hay arrastre que acompañar: si quedara puesto,
      // la página siguiente nacería desplazada y medio apagada.
      const raiz = document.documentElement;
      raiz.removeAttribute("data-nav-arrastre");
      raiz.style.removeProperty("--nav-p");
      raiz.style.removeProperty("--nav-pa");
      raiz.style.removeProperty("--nav-vecina");
      if (vecinaActual.current !== null) {
        vecinaActual.current = null;
        avisar.current?.(null);
      }
    };
    // `pathname` entra en las dependencias para repintar tras cada navegación:
    // el efecto que centra la sección corre en el mismo commit y deja las
    // distancias nuevas.
  }, [pathname, secciones.length]);

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
    if (c === "sinVer") return sinVerCount;
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
