import { motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef, useState } from "react";

/* A pinned, scroll-scrubbed telling of the demo arc with the real testnet numbers. */
const STEPS = [
  { k: "01", t: "Alice locks 100k", d: "Behind an ROI ladder: 50% at +50%, 25% at +100%, 25% at +200%. Her exit penalty is pointed at Challenge C1." },
  { k: "02", t: "Bob locks 50k into C1", d: "A community goal to hold 50k together. Bob has 500 NEAR staked with a validator, so he carries a 1.25x boost." },
  { k: "03", t: "Alice panics and exits", d: "She gets 80k back. The 20% penalty, 20k CSTEST, drops straight into C1's pool. Dumping subsidised the people who stayed." },
  { k: "04", t: "The Challenge succeeds", d: "After the deadline anyone can finalize. The 20k becomes a 16k base pool plus a 4k reserve set aside for NEAR boosts." },
  { k: "05", t: "Bob claims 70k", d: "His 50k principal, his full 16k share of the pool, and 4k of boost for staking NEAR. The reserve is spent. Nothing is left on the table." },
];
const N = STEPS.length;
const at = (i: number) => i / N;
const inRange = (p: MotionValue<number>, i: number) => useTransform(p, [at(i), at(i) + 0.06], [0, 1]);

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties | Record<string, unknown> }) {
  return (
    <motion.div style={style as never} className={`card p-5 w-full max-w-[250px] ${className}`}>
      {children}
    </motion.div>
  );
}

