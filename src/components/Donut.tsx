import { useEffect, useState } from "react";

const R = 15.9155;

export interface DonutSegment {
  color: string;
  pct: number;
}

interface Props {
  segments: DonutSegment[];
  /** Retraso antes de iniciar el dibujo, para escalonar varios donuts entre sí. */
  delayMs?: number;
}

export default function Donut({ segments, delayMs = 0 }: Props) {
  const [drawn, setDrawn] = useState(false);

  // Dibuja el trazo una sola vez al montar (entrar a la página), nunca en loop.
  // Doble rAF asegura que el estado "0%" ya se pintó antes de animar al valor real,
  // para que la transición de stroke-dasharray se dispare de forma confiable.
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    const timer = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setDrawn(true));
      });
    }, delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let acc = 0;
  return (
    <svg className="donut" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
      {segments.map((s, i) => {
        const offset = -acc;
        const el = (
          <circle
            key={i}
            className="donut-seg"
            cx="18" cy="18" r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="3.5"
            strokeDasharray={drawn ? `${s.pct} ${100 - s.pct}` : "0 100"}
            strokeDashoffset={offset}
          />
        );
        acc += s.pct;
        return el;
      })}
    </svg>
  );
}
