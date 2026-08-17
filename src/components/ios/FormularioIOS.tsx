/**
 * FormularioIOS.tsx — Piezas compartidas del patrón de formulario iOS
 * (nav bar con volver + título + acción, secciones planas, filas de campo).
 *
 * Usado por las pantallas internas de Ajustes en iPhone (Configuracion.tsx y
 * los componentes de `components/settings/`). El CSS vive en `styles.css`,
 * bajo `:root.iphone` — reutiliza `.ios-section`/`.ios-group`/`.ios-chevron`,
 * que ya existían para la lista agrupada del índice de Ajustes.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const BackChevron = () => (
  <svg viewBox="0 0 11 19" aria-hidden="true">
    <path d="M9.5 1.5 2 9.5l7.5 8" />
  </svg>
);

export const IosChevron = () => (
  <span className="ios-chevron" aria-hidden="true">
    <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
  </span>
);

/** Nav bar de una pantalla interna: volver (con el nombre de la pantalla
 *  anterior) + título centrado + acción opcional a la derecha. Sin acción,
 *  el hueco de la derecha se reserva igual para que el título quede
 *  centrado de verdad. */
export function IOSNavBar({
  backLabel,
  title,
  onBack,
  action,
}: {
  backLabel: string;
  title: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="ios-nav">
      <button type="button" className="ios-back" onClick={onBack}>
        <BackChevron />
        <span className="ios-back-label">{backLabel}</span>
      </button>
      <h1 className="ios-nav-title">{title}</h1>
      {/* Envuelto siempre (incluso vacío) para reservar la columna derecha
          de la grilla y mantener el título de verdad centrado. */}
      <span className="ios-nav-status">{action}</span>
    </div>
  );
}

export function Section({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ios-section">
      {header && <h2 className="ios-section-header">{header}</h2>}
      <div className="ios-group">{children}</div>
      {footer && <p className="ios-section-footer">{footer}</p>}
    </section>
  );
}

/** Fila editable: etiqueta a la izquierda, input a la derecha. `error`
 *  reemplaza el valor por una fila con el borde/texto de aviso ya usado en
 *  el resto de la app (no viene en el paquete de referencia: los formularios
 *  de Tamio sí validan por campo, y perder ese aviso sería perder
 *  validación). */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  optional,
  inputMode,
  type,
  error,
  stacked,
  autoFocus,
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Muestra "(opcional)" junto a la etiqueta, ya traducido. */
  optional?: boolean;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel";
  type?: string;
  error?: string | null;
  /** Etiqueta arriba, campo abajo — solo cuando el valor no cabe en una línea. */
  stacked?: boolean;
  autoFocus?: boolean;
  /** Para conservar atajos de teclado que la pantalla ya tenía (la
   *  bienvenida envía con Enter desde el nombre de la iglesia). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { t } = useTranslation();
  // Un error siempre fuerza el apilado: en una fila de una sola línea no hay
  // dónde meter el aviso sin que el flujo de flexbox encoja el input hasta
  // dejarlo ilegible en vez de bajar el aviso a su propia línea.
  const enColumna = stacked || !!error;
  return (
    <label className={`ios-field${enColumna ? " ios-field--stacked" : ""}`}>
      <span className="ios-field-label">
        {label}
        {optional && <span className="ios-field-optional"> {t("common.opcional")}</span>}
      </span>
      <input
        className="ios-field-input"
        value={value}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="ios-field-error">{error}</span>}
    </label>
  );
}

/** Fila que abre un selector (hoja u otra pantalla): etiqueta, valor gris y chevron. */
export function PickerField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <button type="button" className="ios-field ios-field--link" onClick={onPress}>
      <span className="ios-field-label">{label}</span>
      <span className="ios-field-value">{value}</span>
      <IosChevron />
    </button>
  );
}

/** Fila con switch nativo a la derecha. */
export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="ios-field">
      <span className="ios-field-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="ios-switch"
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

/** Fila centrada de acción (tinte de marca) o destructiva (rojo). */
export function ActionField({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ios-field ${destructive ? "ios-field--destructive" : "ios-field--action"}`}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
