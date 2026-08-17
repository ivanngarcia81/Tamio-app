/**
 * IOSSegmented.tsx — control segmentado de 2 a 5 opciones, estilo iOS
 * (pastilla deslizante sobre una pista gris). El resto de Ajustes usa
 * `.tabs-segmented` (tema oscuro/`--ink`, pensado para escritorio); esto es
 * su equivalente angosto para iPhone, sin tocar ese componente compartido
 * con Mac/iPad.
 */
import type { CSSProperties } from "react";

export interface IOSSegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** De dos a cinco. Se tipa como unión de tuplas y no como array a secas para
 *  no perder la comprobación en tiempo de compilación que ya había: con seis
 *  casillas las etiquetas dejan de leerse en el ancho de un teléfono. */
type Opciones<T extends string> =
  | readonly [IOSSegmentedOption<T>, IOSSegmentedOption<T>]
  | readonly [IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>]
  | readonly [IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>]
  | readonly [IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>, IOSSegmentedOption<T>];

export default function IOSSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Opciones<T>;
  value: T;
  onChange: (v: T) => void;
}) {
  const activo = options.findIndex((o) => o.value === value);
  return (
    /* `--n` alimenta el ancho del pulgar en el CSS. La pista tiene
       `padding: 2px`, así que cada casilla mide (100% − 4px) / n y el pulgar
       toma exactamente esa medida; moverlo el 100 % de su propio ancho por
       casilla lo deja alineado al píxel con cualquier n. */
    <div className="ios-segmented" role="tablist" style={{ "--n": options.length } as CSSProperties}>
      <span className="ios-segmented-thumb" style={{ transform: `translateX(${activo * 100}%)` }} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className="ios-segmented-opcion"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
