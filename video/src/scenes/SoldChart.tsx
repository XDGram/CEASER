import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { prog, sp } from "../anim";
import { FPS, TL } from "../time";
import { doto, inter } from "../fonts";

// "You sold at 2x. It went 50x." on the dark intro background, between the X posts and line 1.
export const CH = TL.intro - 4.0;
const SOLD = CH + 0.55;
const ROCKET = CH + 1.3;
const TOP = CH + 2.3;
const MATHS = CH + 2.6;
const OUT = TL.intro - 0.3;

const BOX = { x: 220, y: 440, w: 1480, h: 500 };
const toY = (m: number) => BOX.y + BOX.h - (Math.log(m) / Math.log(60)) * BOX.h;
const A: [number, number][] = [[0, 1], [0.07, 1.25], [0.13, 1.12], [0.2, 1.55], [0.25, 1.42], [0.31, 2]];
const B: [number, number][] = [[0.31, 2], [0.37, 1.6], [0.44, 1.75], [0.52, 2.8], [0.6, 3.6], [0.68, 6.5], [0.76, 9], [0.84, 19], [0.92, 31], [1, 50]];
const path = (pts: [number, number][]) => pts.map(([x, m], i) => `${i ? "L" : "M"}${BOX.x + x * BOX.w},${toY(m)}`).join(" ");

export function SoldChart() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < CH - 0.1 || t > OUT + 0.4) return null;
  const a = prog(frame, CH, SOLD, (x) => x);
  const b = prog(frame, ROCKET, TOP, (x) => x * x);
  const mark = sp(frame, SOLD, { damping: 12, stiffness: 220 });
  const t1 = prog(frame, SOLD - 0.05, SOLD + 0.3);
  const t2 = sp(frame, ROCKET + 0.35, { damping: 14, stiffness: 200 });
  const t3 = prog(frame, MATHS, MATHS + 0.45);
  const out = prog(frame, OUT, OUT + 0.35);
  // Tip follows the drawn line: interpolate x linearly and the multiple in log space between points.
  const fi = b * (B.length - 1), i0 = Math.min(B.length - 2, Math.floor(fi)), fr = fi - i0;
  const tip: [number, number] = [interpolate(fr, [0, 1], [B[i0][0], B[i0 + 1][0]]), Math.exp(interpolate(fr, [0, 1], [Math.log(B[i0][1]), Math.log(B[i0 + 1][1])]))];
  const mult = tip[1];
  const shake = t > SOLD && t < SOLD + 0.2 ? (1 - (t - SOLD) / 0.2) * 6 : 0;
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, prog(frame, CH - 0.1, CH + 0.2)) * (1 - out), filter: `blur(${out * 14}px)`, transform: `translate(${Math.sin(frame * 2.3) * shake}px, ${Math.cos(frame * 1.9) * shake}px) scale(${1 + out * 0.08})` }}>
      {/* faint grid */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {[2, 5, 10, 25, 50].map((m) => (
          <g key={m} opacity={0.5}>
            <line x1={BOX.x} x2={BOX.x + BOX.w} y1={toY(m)} y2={toY(m)} stroke="#262626" strokeWidth={1.5} strokeDasharray="6 10" />
            <text x={BOX.x + BOX.w + 18} y={toY(m) + 8} fill="#555" fontFamily={inter} fontSize={24}>{m}x</text>
          </g>
        ))}
        <path d={path(A)} fill="none" stroke="#e7e7e7" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - a} />
        <path d={path(B)} fill="none" stroke="#e8622a" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - b}
          style={{ filter: "drop-shadow(0 0 18px rgba(232,98,42,.75))" }} />
        {t >= SOLD - 0.05 && (
          <g transform={`translate(${BOX.x + 0.31 * BOX.w} ${toY(2)})`} opacity={Math.min(1, mark * 1.4)}>
            <circle r={14 * mark} fill="#e5484d" />
            <circle r={30 * mark} fill="none" stroke="#e5484d" strokeWidth={2} opacity={0.5} />
            <g transform={`translate(0 ${-70 + (1 - mark) * -40})`}>
              <rect x={-92} y={-34} width={184} height={56} rx={28} fill="#e5484d" />
              <text x={0} y={4} textAnchor="middle" fill="#fff" fontFamily={inter} fontWeight={700} fontSize={28}>SOLD · 2x</text>
            </g>
          </g>
        )}
        {b > 0.02 && (
          <g transform={`translate(${BOX.x + tip[0] * BOX.w} ${toY(tip[1])})`}>
            <circle r={12} fill="#e8622a" style={{ filter: "drop-shadow(0 0 16px rgba(232,98,42,.9))" }} />
            <text x={-24} y={-26} textAnchor="end" fill="#e8622a" fontFamily={doto} fontWeight={900} fontSize={64}>{Math.round(mult)}x</text>
          </g>
        )}
      </svg>
      <div style={{ position: "absolute", left: 220, top: 96, width: 1480, fontFamily: inter, fontWeight: 600, fontSize: 76, letterSpacing: "-0.04em", lineHeight: 1.1 }}>
        <div style={{ color: "#f5f5f5", opacity: t1, filter: `blur(${(1 - t1) * 12}px)`, transform: `translateY(${(1 - t1) * 20}px)` }}>You sold at 2x because you were scared.</div>
        <div style={{ color: "#e8622a", opacity: Math.min(1, t2 * 1.3), filter: `blur(${(1 - t2) * 12}px)`, transform: `translateY(${(1 - t2) * 24}px)` }}>Then it did 50x,</div>
        <div style={{ color: "#8a8a8a", fontSize: 52, marginTop: 10, letterSpacing: "-0.02em", opacity: t3, filter: `blur(${(1 - t3) * 10}px)`, transform: `translateY(${(1 - t3) * 16}px)` }}>
          and you did the maths on <span style={{ color: "#f5f5f5" }}>the retirement you fumbled.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
