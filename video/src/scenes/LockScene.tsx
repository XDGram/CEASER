import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, easeOut, kf, prog, sp } from "../anim";
import { FPS, lineStart, wd } from "../time";
import { C, doto, inter } from "../fonts";
import { Chip, Cursor, NearMark } from "../parts";
import { Browser, toStage } from "../Browser";

const L4 = lineStart(4);
const YOU = wd(4, "you");
const SMART = wd(4, "smart");
const WHILE = wd(4, "while");
const R = [wd(4, "10"), wd(4, "10", 1), wd(4, "20"), wd(4, "rest") - 0.25];
const SCARED = wd(4, "scared");
const SELL = wd(4, "sell");
const SAFETY = wd(4, "safety");
const TRAPPED = wd(4, "trapped");
const END = lineStart(5);

const CLICK_INPUT = YOU + 1.0;
const TYPE_A = CLICK_INPUT + 0.12, TYPE_B = TYPE_A + 0.75;
const CLICK_STRATEGY = WHILE + 0.75;
const CLICK_PRESET = WHILE + 1.55;
const ROWS: [number, number][] = [[530, 602], [608, 681], [688, 760], [767, 840]];
const RUNGS = [["5x", "10%"], ["10x", "10%"], ["25x", "20%"], ["100x", "60%"]];
const SELL_CLICK = SELL;

export const lockSfx = [
  { name: "pop-whoosh", at: YOU - 0.2 },
  { name: "click", at: CLICK_INPUT },
  { name: "typing", at: TYPE_A, dur: TYPE_B - TYPE_A },
  { name: "pop", at: SMART },
  { name: "click", at: CLICK_STRATEGY },
  { name: "click", at: CLICK_PRESET },
  ...R.map((at) => ({ name: "pop", at })),
  { name: "pop-whoosh", at: SCARED - 0.1 },
  { name: "click", at: SELL_CLICK },
  { name: "error", at: SELL_CLICK + 0.05 },
  { name: "lock-clunk", at: SELL_CLICK + 0.25 },
  { name: "pop", at: TRAPPED },
];

// Cursor path in page coordinates (CSS px).
const CUR: [number, number, number][] = [
  [YOU - 0.1, 1500, 1050], [CLICK_INPUT - 0.1, 300, 278], [WHILE + 0.1, 300, 278], [CLICK_STRATEGY - 0.08, 300, 400],
  [CLICK_PRESET - 0.08, 219, 504], [R[0] - 0.2, 222, 520], [R[0] + 0.3, 452, 552], [R[1] + 0.3, 452, 631], [R[2] + 0.3, 452, 710], [R[3] + 0.3, 452, 789],
];

