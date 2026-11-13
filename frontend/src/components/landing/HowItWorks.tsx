import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Reveal, SectionIntro } from "./Reveal";

const STEPS = [
  {
    n: "01",
    t: "Lock with a strategy",
    d: "Deposit any NEP-141 token into the vault with rules your future self can't override: a date, an ROI ladder of price targets, or the outcome of a community Challenge. Principal is never trapped: everything releases at your max duration.",
    art: (
      <svg viewBox="0 0 200 120" className="w-full h-auto" aria-hidden>
        <rect x="30" y="50" width="140" height="56" rx="10" fill="none" stroke="var(--color-line-2)" />
        <path d="M 70 50 V 36 a 30 30 0 0 1 60 0 V 50" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
        <circle cx="100" cy="78" r="6" fill="var(--color-ink)" />
        <path d="M 100 84 V 94" stroke="var(--color-ink)" strokeWidth="2" />
      </svg>
    ),
  },
  {
    n: "02",
    t: "Join a Challenge",
    d: "A Challenge is a public goal: lock X tokens together before a deadline. Sponsors fund a reward pool. Every early exit by a participant drops its penalty into that same pool. Fail the goal and sponsors get refunded; your principal is yours either way.",
    art: (
      <svg viewBox="0 0 200 120" className="w-full h-auto" aria-hidden>
        {[40, 80, 120, 160].map((x, i) => (
          <circle key={x} cx={x} cy="40" r="10" fill={i < 3 ? "var(--color-ink)" : "none"} stroke="var(--color-ink)" strokeWidth="1.5" />
        ))}
        <path d="M 40 60 V 80 H 160 V 60" fill="none" stroke="var(--color-line-2)" />
        <rect x="70" y="80" width="60" height="26" rx="6" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.5" />
        <text x="100" y="97" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--color-ink)">
          POOL
        </text>
      </svg>
    ),
  },
  {
    n: "03",
    t: "Claim, boosted by NEAR",
    d: "When your tranches ripen or the Challenge resolves, claim your principal plus your share of the pool, weighted by amount × time locked. NEAR staked with a validator multiplies that share, up to 2x.",
    art: (
      <svg viewBox="0 0 200 120" className="w-full h-auto" aria-hidden>
        {[[30, 70, 1], [70, 55, 1.1], [110, 40, 1.25], [150, 22, 1.5]].map(([x, h, m]) => (
          <g key={x}>
            <rect x={x} y={100 - (h as number)} width="24" height={h as number} rx="4" fill={m === 1.5 ? "var(--color-ink)" : "var(--color-paper-2)"} stroke="var(--color-line-2)" />
            <text x={(x as number) + 12} y="112" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--color-ink-2)">
              {m}x
            </text>
          </g>
        ))}
      </svg>
    ),
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <Reveal id="how" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro title="How it works." ghost="Three steps, one contract." text="Everything runs in a single NEAR smart contract. Deposits enter through the token's own transfer call, so there is no approval step and nothing to trust but the code." />

      <div ref={ref} className="relative mt-14 grid md:grid-cols-[48px_1fr] gap-6">
        <div className="hidden md:block relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
          <motion.div style={{ height: line }} className="absolute left-1/2 top-0 w-px bg-ink" />
        </div>
        <div className="grid gap-5">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: i * 0.05 }} className="card grid sm:grid-cols-[1fr_220px] gap-6 p-6 sm:p-8">
              <div>
                <div className="pixel text-accent text-[13px]">{s.n}</div>
                <h3 className="mt-2 text-[22px] text-ink">{s.t}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-2 max-w-[520px]">{s.d}</p>
              </div>
              <div className="rounded-xl bg-paper border border-line p-4 flex items-center">{s.art}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
