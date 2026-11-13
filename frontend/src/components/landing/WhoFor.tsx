import { motion } from "framer-motion";

const USERS = [
  { t: "Holder with weak hands", d: "Force yourself to hold to target with an ROI ladder. The lock does the discipline for you." },
  { t: "Memecoin founder", d: "Publicly lock your allocation with visible ROI tranches. A trust signal that can't be faked." },
  { t: "Community", d: "Turn \"we're holding\" from a tweet into a Challenge with a threshold, a deadline and a pool." },
  { t: "Sponsor or treasury", d: "Fund a Challenge to pay holders for coordinated behaviour. Refunded if the goal isn't met." },
  { t: "NEAR staker", d: "Earn a boosted share of any Challenge you join, up to 2x, just for having NEAR staked." },
];

export function WhoFor() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="grid md:grid-cols-[1fr_360px] gap-8 items-end">
        <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-[clamp(28px,4.4vw,48px)] leading-[1.06] tracking-tight">
          <span className="text-ink">Who it's for.</span>
          <br />
          <span className="text-ink-3">Everyone on the same side of the chart.</span>
        </motion.h2>
        <p className="text-[13.5px] leading-relaxed text-ink-2">Existing lockers only stop rugs with time locks. CEASER is about holder psychology, collective conviction, and funnelling value back to the L1.</p>
      </div>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {USERS.map((u, i) => (
          <motion.div key={u.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.07 }} whileHover={{ y: -4 }} className="card p-5 flex flex-col gap-3">
            <div className="pixel text-[12px] text-ink-3">0{i + 1}</div>
            <h3 className="text-[15px] tracking-tight text-ink leading-snug">{u.t}</h3>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{u.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
