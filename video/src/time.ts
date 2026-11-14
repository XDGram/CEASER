import tl from "./timeline.json";
import words from "./words.json";

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const TL = tl;
export const END = tl.end;

const WORDS = words as unknown as Record<string, [string, number, number][]>;
export const lineStart = (id: number) => tl.vo.find((v) => v.id === id)!.start;
export const lineEnd = (id: number) => { const v = tl.vo.find((x) => x.id === id)!; return v.start + v.dur; };

/** Absolute time (s) of the nth word in a voiceover line that starts with `text` (case-insensitive). */
export function wd(id: number, text: string, nth = 0): number {
  const list = WORDS[String(id)];
  let n = 0;
  for (const [word, start] of list) {
    if (word.toLowerCase().replace(/[^a-z0-9%]/g, "").startsWith(text.toLowerCase())) {
      if (n === nth) return lineStart(id) + start;
      n++;
    }
  }
  throw new Error(`word "${text}" not found in line ${id}`);
}

/** Seconds to frames. */
export const f = (s: number) => Math.round(s * FPS);
