import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef, useState } from "react";

/* A pinned, scroll-scrubbed telling of the demo arc with the real testnet numbers. */
const STEPS = [
  { k: "01", t: "Alice locks 100k CSTEST", d: "behind an ROI ladder: 50% at +50%, 25% at +100%, 25% at +200%. Her exit penalty is set to feed Challenge C1." },
  { k: "02", t: "Bob locks 50k into Challenge C1", d: "a community goal to hold 50k together. Bob has 500 NEAR staked with a validator, so he carries a 1.25x boost." },
  { k: "03", t: "Alice panics and exits", d: "She gets 80k back. The 20% penalty, 20k CSTEST, drops straight into C1's pool. Dumping subsidised the people who stayed." },
  { k: "04", t: "The Challenge succeeds", d: "After the deadline anyone can finalize. The 20k becomes a 16k base pool plus a 4k reserve set aside for NEAR boosts." },
  { k: "05", t: "Bob claims 70k", d: "His 50k principal, plus his full 16k share of the pool, plus 4k of boost for staking NEAR. The reserve is spent. Nothing is left on the table." },
];

const seg = (i: number) => [i / STEPS.length, (i + 0.55) / STEPS.length] as const;
const useIn = (p: MotionValue<number>, i: number, from = 0.0) => useTransform(p, [seg(i)[0] - from, seg(i)[0] + 0.06], [0, 1]);

