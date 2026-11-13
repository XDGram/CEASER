import { motion } from "framer-motion";
import { Reveal, SectionIntro } from "./Reveal";

const USERS = [
  { t: "Holder with weak hands", d: "Force yourself to hold to target with an ROI ladder. The lock does the discipline for you." },
  { t: "Memecoin founder", d: "Publicly lock your allocation with visible ROI tranches. A trust signal that can't be faked." },
  { t: "Community", d: "Turn \"we're holding\" from a tweet into a Challenge with a threshold, a deadline and a pool." },
  { t: "Sponsor or treasury", d: "Fund a Challenge to pay holders for coordinated behaviour. Refunded if the goal isn't met." },
  { t: "NEAR staker", d: "Earn a boosted share of any Challenge you join, up to 2x, just for having NEAR staked." },
];

export function WhoFor() {
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro title="Who it's for." ghost="Everyone on the same side of the chart." text="Existing lockers only stop rugs with time locks. CEASER is about holder psychology, collective conviction, and funnelling value back to the L1." />
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {USERS.map((u, i) => (
          <motion.div key={u.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.07 }} whileHover={{ y: -4 }} className="card p-5 flex flex-col gap-3">
            <div className="pixel text-[12px] text-ink-3">0{i + 1}</div>
            <h3 className="text-[15px] text-ink leading-snug">{u.t}</h3>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{u.d}</p>
          </motion.div>
        ))}
      </div>
    </Reveal>
  );
}
