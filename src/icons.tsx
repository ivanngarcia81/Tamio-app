import { useId } from "react";

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

/** Logo de marca de Tamio: la "T" sobre barras de crecimiento, en el verde de
 *  ingresos del dashboard. Es el mismo símbolo del icono de la app; se usa en
 *  login, bienvenida y como placeholder del logo en el sidebar. Trae su propio
 *  fondo (cuadrado redondeado), así que va sobre superficie transparente. */
export const IconTamio = ({ size = 44 }: { size?: number }) => {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="180" height="180" rx="42" fill={`url(#${id})`} />
      {/* Monograma "T" limpio y centrado: se lee nítido incluso a 44px. */}
      <rect x="46" y="52" width="88" height="22" rx="7" fill="#fff" />
      <rect x="79" y="52" width="22" height="80" rx="7" fill="#fff" />
    </svg>
  );
};

function base(size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export const IconLogo = ({ size = 20, strokeWidth = 2.4 }: IconProps) => (
  <svg {...base(size, strokeWidth)}><path d="M12 3v18M3 12h18" /></svg>
);

/** Capilla en estilo de línea — placeholder del logo de la iglesia. */
export const IconChurch = ({ size = 20, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M12 2v4M10 4h4" />
    <path d="M6 21v-9l6-5 6 5v9" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
    <path d="M4 21h16" />
  </svg>
);

export const IconHome = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M3 12l9-9 9 9" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </svg>
);

export const IconIngreso = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v8M8 12l4-4 4 4" />
  </svg>
);

export const IconGasto = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v8M8 12l4 4 4-4" />
  </svg>
);

export const IconMiembros = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconReportes = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 4 4 5-6" />
  </svg>
);

export const IconBandeja = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export const IconConfig = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconPlus = ({ size = 18, strokeWidth = 2.4 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const IconClose = ({ size = 18, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconSearch = ({ size = 18, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const IconArrowUp = ({ size = 12, strokeWidth = 2.5 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

export const IconArrowDown = ({ size = 12, strokeWidth = 2.5 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

export const IconChevronDown = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}><polyline points="6 9 12 15 18 9" /></svg>
);

export const IconChevronLeft = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}><polyline points="15 18 9 12 15 6" /></svg>
);

export const IconChevronRight = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}><polyline points="9 18 15 12 9 6" /></svg>
);

export const IconCheck = ({ size = 14, strokeWidth = 2.5 }: IconProps) => (
  <svg {...base(size, strokeWidth)}><polyline points="20 6 9 17 4 12" /></svg>
);

export const IconEdit = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

export const IconClock = ({ size = 14, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </svg>
);

export const IconWarn = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const IconPrinter = ({ size = 15, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const IconBuilding = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
    <path d="M14 21v-9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9" />
    <path d="M8 8h0M8 12h0M8 16h0" />
    <path d="M2 21h20" />
  </svg>
);

export const IconUser = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);

export const IconSignature = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M3 16c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0" />
    <path d="M4 20h16" />
  </svg>
);

export const IconFileText = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M6 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8l5 5v12a1 1 0 0 1-1 1H6z" />
    <path d="M8 13h8M8 17h8M8 9h3" />
  </svg>
);

export const IconExternalLink = ({ size = 14, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M14 3h7v7" />
    <path d="M10 14L21 3" />
    <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
  </svg>
);

export const IconDownload = ({ size = 14, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
);

export const IconRefreshCw = ({ size = 14, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const IconBank = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M12 3l10 6H2l10-6z" />
    <path d="M4 10v9M9 10v9M15 10v9M20 10v9" />
    <path d="M2 21h20" />
  </svg>
);

export const IconSun = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const IconMoon = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const IconMonitor = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const IconRepeat = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const IconTag = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

export const IconGlobe = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const IconVolume = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

export const IconVolumeOff = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" />
    <line x1="17" y1="9" x2="23" y2="15" />
    <line x1="23" y1="9" x2="17" y2="15" />
  </svg>
);

export const IconIdBadge = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M6 16c.5-2 2-3 3-3s2.5 1 3 3" />
    <path d="M14 9h4M14 13h4" />
  </svg>
);

export const IconUpload = ({ size = 14, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const IconMail = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

export const IconClipboardList = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h6" />
  </svg>
);

export const IconCalendar = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const IconBookOpen = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
  </svg>
);

export const IconLogout = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const IconEye = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconHelp = ({ size = 18, strokeWidth = 1.8 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const IconClip = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...base(size, strokeWidth)}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

/** Destellos (IA). Un destello grande de cuatro puntas y dos chispas pequeñas;
 *  relleno para que se lea nítido a tamaño pequeño en los botones. */
export const IconSparkles = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <path d="M12 2.5c.3 0 .56.2.65.49l1.06 3.44a3 3 0 0 0 1.96 1.96l3.44 1.06a.68.68 0 0 1 0 1.3l-3.44 1.06a3 3 0 0 0-1.96 1.96l-1.06 3.44a.68.68 0 0 1-1.3 0l-1.06-3.44a3 3 0 0 0-1.96-1.96L4.9 11.7a.68.68 0 0 1 0-1.3l3.44-1.06a3 3 0 0 0 1.96-1.96l1.06-3.44A.68.68 0 0 1 12 2.5Z" />
    <path d="M19 3c.14 0 .27.1.31.24l.42 1.35a1 1 0 0 0 .68.68l1.35.42a.33.33 0 0 1 0 .62l-1.35.42a1 1 0 0 0-.68.68l-.42 1.35a.33.33 0 0 1-.62 0l-.42-1.35a1 1 0 0 0-.68-.68l-1.35-.42a.33.33 0 0 1 0-.62l1.35-.42a1 1 0 0 0 .68-.68l.42-1.35A.33.33 0 0 1 19 3Z" opacity=".85" />
    <path d="M5.5 15.5c.12 0 .23.08.27.2l.32 1.03a1 1 0 0 0 .68.68l1.03.32a.29.29 0 0 1 0 .54l-1.03.32a1 1 0 0 0-.68.68l-.32 1.03a.29.29 0 0 1-.54 0l-.32-1.03a1 1 0 0 0-.68-.68l-1.03-.32a.29.29 0 0 1 0-.54l1.03-.32a1 1 0 0 0 .68-.68l.32-1.03a.29.29 0 0 1 .27-.2Z" opacity=".7" />
  </svg>
);
