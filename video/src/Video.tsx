import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { FPS, lineStart, TL } from "./time";
import { Sfx } from "./parts";
import { TweetIntro } from "./scenes/TweetIntro";
import { Reveal, revealSfx } from "./scenes/Reveal";
import { LockScene, lockSfx } from "./scenes/LockScene";

const SCENES: [number, number, React.FC][] = [
  [0, TL.reveal + 0.05, TweetIntro],
  [TL.reveal, lineStart(4) + 0.05, Reveal],
  [lineStart(4) - 0.4, lineStart(5) + 0.05, LockScene],
];
const SFX: { name: string; at: number; dur?: number }[] = [...revealSfx, ...lockSfx];

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
