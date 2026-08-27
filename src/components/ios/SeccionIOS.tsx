import type { ReactNode } from "react";

/**
 * El galón de una fila que lleva a otra pantalla.
 *
 * Vive aquí, con el resto del vocabulario de lista, porque ya había TRES
 * copias idénticas de estas cinco líneas —`Dashboard.tsx`, `Cartas.tsx` y
 * `components/ios/FormularioIOS.tsx`— y Reportes iba a ser la cuarta. Las tres
 * viejas se quedan donde están a propósito: unificarlas es un cambio que toca
 * tres pantallas que este trabajo no abre, y hacerlo de paso escondería el
 * arreglo dentro de otro. Cualquiera nueva usa esta.
 */
export const IosChevron = () => (
  <span className="ios-chevron" aria-hidden="true">
    <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
  </span>
);

/**
 * Sección de lista agrupada del teléfono: encabezado + tarjeta inset.
 *
 * El handoff pedía un `ListaIOS`/`FilaIOS` con clases propias
 * (`.ios-lista`, `.ios-grupo`, `.ios-fila`). No se hizo así: el repo ya tenía
 * el patrón montado —`.ios-section` / `.ios-section-header` / `.ios-listcard`
 * con `.ios-txrow` dentro— en Ajustes, Ayuda, Cuenta y las pantallas de datos,
 * y `.ios-lista` además ya está tomado (el índice de `Configuracion.tsx`).
 * Este componente es ese mismo patrón con nombre, para que las páginas que se
 * pasan a secciones no repitan tres divs cada una.
 *
 * Lo que sí es nuevo del rediseño está en el CSS (radio 18, encabezado en
 * mayúsculas, separador del sistema) y en el `total`: en la maqueta el
 * encabezado de un día no dice solo "Hoy", dice "HOY · $4,610.00", que es el
 * dato por el que se abre la pantalla.
 */
export default function SeccionIOS({
  titulo,
  total,
  accion,
  indexada,
  compacta,
  pie,
  children,
}: {
  /** Encabezado de la sección. Sin él, la tarjeta va suelta (el grupo de
   *  resumen que abre Depósitos o Miembros no lleva título). */
  titulo?: string;
  /** Cifra que acompaña al título, a su derecha del punto medio. */
  total?: string;
  /** Enlace o botón al extremo derecho del encabezado ("Ver todo"). */
  accion?: ReactNode;
  /** Encabezado pegajoso, para las listas con índice alfabético (Miembros). */
  indexada?: boolean;
  /** Filas de UNA línea, a la altura del sistema (44 px) en vez de los 56 con
   *  los que `.ios-txrow` acomoda un subtítulo debajo del título. Es la medida
   *  que la maqueta usa en todos los grupos de «etiqueta + valor»: con 56 px y
   *  nada que poner en el segundo renglón, la fila se lee como si le faltara
   *  algo. No se detecta sola —haría falta un `:has()` que alcanzaría a media
   *  app sin haberla mirado—, así que la pide quien la necesita. */
  compacta?: boolean;
  /** Texto explicativo bajo la tarjeta: donde iOS pone las reglas del grupo.
   *  Va DENTRO de la sección a propósito. El repo lo venía escribiendo como
   *  un `<p className="ios-section-footer">` hermano, y así el margen de 35 px
   *  con el que la sección se separa de la siguiente caía ENTRE la tarjeta y
   *  su pie: el texto quedaba más cerca del grupo de abajo —al que no explica
   *  nada— que del de arriba. Dentro, el pie viaja con lo que explica. */
  pie?: ReactNode;
  children: ReactNode;
}) {
  const encabezado = titulo != null && (total ? `${titulo} · ${total}` : titulo);
  return (
    <section className={`ios-section${indexada ? " ios-section--indexada" : ""}${compacta ? " ios-section--compacta" : ""}`}>
      {encabezado && (
        accion
          ? (
            <div className="ios-panel-head">
              <h2>{encabezado}</h2>
              {accion}
            </div>
          )
          : <h2 className="ios-section-header">{encabezado}</h2>
      )}
      <div className="ios-listcard">{children}</div>
      {pie && <p className="ios-section-footer">{pie}</p>}
    </section>
  );
}