export function Story() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(p, "change", (v) => setActive(Math.min(N - 1, Math.floor(v * N))));

  const alice = inRange(p, 0);
  const bob = inRange(p, 1);
  const exit = inRange(p, 2);
  const win = inRange(p, 3);
  const claim = inRange(p, 4);

  const aliceAlpha = useTransform(p, [at(2), at(2) + 0.06], [1, 0.4]);
  const chipOut = useTransform(p, [at(2), at(2) + 0.015, at(2) + 0.11, at(2) + 0.13], [0, 1, 1, 0]);
  const chipOutX = useTransform(p, [at(2), at(2) + 0.12], ["0%", "100%"]);
  const poolN = useTransform(p, [at(2) + 0.09, at(2) + 0.14], [0, 20]);
  const poolText = useTransform(poolN, (v) => `${Math.round(v)}k`);
  const chipIn = useTransform(p, [at(4), at(4) + 0.015, at(4) + 0.11, at(4) + 0.13], [0, 1, 1, 0]);
  const chipInX = useTransform(p, [at(4), at(4) + 0.12], ["0%", "100%"]);
  const bobN = useTransform(p, [at(4) + 0.09, at(4) + 0.15], [50, 70]);
  const bobText = useTransform(bobN, (v) => `${Math.round(v)}k`);
  const bar = useTransform(p, [0, 1], ["0%", "100%"]);
  const headBlur = useTransform(p, [0, 0.06], reduce ? [0, 0] : [14, 0]);
  const headFilter = useMotionTemplate`blur(${headBlur}px)`;
  const headOpacity = useTransform(p, [0, 0.06], [0.2, 1]);

  return (
    <section ref={ref} className="relative" style={{ height: reduce ? "auto" : "460vh" }}>
      <div className={`${reduce ? "" : "sticky top-14 h-[calc(100vh-56px)]"} overflow-hidden`}>
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 h-full flex flex-col">
          <motion.div style={{ filter: headFilter, opacity: headOpacity }} className="pt-10 sm:pt-14 grid md:grid-cols-[1fr_220px] gap-6 items-end">
            <h2 className="h-display">
              <span className="text-ink">The bridge, step by step.</span>
              <br />
              <span className="text-ink-3">Real numbers from the demo run.</span>
            </h2>
            <div className="hidden md:block">
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
          </motion.div>

          <div className="flex-1 flex flex-col justify-start gap-10 pt-14 sm:pt-20 pb-10">
            {/* Caption */}
            <div className="relative h-[120px] sm:h-[110px] max-w-[560px]">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.k}
                  initial={false}
                  animate={{ opacity: active === i ? 1 : 0, y: active === i ? 0 : 14, filter: active === i || reduce ? "blur(0px)" : "blur(10px)" }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="absolute inset-0"
                  style={{ pointerEvents: active === i ? "auto" : "none" }}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="pixel text-accent text-[13px]">{s.k}</span>
                    <h3 className="text-[24px] sm:text-[28px] text-ink leading-tight">{s.t}</h3>
                  </div>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2">{s.d}</p>
                </motion.div>
              ))}
            </div>

            {/* Sequence: Alice → pool → Bob */}
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 sm:gap-4">
              <div className="flex justify-center">
                <Card style={{ opacity: useTransform([alice, aliceAlpha], ([a, b]) => (a as number) * (b as number)), y: useTransform(alice, [0, 1], [24, 0]), filter: useMotionTemplate`blur(${useTransform(alice, [0, 1], reduce ? [0, 0] : [10, 0])}px)` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Alice · lock #1</span>
                    <motion.span style={{ opacity: exit }} className="tag tag-bad">
                      exited
                    </motion.span>
                  </div>
                  <div className="pixel text-[26px] mt-2">100k</div>
                  <div className="mt-1 text-[11.5px] text-ink-2">ROI ladder 50 / 25 / 25</div>
                  <div className="mt-3 flex gap-1">
                    {[50, 25, 25].map((f, i) => (
                      <div key={i} className="h-1.5 rounded-full bg-ink-3/40" style={{ width: `${f}%` }} />
                    ))}
                  </div>
                  <motion.div style={{ opacity: exit }} className="mt-2 text-[11px] text-bad">
                    80k returned · 20k penalty
                  </motion.div>
                </Card>
              </div>

              <div className="relative w-[60px] sm:w-[120px] h-8">
                <motion.div style={{ opacity: exit }} className="absolute top-1/2 left-0 right-0 border-t border-dashed border-line-2" />
                <motion.div style={{ opacity: chipOut, left: chipOutX, x: "-50%" }} className="absolute top-1/2 -translate-y-1/2 rounded-full bg-accent text-white px-2.5 py-1 text-[11px] font-mono whitespace-nowrap shadow">
                  −20k
                </motion.div>
              </div>

              <div className="flex justify-center">
                <Card className="border-ink" style={{ opacity: bob, y: useTransform(bob, [0, 1], [24, 0]), scale: useTransform(poolN, [0, 20], [1, 1.04]), filter: useMotionTemplate`blur(${useTransform(bob, [0, 1], reduce ? [0, 0] : [10, 0])}px)` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Challenge C1</span>
                    <motion.span style={{ opacity: win }} className="tag tag-ok">
                      succeeded
                    </motion.span>
                  </div>
                  <motion.div className="pixel text-[30px] mt-2">{poolText}</motion.div>
                  <div className="mt-1 text-[11.5px] text-ink-2">pool · penalties + sponsors</div>
                  <motion.div style={{ opacity: win }} className="mt-2 text-[11px] text-ink">
                    16k base pool · 4k boost reserve
                  </motion.div>
                </Card>
              </div>

              <div className="relative w-[60px] sm:w-[120px] h-8">
                <motion.div style={{ opacity: claim }} className="absolute top-1/2 left-0 right-0 border-t border-dashed border-line-2" />
                <motion.div style={{ opacity: chipIn, left: chipInX, x: "-50%" }} className="absolute top-1/2 -translate-y-1/2 rounded-full bg-ok text-white px-2.5 py-1 text-[11px] font-mono whitespace-nowrap shadow">
                  +20k
                </motion.div>
              </div>

              <div className="flex justify-center">
                <Card style={{ opacity: bob, y: useTransform(bob, [0, 1], [24, 0]), filter: useMotionTemplate`blur(${useTransform(bob, [0, 1], reduce ? [0, 0] : [10, 0])}px)` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3">Bob · lock #2</span>
                    <span className="pill border-ink text-ink">1.25x</span>
                  </div>
                  <motion.div className="pixel text-[26px] mt-2">{bobText}</motion.div>
                  <div className="mt-1 text-[11.5px] text-ink-2 relative h-[34px]">
                    <motion.span style={{ opacity: useTransform(claim, [0, 1], [1, 0]) }} className="absolute inset-0">
                      in Challenge C1 · 500 NEAR staked
                    </motion.span>
                    <motion.span style={{ opacity: claim }} className="absolute inset-0 text-ink">
                      50k principal + 16k share + 4k boost
                    </motion.span>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
