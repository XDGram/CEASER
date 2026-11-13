import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { EnterButton } from "../Nav";
import { Mark } from "../Mark";

/* The mechanic as a sentence, left to right, around the vault tile. 1000 x 240 canvas. */
const LEFT = [
  { label: "You lock your bag", y: 70 },
  { label: "Someone sells early", y: 170 },
];
const RIGHT = [
  { label: "They pay a 20% penalty", y: 70 },
  { label: "It goes to you", y: 170 },
];

function Pill({ x, y, label, anchor, strong = false }: { x: number; y: number; label: string; anchor: "start" | "end"; strong?: boolean }) {
  const w = label.length * 6.9 + 28;
  const rx = anchor === "start" ? x : x - w;
  return (
    <g>
      <rect x={rx} y={y - 12} width={w} height={24} rx={12} fill={strong ? "var(--color-ink)" : "var(--color-paper)"} stroke={strong ? "var(--color-ink)" : "var(--color-line-2)"} />
      <text x={rx + w / 2} y={y + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="0.1em" fill={strong ? "var(--color-paper)" : "var(--color-ink-2)"}>
        {label.toUpperCase()}
      </text>
    </g>
  );
}

function Circuit() {
  const reduce = useReducedMotion();
  const cx = 500;
  const cy = 120;
  const draw = {
    hidden: { pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 },
    show: (i: number) => ({ pathLength: 1, opacity: 1, transition: { pathLength: { duration: 1.1, delay: 0.3 + i * 0.15, ease: "easeInOut" as const }, opacity: { duration: 0.2, delay: 0.3 + i * 0.15 } } }),
  };
  const lines = [
    ...LEFT.map((n, i) => ({ d: `M 40 ${n.y} H 330 Q 352 ${n.y} 352 ${n.y + (cy - n.y) * 0.5} V ${cy} H ${cx - 62}`, i, dotX: 40, dotY: n.y })),
    ...RIGHT.map((n, i) => ({ d: `M 960 ${n.y} H 670 Q 648 ${n.y} 648 ${n.y + (cy - n.y) * 0.5} V ${cy} H ${cx + 62}`, i: i + 2, dotX: 960, dotY: n.y })),
  ];
  return (
    <svg viewBox="0 0 1000 240" className="w-full h-auto" aria-label="You lock your bag. Someone sells early. They pay a 20% penalty. It goes to you.">
      {lines.map((l) => (
        <motion.path key={l.i} d={l.d} fill="none" stroke="var(--color-line-2)" strokeWidth="1" custom={l.i} variants={draw} initial="hidden" animate="show" />
      ))}
      {lines.map((l) => (
        <motion.circle key={"d" + l.i} cx={l.dotX} cy={l.dotY} r="3" fill="var(--color-ink)" initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 + l.i * 0.1 }} />
      ))}
      <Pill x={110} y={LEFT[0].y} label={LEFT[0].label} anchor="start" />
      <Pill x={110} y={LEFT[1].y} label={LEFT[1].label} anchor="start" />
      <Pill x={890} y={RIGHT[0].y} label={RIGHT[0].label} anchor="end" />
      <Pill x={890} y={RIGHT[1].y} label={RIGHT[1].label} anchor="end" strong />
      {/* step numbers at the dots */}
      {[
        [40, LEFT[0].y, "1"],
        [40, LEFT[1].y, "2"],
        [960, RIGHT[0].y, "3"],
        [960, RIGHT[1].y, "4"],
      ].map(([x, y, n]) => (
        <text key={n} x={Number(x) + (Number(x) < 500 ? -14 : 14)} y={Number(y) + 3.5} textAnchor="middle" fontFamily="var(--font-pixel)" fontSize="11" fill="var(--color-ink-3)">
          {n}
        </text>
      ))}
      <motion.g initial={{ scale: reduce ? 1 : 0.88, opacity: reduce ? 1 : 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ transformOrigin: "500px 120px" }}>
        <rect x={cx - 62} y={cy - 62} width="124" height="124" rx="24" fill="var(--color-paper-2)" stroke="var(--color-line)" />
        <rect x={cx - 48} y={cy - 48} width="96" height="96" rx="20" fill="var(--color-surface)" stroke="var(--color-line)" />
        <foreignObject x={cx - 28} y={cy - 28} width="56" height="56">
          <div className="w-full h-full flex items-center justify-center text-ink">
            <Mark tile size={48} />
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
        <div className="mx-auto mt-8 sm:mt-12 max-w-[980px]">
          <Circuit />
        </div>
        <motion.h1 {...fade(1.2)} className="h-hero pixel text-ink mt-8 sm:mt-12">
          GET PAID.
        </motion.h1>
        <motion.p {...fade(1.4)} className="mx-auto mt-7 max-w-[440px] text-[14.5px] leading-relaxed text-ink-2">
          A memecoin lock on NEAR where the people who sell early pay the people who hold.
        </motion.p>
        <motion.div {...fade(1.6)} className="mt-9 flex justify-center">
          <EnterButton className="btn btn-accent" icon />
        </motion.div>
      </motion.div>
    </section>
  );
}
