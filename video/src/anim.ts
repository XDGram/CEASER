import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./time";

export const ease = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** Keyframes in seconds: [[t, v], ...]. Holds the ends. */
export function kf(frame: number, keys: [number, number][], e = ease): number {
  const t = frame / FPS;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) return t1 === t0 ? v1 : interpolate(t, [t0, t1], [v0, v1], { easing: e });
  }
  return keys[keys.length - 1][1];
}

/** 0..1 spring that starts at time `at` (s). */
export function sp(frame: number, at: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) {
  return spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping: 18, stiffness: 140, mass: 0.9, ...cfg } });
}

/** Linear 0..1 progress between two times (s), clamped. */
export function prog(frame: number, a: number, b: number, e = easeOut) {
  return interpolate(frame / FPS, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
}
