import { motion } from "framer-motion";
import { useWallet } from "../lib/wallet";
import { Mark } from "./Mark";

/* Node pills around the central tile, in SVG units of a 1000 x 300 canvas. */
const LEFT = [
  { label: "Lock", y: 60 },
  { label: "Penalty", y: 150 },
  { label: "Sponsor pool", y: 240 },
];
const RIGHT = [
  { label: "Challenge", y: 60 },
  { label: "NEAR stake", y: 150 },
  { label: "Claim", y: 240 },
];

function Pill({ x, y, label, anchor }: { x: number; y: number; label: string; anchor: "start" | "end" }) {
  const w = label.length * 7.2 + 22;
  const rx = anchor === "start" ? x : x - w;
  return (
    <g>
      <rect x={rx} y={y - 11} width={w} height={22} rx={11} fill="var(--color-surface)" stroke="var(--color-line-2)" />
      <text x={rx + w / 2} y={y + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.08em" fill="var(--color-ink-2)">
        {label.toUpperCase()}
      </text>
    </g>
  );
}

function Circuit() {
  const cx = 500;
  const cy = 150;
  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    show: (i: number) => ({ pathLength: 1, opacity: 1, transition: { pathLength: { duration: 1.1, delay: 0.25 + i * 0.12, ease: "easeInOut" as const }, opacity: { duration: 0.2, delay: 0.25 + i * 0.12 } } }),
  };
  const lines = [
    ...LEFT.map((n, i) => ({ d: `M 120 ${n.y} H 320 Q 340 ${n.y} 340 ${n.y + (cy - n.y) * 0.4} V ${cy} H ${cx - 70}`, i, dotX: 120, dotY: n.y })),
    ...RIGHT.map((n, i) => ({ d: `M 880 ${n.y} H 680 Q 660 ${n.y} 660 ${n.y + (cy - n.y) * 0.4} V ${cy} H ${cx + 70}`, i: i + 3, dotX: 880, dotY: n.y })),
  ];
  return (
    <svg viewBox="0 0 1000 300" className="w-full h-auto" aria-hidden>
      <defs>
        <linearGradient id="fadeL" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-paper)" />
          <stop offset="1" stopColor="var(--color-paper)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((l) => (
        <motion.path key={l.i} d={l.d} fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" custom={l.i} variants={draw} initial="hidden" animate="show" />
      ))}
      {lines.map((l) => (
        <motion.circle key={"d" + l.i} cx={l.dotX} cy={l.dotY} r="3.5" fill="var(--color-ink)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 + l.i * 0.1 }} />
      ))}
      {LEFT.map((n) => (
        <Pill key={n.label} x={200} y={n.y} label={n.label} anchor="start" />
      ))}
      {RIGHT.map((n) => (
        <Pill key={n.label} x={800} y={n.y} label={n.label} anchor="end" />
      ))}
      <motion.g initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ transformOrigin: "500px 150px" }}>
        <rect x={cx - 70} y={cy - 70} width="140" height="140" rx="26" fill="var(--color-paper-2)" stroke="var(--color-line)" />
        <rect x={cx - 56} y={cy - 56} width="112" height="112" rx="22" fill="var(--color-surface)" stroke="var(--color-line)" />
        <foreignObject x={cx - 34} y={cy - 34} width="68" height="68">
          <div className="w-full h-full flex items-center justify-center text-ink">
            <Mark size={56} />
          </div>
        </foreignObject>
      </motion.g>
    </svg>
  );
}

export function Hero() {
  const { accountId, connect } = useWallet();
  const word = (t: string, delay: number) => (
    <motion.span className="pixel block" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay }}>
      {t}
    </motion.span>
  );
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-20 sm:pt-28 pb-16 text-center">
        <h1 className="text-[clamp(34px,7vw,74px)] text-ink leading-none">
          {word("LOCK. HOLD.", 0.05)}
        </h1>
        <div className="mt-6 sm:mt-10">
          <Circuit />
        </div>
        <h1 className="mt-6 sm:mt-10 text-[clamp(34px,7vw,74px)] text-ink leading-none">{word("EARN.", 1.5)}</h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7, duration: 0.6 }} className="mx-auto mt-7 max-w-[420px] text-[14px] leading-relaxed text-ink-2">
          CEASER turns memecoin holding into a coordinated game on NEAR. Dumps pay the diamond hands who stayed. Diamond hands who back NEAR get paid more.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.9, duration: 0.5 }} className="mt-8 flex justify-center">
          {accountId ? (
            <a href="#lock" className="btn btn-accent">
              <Mark size={18} className="text-white/90" />
              Create a lock
            </a>
          ) : (
            <button onClick={connect} className="btn btn-accent">
              <Mark size={18} className="text-white/90" />
              Connect wallet
            </button>
          )}
        </motion.div>
      </div>
    </section>
  );
}
