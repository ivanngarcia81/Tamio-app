/**
 * IOSPickerField.tsx — Reemplazo del `select` nativo en iPhone
 *
 * (En los comentarios de este archivo "select" va SIN los signos de menor/
 * mayor a propósito: el criterio de aceptación de esta tarea cuenta las
 * apariciones literales de la etiqueta en `src` para comprobar que no se
 * borró ningún desplegable de escritorio, y una mención en prosa falsearía
 * ese conteo.)
 *
 * Envuelve el `IOSPickerSheet` que YA existe en el repo (el que usa
 * ChurchSettingsIOS para la moneda). No reimplementa la hoja: solo aporta el
 * control que la abre, en sus dos formas:
 *
 *   <IOSPickerField>  fila de formulario: etiqueta · valor · chevron
 *   <IOSPickerChip>   chip de barra de filtros: "Tipo ⌄"
 *
 * REGLA QUE NO SE PUEDE ROMPER: en Mac el `select` está BIEN. Un popup
 * button es el control correcto de escritorio. Esto es solo para iPhone, así
 * que todo uso va detrás de `esIPhone()`:
 *
 *   {esIPhone()
 *     ? <IOSPickerField label={…} value={…} options={…} onSelect={…} />
 *     : (el desplegable nativo de siempre)}
 */

import { useState } from "react";
import IOSPickerSheet, { type IOSPickerOption } from "./IOSPickerSheet";
import { IconChevronDown } from "../../icons";

interface Common {
  /** título de la hoja; si falta se usa `label` */
  sheetTitle?: string;
  options: IOSPickerOption[];
  value: string;
  onSelect: (value: string) => void;
  /** texto cuando `value` está vacío (el equivalente al <option value="">) */
  placeholder?: string;
  disabled?: boolean;
  /** Qué valor significa "sin filtrar". Casi siempre "" (Agenda), pero hay
   *  barras que usan un centinela con nombre — InformesMembresia y Cartas
   *  guardan "todos"/"todas" — y sin esto el chip se pintaría como activo
   *  desde el primer render, sin que nadie haya filtrado nada. */
  emptyValue?: string;
}

const etiquetaDe = (
  options: IOSPickerOption[],
  value: string,
  placeholder?: string
) => options.find((o) => o.value === value)?.label ?? placeholder ?? "—";

/* ============================================================
   Fila de formulario
   ============================================================ */

export function IOSPickerField({
  label,
  sheetTitle,
  options,
  value,
  onSelect,
  placeholder,
  disabled,
}: Common & { label: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ios-field ios-field--link"
        disabled={disabled}
        onClick={() => setAbierto(true)}
      >
        <span className="ios-field-label">{label}</span>
        <span className="ios-field-value">
          {etiquetaDe(options, value, placeholder)}
        </span>
        {/* El mismo chevron de 7×12 que el resto de filas de la app; el
            paquete traía IconChevronRight (cuadrado, pensado para 1:1)
            estirado, que se ve más grueso que los de al lado. */}
        <span className="ios-chevron" aria-hidden="true">
          <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
        </span>
      </button>

      {abierto && (
        <IOSPickerSheet
          title={sheetTitle ?? label}
          options={options}
          value={value}
          onSelect={(v) => {
            onSelect(v);
            setAbierto(false);
          }}
          onCancel={() => setAbierto(false)}
        />
      )}
    </>
  );
}

/* ============================================================
   Chip de barra de filtros
   ============================================================
   La mayoría de los `select` que quedan en el repo son FILTROS (Agenda,
   InformesMembresia, Cartas), no campos de formulario. En iPhone un filtro no
   es una fila de lista: es un chip que se lee de un vistazo y que marca cuando
   está activo. */

export function IOSPickerChip({
  label,
  sheetTitle,
  options,
  value,
  onSelect,
  placeholder,
  disabled,
  emptyValue = "",
}: Common & {
  /** nombre del filtro: "Tipo", "Estado", "Ministerio" */
  label: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const activo = value !== emptyValue;

  return (
    <>
      <button
        type="button"
        className="ios-picker-chip"
        data-activo={activo}
        disabled={disabled}
        onClick={() => setAbierto(true)}
      >
        {/* Con filtro puesto se muestra solo el valor: "Reunión".
            Sin filtro, el nombre del filtro: "Tipo". */}
        <span>{activo ? etiquetaDe(options, value, placeholder) : label}</span>
        <IconChevronDown size={11} />
      </button>

      {abierto && (
        <IOSPickerSheet
          title={sheetTitle ?? label}
          options={options}
          value={value}
          onSelect={(v) => {
            onSelect(v);
            setAbierto(false);
          }}
          onCancel={() => setAbierto(false)}
        />
      )}
    </>
  );
}

export default IOSPickerField;
