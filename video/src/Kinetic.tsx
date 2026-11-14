import React from "react";
import { useCurrentFrame } from "remotion";
import { prog } from "./anim";
import { FPS } from "./time";
import { inter } from "./fonts";

/** Big centered words that blur in at `at` and out at `until`. */
export function Big({ children, at, until, size = 140, y = 0, color = "#141414", weight = 600 }: { children: React.ReactNode; at: number; until: number; size?: number; y?: number; color?: string; weight?: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < at - 0.05 || t > until + 0.4) return null;
  const a = prog(frame, at - 0.05, at + 0.35);
  const o = 1 - prog(frame, until, until + 0.35);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 540 + y, transform: `translateY(-50%) scale(${1.08 - 0.08 * a + (1 - o) * 0.06})`, textAlign: "center", fontFamily: inter, fontWeight: weight,
      fontSize: size, lineHeight: 1.05, letterSpacing: "-0.045em", color, opacity: a * o, filter: `blur(${(1 - a) * 16 + (1 - o) * 10}px)` }}>{children}</div>
  );
}

/** Chapter label like "02 · Your voice". */
export function Chapter({ n, title, at, until, dark = false }: { n: string; title: string; at: number; until: number; dark?: boolean }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < at - 0.05 || t > until + 0.4) return null;
  const a = prog(frame, at, at + 0.5);
  const o = 1 - prog(frame, until, until + 0.35);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 540, transform: "translateY(-50%)", textAlign: "center", opacity: a * o, filter: `blur(${(1 - a) * 10 + (1 - o) * 10}px)` }}>
      <div style={{ fontFamily: inter, fontSize: 30, letterSpacing: "0.3em", color: "#e8622a", marginBottom: 18 }}>{n}</div>
      <div style={{ fontFamily: inter, fontWeight: 600, fontSize: 150, letterSpacing: "-0.045em", color: dark ? "#f5f5f5" : "#141414", transform: `translateY(${(1 - a) * 30}px)` }}>{title}</div>
    </div>
  );
}
