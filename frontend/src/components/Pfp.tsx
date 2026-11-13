// Deterministic punk-style pixel avatar derived from an account id.
// Every colour is a token from the design palette, so avatars sit inside the
// paper look instead of fighting it.

const SKIN = ["#ebe8e1", "#dcd9d2", "#c9c5bc", "#a3a09a"];
const HAIR = ["#141414", "#6f6c66", "#c84f1c", "#2f7d4f", "#b23b2a", "#a3a09a"];
const BG = ["#f3f1ec", "#ebe8e1", "#dcd9d2", "#ffffff"];
const ACCESSORY = ["#e8622a", "#141414", "#2f7d4f", "#b23b2a"];
const INK = "#141414";

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 24x24 face template. . bg, o outline, s skin, d skin shade, e eye white,
// p pupil, m mouth. Hair, eyes and accessories overlay it.
const FACE = [
  "........................",
  "........................",
  "........................",
  "......oooooooooo........",
  ".....osssssssssso.......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....ossssssssssso......",
  ".....odsssssssssso......",
  ".....odsssssssssso......",
  ".....odsssssssssso......",
  ".....odsssssssssso......",
  "......odsssssssso.......",
  ".......ossssssso........",
  ".......osssso...........",
  ".......osssso...........",
  ".......osssso...........",
  ".......osssso...........",
  ".......osssso...........",
];

// Hair styles as row overlays: start column, pixels per row.
const HAIRSTYLES: Record<string, [number, number, number][]> = {
  // [row, startCol, length]
  mohawk: [
    [1, 10, 4],
    [2, 10, 4],
    [3, 9, 6],
    [4, 9, 6],
  ],
  cap: [
    [3, 6, 10],
    [4, 5, 13],
    [5, 5, 13],
  ],
  wild: [
    [2, 6, 10],
    [3, 5, 12],
    [4, 4, 14],
    [5, 5, 12],
    [6, 4, 3],
    [6, 15, 3],
  ],
  slick: [
    [3, 6, 10],
    [4, 5, 12],
    [5, 5, 3],
  ],
  long: [
    [3, 6, 10],
    [4, 5, 12],
    [5, 4, 13],
    [6, 4, 2],
    [6, 15, 2],
    [7, 4, 2],
    [7, 15, 2],
    [8, 4, 2],
    [8, 15, 2],
    [9, 4, 2],
    [9, 15, 2],
    [10, 4, 2],
    [10, 15, 2],
  ],
  none: [],
};

export function Pfp({ id, size = 28, className = "" }: { id: string; size?: number; className?: string }) {
  const h = hash(id);
  const skin = SKIN[h % SKIN.length];
  const shade = SKIN[(h + 1) % SKIN.length];
  const hair = HAIR[(h >>> 3) % HAIR.length];
  const bg = BG[(h >>> 6) % BG.length];
  const styles = Object.keys(HAIRSTYLES);
  const style = styles[(h >>> 9) % styles.length];
  const acc = (h >>> 13) % 4; // 0 none, 1 earring, 2 glasses, 3 chain
  const accColor = ACCESSORY[(h >>> 16) % ACCESSORY.length];
  const eyeRow = 9;
  const mouthRow = 15 + ((h >>> 19) % 2);

  const cells: { x: number; y: number; c: string }[] = [];
  FACE.forEach((row, y) => {
    row.split("").forEach((ch, x) => {
      if (ch === "o") cells.push({ x, y, c: INK });
      else if (ch === "s") cells.push({ x, y, c: skin });
      else if (ch === "d") cells.push({ x, y, c: shade });
    });
  });
  for (const [y, x0, len] of HAIRSTYLES[style]) for (let x = x0; x < x0 + len; x++) cells.push({ x, y, c: hair });
  // Eyes: whites plus pupil, pupil side varies.
  const pupilLeft = (h >>> 21) % 2 === 0;
  for (const ex of [8, 13]) {
    cells.push({ x: ex, y: eyeRow, c: "#ffffff" }, { x: ex + 1, y: eyeRow, c: "#ffffff" });
    cells.push({ x: pupilLeft ? ex : ex + 1, y: eyeRow, c: INK });
    cells.push({ x: ex, y: eyeRow + 1, c: shade }, { x: ex + 1, y: eyeRow + 1, c: shade });
  }
  if (acc === 2) {
    for (const ex of [7, 12]) for (let x = ex; x < ex + 4; x++) cells.push({ x, y: eyeRow - 1, c: accColor });
    cells.push({ x: 11, y: eyeRow, c: accColor }, { x: 12, y: eyeRow, c: accColor });
  }
  // Mouth.
  for (let x = 9; x < 13; x++) cells.push({ x, y: mouthRow, c: INK });
  if (acc === 1) cells.push({ x: 5, y: 12, c: accColor }, { x: 5, y: 13, c: accColor });
  if (acc === 3) for (let x = 7; x < 13; x++) cells.push({ x, y: 19, c: accColor });

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" shapeRendering="crispEdges" className={`shrink-0 rounded-md ${className}`} role="img" aria-label={`avatar for ${id}`}>
      <rect width="24" height="24" fill={bg} />
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="1" height="1" fill={c.c} />
      ))}
    </svg>
  );
}
