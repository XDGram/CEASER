import { motion } from "framer-motion";
import { useProtocol } from "../../lib/protocol";
import { fmtDur } from "../../lib/near";
import { Reveal } from "./Reveal";

export function Defenses() {
  const { config } = useProtocol();
  const items = [
    { t: "TWAP, not spot", d: `Price targets compare against a time-weighted average over ${config ? fmtDur(config.twap_window_sec) : "30m"}. A one-block wick unlocks nothing.` },
    { t: "Two-read commit", d: `The first read arms a tranche. A second read after a ${config ? fmtDur(config.cooldown_sec) : "10m"} cooldown must still agree, or it disarms.` },
    { t: "Liquidity floor", d: "If the oracle's pool is too thin, price checks are paused. Manipulating an empty pool proves nothing." },
    { t: "Min lock duration", d: "A price tranche cannot ripen before a minimum time has passed, whatever the chart does." },
    { t: "Immutable reference price", d: "Captured once at lock creation and never changed. Multipliers always apply to that number." },
    { t: "Max duration cap", d: "Every tranche releases at the cap. Funds are never stranded by a price that never comes." },
  ];
  return (
    <Reveal className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-[360px_1fr]">
          <div className="p-7 sm:p-9 bg-ink text-paper">
            <div className="pill border-paper/30 text-paper/80">Manipulation defenses</div>
            <h2 className="mt-5 text-[clamp(24px,3.2vw,34px)] leading-[1.08]">Built so a pump can't pick your lock.</h2>
            <p className="mt-4 text-[13.5px] leading-relaxed text-paper/70">Price-based unlocks are the obvious attack surface. CEASER layers six defenses, none of which is sufficient alone. They are real code on the vault, enforced even against the demo's mock oracle.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <motion.div key={it.t} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.06 }} className="p-6 border-b border-line sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(n+4)]:border-b-0">
                <div className="pixel text-[11px] text-ink-3">0{i + 1}</div>
                <h3 className="mt-2 text-[15px] text-ink">{it.t}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{it.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