export function LockScene() {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // Title card.
  const titleIn = sp(frame, L4 - 0.1, { damping: 18, stiffness: 150 });
  const titleOut = prog(frame, YOU - 0.55, YOU - 0.1);

  // Window entrance (3D float up), then camera.
  const enter = sp(frame, YOU - 0.5, { damping: 20, stiffness: 90, mass: 1.1 });
  const scroll = kf(frame, [[SAFETY - 0.6, 0], [SAFETY + 0.3, 560]]);
  const cam = {
    x: kf(frame, [[YOU, 960], [CLICK_INPUT - 0.4, 960], [CLICK_INPUT + 0.1, 760], [WHILE, 760], [WHILE + 0.6, 760], [R[0] - 0.4, 760], [R[0] + 0.2, 880], [SAFETY - 0.6, 880], [SAFETY + 0.3, 760]]),
    y: kf(frame, [[YOU, 540], [CLICK_INPUT - 0.4, 540], [CLICK_INPUT + 0.1, 380], [WHILE, 380], [WHILE + 0.6, 540], [R[0] - 0.4, 540], [R[0] + 0.2, 760], [SAFETY - 0.6, 760], [SAFETY + 0.3, 700]]),
    z: kf(frame, [[YOU - 0.5, 0.8], [YOU + 0.6, 0.86], [CLICK_INPUT - 0.4, 0.9], [CLICK_INPUT + 0.1, 1.85], [WHILE, 1.9], [WHILE + 0.6, 1.4], [R[0] - 0.4, 1.42], [R[0] + 0.2, 1.6], [R[3] + 1.2, 1.66], [SAFETY - 0.6, 1.5], [SAFETY + 0.3, 1.9], [END - 0.3, 2.0]]),
  };
  const sellFocus = prog(frame, SCARED - 0.2, SCARED + 0.3) * (1 - prog(frame, SAFETY - 0.7, SAFETY - 0.3));

  // Cursor (page -> stage, through scroll).
  const cx = kf(frame, CUR.map(([tt, x]) => [tt, x] as [number, number]), ease);
  const cy = kf(frame, CUR.map(([tt, , y]) => [tt, y] as [number, number]), ease);
  const cs = toStage(cx, cy, scroll);
  const typed = Math.floor(prog(frame, TYPE_A, TYPE_B, (x) => x) * 6.99);
  const filled = t >= TYPE_A;

  const worldOut = prog(frame, END - 0.35, END);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #fbfaf7 0%, #ece9e2 75%)" }} />
      {t < YOU && (
        <div style={{ position: "absolute", top: 440, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontWeight: 600, fontSize: 130, letterSpacing: "-0.045em", color: C.ink,
          opacity: titleIn * (1 - titleOut), transform: `scale(${0.92 + 0.08 * titleIn + titleOut * 0.3})`, filter: `blur(${(1 - titleIn) * 10 + titleOut * 14}px)` }}>
          Here's how it <span style={{ color: C.accent }}>works.</span>
        </div>
      )}
      {t >= YOU - 0.6 && (
        <AbsoluteFill style={{ perspective: 2400, filter: `blur(${sellFocus * 10 + worldOut * 18}px) brightness(${1 - sellFocus * 0.12})`, opacity: 1 - worldOut }}>
          <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(960px,540px) scale(${cam.z}) translate(${-cam.x}px,${-cam.y}px) translateY(${(1 - enter) * 700}px) rotateX(${(1 - enter) * 26}deg)` }}>
            <Browser url="ceaser-nine.vercel.app/app/lock" src="ui/lock-empty.png" src2="ui/lock-filled.png" mix={filled ? 1 : 0} scrollY={scroll}>
              {filled && t < TYPE_B + 0.1 && (
                <div style={{ position: "absolute", left: 202 + typed * 8.6, top: 263, width: 630 - typed * 8.6, height: 30, background: "#fff" }} />
              )}
              {ROWS.map(([a, b], i) => {
                const on = prog(frame, R[i] - 0.1, R[i] + 0.25) * (1 - prog(frame, SCARED - 0.4, SCARED));
                return <div key={i} style={{ position: "absolute", left: 178, top: a, width: 684, height: b - a, borderRadius: 12, border: `2px solid ${C.accent}`,
                  background: "rgba(232,98,42,.06)", opacity: on, boxShadow: `0 0 0 ${6 * on}px rgba(232,98,42,.12)` }} />;
              })}
              {/* Safety release highlight */}
              <div style={{ position: "absolute", left: 183, top: 1126, height: 38, width: 670 * prog(frame, SAFETY, SAFETY + 0.9), background: "rgba(232,98,42,.16)", borderRadius: 6 }} />
            </Browser>
            {t < SCARED + 0.2 && <Cursor x={cs.x} y={cs.y} clicks={[CLICK_INPUT, CLICK_STRATEGY, CLICK_PRESET]} scale={0.9} />}
          </AbsoluteFill>
        </AbsoluteFill>
      )}

      {/* Vault chip: "a smart contract on NEAR" */}
      {(() => {
        const a = sp(frame, SMART - 0.1, { damping: 15, stiffness: 190 });
        const o = 1 - prog(frame, WHILE - 0.3, WHILE + 0.1);
        if (t < SMART - 0.15 || o <= 0) return null;
        return (
          <Chip style={{ position: "absolute", right: 90, top: 90, opacity: a * o, transform: `translateY(${(1 - a) * 30}px) scale(${0.85 + 0.15 * a})`, display: "flex", gap: 20, alignItems: "center" }}>
            <NearMark size={76} />
            <div>
              <div style={{ fontSize: 18, letterSpacing: "0.2em", color: C.ink2, textTransform: "uppercase" }}>The CEASER vault</div>
              <div style={{ fontSize: 40, fontWeight: 600, marginTop: 4 }}>A smart contract on NEAR</div>
              <div style={{ fontSize: 22, color: C.ink2, marginTop: 6, fontFamily: "monospace" }}>ceaser-vault-756e8a.testnet</div>
            </div>
          </Chip>
        );
      })()}

      {/* Rung chips */}
      {RUNGS.map(([x, pct], i) => {
        const a = sp(frame, R[i] - 0.05, { damping: 14, stiffness: 210 });
        const o = 1 - prog(frame, SCARED - 0.4, SCARED);
        if (t < R[i] - 0.1 || o <= 0) return null;
        return (
          <Chip key={i} style={{ position: "absolute", right: 80, top: 150 + i * 205, width: 360, opacity: a * o, transform: `translateX(${(1 - a) * 80}px) scale(${0.9 + 0.1 * a})`,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 32px" }}>
            <span style={{ fontFamily: doto, fontWeight: 900, fontSize: 76, color: i === 3 ? C.accent : C.ink, lineHeight: 1 }}>{x}</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 38, fontWeight: 600 }}>{pct}</div>
              <div style={{ fontSize: 17, color: C.ink2, letterSpacing: "0.12em", textTransform: "uppercase" }}>unlocks</div>
            </div>
          </Chip>
        );
      })}

      {/* "Your scared future self can't sell early" */}
      {sellFocus > 0 && (() => {
        const tSell = t - SELL_CLICK;
        const shakeX = tSell > 0 && tSell < 0.45 ? Math.sin(tSell * 70) * 18 * (1 - tSell / 0.45) : 0;
        const locked = prog(frame, SELL_CLICK + 0.15, SELL_CLICK + 0.45);
        const cur = { x: kf(frame, [[SCARED, 1500], [SELL_CLICK - 0.1, 1010]]), y: kf(frame, [[SCARED, 900], [SELL_CLICK - 0.1, 575]]) };
        const ap = sp(frame, SCARED - 0.15, { damping: 15, stiffness: 180 });
        return (
          <AbsoluteFill style={{ opacity: sellFocus }}>
            <div style={{ position: "absolute", top: 300, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontSize: 40, color: C.ink2, letterSpacing: "-0.01em" }}>
              Your scared future self
            </div>
            <div style={{ position: "absolute", left: 960, top: 540, transform: `translate(-50%,-50%) translateX(${shakeX}px) scale(${0.8 + 0.2 * ap})`,
              display: "flex", alignItems: "center", gap: 18, padding: "34px 64px", borderRadius: 999, fontFamily: inter, fontWeight: 600, fontSize: 52,
              background: locked > 0.5 ? C.ink : C.bad, color: "#fff", boxShadow: "0 40px 90px rgba(20,20,20,.3)" }}>
              {locked > 0.5 ? (
                <><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>Locked until 5x</>
              ) : (<>Sell everything</>)}
            </div>
            {locked > 0 && <div style={{ position: "absolute", top: 680, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontSize: 34, color: C.ink, opacity: locked }}>can't sell early.</div>}
            <Cursor x={cur.x} y={cur.y} clicks={[SELL_CLICK]} scale={1.5} />
          </AbsoluteFill>
        );
      })()}

      {/* Safety release chip */}
      {(() => {
        const a = sp(frame, TRAPPED - 0.1, { damping: 15, stiffness: 190 });
        const o = 1 - prog(frame, END - 0.4, END - 0.1);
        if (t < TRAPPED - 0.15) return null;
        return (
          <Chip style={{ position: "absolute", left: 960, bottom: 110, transform: `translateX(-50%) translateY(${(1 - a) * 40}px)`, opacity: a * o, display: "flex", gap: 18, alignItems: "center", fontSize: 34, fontWeight: 600 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.ok} strokeWidth="2.4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Your bag is never trapped
          </Chip>
        );
      })()}
    </AbsoluteFill>
  );
}
