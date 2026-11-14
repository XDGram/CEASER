import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { kf, prog, sp } from "../anim";
import { FPS, lineStart, wd } from "../time";
import { C, doto, inter } from "../fonts";
import { Chip } from "../parts";
import { Shot, Hi } from "../Shot";
import { Big } from "../Kinetic";

const L5 = lineStart(5);
const LEAVE = wd(5, "if");
const PEN = wd(5, "penalty");
const THAT = wd(5, "that");
const US = wd(5, "us");
const IT = wd(5, "it");
const POOL = wd(5, "pool");
const AND = wd(5, "and");
const HELD = wd(5, "held");
const DUMP = wd(5, "dumpers");
const END = lineStart(6);
const CLICK = LEAVE + 0.55;

export const twistSfx = [
  { name: "click", at: CLICK },
  { name: "pop-whoosh", at: CLICK + 0.25 },
  { name: "pop-whoosh", at: THAT - 0.15 },
  { name: "error", at: US },
  { name: "pop", at: POOL },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ name: "pop", at: HELD - 0.4 + i * 0.12 })),
];

const HOLDERS = ["whale", "whale", "chad", "chad", "hodler", "hodler"].map((n, i) => `ceaser-${n}-${i % 2 ? "cd197d" : "7e8558"}`);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function Twist() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const dark = 1 - prog(frame, LEAVE - 0.35, LEAVE + 0.05);
  const shotOut = prog(frame, THAT - 0.3, THAT + 0.1);
  const mg = t >= THAT - 0.3 && t < DUMP + 0.2;
  const dumpDark = prog(frame, DUMP - 0.3, DUMP);

  // Motion graphic: penalty token -> (not) treasury -> pool -> holders.
  const tokIn = sp(frame, THAT - 0.1, { damping: 15, stiffness: 160 });
  const toPool = prog(frame, IT - 0.1, POOL);
  const tokX = interpolate(toPool, [0, 1], [-420, 0]);
  const tokY = interpolate(toPool, [0, 1], [-60, 40]) - Math.sin(toPool * Math.PI) * 160;
  const treasury = sp(frame, THAT + 0.3, { damping: 16, stiffness: 160 });
  const cross = prog(frame, US - 0.05, US + 0.3);
  const treasOut = prog(frame, IT - 0.2, IT + 0.3);
  const poolIn = sp(frame, IT - 0.2, { damping: 15, stiffness: 150 });
  const poolVal = 460750 + 20000 * prog(frame, POOL - 0.1, POOL + 0.6);
  const share = prog(frame, AND, HELD + 0.3);
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      {/* Exit flow on the real app */}
      {t < THAT + 0.2 && (
        <AbsoluteFill style={{ opacity: 1 - shotOut, filter: `blur(${shotOut * 16}px)` }}>
          <Shot url="ceaser-nine.vercel.app/app/locks" src="ui/locks.png" src2="ui/exit-dialog.png" mix={prog(frame, CLICK + 0.1, CLICK + 0.4)} enterAt={LEAVE - 0.6} enterFrom="right"
            fx={[[LEAVE, 720], [CLICK - 0.2, 470], [CLICK + 0.4, 720], [PEN - 0.3, 720]]}
            fy={[[LEAVE, 520], [CLICK - 0.2, 620], [CLICK + 0.4, 420], [PEN - 0.3, 360]]}
            z={[[LEAVE - 0.6, 0.86], [LEAVE + 0.2, 0.9], [CLICK - 0.2, 1.5], [CLICK + 0.4, 1.3], [PEN - 0.3, 2.1], [THAT, 2.3]]}
            cursor={[[LEAVE - 0.2, 900, 950], [CLICK - 0.05, 311, 780], [CLICK + 0.5, 330, 790], [PEN, 700, 560]]} clicks={[CLICK]}>
            <Hi x={526} y={350} w={392} h={30} o={prog(frame, PEN - 0.2, PEN + 0.2)} color={C.bad} />
          </Shot>
        </AbsoluteFill>
      )}

      {mg && (
        <AbsoluteFill style={{ opacity: prog(frame, THAT - 0.3, THAT) }}>
          {/* treasury box, crossed out */}
          <div style={{ position: "absolute", left: 1140, top: 300, opacity: treasury * (1 - treasOut), transform: `scale(${0.85 + 0.15 * treasury})` }}>
            <Chip style={{ width: 460, textAlign: "center", padding: "34px 28px" }}>
              <div style={{ fontSize: 18, letterSpacing: "0.2em", color: C.ink2 }}>CEASER TEAM</div>
              <div style={{ fontSize: 46, fontWeight: 600, marginTop: 6 }}>Our wallet</div>
            </Chip>
            <div style={{ position: "absolute", left: -20, right: -20, top: "50%", height: 8, background: C.bad, borderRadius: 4, transform: `rotate(-8deg) scaleX(${cross})`, transformOrigin: "left" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 190, textAlign: "center", fontFamily: inter, fontWeight: 600, fontSize: 40, color: C.bad, opacity: cross }}>Not to us.</div>
          </div>
          {/* the pool */}
          <div style={{ position: "absolute", left: 960, top: 600, transform: `translate(-50%,-50%) scale(${0.7 + 0.3 * poolIn})`, opacity: poolIn }}>
            <Chip style={{ width: 640, padding: "34px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 18, letterSpacing: "0.2em", color: C.ink2 }}>COMMUNITY POOL · CHALLENGE #4</div>
              <div style={{ fontFamily: doto, fontWeight: 900, fontSize: 96, marginTop: 10, color: C.ink }}>{fmt(poolVal)}</div>
              <div style={{ fontSize: 24, color: C.ink2 }}>CSTEST, paid to the people who held</div>
            </Chip>
          </div>
          {/* penalty token */}
          {toPool < 1 && (
            <div style={{ position: "absolute", left: 960 + tokX, top: 360 + tokY, transform: `translate(-50%,-50%) scale(${(0.6 + 0.4 * tokIn) * (1 - 0.5 * toPool)})`, opacity: tokIn,
              padding: "26px 40px", borderRadius: 999, background: C.bad, color: "#fff", fontFamily: inter, fontWeight: 600, fontSize: 48, boxShadow: "0 30px 70px rgba(178,59,42,.35)", whiteSpace: "nowrap" }}>
              −20,000 penalty
            </div>
          )}
          {/* holders */}
          {HOLDERS.map((h, i) => {
            const a = sp(frame, HELD - 0.45 + i * 0.12, { damping: 14, stiffness: 200 });
            const x = 260 + i * 280, y = 920;
            const coin = prog(frame, AND + i * 0.12, AND + 0.9 + i * 0.12);
            return (
              <React.Fragment key={i}>
                {coin > 0 && coin < 1 && <div style={{ position: "absolute", left: interpolate(coin, [0, 1], [960, x]), top: interpolate(coin, [0, 1], [640, y]) - Math.sin(coin * Math.PI) * 80, width: 26, height: 26, borderRadius: 13, background: C.accent, boxShadow: "0 0 24px rgba(232,98,42,.7)", transform: "translate(-50%,-50%)" }} />}
                <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${0.6 + 0.4 * a})`, opacity: share > 0 ? a : 0, textAlign: "center", fontFamily: inter }}>
                  <div style={{ width: 84, height: 84, borderRadius: 42, margin: "0 auto", background: ["#e8622a", "#141414", "#2f7d4f", "#6f6c66", "#c84f1c", "#3d5a80"][i], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 34, boxShadow: "0 14px 30px rgba(20,20,20,.18)" }}>{h.split("-")[1][0].toUpperCase()}</div>
                  <div style={{ fontSize: 17, color: C.ink2, marginTop: 10, fontFamily: "monospace" }}>{h}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: C.ok, marginTop: 2, opacity: prog(frame, HELD, HELD + 0.4) }}>+ share</div>
                </div>
              </React.Fragment>
            );
          })}
        </AbsoluteFill>
      )}

      {/* Dark bookends */}
      <AbsoluteFill style={{ background: C.ink, opacity: Math.max(dark, dumpDark) }} />
      <Big at={L5} until={LEAVE - 0.35} color="#f5f5f5" size={150}>Now the <span style={{ color: C.accent }}>twist.</span></Big>
      <Big at={DUMP} until={END - 0.35} color="#f5f5f5" size={124}>Dumpers pay<br /><span style={{ color: C.accent }}>the diamond hands.</span></Big>
    </AbsoluteFill>
  );
}
