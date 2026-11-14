import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { kf, prog, sp } from "../anim";
import { FPS, TL, wd } from "../time";
import { inter } from "../fonts";

type Card = { src: string; w: number; h: number; at: number; x: number; y: number; r: number; width: number };
const IMG: Record<string, [number, number]> = {
  "01-mztacat.jpg": [1179, 446], "02-ToolySOL.jpg": [1179, 317], "03-0xSweep.jpg": [1179, 289], "04-reply-holding-on.jpg": [1179, 180],
  "05-DonWedge.jpg": [1179, 310], "06-shahh.jpg": [1179, 378], "07-lynk0x.jpg": [1179, 305], "08-ramonos.jpg": [1179, 410], "09-nyhrox.png": [1400, 361],
};
const card = (src: string, at: number, x: number, y: number, r: number, width = 860): Card => ({ src, w: IMG[src][0], h: IMG[src][1], at, x, y, r, width });

// Wave 1: regret, cut on the whooshes in the soundtrack.
const sfxAt = TL.sfx.filter((s) => s.file === "whoosh-fast.mp3").map((s) => s.at);
const WAVE1 = [
  card("01-mztacat.jpg", 0.35, -330, -150, -3.5),
  card("02-ToolySOL.jpg", sfxAt[0], 350, -230, 2.5),
  card("03-0xSweep.jpg", sfxAt[1], -360, 200, 2),
  card("09-nyhrox.png", sfxAt[2], 330, 170, -2.2, 900),
  card("04-reply-holding-on.jpg", sfxAt[3], 0, 10, 0, 980),
];
const EVERY = wd(1, "every");
const SAME = wd(1, "same");
const HOLD = wd(2, "hold");
const ALMOST = wd(2, "almost");
const WAVE2 = [
  card("05-DonWedge.jpg", HOLD - 0.62, -440, -190, -2, 780),
  card("07-lynk0x.jpg", HOLD - 0.42, 440, -210, 2, 780),
  card("06-shahh.jpg", HOLD - 0.22, -440, 190, 1.5, 780),
  card("08-ramonos.jpg", HOLD, 440, 180, -1.5, 780),
];

function TweetCard({ c, frame, depth, out }: { c: Card; frame: number; depth: number; out: number }) {
  const t = frame / FPS;
  if (t < c.at - 0.05) return null;
  const s = sp(frame, c.at - 0.05, { damping: 16, stiffness: 260, mass: 0.7 });
  const enter = 1.5 - 0.5 * s;
  const blur = (1 - s) * 18;
  const push = 1 - depth * 0.06;
  const dim = 1 - Math.min(depth * 0.18, 0.6);
  // Out: fly away from the center with blur.
  const ox = c.x * out * 2.2, oy = c.y * out * 2.2;
  const h = (c.width * c.h) / c.w;
  return (
    <div style={{ position: "absolute", left: 960 + c.x + ox - c.width / 2, top: 540 + c.y + oy - h / 2, width: c.width, height: h,
      transform: `scale(${enter * push * (1 + out * 0.3)}) rotate(${c.r * (1 + out * 2)}deg)`, filter: `blur(${blur + out * 14}px) brightness(${dim})`,
      opacity: Math.min(1, s * 3) * (1 - out), borderRadius: 26, overflow: "hidden", border: "1px solid #2f3336",
      boxShadow: "0 40px 120px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04)", zIndex: Math.round(c.at * 10) }}>
      <Img src={staticFile(`tweets/${c.src}`)} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

function Big({ text, at, until, frame, size = 150, y = 0, color = "#f5f5f5" }: { text: string; at: number; until: number; frame: number; size?: number; y?: number; color?: string }) {
  const t = frame / FPS;
  if (t < at - 0.05 || t > until + 0.4) return null;
  const a = prog(frame, at - 0.05, at + 0.35);
  const o = 1 - prog(frame, until, until + 0.35);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 540 + y - size * 0.6, textAlign: "center", fontFamily: inter, fontWeight: 600,
      fontSize: size, letterSpacing: "-0.045em", color, opacity: a * o, filter: `blur(${(1 - a) * 16 + (1 - o) * 10}px)`,
      transform: `scale(${1.08 - 0.08 * a})` }}>{text}</div>
  );
}

export function TweetIntro() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = kf(frame, [[0, 1], [7, 1.12]]);
  const out1 = prog(frame, EVERY - 0.25, EVERY + 0.3);
  const out2 = prog(frame, ALMOST, ALMOST + 0.9);
  const grey2 = prog(frame, ALMOST - 0.1, ALMOST + 0.5);
  // Riser into the reveal: an orange line of light grows, then whites out.
  const reveal = TL.reveal;
  const line = prog(frame, reveal - 1.8, reveal - 0.05, (x) => x * x * x);
  const flash = interpolate(t, [reveal - 0.12, reveal], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shake = (() => { // tiny camera shake on each slam
    let s = 0;
    for (const c of [...WAVE1, ...WAVE2]) { const d = t - c.at; if (d > 0 && d < 0.25) s = Math.max(s, (1 - d / 0.25) * 7); }
    return s;
  })();
  const sx = Math.sin(frame * 2.1) * shake, sy = Math.cos(frame * 1.7) * shake;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #1a1a1a 0%, #070707 70%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px,${sy}px) scale(${cam})` }}>
        {t < EVERY + 0.5 && WAVE1.map((c, i) => <TweetCard key={c.src} c={c} frame={frame} depth={WAVE1.filter((d, j) => j > i && t >= d.at).length} out={out1} />)}
      </AbsoluteFill>
      <Big text="Every cycle." at={EVERY} until={SAME - 0.1} frame={frame} />
      <Big text="Same story." at={SAME} until={TL.vo[1].start - 0.35} frame={frame} />
      <Big text="Everyone says…" at={TL.vo[1].start} until={HOLD - 0.75} frame={frame} size={96} color="#bdbdbd" />
      <AbsoluteFill style={{ filter: `grayscale(${grey2})`, transform: `translateY(${out2 * 90}px)` }}>
        {t < ALMOST + 1 && WAVE2.map((c, i) => <TweetCard key={c.src} c={c} frame={frame} depth={grey2 * 4 + WAVE2.filter((d, j) => j > i && t >= d.at).length * 0.3} out={out2 * 0.6} />)}
      </AbsoluteFill>
      <Big text="Almost nobody does." at={ALMOST + 0.05} until={reveal - 1.4} frame={frame} size={120} />
      <div style={{ position: "absolute", left: 960 - 900 * line, width: 1800 * line, top: 539, height: 2 + line * 3, background: "#e8622a",
        boxShadow: `0 0 ${30 + 90 * line}px ${10 + 30 * line}px rgba(232,98,42,${0.35 * line})`, opacity: line > 0 ? 1 : 0 }} />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <div style={{ position: "absolute", right: 48, bottom: 36, fontFamily: inter, fontSize: 18, color: "rgba(255,255,255,.35)", letterSpacing: "0.08em" }}>Posts from X</div>
    </AbsoluteFill>
  );
}
