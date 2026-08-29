import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import Portal from "../Portal";
import { IconCheck, IconSearch } from "../../icons";

export interface IOSPickerOption {
  value: string;
  label: string;
  /** Punto de color a la izquierda de la etiqueta (categorías). Opcional:
   *  las listas sin color (moneda, idioma…) no pintan nada. */
  color?: string;
  /** Dato secundario alineado a la derecha, antes de la marca. Lo pide la
   *  hoja de años de la ficha del aportante: «2025» a secas es una lista de
   *  números, «2025 · $1,150.00» contesta la pregunta de quien la abre —en
   *  qué ejercicio hubo algo—. Las listas que no lo pasan no cambian. */
  detalle?: string;
}

interface Props {
  title: string;
  options: IOSPickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onCancel: () => void;
  /** Buscador arriba de la lista. Para catálogos que no se recorren con el
   *  pulgar —las 30 y pico monedas—: es el selector de país de iOS, no una
   *  lista de seis. Se filtra por la etiqueta, sin acentos y sin mayúsculas,
   *  para que «peso» encuentre «Peso mexicano». */
  buscador?: boolean;
  /** Pie bajo la lista, donde iOS pone las reglas del grupo. */
  pie?: string;
}

/** Sin acentos y sin mayúsculas, la misma regla que el buscador del índice
 *  de Ajustes. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Hoja de selección de una lista corta (moneda, y lo que necesite un
 * `PickerField` más adelante) — mismo look que `ActionSheet`, reutilizando
 * sus clases (`.action-sheet-*`), con una marca de check en la opción activa
 * y scroll propio para no reventar la altura de la pantalla en listas de
 * más de 6-7 filas.
 */
export default function IOSPickerSheet({ title, options, value, onSelect, onCancel, buscador, pie }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  useEscapeClose(onCancel);

  const q = normalizar(query.trim());
  const visibles = q ? options.filter((o) => normalizar(o.label).includes(q)) : options;

  return (
    <Portal>
      <div className="action-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="action-sheet">
          {/* Título, regla del grupo y buscador viven en el MISMO bloque de
              arriba, que es donde una hoja de acciones de iOS pone su cabecera.
              Sueltos entre bloque y bloque quedaban sobre el hueco —la hoja es
              una pila de tarjetas con aire entre ellas, no una superficie— y
              se leían encima de la pantalla de atrás.

              Y el pie va ARRIBA, con el título, y no debajo de la lista: es la
              regla que hace falta ANTES de elegir («se puede cambiar
              después»), no una nota al pie de la que ya eligió. */}
          <div className="action-sheet-head">
            <div className="action-sheet-title">{title}</div>
            {pie && <div className="action-sheet-message">{pie}</div>}
            {buscador && (
              <div className="ios-picker-buscar">
                <IconSearch size={16} strokeWidth={2.2} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("common.buscarCorto")}
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
          <div className="action-sheet-opciones action-sheet-opciones--lista">
            {visibles.map((op) => (
              <button
                key={op.value}
                type="button"
                className="action-sheet-opcion action-sheet-opcion--lista"
                onClick={() => onSelect(op.value)}
              >
                <span>
                  {op.color && <span className="ios-picker-dot" style={{ background: op.color }} aria-hidden="true" />}
                  {op.label}
                </span>
                {op.detalle && <span className="ios-picker-detalle">{op.detalle}</span>}
                {op.value === value && <IconCheck size={17} />}
              </button>
            ))}
          </div>
          <button type="button" className="action-sheet-cancelar" onClick={onCancel}>
            {t("common.cancelar")}
          </button>
        </div>
      </div>
    </Portal>
  );
}
