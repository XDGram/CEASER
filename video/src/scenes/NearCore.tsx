import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { prog, sp } from "../anim";
import { FPS, lineStart, wd } from "../time";
import { C, doto, inter } from "../fonts";
import { Chip, NearMark } from "../parts";
import { Shot } from "../Shot";
import { Big, Chapter } from "../Kinetic";

const L7 = lineStart(7);
const FIRST = wd(7, "first");
const IF = wd(7, "if");
const TWO = wd(7, "two");
const L8 = lineStart(8);
const EVERY = wd(8, "every");
const NEARW = wd(8, "near");
const PAID = wd(8, "paid");
const VER = wd(8, "verified");
const LIVE = wd(8, "live");
const NOSPAM = wd(8, "no");
const REAL = wd(8, "real");
const END = lineStart(9);

const TYPE_A = EVERY + 0.35, TYPE_B = EVERY + 1.6;
const TEXT = "Diamond hands only. Locked until 100x.";
const SCROLL = 1080;

export const nearSfx = [
  { name: "pop-whoosh", at: FIRST - 0.1 },
  { name: "pop", at: IF + 0.75 },
  { name: "pop", at: IF + 1.5 },
  { name: "pop", at: IF + 2.25 },
  { name: "pop", at: TWO },
  { name: "pop-whoosh", at: L8 - 0.1 },
  { name: "click", at: EVERY + 0.2 },
  { name: "typing", at: TYPE_A, dur: TYPE_B - TYPE_A },
  { name: "click", at: NEARW },
  { name: "pop", at: PAID + 0.1 },
  { name: "pop", at: VER + 0.6 },
  { name: "pop-whoosh", at: LIVE - 0.1 },
];

const TIERS: [number, string][] = [[10, "1.10x"], [100, "1.25x"], [1000, "1.50x"], [10000, "2.00x"]];

