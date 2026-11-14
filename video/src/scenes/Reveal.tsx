import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { kf, prog, sp } from "../anim";
import { FPS, TL, wd, lineStart } from "../time";
import { C, doto, inter } from "../fonts";
import { MARK_PARTS, NearMark } from "../parts";

export const revealSfx = [{ name: "pop", at: wd(3, "built") + 0.05 }];

const R = TL.reveal;
const NAME = wd(3, "ceaser");
const SUB = wd(3, "a");
const NEAR = wd(3, "built");
const OUT = lineStart(4) - 0.35;
const FROM = [[-60, -40], [50, -70], [80, -20], [40, 70], [90, 60]];

export function Reveal() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const flash = 1 - prog(frame, R, R + 0.5);
  const tile = sp(frame, R, { damping: 14, stiffness: 120 });
  const zoom = kf(frame, [[R, 1.06], [OUT, 1]]);
  const out = prog(frame, OUT, OUT + 0.35);
  const letters = "CEASER".split("");
  const subWords = "A commitment protocol for memecoins".split(" ");
  const badge = sp(frame, NEAR, { damping: 13, stiffness: 200 });
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(232,98,42,.10), transparent 60%)" }} />
      <AbsoluteFill style={{ transform: `scale(${zoom * (1 + out * 0.25)})`, opacity: 1 - out, filter: `blur(${out * 20}px)` }}>
        <div style={{ position: "absolute", left: 960 - 110, top: 250, width: 220, height: 220, transform: `scale(${0.5 + 0.5 * tile})`, opacity: Math.min(1, tile * 2) }}>
          <svg width={220} height={220} viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill={C.ink} />
            {MARK_PARTS.map((d, i) => {
              const p = sp(frame, R + 0.12 + i * 0.07, { damping: 15, stiffness: 170 });
              return <path key={i} d={d} fill={C.paper} opacity={Math.min(1, p * 1.5)} transform={`translate(${FROM[i][0] * (1 - p) / 10} ${FROM[i][1] * (1 - p) / 10})`} />;
            })}
          </svg>
        </div>
        <div style={{ position: "absolute", top: 500, left: 0, right: 0, textAlign: "center", fontFamily: doto, fontWeight: 900, fontSize: 190, letterSpacing: "0.04em", color: C.ink, lineHeight: 1 }}>
          {letters.map((l, i) => {
            const p = sp(frame, NAME - 0.25 + i * 0.05, { damping: 16, stiffness: 180 });
            return <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 40}px)`, filter: `blur(${(1 - p) * 8}px)` }}>{l}</span>;
          })}
        </div>
        <div style={{ position: "absolute", top: 735, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontSize: 50, letterSpacing: "-0.02em", color: C.ink2 }}>
          {subWords.map((w, i) => {
            const p = prog(frame, SUB + i * 0.14, SUB + i * 0.14 + 0.45);
            return <span key={i} style={{ display: "inline-block", marginRight: 14, opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)` }}>{w}</span>;
          })}
        </div>
        <div style={{ position: "absolute", top: 840, left: 960, transform: `translateX(-50%) scale(${0.6 + 0.4 * badge})`, opacity: badge,
          display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderRadius: 999, border: `2px solid ${C.ink}`, background: C.surface,
          fontFamily: inter, fontWeight: 600, fontSize: 30, color: C.ink, boxShadow: "0 18px 50px rgba(20,20,20,.12)" }}>
          <NearMark size={34} /> Built on NEAR
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}
