import { useMemo } from "react";

/* A dotted halftone field shaped by a deterministic noise map. */
function noise(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export function Halftone({ seed = 1, cols = 56, rows = 30, className = "" }: { seed?: number; cols?: number; rows?: number; className?: string }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = i / cols;
        const v = j / rows;
        // Low-frequency blobs plus fine grain, faded toward the edges.
        const blob = Math.sin(u * 7.3 + seed) * Math.cos(v * 5.1 - seed * 0.7) * 0.5 + 0.5;
        const grain = noise(i, j, seed);
        const edge = Math.min(1, Math.min(u, 1 - u) * 2.6) * Math.min(1, Math.min(v, 1 - v) * 2.6);
        const a = (blob * 0.7 + grain * 0.5) * edge;
        if (a < 0.42) continue;
        out.push({ x: i * 10 + 5, y: j * 10 + 5, r: Math.min(3.2, (a - 0.4) * 7), o: Math.min(0.85, a) });
      }
    }
    return out;
  }, [seed, cols, rows]);
  return (
    <svg viewBox={`0 0 ${cols * 10} ${rows * 10}`} className={className} aria-hidden>
      {dots.map((d, k) => (
        <circle key={k} cx={d.x} cy={d.y} r={d.r} fill="var(--color-ink)" opacity={d.o * 0.55} />
      ))}
    </svg>
  );
}