export function NearCore() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const ink = 1 - prog(frame, FIRST - 0.3, FIRST);
  const nIn = sp(frame, L7 - 0.1, { damping: 14, stiffness: 120 });

  // Staking boost counters (log scale 1 -> 10,000 NEAR).
  const p = prog(frame, IF + 0.1, TWO, (x) => x);
  const staked = t < IF ? 0 : Math.pow(10, 4 * p);
  const tier = TIERS.filter(([n]) => staked >= n - 0.01).length;
  const boost = tier ? TIERS[tier - 1][1] : "1.00x";
  const stakeOn = t >= IF - 0.3 && t < L8;
  const stakeIn = sp(frame, IF - 0.3, { damping: 18, stiffness: 140 });
  const stakeOut = prog(frame, L8 - 0.4, L8 - 0.05);

  // Voice: composer shot.
  const voiceShot = t >= EVERY - 0.6 && t < NOSPAM;
  const typed = Math.floor(prog(frame, TYPE_A, TYPE_B, (x) => x) * TEXT.length);
  const shotBlur = prog(frame, PAID - 0.1, PAID + 0.3) * 8;
  const shotOut = prog(frame, NOSPAM - 0.4, NOSPAM - 0.05);
  const tx = sp(frame, PAID, { damping: 15, stiffness: 180 });
  const ok = prog(frame, VER + 0.4, VER + 0.8);
  const post = sp(frame, LIVE - 0.15, { damping: 15, stiffness: 170 });
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #fbfaf7 0%, #ece9e2 75%)" }} />

      {/* 01 Staking */}
      <Chapter n="01" title="Staking" at={FIRST} until={IF - 0.35} />
      {stakeOn && (
        <AbsoluteFill style={{ opacity: stakeIn * (1 - stakeOut), filter: `blur(${stakeOut * 14}px)`, transform: `scale(${0.95 + 0.05 * stakeIn})` }}>
          <div style={{ position: "absolute", top: 170, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontSize: 34, color: C.ink2 }}>Stake NEAR, and the vault contract boosts your share of the rewards</div>
          <div style={{ position: "absolute", top: 300, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 60 }}>
            <Chip style={{ width: 640, padding: "40px 48px" }}>
              <div style={{ fontSize: 18, letterSpacing: "0.22em", color: C.ink2 }}>NEAR STAKED</div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14 }}>
                <span style={{ fontFamily: doto, fontWeight: 900, fontSize: 120, lineHeight: 1 }}>{Math.floor(staked).toLocaleString("en-US")}</span>
                <NearMark size={70} />
              </div>
            </Chip>
            <Chip style={{ width: 520, padding: "40px 48px", border: `2px solid ${tier === 4 ? C.accent : C.line}` }}>
              <div style={{ fontSize: 18, letterSpacing: "0.22em", color: C.ink2 }}>REWARD BOOST</div>
              <div style={{ fontFamily: doto, fontWeight: 900, fontSize: 130, lineHeight: 1, marginTop: 14, color: tier === 4 ? C.accent : C.ink, transform: `scale(${1 + 0.08 * (1 - prog(frame, TWO, TWO + 0.4)) * (t > TWO ? 1 : 0)})` }}>{boost}</div>
            </Chip>
          </div>
          <div style={{ position: "absolute", top: 640, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 26 }}>
            {TIERS.map(([n, b], i) => (
              <div key={n} style={{ padding: "18px 30px", borderRadius: 999, fontFamily: inter, fontSize: 30, fontWeight: 600, display: "flex", gap: 10, alignItems: "center",
                border: `2px solid ${i < tier ? C.ink : C.line}`, background: i < tier ? C.ink : "transparent", color: i < tier ? "#fff" : C.ink3 }}>
                ≥ {n.toLocaleString("en-US")} <NearMark size={28} color={i < tier ? "#fff" : C.ink3} bg={i < tier ? C.ink : C.paper} /> → {b}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", top: 790, left: 0, right: 0, textAlign: "center", fontFamily: inter, fontWeight: 600, fontSize: 64, letterSpacing: "-0.03em", opacity: prog(frame, TWO - 0.1, TWO + 0.3) }}>
            Up to <span style={{ color: C.accent }}>2x</span> the rewards.
          </div>
        </AbsoluteFill>
      )}

      {/* 02 Your voice */}
      <Chapter n="02" title="Your voice" at={L8} until={EVERY - 0.5} />
      {voiceShot && (
        <AbsoluteFill style={{ opacity: 1 - shotOut, filter: `blur(${shotOut * 14}px)` }}>
          <Shot url="ceaser-nine.vercel.app/app/c/diamond-hands" src="ui/community.png" enterAt={EVERY - 0.6} scroll={[[0, SCROLL]]} blur={shotBlur}
            fx={[[EVERY, 575], [TYPE_B, 575], [NEARW - 0.3, 760]]} fy={[[EVERY, 1440], [TYPE_B, 1440], [NEARW - 0.3, 1490]]}
            z={[[EVERY - 0.6, 1.2], [EVERY + 0.3, 1.75], [TYPE_B, 1.8], [NEARW - 0.3, 2.3], [PAID, 2.4]]}
            cursor={[[EVERY - 0.3, 900, 1700], [EVERY + 0.15, 420, 1440], [TYPE_B, 440, 1450], [NEARW - 0.05, 870, 1508], [PAID + 1, 880, 1515]]} clicks={[EVERY + 0.2, NEARW]}>
            {t >= TYPE_A && (
              <div style={{ position: "absolute", left: 223, top: 1403, width: 700, height: 72, background: "#fff", borderRadius: 10, padding: "12px 14px", boxSizing: "border-box", fontFamily: inter, fontSize: 15, color: C.ink }}>
                {TEXT.slice(0, typed)}<span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span>
              </div>
            )}
            {t >= TYPE_B && <div style={{ position: "absolute", left: 818, top: 1493, width: 107, height: 30, borderRadius: 15, background: C.accent, color: "#fff", fontFamily: inter, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Post · 0.01 <NearMark size={13} color="#fff" bg={C.accent} /></div>}
          </Shot>
          {t >= PAID - 0.05 && (
            <Chip style={{ position: "absolute", left: 960, top: 300, transform: `translate(-50%,0) scale(${0.8 + 0.2 * tx})`, opacity: tx * (1 - prog(frame, LIVE - 0.2, LIVE + 0.1)), padding: "34px 44px", minWidth: 780 }}>
              <div style={{ fontSize: 18, letterSpacing: "0.22em", color: C.ink2 }}>NEAR TRANSFER</div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10, fontSize: 46, fontWeight: 600 }}>
                0.01 <NearMark size={44} /> <span style={{ color: C.ink3 }}>→</span> <span style={{ fontFamily: "monospace", fontSize: 32 }}>ceaser-treasury-756e8a.testnet</span>
              </div>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 600, color: C.ok, opacity: ok }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={C.ok} strokeWidth="2.6"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> Verified on chain
              </div>
            </Chip>
          )}
          {t >= LIVE - 0.2 && (
            <Chip style={{ position: "absolute", left: 960, top: 330, transform: `translate(-50%,0) translateY(${(1 - post) * 60}px)`, opacity: post, width: 900, padding: "30px 36px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 26 }}>D</div>
                <div style={{ fontFamily: "monospace", fontSize: 22 }}>ceaser-demo-2aa40774.testnet</div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 20, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 14px" }}>paid 0.01 <NearMark size={20} color={C.ink2} bg="#fff" /> ↗</div>
              </div>
              <div style={{ fontSize: 36, marginTop: 18, fontWeight: 500 }}>{TEXT}</div>
            </Chip>
          )}
        </AbsoluteFill>
      )}
      <Big at={NOSPAM} until={REAL - 0.25} size={170}>No spam.</Big>
      <Big at={REAL} until={END - 0.4} size={170}>Real <span style={{ color: C.accent }}>conviction.</span></Big>

      {/* Intro: NEAR at the core */}
      <AbsoluteFill style={{ background: C.ink, opacity: ink }}>
        <div style={{ position: "absolute", left: 960, top: 400, transform: `translate(-50%,-50%) scale(${0.5 + 0.5 * nIn})`, opacity: nIn, filter: `drop-shadow(0 0 60px rgba(255,255,255,${0.15 * nIn}))` }}>
          <NearMark size={220} color="#f5f5f5" bg={C.ink} />
        </div>
        <Big at={L7 + 0.3} until={FIRST - 0.3} color="#f5f5f5" size={110} y={170}>NEAR is at the <span style={{ color: C.accent }}>core.</span></Big>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
