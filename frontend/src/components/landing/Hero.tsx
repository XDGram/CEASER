import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { EnterButton } from "../Nav";
import { Mark } from "../Mark";

/* Hairline circuit around the central tile, as in the reference. 1000 x 300 canvas. */
const LEFT = [
  { label: "Lock", y: 60 },
  { label: "ROI ladder", y: 150 },
  { label: "Early exit", y: 240 },
];
const RIGHT = [
  { label: "Challenge", y: 60 },
  { label: "Sponsor pool", y: 150 },
  { label: "NEAR boost", y: 240 },
];

function Pill({ x, y, label, anchor }: { x: number; y: number; label: string; anchor: "start" | "end" }) {
  const w = label.length * 6.6 + 24;
  const rx = anchor === "start" ? x : x - w;
  return (
    <g>
      <rect x={rx} y={y - 11} width={w} height={22} rx={11} fill="var(--color-paper)" stroke="var(--color-line-2)" />
      <text x={rx + w / 2} y={y + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.1em" fill="var(--color-ink-2)">
        {label.toUpperCase()}
      </text>
    </g>
  );
}

function Circuit() {
  const reduce = useReducedMotion();
  const cx = 500;
  const cy = 150;
  const draw = {
    hidden: { pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 },
    show: (i: number) => ({ pathLength: 1, opacity: 1, transition: { pathLength: { duration: 1.2, delay: 0.3 + i * 0.1, ease: "easeInOut" as const }, opacity: { duration: 0.2, delay: 0.3 + i * 0.1 } } }),
  };
  const lines = [
    ...LEFT.map((n, i) => ({ d: `M 60 ${n.y} H 330 Q 350 ${n.y} 350 ${n.y + (cy - n.y) * 0.45} V ${cy} H ${cx - 62}`, i, dotX: 60, dotY: n.y })),
    ...RIGHT.map((n, i) => ({ d: `M 940 ${n.y} H 670 Q 650 ${n.y} 650 ${n.y + (cy - n.y) * 0.45} V ${cy} H ${cx + 62}`, i: i + 3, dotX: 940, dotY: n.y })),
  ];
  return (
    <svg viewBox="0 0 1000 300" className="w-full h-auto" aria-hidden>
      {lines.map((l) => (
        <motion.path key={l.i} d={l.d} fill="none" stroke="var(--color-line-2)" strokeWidth="1" custom={l.i} variants={draw} initial="hidden" animate="show" />
      ))}
      {lines.map((l) => (
        <motion.circle key={"d" + l.i} cx={l.dotX} cy={l.dotY} r="3" fill="var(--color-ink)" initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3 + l.i * 0.08 }} />
      ))}
      {LEFT.map((n) => (
        <Pill key={n.label} x={170} y={n.y} label={n.label} anchor="start" />
      ))}
      {RIGHT.map((n) => (
        <Pill key={n.label} x={830} y={n.y} label={n.label} anchor="end" />
      ))}
      <motion.g initial={{ scale: reduce ? 1 : 0.88, opacity: reduce ? 1 : 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ transformOrigin: "500px 150px" }}>
        <rect x={cx - 62} y={cy - 62} width="124" height="124" rx="24" fill="var(--color-paper-2)" stroke="var(--color-line)" />
        <rect x={cx - 48} y={cy - 48} width="96" height="96" rx="20" fill="var(--color-surface)" stroke="var(--color-line)" />
        <foreignObject x={cx - 28} y={cy - 28} width="56" height="56">
          <div className="w-full h-full flex items-center justify-center text-ink">
            <Mark size={48} />
          </div>
        </foreignObject>
      </motion.g>
    </svg>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const fade = (delay: number) => ({ initial: { opacity: 0, y: reduce ? 0 : 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay } });

  return (
    <section ref={ref} id="top" className="relative">
      <motion.div style={{ y, opacity }} className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <motion.h1 {...fade(0.05)} className="h-hero pixel text-ink">
          LOCK. HOLD.
        </motion.h1>
        <div className="mx-auto mt-6 sm:mt-10 max-w-[980px]">
          <Circuit />
        </div>
        <motion.h1 {...fade(1.2)} className="h-hero pixel text-ink mt-6 sm:mt-10">
          GET PAID.
        </motion.h1>
        <motion.p {...fade(1.4)} className="mx-auto mt-7 max-w-[460px] text-[14.5px] leading-relaxed text-ink-2">
          CEASER is a commitment protocol on NEAR. Lock your memecoin, join your community's Challenge, and collect the penalties of everyone who dumped early.
        </motion.p>
        <motion.div {...fade(1.6)} className="mt-9 flex justify-center">
          <EnterButton className="btn btn-accent" icon />
        </motion.div>
      </motion.div>
    </section>
  );
}
