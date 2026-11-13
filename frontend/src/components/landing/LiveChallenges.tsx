import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useProtocol } from "../../lib/protocol";
import { countdown, fmtDate, fmtDur, fromUnits, nowTs, pct as fmtPct } from "../../lib/near";
import { EnterButton } from "../Nav";
import { useWallet } from "../../lib/wallet";
import { Reveal, SectionIntro } from "./Reveal";
import type { Challenge } from "../../lib/types";

const open = (c: Challenge) => c.state === "active" && c.deadline_ts > nowTs();
const progress = (c: Challenge) => (BigInt(c.threshold_amount) > 0n ? Math.min(100, Number((BigInt(c.total_locked) * 1000n) / BigInt(c.threshold_amount)) / 10) : 0);

function Tag({ c }: { c: Challenge }) {
  if (c.state === "succeeded") return <span className="tag tag-ok">succeeded</span>;
  if (c.state === "failed") return <span className="tag tag-bad">failed</span>;
  if (!open(c)) return <span className="tag tag-muted">awaiting finalize</span>;
  return <span className="tag tag-live">live</span>;
}

export function LiveChallenges() {
  const { challenges, meta } = useProtocol();
  const { accountId } = useWallet();
  // Most pool at stake first among open ones, then the rest by recency.
  const rank = (c: Challenge) => (open(c) ? 0 : c.participant_count > 0 ? 1 : 2);
  const sorted = [...challenges].sort((a, b) => rank(a) - rank(b) || Number(BigInt(b.total_locked) - BigInt(a.total_locked)) || b.id - a.id);
  const c = sorted[0];
  const others = sorted.slice(1, 4);
  const liveCount = challenges.filter(open).length;
  const tm = c ? meta(c.token) : null;
  const sm = c ? meta(c.sponsor_token) : null;
  const pool = c ? BigInt(c.sponsor_total) + BigInt(c.penalty_total) : 0n;

  return (
    <Reveal id="live" className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-24 sm:pt-32">
      <SectionIntro
        title="Live right now."
        ghost="Read straight from the vault."
        text={`${liveCount} Challenge${liveCount === 1 ? "" : "s"} open, ${challenges.length} created in total. Numbers exactly as the contract reports them.`}
        action={accountId ? <Link to="/app/challenges" className="btn btn-outline btn-sm">All Challenges</Link> : <EnterButton className="btn btn-outline btn-sm" label="Connect to join" />}
      />
      {c && tm && sm ? (
        <>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6 }} className="mt-10 card overflow-hidden grid lg:grid-cols-[1.2fr_1fr]">
            <div className="p-7 sm:p-9">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-mono text-ink-3">CHALLENGE #{c.id}</div>
                  <h3 className="mt-1 text-[24px] sm:text-[28px] leading-tight">{c.title}</h3>
                </div>
                <Tag c={c} />
              </div>
              <div className="mt-8 flex items-baseline justify-between text-[13px]">
                <span>
                  <span className="pixel text-[24px]">{fromUnits(c.total_locked, tm.decimals, 0)}</span>
                  <span className="text-ink-2"> / {fromUnits(c.threshold_amount, tm.decimals, 0)} {tm.symbol} locked</span>
                </span>
                <span className="font-mono text-ink-2">{progress(c)}%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-paper-2 overflow-hidden">
                <motion.div initial={{ width: 0 }} whileInView={{ width: `${progress(c)}%` }} viewport={{ once: true }} transition={{ duration: 1 }} className={`h-full ${progress(c) >= 100 ? "bg-ok" : "bg-ink"}`} />
              </div>
              <p className="mt-6 text-[13px] leading-relaxed text-ink-2 max-w-[460px]">
                {c.participant_count} locker{c.participant_count === 1 ? "" : "s"} committed. Every early exit by a participant adds its penalty to the pool; sponsors can add to it until the deadline.
              </p>
            </div>
            <div className="bg-paper-2/60 border-t lg:border-t-0 lg:border-l border-line p-7 sm:p-9 grid grid-cols-2 gap-x-6 gap-y-6 content-start">
              {[
                ["Pool", `${fromUnits(pool, sm.decimals, 0)} ${sm.symbol}`, `${fromUnits(c.sponsor_total, sm.decimals, 0)} from sponsors · ${fromUnits(c.penalty_total, sm.decimals, 0)} from penalties`],
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
          {others.length > 0 && (
            <div className="mt-4 card divide-y divide-line">
              {others.map((o) => {
                const om = meta(o.token);
                const op = BigInt(o.sponsor_total) + BigInt(o.penalty_total);
                return (
                  <div key={o.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_200px_140px_auto] items-center gap-x-6 gap-y-2 px-6 py-4 text-[13px]">
                    <div className="min-w-0">
                      <div className="text-ink truncate">{o.title}</div>
                      <div className="text-[11.5px] text-ink-2">
                        {o.participant_count} locker{o.participant_count === 1 ? "" : "s"} · {countdown(o.deadline_ts)}
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="h-1.5 rounded-full bg-paper-2 overflow-hidden">
                        <div className="h-full bg-ink" style={{ width: `${progress(o)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-ink-2">
                        {fromUnits(o.total_locked, om.decimals, 0)} / {fromUnits(o.threshold_amount, om.decimals, 0)} {om.symbol}
                      </div>
                    </div>
                    <div className="hidden sm:block text-ink">
                      {fromUnits(op, meta(o.sponsor_token).decimals, 0)} <span className="text-ink-2">{meta(o.sponsor_token).symbol} pool</span>
                    </div>
                    <Tag c={o} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="mt-10 card p-8 text-[13px] text-ink-2">Loading Challenges from the vault…</div>
      )}
    </Reveal>
  );
}
