import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { FPS, lineStart, TL } from "./time";
import { Sfx } from "./parts";
import { TweetIntro } from "./scenes/TweetIntro";
import { Reveal, revealSfx } from "./scenes/Reveal";
import { LockScene, lockSfx } from "./scenes/LockScene";
import { Twist, twistSfx } from "./scenes/Twist";
import { Communities, commSfx } from "./scenes/Communities";
import { NearCore, nearSfx } from "./scenes/NearCore";
import { Rank, rankSfx } from "./scenes/Rank";
import { Outro, outroSfx } from "./scenes/Outro";

const SCENES: [number, number, React.FC][] = [
  [0, TL.reveal + 0.05, TweetIntro],
  [TL.reveal, lineStart(4) + 0.05, Reveal],
  [lineStart(4) - 0.15, lineStart(5) + 0.05, LockScene],
  [lineStart(5), lineStart(6) + 0.05, Twist],
  [lineStart(6) - 0.05, lineStart(7) + 0.05, Communities],
  [lineStart(7), lineStart(9) + 0.05, NearCore],
  [lineStart(9), lineStart(10) + 0.05, Rank],
  [lineStart(10), 1e9, Outro],
];
const SFX: { name: string; at: number; dur?: number }[] = [...revealSfx, ...lockSfx, ...twistSfx, ...commSfx, ...nearSfx, ...rankSfx, ...outroSfx];

export function CeaserVideo() {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {SCENES.map(([a, b, S], i) => (t >= a && t < b ? <AbsoluteFill key={i}><S /></AbsoluteFill> : null))}
      <Audio src={staticFile("soundtrack.mp3")} />
      {SFX.map((s, i) => <Sfx key={i} name={s.name} at={s.at} dur={s.dur} />)}
    </AbsoluteFill>
  );
}
