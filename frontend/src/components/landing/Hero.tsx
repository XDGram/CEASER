import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { EnterButton } from "../Nav";

/* A looping flow: a dumper exits, the penalty drops into the pool, the pool pays the stayer. */
function FlowDiagram() {
  const reduce = useReducedMotion();
  const loop = { duration: 6, repeat: Infinity, ease: "easeInOut" as const };
  const node = (x: number, y: number, label: string, sub: string, tone: "ink" | "accent" | "ok" = "ink") => (
    <g>
      <rect x={x - 70} y={y - 26} width="140" height="52" rx="12" fill="var(--color-surface)" stroke={tone === "accent" ? "var(--color-accent)" : tone === "ok" ? "var(--color-ok)" : "var(--color-line-2)"} />
      <text x={x} y={y - 4} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="12" fontWeight="500" fill="var(--color-ink)">
        {label}
      </text>
      <text x={x} y={y + 13} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.06em" fill="var(--color-ink-2)">
        {sub}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 520 380" className="w-full h-auto" aria-label="Flow: a dumper's penalty goes into the Challenge pool and is paid to the holders who stayed">
      <path id="p1" d="M 110 90 C 110 170, 260 150, 260 200" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="3 4" />
      <path id="p2" d="M 260 226 C 260 290, 400 260, 400 300" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="3 4" />
      <path d="M 400 90 C 400 150, 290 150, 274 186" fill="none" stroke="var(--color-line)" strokeWidth="1.2" />
      {node(110, 90, "Dumper", "EXITS EARLY · 20% PENALTY", "accent")}
      {node(400, 90, "Sponsor", "FUNDS THE POOL")}
      {node(260, 200, "Challenge pool", "PENALTIES + SPONSORS", "ink")}
      {node(400, 300, "Diamond hands", "PAID BY CONVICTION × BOOST", "ok")}
      <g>
        <rect x={60} y={286} width="130" height="30" rx="15" fill="var(--color-ink)" />
        <text x={125} y={305} textAnchor="middle" fontFamily="var(--font-pixel)" fontSize="11" fill="var(--color-paper)">
          NEAR STAKED 1.25X
        </text>
      </g>
      <path d="M 190 301 H 330" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="3 4" />
      {!reduce && (
        <>
          <motion.circle r="6" fill="var(--color-accent)" initial={{ offsetDistance: "0%" }} animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.1, 0.9, 1] }} style={{ offsetPath: "path('M 110 90 C 110 170, 260 150, 260 200')" }} />
          <motion.circle r="6" fill="var(--color-ok)" initial={{ offsetDistance: "0%" }} animate={{ offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] }} transition={{ ...loop, delay: 3, times: [0, 0.1, 0.9, 1] }} style={{ offsetPath: "path('M 260 226 C 260 290, 400 260, 400 300')" }} />
          <motion.circle cx={260} cy={200} r="86" fill="none" stroke="var(--color-accent)" strokeWidth="1" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.1], opacity: [0.35, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: 2.6, ease: "easeOut" }} style={{ transformOrigin: "260px 200px" }} />
        </>
      )}
    </svg>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.94]);

  const up = (delay: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: "easeOut" as const } });

  return (
    <section ref={ref} id="top" className="relative">
      <motion.div style={{ y, opacity, scale }} className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-16 sm:pt-24 pb-14 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div>
          <motion.span {...up(0)} className="pill">
            NEAR testnet · Memecoins with mechanics
          </motion.span>
          <motion.h1 {...up(0.08)} className="mt-6 text-[clamp(38px,5.6vw,64px)] leading-[1.02] tracking-tight text-ink">
            Lock your memecoin.
            <br />
            <span className="text-ink-3">Get paid when</span> others dump.
          </motion.h1>
          <motion.p {...up(0.18)} className="mt-6 max-w-[480px] text-[15px] leading-relaxed text-ink-2">
            CEASER is a commitment protocol on NEAR. Hold your bag to the targets you set, join your community's Challenge, and collect the exit penalties of everyone who sold early. Stake NEAR and your share gets multiplied.
          </motion.p>
          <motion.div {...up(0.28)} className="mt-8 flex flex-wrap items-center gap-3">
            <EnterButton className="btn btn-accent" label={undefined} />
            <a href="#how" className="btn btn-outline">
              How it works
            </a>
          </motion.div>
          <motion.div {...up(0.4)} className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-[12px] text-ink-2">
            <span>
              <span className="pixel text-ink text-[14px]">01</span> ROI-laddered unlocks
            </span>
            <span>
              <span className="pixel text-ink text-[14px]">02</span> Exit penalties fund the pool
            </span>
            <span>
              <span className="pixel text-ink text-[14px]">03</span> NEAR staking boost
            </span>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.25 }} className="card p-4 sm:p-6">
          <FlowDiagram />
        </motion.div>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="flex justify-center pb-6">
        <motion.span animate={reduce ? {} : { y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-3">
          scroll
        </motion.span>
      </motion.div>
    </section>
  );
}