export function Story() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(p, "change", (v) => setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length))));

  const alice = useIn(p, 0);
  const bob = useIn(p, 1);
  const exitP = useIn(p, 2);
  const win = useIn(p, 3);
  const claim = useIn(p, 4);

  const aliceDim = useTransform(p, [seg(2)[0], seg(2)[0] + 0.06], [1, 0.35]);
  const penaltyX = useTransform(p, [seg(2)[0], seg(2)[0] + 0.1], [0, 230]);
  const penaltyY = useTransform(p, [seg(2)[0], seg(2)[0] + 0.1], [0, 120]);
  const pool = useTransform(p, [seg(2)[0] + 0.08, seg(2)[0] + 0.12], [0, 20]);
  const poolText = useTransform(pool, (v) => `${Math.round(v)}k`);
  const rewardX = useTransform(p, [seg(4)[0], seg(4)[0] + 0.1], [0, 230]);
  const rewardY = useTransform(p, [seg(4)[0], seg(4)[0] + 0.1], [0, -120]);
  const bobTotal = useTransform(p, [seg(4)[0] + 0.06, seg(4)[0] + 0.12], [50, 70]);
  const bobText = useTransform(bobTotal, (v) => `${Math.round(v)}k`);
  const bar = useTransform(p, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} className="relative" style={{ height: reduce ? "auto" : "420vh" }}>
      <div className={`${reduce ? "" : "sticky top-14 h-[calc(100vh-56px)]"} overflow-hidden`}>
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-full flex flex-col">
          <div className="pt-10 sm:pt-14 flex items-end justify-between gap-6">
            <h2 className="text-[clamp(26px,4vw,44px)] leading-[1.05] tracking-tight">
              <span className="text-ink">The bridge, step by step.</span>
              <br />
              <span className="text-ink-3">Real numbers from the testnet demo.</span>
            </h2>
            <div className="hidden sm:block w-[180px]">
              <div className="h-1 w-full rounded-full bg-paper-2 overflow-hidden">
                <motion.div style={{ width: bar }} className="h-full bg-ink" />
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-3">
                {STEPS.map((s, i) => (
                  <span key={s.k} className={i === active ? "text-ink" : ""}>
                    {s.k}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 grid lg:grid-cols-[380px_1fr] gap-8 items-center py-8">
            <div className="relative min-h-[150px]">
              {STEPS.map((s, i) => (
                <motion.div key={s.k} animate={{ opacity: active === i ? 1 : 0, y: active === i ? 0 : 10 }} transition={{ duration: 0.35 }} className="absolute inset-0" style={{ pointerEvents: active === i ? "auto" : "none" }}>
                  <div className="pixel text-accent text-[13px]">{s.k}</div>
                  <h3 className="mt-2 text-[22px] sm:text-[26px] tracking-tight text-ink leading-tight">{s.t}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-ink-2 max-w-[360px]">{s.d}</p>
                </motion.div>
              ))}
            </div>

            <div className="relative h-[360px] sm:h-[420px]">
              <svg viewBox="0 0 640 420" className="absolute inset-0 w-full h-full" aria-hidden>
                <motion.path d="M 150 110 C 150 220, 320 180, 320 230" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="3 4" style={{ pathLength: exitP, opacity: exitP }} />
                <motion.path d="M 320 260 C 320 330, 500 320, 500 300" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="3 4" style={{ pathLength: claim, opacity: claim }} />
              </svg>

              {/* Alice */}
              <motion.div style={{ opacity: useTransform([alice, aliceDim], ([a, d]) => (a as number) * (d as number)), x: useTransform(alice, [0, 1], [-30, 0]) }} className="absolute left-[4%] top-[6%] w-[200px] card p-4">
                <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Alice · lock #1</div>
                <div className="pixel text-[22px] mt-1">100k</div>
                <div className="mt-1 text-[11px] text-ink-2">ROI ladder 50 / 25 / 25</div>
                <div className="mt-2 flex gap-1">
                  {[50, 25, 25].map((f, i) => (
                    <div key={i} className="h-1.5 rounded-full bg-ink-3/40" style={{ width: `${f}%` }} />
                  ))}
                </div>
              </motion.div>
              <motion.div style={{ opacity: exitP }} className="absolute left-[4%] top-[6%] w-[200px] -translate-y-3">
                <span className="tag tag-bad">exited · 80k returned</span>
              </motion.div>

              {/* Penalty token */}
              <motion.div style={{ opacity: useTransform(p, [seg(2)[0], seg(2)[0] + 0.02, seg(2)[0] + 0.1, seg(2)[0] + 0.12], [0, 1, 1, 0]), x: penaltyX, y: penaltyY }} className="absolute left-[14%] top-[32%] rounded-full bg-accent text-white px-3 py-1 text-[11px] font-mono shadow">
                −20k penalty
              </motion.div>

              {/* Pool */}
              <motion.div style={{ opacity: useIn(p, 1), scale: useTransform(pool, [0, 20], [1, 1.04]) }} className="absolute left-1/2 top-[44%] -translate-x-1/2 w-[220px] card p-4 border-ink">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Challenge C1 · pool</div>
                  <motion.span style={{ opacity: win }} className="tag tag-ok">
                    succeeded
                  </motion.span>
                </div>
                <motion.div className="pixel text-[28px] mt-1">{poolText}</motion.div>
                <motion.div style={{ opacity: win }} className="mt-1 text-[11px] text-ink-2">
                  16k base pool · 4k boost reserve
                </motion.div>
              </motion.div>

              {/* Bob */}
              <motion.div style={{ opacity: bob, x: useTransform(bob, [0, 1], [30, 0]) }} className="absolute right-[2%] top-[62%] w-[210px] card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Bob · lock #2</div>
                  <span className="pill border-ink text-ink">1.25x</span>
                </div>
                <motion.div className="pixel text-[22px] mt-1">{bobText}</motion.div>
                <div className="mt-1 text-[11px] text-ink-2">
                  <motion.span style={{ opacity: useTransform(claim, [0, 1], [1, 0]) }} className="absolute">
                    in Challenge C1 · 500 NEAR staked
                  </motion.span>
                  <motion.span style={{ opacity: claim }}>50k principal + 16k share + 4k boost</motion.span>
                </div>
              </motion.div>

              {/* Reward token */}
              <motion.div style={{ opacity: useTransform(p, [seg(4)[0], seg(4)[0] + 0.02, seg(4)[0] + 0.1, seg(4)[0] + 0.12], [0, 1, 1, 0]), x: rewardX, y: rewardY }} className="absolute left-[46%] top-[70%] rounded-full bg-ok text-white px-3 py-1 text-[11px] font-mono shadow">
                +20k reward
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
