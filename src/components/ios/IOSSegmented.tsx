/**
 * IOSSegmented.tsx — control segmentado de 2 opciones, estilo iOS (pastilla
 * deslizante sobre una pista gris). El resto de Ajustes usa `.tabs-segmented`
 * (tema oscuro/`--ink`, pensado para escritorio); esto es su equivalente
 * angosto para el patrón de formulario de iPhone, sin tocar ese componente
 * compartido con Mac/iPad.
 */
export interface IOSSegmentedOption<T extends string> {
  value: T;
  label: string;
}

export default function IOSSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [IOSSegmentedOption<T>, IOSSegmentedOption<T>];
  value: T;
  onChange: (v: T) => void;
}) {
  const activo = options.findIndex((o) => o.value === value);
  return (
    <div className="ios-segmented" role="tablist">
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
