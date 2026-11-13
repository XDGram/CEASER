import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useProtocol } from "../../lib/protocol";
import { countdown, fromUnits } from "../../lib/near";
import { EnterButton } from "../Nav";
import { useWallet } from "../../lib/wallet";

export function LiveChallenges() {
  const { challenges, meta } = useProtocol();
  const { accountId } = useWallet();
  const list = [...challenges].sort((a, b) => (a.state === "active" ? 0 : 1) - (b.state === "active" ? 0 : 1) || b.id - a.id).slice(0, 3);
  return (
    <section id="live" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-[clamp(28px,4.4vw,48px)] leading-[1.06] tracking-tight">
          <span className="text-ink">Live on testnet.</span>
          <br />
          <span className="text-ink-3">Read straight from the vault.</span>
        </h2>
        {accountId ? (
          <Link to="/app/challenges" className="btn btn-outline">
            All Challenges
          </Link>
        ) : (
          <EnterButton className="btn btn-outline" label="Connect to join" />
        )}
      </div>
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((c, i) => {
          const tm = meta(c.token);
          const sm = meta(c.sponsor_token);
          const pool = BigInt(c.sponsor_total) + BigInt(c.penalty_total);
          const pct = BigInt(c.threshold_amount) > 0n ? Math.min(100, Number((BigInt(c.total_locked) * 1000n) / BigInt(c.threshold_amount)) / 10) : 0;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.08 }} className="card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono text-ink-3">#{c.id}</div>
                  <h3 className="text-[17px] tracking-tight leading-tight">{c.title}</h3>
                </div>
                <span className={`tag ${c.state === "succeeded" ? "tag-ok" : c.state === "failed" ? "tag-bad" : "tag-live"}`}>{c.state}</span>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-paper-2 overflow-hidden">
                <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} className={`h-full ${pct >= 100 ? "bg-ok" : "bg-ink"}`} />
              </div>
              <div className="mt-2 flex justify-between text-[12px]">
                <span>
                  {fromUnits(c.total_locked, tm.decimals, 0)} / {fromUnits(c.threshold_amount, tm.decimals, 0)} {tm.symbol}
                </span>
                <span className="text-ink-2">{countdown(c.deadline_ts)}</span>
              </div>
              <div className="mt-3 text-[12px] text-ink-2">
                Pool <span className="text-ink">{fromUnits(pool, sm.decimals, 0)} {sm.symbol}</span> · {c.participant_count} locker{c.participant_count === 1 ? "" : "s"}
              </div>
            </motion.div>
          );
        })}
        {!list.length && <div className="card p-8 text-[13px] text-ink-2 sm:col-span-2 lg:col-span-3">Loading Challenges from the vault…</div>}
      </div>
    </section>
  );
}
