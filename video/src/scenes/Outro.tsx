import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { prog, sp } from "../anim";
import { END as VEND, FPS, lineStart, TL, wd } from "../time";
import { C, doto, inter } from "../fonts";
import { Cursor, MARK_PARTS, NearMark } from "../parts";

const L10 = lineStart(10);
const HIT = TL.sfx.find((s) => s.file === "logo-impact.mp3")!.at;
const BUILT = wd(10, "built");
const TRY = wd(10, "try");
const NOW = wd(10, "wallet") - 0.2;
const SET = wd(10, "well");
const FROM = [[-60, -40], [50, -70], [80, -20], [40, 70], [90, 60]];

export const outroSfx = [
  { name: "pop", at: BUILT + 0.1 },
  { name: "pop-whoosh", at: TRY },
  { name: "click", at: NOW + 0.1 },
  { name: "pop", at: SET + 0.2 },
];

export function Outro() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const flash = 1 - prog(frame, HIT, HIT + 0.5);
  const tile = sp(frame, HIT - 0.05, { damping: 13, stiffness: 150 });
  const up = prog(frame, TRY - 0.3, TRY + 0.3);
  const badge = sp(frame, BUILT, { damping: 13, stiffness: 200 });
  const cta = sp(frame, TRY, { damping: 15, stiffness: 170 });
  const click = NOW + 0.1;
  const pressed = t >= click;
  const done = sp(frame, SET + 0.1, { damping: 15, stiffness: 180 });
  const fade = prog(frame, VEND - 1.6, VEND - 0.1);
  const cx = 960 + 520 - 520 * prog(frame, TRY + 0.2, click - 0.05);
  const cy = 1000 - 205 * prog(frame, TRY + 0.2, click - 0.05);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(232,98,42,.12), transparent 60%)" }} />
      <AbsoluteFill style={{ transform: `translateY(${-150 * up}px) scale(${1 - 0.18 * up})` }}>
        <div style={{ position: "absolute", left: 960 - 110, top: 230, width: 220, height: 220, transform: `scale(${0.4 + 0.6 * tile})`, opacity: Math.min(1, tile * 2) }}>
          <svg width={220} height={220} viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill={C.ink} />
            {MARK_PARTS.map((d, i) => {
              const p = sp(frame, HIT + i * 0.05, { damping: 15, stiffness: 190 });
              return <path key={i} d={d} fill={C.paper} opacity={Math.min(1, p * 1.5)} transform={`translate(${FROM[i][0] * (1 - p) / 10} ${FROM[i][1] * (1 - p) / 10})`} />;
            })}
          </svg>
        </div>
        <div style={{ position: "absolute", top: 490, left: 0, right: 0, textAlign: "center", fontFamily: doto, fontWeight: 900, fontSize: 200, letterSpacing: "0.04em", color: C.ink, lineHeight: 1 }}>
          {"CEASER".split("").map((l, i) => {
            const p = sp(frame, HIT + 0.05 + i * 0.04, { damping: 16, stiffness: 200 });
            return <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 40}px)`, filter: `blur(${(1 - p) * 8}px)` }}>{l}</span>;
          })}
        </div>
        <div style={{ position: "absolute", top: 740, left: 960, transform: `translateX(-50%) scale(${0.6 + 0.4 * badge})`, opacity: badge, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px",
          borderRadius: 999, border: `2px solid ${C.ink}`, background: C.surface, fontFamily: inter, fontWeight: 600, fontSize: 32, color: C.ink }}>
          <NearMark size={36} /> Built on NEAR
        </div>
      </AbsoluteFill>
      {t >= TRY - 0.05 && (
        <div style={{ position: "absolute", top: 740, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: cta, transform: `translateY(${(1 - cta) * 40}px)` }}>
          <div style={{ fontFamily: inter, fontSize: 40, color: C.ink2 }}>ceaser-nine.vercel.app</div>
          <div style={{ padding: "26px 56px", borderRadius: 999, background: pressed ? C.ink : C.accent, color: "#fff", fontFamily: inter, fontWeight: 600, fontSize: 46,
            transform: `scale(${pressed && t < click + 0.15 ? 0.95 : 1})`, boxShadow: "0 24px 60px rgba(232,98,42,.35)" }}>
            {pressed ? "Setting you up…" : "Try without a wallet"}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", fontFamily: inter, fontSize: 32, fontWeight: 600, color: C.ok, opacity: done }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.ok} strokeWidth="2.6"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Test NEAR in seconds. No wallet needed.
          </div>
        </div>
      )}
      {t >= TRY + 0.15 && t < SET + 0.6 && <Cursor x={cx} y={cy} clicks={[click]} scale={1.5} />}
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <AbsoluteFill style={{ background: "#000", opacity: fade }} />
    </AbsoluteFill>
  );
}
