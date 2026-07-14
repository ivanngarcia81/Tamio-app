import { IconArrowDown, IconArrowUp } from "../icons";

export default function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return null;
  const rising = pct >= 0;
  const good = invert ? !rising : rising;
  return (
    <span className={`delta ${good ? "good" : "bad"}`}>
      {rising ? <IconArrowUp size={10} strokeWidth={2.2} /> : <IconArrowDown size={10} strokeWidth={2.2} />}
      {Math.abs(pct)}%
    </span>
  );
}
