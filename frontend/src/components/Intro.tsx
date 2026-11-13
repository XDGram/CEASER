import { motion } from "framer-motion";
import { Halftone } from "./Halftone";
import { Mark } from "./Mark";

export function Intro() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-20 sm:pt-28 pb-12">
      <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
        <div>
          <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-[clamp(30px,4.6vw,50px)] leading-[1.08] tracking-tight">
            <span className="block text-ink">Introducing CEASER</span>
            <span className="text-ink-3">
              A commitment protocol that makes <span className="text-ink">holding</span> a game you can <span className="text-ink">win together</span>
            </span>
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-10 max-w-[360px] text-[14px] leading-relaxed text-ink-2">
            Lock a bag behind targets your future self can't override. Join a community Challenge with a shared goal and a sponsor pool. When someone dumps early, their penalty pays the people who stayed.
          </motion.p>
          <motion.a initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.6 }} href="https://github.com/XDGram/CEASER#readme" target="_blank" rel="noopener" className="btn btn-outline mt-7">
            <Mark size={18} />
            Read the README
          </motion.a>
        </div>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="relative lg:-mt-6">
          <Halftone seed={3} cols={64} rows={40} className="w-full h-auto" />
        </motion.div>
      </div>
      <div className="mt-16 sm:mt-24 grid md:grid-cols-[1fr_320px] gap-10 items-end">
        <h3 className="text-[clamp(24px,3.6vw,40px)] leading-[1.12] tracking-tight">
          <span className="text-ink">Three mechanics,</span>{" "}
          <span className="text-ink-3">and everything else is scaffolding. ROI-laddered unlocks, exit penalties that fund the pool, and a NEAR-staking boost on rewards.</span>
        </h3>
        <p className="text-[13px] leading-relaxed text-ink-2 md:text-right">
          The first protocol where memecoin activity turns into NEAR staking demand. Lockers who stake NEAR earn up to 2x their share of any Challenge pool.
        </p>
      </div>
    </section>
  );
}
