import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Barra de filtros de la versión Mac — el componente único que usan las seis
 * pantallas de datos (Movimientos, Agenda, Informes de membresía, Cartas,
 * Membresía y Actas).
 *
 * El problema que resuelve: cada pantalla montaba su propia fila de controles
 * de 44 px que envolvía en cuanto había tres o más. Agenda llegaba a seis
 * `<select>`, dos fechas, un buscador y una pastilla; Informes de membresía, a
 * cinco `<select>`, buscador, dos pastillas y dos filas de pestañas. Tres
 * navegaciones apiladas antes de ver un solo dato.
 *
 * Aquí los filtros se pliegan en un botón de la toolbar que abre un popover.
 * El botón DICE CUÁNTOS hay puestos y se pinta con el acento cuando hay
 * alguno: un filtro activo escondido en un popover, sin señal, es una trampa
 * —el usuario ve una lista incompleta y no sabe por qué—.
 *
 * NO decide nada sobre los datos: recibe los mismos valores y los mismos
 * `onChange` que ya tenía cada pantalla, y los devuelve igual. Las consultas y
 * los cálculos no se tocan.
 */

export type CampoFiltro =
  | {
      tipo: "opciones";
      id: string;
      label: string;
      valor: string;
      /** Valor que significa "sin filtrar" — normalmente "" o "todos". */
      vacio: string;
      opciones: { value: string; label: string }[];
      onChange: (v: string) => void;
    }
  | { tipo: "fecha"; id: string; label: string; valor: string; onChange: (v: string) => void }
  | { tipo: "interruptor"; id: string; label: string; valor: boolean; onChange: (v: boolean) => void };

function activo(c: CampoFiltro): boolean {
  if (c.tipo === "opciones") return c.valor !== c.vacio;
  if (c.tipo === "fecha") return c.valor !== "";
  return c.valor;
}

export function MacFiltros({ campos, onRestablecer }: { campos: CampoFiltro[]; onRestablecer: () => void }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const n = campos.filter(activo).length;

  // Cerrar al tocar fuera o con Escape, como cualquier popover de macOS.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  if (campos.length === 0) return null;

  return (
    <div className="mac-filtros" ref={caja}>
      <button
        type="button"
        className={`mac-btn mac-filtros-btn${n > 0 ? " activo" : ""}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        {n > 0 ? t("filtros.conteo", { n }) : t("filtros.titulo")}
        <svg viewBox="0 0 9 9" aria-hidden="true" className="mac-filtros-chev"><path d="M1.5 3l3 3 3-3" /></svg>
      </button>

      {abierto && (
        <div className="mac-filtros-pop" role="dialog" aria-label={t("filtros.titulo")}>
          {campos.map((c) => (
            <div className="mac-filtros-fila" key={c.id}>
              <label className="mac-filtros-label" htmlFor={`f-${c.id}`}>{c.label}</label>
              {c.tipo === "opciones" && (
                <select
                  id={`f-${c.id}`}
                  className="mac-filtros-select"
                  value={c.valor}
                  onChange={(e) => c.onChange(e.target.value)}
                >
                  {c.opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {c.tipo === "fecha" && (
                <input
                  id={`f-${c.id}`}
                  type="date"
                  className="mac-filtros-input"
                  value={c.valor}
                  onChange={(e) => c.onChange(e.target.value)}
                />
              )}
              {c.tipo === "interruptor" && (
                <label className="mac-check">
                  <input
                    id={`f-${c.id}`}
                    type="checkbox"
                    checked={c.valor}
                    onChange={(e) => c.onChange(e.target.checked)}
                  />
                </label>
              )}
            </div>
          ))}
          <div className="mac-filtros-pie">
            <button type="button" className="mac-btn" disabled={n === 0} onClick={onRestablecer}>
              {t("filtros.restablecer")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Buscador de la toolbar: 22 px y ~180 de ancho, donde va en cualquier app de
 *  Mac. Sustituye a los campos de 44 px que vivían dentro del contenido. */
export function MacBuscador({
  value, onChange, placeholder, ancho = 180,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ancho?: number;
}) {
  return (
    <label className="mac-search" style={{ width: ancho }}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="5" cy="5" r="3.6" />
        <path d="M7.8 7.8L11 11" />
      </svg>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Segmentado del encabezado de una tabla: los contadores ("Todos 8 · Ofrenda
 *  2") no son filtros de popover — son una vista de la misma lista, y en macOS
 *  eso es un segmentado, no una fila de pastillas sueltas. */
export function MacSegmentado<T extends string>({
  value, onChange, opciones, aria,
}: {
  value: T;
  onChange: (v: T) => void;
  opciones: { id: T; label: ReactNode }[];
  aria?: string;
}) {
  return (
    <div className="mac-seg" role="tablist" aria-label={aria}>
      {opciones.map((o) => (
        <button
          type="button"
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          className={`mac-seg-op${value === o.id ? " activa" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
