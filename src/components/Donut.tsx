const R = 15.9155;

export interface DonutSegment {
  color: string;
  pct: number;
}

export default function Donut({ segments }: { segments: DonutSegment[] }) {
  let acc = 0;
  return (
    <svg className="donut" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
      {segments.map((s, i) => {
        const el = (
          <circle
            key={i}
            cx="18" cy="18" r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="3.5"
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={-acc}
          />
        );
        acc += s.pct;
        return el;
      })}
    </svg>
  );
}
