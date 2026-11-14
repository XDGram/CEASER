import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { kf, prog, sp } from "../anim";
import { FPS, lineStart, wd } from "../time";
import { C, inter } from "../fonts";
import { NearMark } from "../parts";
import { Shot, Hi } from "../Shot";
import { Big, Chapter } from "../Kinetic";

const L9 = lineStart(9);
const THE = wd(9, "the");
const ONE = wd(9, "one");
const FIVE = wd(9, "five");
const CAMP = wd(9, "campaigns");
const TWENTY = wd(9, "twenty");
const EVEN = wd(9, "even");
const TO = wd(9, "to");
const SPEAK = wd(9, "speak");
const LEAD = wd(9, "lead", 1);
const LAUNCH = wd(9, "launch");
const USE = wd(9, "use");
const MEME = wd(9, "memcoin");
const END = lineStart(10);
const STOP = END - 1.55;

export const rankSfx = [
  { name: "pop-whoosh", at: THE - 0.2 },
  ...[ONE, FIVE, CAMP, TWENTY].map((at) => ({ name: "pop", at })),
  { name: "pop-whoosh", at: EVEN - 0.2 },
  { name: "click", at: EVEN + 0.7 },
  ...[TO, SPEAK, LEAD, LAUNCH].map((at) => ({ name: "pop", at: at + 0.05 })),
  { name: "pop-whoosh", at: MEME - 0.15 },
];

// near-backing.png: 1132 x 565 CSS px. Rows (CSS y, h) inside the card.
const ROWS: [number, number, number][] = [[ONE, 247, 24], [FIVE, 335, 24], [CAMP, 284, 36], [TWENTY, 370, 24]];
const S = 1.38; // card display scale

export function Rank() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cardOn = t >= THE - 0.4 && t < EVEN;
  const cIn = sp(frame, THE - 0.3, { damping: 20, stiffness: 110 });
  const cOut = prog(frame, EVEN - 0.4, EVEN - 0.05);
  const fy = kf(frame, [[THE, 282], [ONE - 0.2, 282], [ONE + 0.2, 259], [FIVE + 0.2, 347], [CAMP + 0.2, 302], [TWENTY + 0.2, 382]]);
  const z = kf(frame, [[THE - 0.3, 0.92], [ONE - 0.2, 1.0], [ONE + 0.3, 1.18], [EVEN, 1.22]]);
  const board = t >= EVEN - 0.45 && t < TO;
  const bOut = prog(frame, TO - 0.35, TO);
  const ink = prog(frame, TO - 0.3, TO);
  const words: [number, string][] = [[TO, "Hold."], [SPEAK, "Speak."], [LEAD, "Lead."], [LAUNCH, "Launch."]];
  const wOut = prog(frame, USE - 0.25, USE);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #fbfaf7 0%, #ece9e2 75%)" }} />
      <Chapter n="03" title="Your rank" at={L9} until={THE - 0.35} />
      {cardOn && (
        <AbsoluteFill style={{ perspective: 2200, opacity: cIn * (1 - cOut), filter: `blur(${cOut * 14}px)` }}>
          <div style={{ position: "absolute", left: 960, top: 540, width: 1132, height: 565, transformOrigin: "0 0",
            transform: `scale(${S * z}) translate(${-566}px, ${-fy}px) rotateX(${(1 - cIn) * 24}deg) translateY(${(1 - cIn) * 300}px)` }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 100px rgba(20,20,20,.22), 0 0 0 1px rgba(20,20,20,.08)" }}>
              <Img src={staticFile("ui/near-backing.png")} style={{ width: 1132, display: "block" }} />
            </div>
            {ROWS.map(([at, y, h], i) => <Hi key={i} x={12} y={y - 6} w={1108} h={h + 12} o={prog(frame, at - 0.1, at + 0.2) * (1 - prog(frame, (ROWS[i + 1]?.[0] ?? EVEN) - 0.15, (ROWS[i + 1]?.[0] ?? EVEN) + 0.1))} />)}
          </div>
        </AbsoluteFill>
      )}
      {board && (
        <AbsoluteFill style={{ opacity: 1 - bOut, filter: `blur(${bOut * 14}px)` }}>
          <Shot url="ceaser-nine.vercel.app/app/communities" src="ui/communities-near.png" enterAt={EVEN - 0.45} enterFrom="right"
            fx={[[EVEN, 720], [EVEN + 0.6, 720], [EVEN + 1.4, 700]]} fy={[[EVEN, 450], [EVEN + 0.6, 450], [EVEN + 1.4, 590]]}
            z={[[EVEN - 0.4, 0.9], [EVEN + 0.6, 1.0], [EVEN + 1.4, 1.55], [TO, 1.6]]}
            cursor={[[EVEN, 1300, 900], [EVEN + 0.65, 1208, 506], [EVEN + 1.6, 1225, 560]]} clicks={[EVEN + 0.7]}>
            <Hi x={1150} y={540} w={120} h={130} o={prog(frame, EVEN + 1.3, EVEN + 1.7)} />
          </Shot>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: C.ink, opacity: ink }}>
        {t >= TO && t < USE + 0.3 && (
          <div style={{ position: "absolute", top: 540, left: 0, right: 0, transform: "translateY(-50%)", display: "flex", justifyContent: "center", gap: 44, opacity: 1 - wOut, filter: `blur(${wOut * 12}px)` }}>
            {words.map(([at, w]) => {
              const a = sp(frame, at - 0.05, { damping: 14, stiffness: 200 });
              return <div key={w} style={{ fontFamily: inter, fontWeight: 600, fontSize: 112, letterSpacing: "-0.045em", color: "#f5f5f5", opacity: t >= at - 0.08 ? a : 0, transform: `translateY(${(1 - a) * 50}px)` }}>{w}</div>;
            })}
          </div>
        )}
        <Big at={USE - 0.15} until={MEME - 0.3} color="#f5f5f5" size={150}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 36 }}>You use <NearMark size={140} color="#f5f5f5" bg={C.ink} /> NEAR.</span>
        </Big>
        <Big at={MEME} until={STOP - 0.3} color="#f5f5f5" size={120}>Memecoin activity<br />becomes <span style={{ color: C.accent }}>NEAR demand.</span></Big>
        <Big at={STOP} until={END - 0.1} color="#f5f5f5" size={130}>Stop fumbling<br />your <span style={{ color: C.accent }}>moonbag.</span></Big>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
