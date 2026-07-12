interface IconProps {
  size?: number;
  strokeWidth?: number;
}

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
