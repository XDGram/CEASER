import React from "react";
import { Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { f, FPS } from "./time";
import { C, doto, inter } from "./fonts";

const SFX: Record<string, { onset: number; vol: number }> = {
  click: { onset: 0.1, vol: 0.55 },
  pop: { onset: 0.03, vol: 0.35 },
  "pop-whoosh": { onset: 0.01, vol: 0.4 },
  typing: { onset: 0.09, vol: 0.35 },
  "lock-clunk": { onset: 0.03, vol: 0.45 },
  error: { onset: 0.0, vol: 0.18 },
};

/** A UI sound whose audible hit lands at `at` seconds. */
export function Sfx({ name, at, vol, dur }: { name: keyof typeof SFX | string; at: number; vol?: number; dur?: number }) {
  const s = SFX[name] ?? { onset: 0, vol: 0.4 };
  return (
    <Sequence from={Math.max(0, f(at - s.onset))} durationInFrames={dur ? f(dur) : undefined} layout="none">
      <Audio src={staticFile(`sfx/${name}.mp3`)} volume={vol ?? s.vol} />
    </Sequence>
  );
}

/** macOS-style arrow cursor with a press animation and click ripple. */
export function Cursor({ x, y, clicks, scale = 1 }: { x: number; y: number; clicks: number[]; scale?: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  let press = 0;
  let ripple: number | null = null;
  for (const c of clicks) {
    const d = t - c;
    if (d > -0.08 && d < 0.18) press = Math.max(press, 1 - Math.abs(d - 0.02) / 0.16);
    if (d >= 0 && d < 0.5) ripple = d / 0.5;
  }
  const s = scale * (1 - 0.14 * press);
  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none", zIndex: 50 }}>
      {ripple !== null && (
        <div style={{ position: "absolute", left: -40 * scale, top: -40 * scale, width: 80 * scale, height: 80 * scale, borderRadius: "50%",
          border: `${3 * scale}px solid ${C.accent}`, opacity: 0.9 * (1 - ripple), transform: `scale(${0.3 + ripple * 0.9})` }} />
      )}
      <svg width={34 * s} height={34 * s} viewBox="0 0 24 24" style={{ position: "absolute", left: -5 * s, top: -3 * s, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.35))" }}>
        <path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5h6.3z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export const MARK = "M5 4h8v6h-2v12h2v6H5zM15 4h6v6h-6zM23 5h4v4h-4zM15 22h6v6h-6zM23 23h4v4h-4z";
export const MARK_PARTS = ["M5 4h8v6h-2v12h2v6H5z", "M15 4h6v6h-6z", "M23 5h4v4h-4z", "M15 22h6v6h-6z", "M23 23h4v4h-4z"];

export function NearMark({ size = 24, color = C.ink, bg = C.paper }: { size?: number; color?: string; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill={color} />
      <path d="M7 17V7h1.6l7.2 7.4V7H17v10h-1.6L8.2 9.6V17z" fill={bg} />
    </svg>
  );
}

/** Floating white card with soft shadow, the house style for callouts. */
export function Chip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 22, padding: "22px 28px",
      boxShadow: "0 30px 80px rgba(20,20,20,.18), 0 6px 18px rgba(20,20,20,.08)", fontFamily: inter, color: C.ink, ...style }}>
      {children}
    </div>
  );
}

export const Label = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ fontFamily: inter, fontSize: 15, letterSpacing: "0.22em", textTransform: "uppercase", color: C.ink2, ...style }}>{children}</div>
);
export const Pixel = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <span style={{ fontFamily: doto, fontWeight: 900, ...style }}>{children}</span>
);
