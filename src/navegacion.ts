// El mapa de navegación de Tamio, en un solo sitio.
//
// Hasta ahora esta lista vivía escrita a mano dentro del JSX de
// `Sidebar.tsx`: ruta, icono, etiqueta y contador de cada destino, mezclados
// con el marcado. Eso bastaba mientras la barra lateral fuera la única forma
// de moverse por la app. Con la cáscara móvil hay tres cosas que necesitan la
// MISMA lista —la barra lateral del escritorio, la barra inferior del teléfono
// y el carrusel de secciones—, y tres copias de una lista de doce destinos se
// desincronizan a la primera pantalla nueva.
//
// Aquí solo vive la ESTRUCTURA. Los permisos siguen en `role.ts`
// (`puedeVer`), que es su sitio, y este módulo los consulta.

import { puedeVer, type Role } from "./role";

/** De qué contador cuelga la insignia de un destino. Se guarda el nombre y no
 *  el número: la lista es estática y los contadores cambian, así que quien
 *  pinta el menú resuelve el número en el momento. */
export type Contador = "miembros" | "pendientes" | "noLeidos";

export interface Destino {
  /** Ruta de React Router. Es también la identidad del destino. */
  ruta: string;
  /** Clave de i18n de su nombre. */
  clave: string;
  /** Nombre alternativo para la barra inferior, donde cada pestaña tiene un
   *  quinto de la pantalla. "Configuración" salía como "Configuraci…"; una
   *  palabra cortada a la mitad es peor que una palabra más corta. */
  claveCorta?: string;
  contador?: Contador;
}

export interface Area {
  id: "tesoreria" | "secretaria";
  /** Clave de i18n del nombre del área. */
  clave: string;
  secciones: Destino[];
}

/** Las dos áreas y sus secciones, en el orden en que se muestran.
 *
 *  El orden importa y no es alfabético: es el del trabajo. En Tesorería,
 *  primero se registra (ingresos, gastos), luego se consulta (miembros,
 *  reportes) y al final se cierra la semana (depósitos). */
export const AREAS: Area[] = [
  {
    id: "tesoreria",
    clave: "nav.grupoTesoreria",
    secciones: [
      { ruta: "/ingresos", clave: "nav.ingresos" },
      { ruta: "/gastos", clave: "nav.gastos" },
      { ruta: "/miembros", clave: "nav.miembros", contador: "miembros" },
      { ruta: "/reportes", clave: "nav.reportes" },
      { ruta: "/depositos", clave: "nav.depositos" },
      { ruta: "/bandeja", clave: "nav.porRevisar", contador: "pendientes" },
    ],
  },
  {
    id: "secretaria",
    clave: "nav.grupoSecretaria",
    secciones: [
      { ruta: "/membresia", clave: "nav.membresia" },
      { ruta: "/actas", clave: "nav.actas" },
      { ruta: "/servicios", clave: "nav.servicios" },
      { ruta: "/cartas", clave: "nav.cartas" },
      { ruta: "/reporte-miembros", clave: "nav.reporteMiembros" },
      { ruta: "/agenda", clave: "nav.agenda" },
    ],
  },
];

/** Destinos que no son de ningún área: los ve todo el mundo. */
export const INICIO: Destino = { ruta: "/", clave: "nav.inicio" };
export const MENSAJES: Destino = { ruta: "/inbox", clave: "nav.inbox", contador: "noLeidos" };
export const AYUDA: Destino = { ruta: "/ayuda", clave: "nav.ayuda" };
export const AJUSTES: Destino = { ruta: "/configuracion", clave: "nav.configuracion", claveCorta: "nav.ajustes" };

/** Las secciones de un área que este rol puede ver. Vacío = el área entera se
 *  le oculta. */
export function seccionesVisibles(area: Area, rol: Role): Destino[] {
  return area.secciones.filter((s) => puedeVer(rol, s.ruta));
}

/** Las áreas con al menos una sección visible para este rol, **la más suya
 *  primero**.
 *
 *  El orden no es decorativo. La secretaria puede ver el Reporte de Tesorería
 *  (`role.ts`), así que Tesorería le cuenta como área visible… con una sola
 *  pantalla dentro. Sin ordenar, su barra le ponía "Tesorería" en la segunda
 *  ranura —delante de Secretaría, que es su trabajo— para llevarla a un único
 *  informe. Ordenando por cuántas secciones tiene cada quien, el área de uno
 *  va siempre delante de la que solo se asoma. */
export function areasVisibles(rol: Role): Area[] {
  return AREAS
    .filter((a) => seccionesVisibles(a, rol).length > 0)
    .sort((a, b) => seccionesVisibles(b, rol).length - seccionesVisibles(a, rol).length);
}

