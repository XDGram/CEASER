import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, kf, sp } from "./anim";
import { FPS } from "./time";
import { Browser, toStage } from "./Browser";
import { Cursor } from "./parts";

export type K = [number, number][];
/** A browser shot with a camera in page coordinates. fx/fy/z/scroll are keyframes in seconds. */
export function Shot({ url, src, src2, mix = 0, fx, fy, z, scroll = [[0, 0]], enterAt, enterFrom = "bottom", cursor, clicks = [], cursorUntil = 1e9, blur = 0, children }: {
  url: string; src: string; src2?: string; mix?: number; fx: K; fy: K; z: K; scroll?: K; enterAt: number; enterFrom?: "bottom" | "right";
  cursor?: [number, number, number][]; clicks?: number[]; cursorUntil?: number; blur?: number; children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const sc = kf(frame, scroll);
  const f = toStage(kf(frame, fx), kf(frame, fy), sc);
  const zz = kf(frame, z);
  const e = sp(frame, enterAt, { damping: 20, stiffness: 95, mass: 1.05 });
  const enterT = enterFrom === "bottom" ? `translateY(${(1 - e) * 700}px) rotateX(${(1 - e) * 26}deg)` : `translateX(${(1 - e) * 1500}px) rotateY(${-(1 - e) * 30}deg)`;
  let cur = null;
  if (cursor && t >= cursor[0][0] && t < cursorUntil) {
    const cx = kf(frame, cursor.map(([a, x]) => [a, x] as [number, number]), ease);
    const cy = kf(frame, cursor.map(([a, , y]) => [a, y] as [number, number]), ease);
    const s = toStage(cx, cy, sc);
    cur = <Cursor x={s.x} y={s.y} clicks={clicks} scale={0.9} />;
  }
  return (
    <AbsoluteFill style={{ perspective: 2400, filter: blur ? `blur(${blur}px)` : undefined }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(960px,540px) scale(${zz}) translate(${-f.x}px,${-f.y}px) ${enterT}` }}>
        <Browser url={url} src={src} src2={src2} mix={mix} scrollY={sc}>{children}</Browser>
        {cur}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Rounded accent highlight box in page coordinates. */
export const Hi = ({ x, y, w, h, o, color = "#e8622a" }: { x: number; y: number; w: number; h: number; o: number; color?: string }) =>
  o <= 0 ? null : <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 12, border: `2px solid ${color}`, background: `${color}10`, opacity: o, boxShadow: `0 0 0 ${6 * o}px ${color}22` }} />;
