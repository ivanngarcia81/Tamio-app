/**
 * IOSIcons.tsx — Glifos rellenos estilo iOS para el tab bar y la nav bar de Tamio
 *
 * Dibujos originales con las proporciones de los símbolos del sistema
 * (house.fill, building.columns.fill, tray.fill, doc.text.fill, gearshape.fill,
 * plus, square.and.arrow.up).
 *
 * Si quieres los glifos exactos de Apple: abre la app SF Symbols en la Mac,
 * busca el símbolo, File → Export Symbol, y sustituye el `<path>` de aquí
 * conservando el mismo nombre de componente. La licencia de SF Symbols permite
 * usarlos dentro de apps de plataformas Apple; no permite deformarlos.
 *
 * Los del tab bar son SÓLIDOS (fill). Los de la nav bar son de TRAZO (stroke).
 * Esa diferencia es intencional y es la convención de iOS.
 */

type IconProps = { size?: number; className?: string };

const fillProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className,
  "aria-hidden": true as const,
  focusable: "false" as const,
});

const strokeProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true as const,
  focusable: "false" as const,
});

/* ---------------- Tab bar (rellenos) ---------------- */

/** Inicio · house.fill */
export const HomeIcon = ({ size = 25, className }: IconProps) => (
  <svg {...fillProps(size, className)}>
    <path d="M11.35 2.63a1 1 0 0 1 1.3 0l9 7.6A1 1 0 0 1 22 11v8.4a2.6 2.6 0 0 1-2.6 2.6H4.6A2.6 2.6 0 0 1 2 19.4V11a1 1 0 0 1 .35-.77z" />
  </svg>
);

/** Tesorería · building.columns.fill */
export const TreasuryIcon = ({ size = 25, className }: IconProps) => (
  <svg {...fillProps(size, className)}>
    <path d="M11.63 2.3a.8.8 0 0 1 .74 0l9.2 4.75c.72.37.45 1.45-.37 1.45H2.8c-.82 0-1.09-1.08-.37-1.45z" />
    <rect x="3.9" y="10.3" width="2.5" height="8.1" rx="1.25" />
    <rect x="8.6" y="10.3" width="2.5" height="8.1" rx="1.25" />
    <rect x="13.3" y="10.3" width="2.5" height="8.1" rx="1.25" />
    <rect x="18" y="10.3" width="2.5" height="8.1" rx="1.25" />
    <rect x="2" y="19.7" width="20" height="2.4" rx="1.2" />
  </svg>
);

/** Pendientes · tray.fill */
export const PendingIcon = ({ size = 25, className }: IconProps) => (
  <svg {...fillProps(size, className)}>
    <path d="M6.75 2.6h10.5a2.4 2.4 0 0 1 2.28 1.64l2.4 7.16h-4.86a1 1 0 0 0-.87.5l-1.13 1.95a1 1 0 0 1-.87.5h-4.4a1 1 0 0 1-.87-.5L7.8 11.9a1 1 0 0 0-.87-.5H2.07l2.4-7.16A2.4 2.4 0 0 1 6.75 2.6z" />
    <path d="M2 13.4h4.35l1.13 1.95a2.4 2.4 0 0 0 2.08 1.2h4.88a2.4 2.4 0 0 0 2.08-1.2l1.13-1.95H22V19a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 19z" />
  </svg>
);

/** Secretaría · doc.text.fill */
export const SecretaryIcon = ({ size = 25, className }: IconProps) => (
  <svg {...fillProps(size, className)} fillRule="evenodd" clipRule="evenodd">
    <path d="M6.9 2h6.5v5.1a1.5 1.5 0 0 0 1.5 1.5H20v11a2.4 2.4 0 0 1-2.4 2.4H6.9a2.4 2.4 0 0 1-2.4-2.4V4.4A2.4 2.4 0 0 1 6.9 2zm1.6 10.1a.95.95 0 0 0 0 1.9h7a.95.95 0 0 0 0-1.9zm0 4.1a.95.95 0 0 0 0 1.9h4.6a.95.95 0 0 0 0-1.9z" />
    <path d="M15 2.3 19.8 7h-4.1a.7.7 0 0 1-.7-.7z" />
  </svg>
);

/** Ajustes · gearshape.fill */
export const SettingsIcon = ({ size = 25, className }: IconProps) => (
  <svg {...fillProps(size, className)}>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
      <rect
        key={deg}
        x="10.7"
        y="1.3"
        width="2.6"
        height="5.4"
        rx="1.3"
        transform={`rotate(${deg} 12 12)`}
      />
    ))}
    <path
      fillRule="evenodd"
      d="M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2zm0 5.6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"
    />
  </svg>
);

/* ---------------- Nav bar (trazo) ---------------- */

/** Nuevo movimiento · plus */
export const PlusIcon = ({ size = 22, className }: IconProps) => (
  <svg {...strokeProps(size, className)} strokeWidth={2.1}>
    <path d="M12 4.8v14.4M4.8 12h14.4" />
  </svg>
);

/** Compartir · square.and.arrow.up */
export const ShareIcon = ({ size = 22, className }: IconProps) => (
  <svg {...strokeProps(size, className)}>
    <path d="M8.2 9.4H6.4a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h11.2a2.2 2.2 0 0 0 2.2-2.2v-7.6a2.2 2.2 0 0 0-2.2-2.2h-1.8" />
    <path d="M12 14.6V3.2" />
    <path d="M8.3 6.7 12 3l3.7 3.7" />
  </svg>
);