/** ¿A qué área pertenece esta ruta? `null` para Inicio, Mensajes, Ayuda y
 *  Ajustes, que no están dentro de ninguna. */
export function areaDeRuta(ruta: string): Area | null {
  return AREAS.find((a) => a.secciones.some((s) => s.ruta === ruta)) ?? null;
}

// ---------------------------------------------------------------------------
// La barra inferior del teléfono
// ---------------------------------------------------------------------------
//
// Cinco pestañas fijas. Las tres primeras y la última son estructura; **la
// cuarta es un ATAJO**, y esa distinción es la que hace que el diseño no se
// vuelva confuso.
//
// La tentación era subir a la barra "lo más importante" de cada área y dejar
// el resto en el carrusel. Pero entonces el tesorero tiene que aprenderse por
// qué Depósitos está abajo y Reportes arriba, y la respuesta sería "porque a
// alguien le pareció más importante". La gente aprende dónde están las cosas,
// no rankings de importancia; una lista partida en dos sitios por un criterio
// ajeno se busca dos veces siempre.
//
// Por eso el atajo NO saca la sección del carrusel: el carrusel siempre las
// tiene todas, en el mismo orden, y la barra solo le añade un camino corto a
// la que se usa cada semana.

export interface RanuraBarra {
  destino: Destino;
  /** Un atajo repite algo que también está en el carrusel; se marca para no
   *  confundir a quien lea esto dentro de un año. */
  atajo?: boolean;
}

/**
 * La barra de un rol. Cinco ranuras, y el botón de crear va flotando aparte.
 *
 * El administrador ve las dos áreas, así que su cuarta ranura ya está ocupada
 * por Secretaría y solo la tercera es atajo. Un tesorero o una secretaria
 * tienen una sola área, así que les sobran dos ranuras: ahí van los dos
 * atajos de su semana.
 *
 * La Bandeja no vale para todos: la secretaria **no puede verla**
 * (`role.ts`), así que su tercera ranura es Mensajes.
 */
export function barraDeRol(rol: Role): RanuraBarra[] {
  const areas = areasVisibles(rol);

  // La tercera ranura es la del medio a propósito: es el hueco que libera el
  // botón de crear al salirse de la barra, y el centro es lo que la mano
  // alcanza sin recolocar el teléfono. Ahí va lo que esa persona mira todos
  // los días: el tesorero, lo que le falta por revisar; la secretaria, sus
  // mensajes, porque la Bandeja no la puede ver (`role.ts`).
  const central: RanuraBarra = puedeVer(rol, "/bandeja")
    ? {
        destino: {
          ruta: "/bandeja", clave: "nav.porRevisar", claveCorta: "nav.porRevisarCorto", contador: "pendientes",
        },
        atajo: true,
      }
    : { destino: MENSAJES, atajo: true };

  // Un área con UNA sola sección visible no es un área para esa persona: es
  // una pantalla prestada. Se etiqueta con su propio nombre —"Reportes"— y no
  // con el del área, porque poner "Tesorería" en una pestaña que solo lleva a
  // un informe promete un sitio entero que no existe.
  const comoArea = (a: Area): RanuraBarra => {
    const suyas = seccionesVisibles(a, rol);
    if (suyas.length === 1) return { destino: suyas[0]!, atajo: true };
    return { destino: { ruta: primeraSeccion(a, rol), clave: a.clave } };
  };

  if (areas.length >= 2) {
    // Administrador: las dos áreas, una a cada lado del centro.
    return [
      { destino: INICIO },
      comoArea(areas[0]!),
      central,
      comoArea(areas[1]!),
      { destino: AJUSTES },
    ];
  }

  const unica = areas[0];
  if (!unica) return [{ destino: INICIO }, central, { destino: AJUSTES }];

  // Una sola área: sobra una ranura, y ahí va el atajo de su semana —el
  // depósito del domingo, los compromisos de los próximos días—. Sigue estando
  // en el carrusel; esto solo es un camino corto.
  const extra: Destino = unica.id === "tesoreria"
    ? { ruta: "/depositos", clave: "nav.depositos" }
    : { ruta: "/agenda", clave: "nav.agenda" };

  const ranuras: RanuraBarra[] = [{ destino: INICIO }, comoArea(unica), central];
  if (puedeVer(rol, extra.ruta)) ranuras.push({ destino: extra, atajo: true });
  ranuras.push({ destino: AJUSTES });
  return ranuras;
}

/** A dónde lleva tocar el nombre de un área: a su primera sección visible. Un
 *  área no es una pantalla, así que tiene que aterrizar en algún sitio. */
export function primeraSeccion(area: Area, rol: Role): string {
  return seccionesVisibles(area, rol)[0]?.ruta ?? "/";
}

