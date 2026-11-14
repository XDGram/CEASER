import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { prog, sp } from "../anim";
import { FPS, lineStart, wd } from "../time";
import { C, inter } from "../fonts";
import { Chip, NearMark } from "../parts";
import { Shot, Hi } from "../Shot";

const L6 = lineStart(6);
const CAMP = wd(6, "campaigns");
const LOCK = wd(6, "they");
const MILE = wd(6, "chase");
const CLIMB = wd(6, "and");
const EVERY = wd(6, "every");
const NEARW = wd(6, "near");
const END = lineStart(7);
const SWITCH = CLIMB - 0.25;

export const commSfx = [
  { name: "pop-whoosh", at: L6 - 0.2 },
  { name: "pop", at: LOCK + 0.1 },
  { name: "pop", at: LOCK + 0.65 },
  { name: "pop", at: MILE + 0.2 },
  { name: "pop-whoosh", at: SWITCH },
  { name: "pop", at: EVERY + 0.3 },
];

function Toast({ at, until, i, who, text }: { at: number; until: number; i: number; who: string; text: string }) {
  const frame = useCurrentFrame();
  const a = sp(frame, at, { damping: 16, stiffness: 190 });
  const o = 1 - prog(frame, until, until + 0.3);
  if (frame / FPS < at - 0.05) return null;
  return (
    <Chip style={{ position: "absolute", left: 70, bottom: 70 + i * 128, width: 560, padding: "18px 22px", display: "flex", gap: 16, alignItems: "center", opacity: a * o, transform: `translateX(${(1 - a) * -120}px)` }}>
      <div style={{ width: 54, height: 54, borderRadius: 27, background: i ? C.ink : C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 24 }}>{who[7].toUpperCase()}</div>
      <div>
        <div style={{ fontSize: 18, fontFamily: "monospace", color: C.ink2 }}>{who}</div>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{text}</div>
      </div>
      <div style={{ marginLeft: "auto", fontSize: 14, letterSpacing: "0.16em", color: C.ok }}>● LIVE</div>
    </Chip>
  );
}

export function Communities() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const sw = prog(frame, SWITCH, SWITCH + 0.4);
  const out = prog(frame, END - 0.35, END);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #fbfaf7 0%, #ece9e2 75%)" }} />
      <AbsoluteFill style={{ opacity: 1 - out, filter: `blur(${out * 16}px)` }}>
        {t < SWITCH + 0.45 && (
          <AbsoluteFill style={{ opacity: 1 - sw, filter: `blur(${sw * 14}px)` }}>
            <Shot url="ceaser-nine.vercel.app/app/c/diamond-hands" src="ui/community.png" enterAt={L6 - 0.45} enterFrom="right"
              fx={[[L6, 720], [CAMP - 0.4, 720], [CAMP + 0.3, 460], [LOCK - 0.2, 460], [LOCK + 0.3, 420], [MILE - 0.2, 420], [MILE + 0.3, 560]]}
              fy={[[L6, 450], [CAMP - 0.4, 450], [CAMP + 0.3, 220], [LOCK - 0.2, 220], [LOCK + 0.3, 420], [MILE - 0.2, 420], [MILE + 0.3, 470]]}
              z={[[L6 - 0.4, 0.85], [L6 + 0.4, 0.9], [CAMP - 0.4, 0.95], [CAMP + 0.3, 1.6], [LOCK - 0.2, 1.65], [LOCK + 0.3, 2.0], [MILE - 0.2, 2.0], [MILE + 0.3, 1.9], [SWITCH, 2.0]]}>
              <Hi x={180} y={398} w={340} h={48} o={prog(frame, LOCK, LOCK + 0.3)} />
              <Hi x={325} y={457} w={460} h={40} o={prog(frame, MILE, MILE + 0.3)} color={C.ok} />
            </Shot>
            <Toast at={LOCK + 0.1} until={MILE - 0.1} i={1} who="ceaser-whale-7e8558" text="locked 900,000 CSTEST" />
            <Toast at={LOCK + 0.65} until={MILE - 0.1} i={0} who="ceaser-chad-7e8558" text="joined Diamond hands season" />
            {(() => {
              const a = sp(frame, MILE + 0.2, { damping: 15, stiffness: 190 });
              if (t < MILE + 0.15) return null;
              return (
                <Chip style={{ position: "absolute", right: 90, bottom: 110, opacity: a, transform: `translateY(${(1 - a) * 40}px)`, display: "flex", gap: 18, alignItems: "center", fontSize: 32, fontWeight: 600 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.ok} strokeWidth="2.4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  Milestone hit: 2,500,000 committed
                </Chip>
              );
            })()}
          </AbsoluteFill>
        )}
        {t >= SWITCH && (
          <AbsoluteFill style={{ opacity: sw }}>
            <Shot url="ceaser-nine.vercel.app/app/challenges/4" src="ui/challenge.png" enterAt={SWITCH - 0.2} enterFrom="right"
              fx={[[SWITCH, 560], [EVERY - 0.3, 560], [EVERY + 0.4, 760]]}
              fy={[[SWITCH, 760], [EVERY - 0.3, 760], [EVERY + 0.4, 330]]}
              z={[[SWITCH, 1.5], [EVERY - 0.3, 1.6], [EVERY + 0.4, 1.4], [END, 1.5]]}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Hi key={i} x={172} y={566 + i * 60} w={752} h={52} o={prog(frame, CLIMB + 0.1 + i * 0.12, CLIMB + 0.3 + i * 0.12) * (1 - prog(frame, CLIMB + 0.5 + i * 0.12, CLIMB + 0.8 + i * 0.12))} />
              ))}
              {[0, 1, 2, 3].map((i) => {
                const a = prog(frame, EVERY + 0.4 + i * 0.15, EVERY + 0.7 + i * 0.15);
                const pulse = 0.6 + 0.4 * Math.sin(frame / 4 + i);
                return <div key={i} style={{ position: "absolute", left: 182 + i * 283 + 220, top: 286, opacity: a, display: "flex", alignItems: "center", gap: 6, fontFamily: inter, fontSize: 10, letterSpacing: "0.15em", color: C.ok }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: C.ok, opacity: pulse, boxShadow: `0 0 8px ${C.ok}` }} />LIVE</div>;
              })}
            </Shot>
            {(() => {
              const a = sp(frame, NEARW - 0.4, { damping: 15, stiffness: 190 });
              if (t < NEARW - 0.45) return null;
              return (
                <Chip style={{ position: "absolute", left: 960, bottom: 90, transform: `translateX(-50%) translateY(${(1 - a) * 40}px)`, opacity: a, display: "flex", gap: 18, alignItems: "center", fontSize: 36, fontWeight: 600 }}>
                  <NearMark size={50} /> Read live from NEAR
                </Chip>
              );
            })()}
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
