/**
 * CalendarioIOS.tsx — el calendario de la Agenda en el iPhone: una cuadrícula
 * compacta donde cada día es un número y, si tiene algo, un punto debajo.
 *
 * POR QUÉ NO ES LA TABLA DE ESCRITORIO. En 390 px las siete columnas miden
 * 53 px, y dentro de cada una la pastilla de un evento se queda en 40: medido,
 * el nombre de la actividad se dibuja con CERO píxeles de ancho. El teléfono
 * enseñaba que a las 19:00 pasaba algo y nunca qué. Aquí el día solo dice
 * "hay" o "no hay", y lo que hay se lee entero en la lista de abajo — que es
 * lo que hace el Calendario de iOS y lo que resuelve el problema.
 *
 * Sirve para las dos vistas con la misma pieza: el mes son seis filas de siete
 * y la semana es una sola, con la inicial del día encima de cada número.
 */
import { useTranslation } from "react-i18next";

export default function CalendarioIOS({
  dias, diasSemana, seleccion, hoy, tiene, onElegir, tira = false,
}: {
  /** Celdas en orden, empezando en domingo. `null` = hueco del mes. */
  dias: (string | null)[];
  /** Nombres cortos de los siete días, empezando en domingo. */
  diasSemana: string[];
  /** Día elegido (YYYY-MM-DD). */
  seleccion: string;
  hoy: string;
  /** ¿Ese día tiene alguna actividad tras los filtros? */
  tiene: (fecha: string) => boolean;
  onElegir: (fecha: string) => void;
  /** Tira de una semana: la inicial va dentro de cada celda, no en una
   *  cabecera aparte, porque con siete celdas una cabecera es la mitad de la
   *  altura del control para repetir lo mismo. */
  tira?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className={`ios-cal${tira ? " ios-cal--tira" : ""}`}>
      {!tira && (
        <div className="ios-cal-dow" aria-hidden="true">
          {diasSemana.map((d, i) => <span key={i}>{d}</span>)}
        </div>
      )}
      <div className="ios-cal-grid">
        {dias.map((fecha, i) => {
          if (!fecha) return <span key={i} className="ios-cal-hueco" />;
          const esHoy = fecha === hoy;
          const elegido = fecha === seleccion;
          return (
            <button
              key={fecha}
              type="button"
              className="ios-cal-dia"
              aria-pressed={elegido}
              aria-label={`${fecha}${tiene(fecha) ? ` · ${t("agenda.conActividades")}` : ""}`}
              onClick={() => onElegir(fecha)}
            >
              {tira && <span className="ios-cal-dow-celda">{diasSemana[i]}</span>}
              <span className={`ios-cal-num${esHoy ? " ios-cal-num--hoy" : elegido ? " ios-cal-num--sel" : ""}`}>
                {Number(fecha.slice(8, 10))}
              </span>
              {/* En el día de hoy no se pinta: el círculo relleno ya lo
                  destaca y un punto encima del relleno no se ve. */}
              <span className={`ios-cal-punto${tiene(fecha) && !esHoy ? " ios-cal-punto--on" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
