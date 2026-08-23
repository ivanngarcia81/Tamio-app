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
import Portal from "../Portal";

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

/** Una pantalla empujada por encima de una hoja: cubre la anterior con su
 *  propia nav bar de volver, que es como iOS entra en cualquier sublista. Se
 *  monta en su propio portal, así que el orden del documento la deja por
 *  encima de la hoja que la abrió sin tener que inventar un z-index nuevo. */
export function IOSPantalla({ titulo, volverA, onVolver, accion, bajoBarra, children }: {
  titulo: string;
  /** Nombre de la pantalla anterior, junto al chevron de volver. */
  volverA: string;
  onVolver: () => void;
  accion?: ReactNode;
  /** Fijo bajo la barra, fuera del área que desplaza: un buscador dentro de la
   *  lista se va de la pantalla en cuanto se escriben tres letras. */
  bajoBarra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Portal>
      <div className="ios-sheet-overlay">
        <div className="ios-sheet" role="dialog" aria-label={titulo}>
          <IOSNavBar backLabel={volverA} title={titulo} onBack={onVolver} action={accion} />
          {bajoBarra}
          <div className="ios-sheet-body">{children}</div>
        </div>
      </div>
    </Portal>
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

/** Fila de texto largo EN LA PROPIA FILA: etiqueta arriba, área de escritura
 *  debajo. Es la otra forma de meter texto libre en una lista agrupada; la
 *  primera es `IOSFilaTexto`, que se lo lleva a su propia pantalla.
 *
 *  Cuál usar no es gusto: depende del largo. Un motivo o una observación son
 *  una o dos frases y caben aquí, donde se leen sin salir del formulario. El
 *  resumen de un acta es un documento y necesita la pantalla entera. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="ios-field ios-field--stacked">
      <span className="ios-field-label">{label}</span>
      <textarea
        className="ios-field-input ios-field-area"
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Fila con un control nativo del sistema a la derecha (fecha, hora, mes). El
 *  `input` se queda: en WKWebView ES la rueda de iOS, y sustituirlo por una
 *  hoja propia sería cambiar un control nativo por uno peor.
 *
 *  (La clase `nm-nativo` es de cuando esto vivía solo en "Nuevo ingreso";
 *  el nombre quedó, la regla —alinear a la derecha— siempre fue genérica.) */
export function FilaNativa({
  label, tipo, valor, min, max, onChange,
}: {
  label: string;
  tipo: "date" | "time" | "month";
  valor: string;
  /** Tope inferior del control nativo (la recepción de una carta no puede ser
   *  anterior a su emisión). No sustituye a la validación: el `min` guía la
   *  rueda, pero quien teclea la fecha a mano se la salta. */
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="ios-field">
      <span className="ios-field-label">{label}</span>
      <input
        className="ios-field-input nm-nativo"
        type={tipo}
        value={valor}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Fila de conteo: la cifra y un −/+ pegado a ella. El teclado numérico para
 *  subir de uno en uno es el control equivocado — contar asistentes es tocar
 *  "+" doce veces, no escribir "12" y volver a cerrar el teclado; y lo mismo
 *  vale para "cada N semanas" o "termina después de N veces".
 *
 *  (Nació dentro de "Nuevo culto"; se sacó aquí cuando la Agenda necesitó el
 *  mismo control para la repetición.) */
export function FilaConteo({
  label, valor, min = 0, onChange,
}: {
  label: string;
  valor: number;
  /** Tope inferior. 0 para un conteo de asistentes, 1 para "cada N semanas". */
  min?: number;
  onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ios-field">
      <span className="ios-field-label">{label}</span>
      <span className="ios-conteo">
        <span className="ios-conteo-cifra">{valor}</span>
        <span className="ios-stepper">
          <button
            type="button"
            aria-label={t("servicios.restar")}
            disabled={valor <= min}
            onClick={() => onChange(Math.max(min, valor - 1))}
          >
            −
          </button>
          <button type="button" aria-label={t("servicios.sumar")} onClick={() => onChange(valor + 1)}>
            +
          </button>
        </span>
      </span>
    </div>
  );
}

/** Fila de selección múltiple con pastillas: etiqueta arriba, chips debajo.
 *  Para conjuntos cortos y fijos —los siete días de la semana, los cuatro
 *  avisos— donde llevárselos a otra pantalla costaría más toques que
 *  resolverlos aquí mismo. */
export function FilaChips({
  label, opciones, activos, onToggle, pie,
}: {
  label: string;
  opciones: { valor: number; etiqueta: string }[];
  activos: number[];
  onToggle: (v: number) => void;
  /** Aclaración bajo los chips (qué hace y qué no hace un recordatorio). */
  pie?: string;
}) {
  return (
    <div className="ios-field ios-field--stacked">
      <span className="ios-field-label">{label}</span>
      <div className="dias-toggle">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activos.includes(o.valor)}
            className={`dia-chip${activos.includes(o.valor) ? " active" : ""}`}
            onClick={() => onToggle(o.valor)}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {pie && <span className="ios-field-pie">{pie}</span>}
    </div>
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
  sub,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: string;
  /** Segunda línea bajo la etiqueta, como la usa el handoff de iPad. */
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Dibujado pero sin motor: se apaga y el `title` dice qué le falta. */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div className={`ios-field${disabled ? " ios-field--apagado" : ""}`} title={title}>
      {sub ? (
        <span className="ios-field-textos">
          <span className="ios-field-label">{label}</span>
          <span className="ios-field-sub">{sub}</span>
        </span>
      ) : (
        <span className="ios-field-label">{label}</span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        disabled={disabled}
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
  disabled,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Se apaga a gris sin cambiar de alto, para que la fila no salte. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ios-field ${destructive ? "ios-field--destructive" : "ios-field--action"}`}
      disabled={disabled}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
