import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useProtocol } from "../../lib/protocol";
import { countdown, fmtDate, fmtDur, fromUnits, nowTs, pct as fmtPct } from "../../lib/near";
import { EnterButton } from "../Nav";
import { useWallet } from "../../lib/wallet";
import { Reveal, SectionIntro } from "./Reveal";

export function LiveChallenges() {
  const { challenges, meta } = useProtocol();
  const { accountId } = useWallet();
  // Prefer a Challenge that is still open, then the most recent one with lockers, then anything.
  const rank = (x: (typeof challenges)[number]) => (x.state === "active" && x.deadline_ts > nowTs() ? 0 : x.participant_count > 0 ? 1 : 2);
  const c = [...challenges].sort((a, b) => rank(a) - rank(b) || b.id - a.id)[0];
  const tm = c ? meta(c.token) : null;
  const sm = c ? meta(c.sponsor_token) : null;
  const pool = c ? BigInt(c.sponsor_total) + BigInt(c.penalty_total) : 0n;
  const pct = c && BigInt(c.threshold_amount) > 0n ? Math.min(100, Number((BigInt(c.total_locked) * 1000n) / BigInt(c.threshold_amount)) / 10) : 0;

  return (
    <Reveal id="live" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro
        title="Live on testnet."
        ghost="Read straight from the vault."
        text={`${challenges.length} Challenge${challenges.length === 1 ? "" : "s"} on the vault so far. One of them, exactly as the contract reports it.`}
        action={accountId ? <Link to="/app/challenges" className="btn btn-outline btn-sm">All Challenges</Link> : <EnterButton className="btn btn-outline btn-sm" label="Connect to join" />}
      />
      {c && tm && sm ? (
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6 }} className="mt-10 card overflow-hidden grid lg:grid-cols-[1.2fr_1fr]">
          <div className="p-7 sm:p-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono text-ink-3">CHALLENGE #{c.id}</div>
                <h3 className="mt-1 text-[26px] sm:text-[30px] leading-tight">{c.title}</h3>
              </div>
              <span className={`tag ${c.state === "succeeded" ? "tag-ok" : c.state === "failed" ? "tag-bad" : c.deadline_ts <= nowTs() ? "tag-muted" : "tag-live"}`}>{c.state === "active" && c.deadline_ts <= nowTs() ? "awaiting finalize" : c.state}</span>
            </div>
            <div className="mt-8 flex items-baseline justify-between text-[13px]">
              <span>
                <span className="pixel text-[24px]">{fromUnits(c.total_locked, tm.decimals, 0)}</span>
                <span className="text-ink-2"> / {fromUnits(c.threshold_amount, tm.decimals, 0)} {tm.symbol} locked</span>
              </span>
              <span className="font-mono text-ink-2">{pct}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-paper-2 overflow-hidden">
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1 }} className={`h-full ${pct >= 100 ? "bg-ok" : "bg-ink"}`} />
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-ink-2 max-w-[460px]">
              {c.participant_count} locker{c.participant_count === 1 ? "" : "s"} committed. Every early exit by a participant adds its penalty to the pool on the right; sponsors can add to it until the deadline.
            </p>
          </div>
          <div className="bg-paper-2/60 border-t lg:border-t-0 lg:border-l border-line p-7 sm:p-9 grid grid-cols-2 gap-x-6 gap-y-6 content-start">
            {[
              ["Pool", `${fromUnits(pool, sm.decimals, 0)} ${sm.symbol}`, `${fromUnits(c.sponsor_total, sm.decimals, 0)} sponsors · ${fromUnits(c.penalty_total, sm.decimals, 0)} penalties`],
              ["Deadline", countdown(c.deadline_ts), fmtDate(c.deadline_ts)],
              ["Min lock", fmtDur(c.min_lock_duration_sec), "to count toward the goal"],
              ["Boost reserve", fmtPct(c.boost_reserve_bps), "set aside for NEAR stakers"],
            ].map(([k, v, s]) => (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">{k}</div>
                <div className="mt-1 text-[16px] text-ink">{v}</div>
                <div className="text-[11.5px] text-ink-2">{s}</div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="mt-10 card p-8 text-[13px] text-ink-2">Loading the latest Challenge from the vault…</div>
      )}
    </Reveal>
  );
}
