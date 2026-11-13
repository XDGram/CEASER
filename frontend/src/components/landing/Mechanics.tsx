import { motion } from "framer-motion";
import { useProtocol } from "../../lib/protocol";
import { fromUnits, mult } from "../../lib/near";
import { Reveal, SectionIntro } from "./Reveal";

const reveal = (i = 0) => ({ initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.6, delay: i * 0.08 } });

function Ladder() {
  const rungs = [
    { f: 50, g: "+50%" },
    { f: 25, g: "+100%" },
    { f: 25, g: "+200%" },
  ];
  return (
    <div className="flex items-end gap-3 h-[150px]">
      {rungs.map((r, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <motion.div initial={{ height: 0 }} whileInView={{ height: `${40 + i * 30}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 + i * 0.15, ease: "easeOut" }} className="w-full rounded-t-lg bg-ink flex items-start justify-center pt-2">
            <span className="pixel text-paper text-[12px]">{r.f}%</span>
          </motion.div>
          <span className="font-mono text-[10px] text-ink-2">{r.g}</span>
        </div>
      ))}
    </div>
  );
}

export function Mechanics() {
  const { tiers } = useProtocol();
  return (
    <Reveal id="mechanics" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro title="Three mechanics define CEASER." ghost="Everything else is scaffolding." text="Each one is a few lines of contract code. Together they turn holding from a solo gamble into a coordinated, NEAR-aligned game." />

      <div className="mt-12 grid md:grid-cols-3 gap-5">
        <motion.div {...reveal(0)} className="card p-6 sm:p-7 flex flex-col">
          <div className="pixel text-accent text-[13px]">01</div>
          <h3 className="mt-2 text-[20px]">ROI-laddered unlocks</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Split your bag into rungs that unlock as price climbs past targets set from the price at lock time. Your future self can't sell the 25% meant for +200% at +40%.</p>
          <div className="mt-6">
            <Ladder />
          </div>
        </motion.div>

        <motion.div {...reveal(1)} className="card p-6 sm:p-7 flex flex-col border-ink">
          <div className="pixel text-accent text-[13px]">02</div>
          <h3 className="mt-2 text-[20px]">Exit penalty → Challenge pool</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Leave early and you pay up to 20% of what's still locked. It doesn't go to a treasury. It goes to the pool that pays the people who held. Defection subsidises coordination.</p>
          <div className="mt-6 rounded-xl bg-paper border border-line p-4 font-mono text-[11px] leading-loose text-ink-2">
            <div>
              early_exit(lock) <span className="text-ink-3">→</span>
            </div>
            <div className="pl-3">
              returned <span className="text-ink">80,000</span>
            </div>
            <div className="pl-3">
              penalty <span className="text-accent">20,000</span> → sink: challenge 1
            </div>
            <div className="pl-3 text-ink-3">dumpers pay diamond hands</div>
          </div>
        </motion.div>

        <motion.div {...reveal(2)} className="card p-6 sm:p-7 flex flex-col">
          <div className="pixel text-accent text-[13px]">03</div>
          <h3 className="mt-2 text-[20px]">NEAR-staking boost</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">At claim time the vault reads your staked balance from a whitelisted staking pool and multiplies your pool share. Memecoin activity becomes NEAR staking demand.</p>
          <div className="mt-6 divide-y divide-line border-y border-line">
            <div className="flex justify-between py-1.5 text-[12px] text-ink-2">
              <span>&lt; 10 NEAR</span>
              <span className="font-mono">1.00x</span>
            </div>
            {tiers.map(([min, b], i) => (
              <motion.div key={min} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.1 }} className="flex justify-between py-1.5 text-[12px]">
                <span className="text-ink-2">≥ {fromUnits(min, 24, 0)} NEAR</span>
                <span className={`font-mono ${b >= 20000 ? "text-ink font-medium" : "text-ink"}`}>{mult(b)}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </Reveal>
  );
}
