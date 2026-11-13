import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { CONFIG } from "../../config";
import { countdown, fromUnits, mult, nowTs } from "../../lib/near";
import { useProtocol } from "../../lib/protocol";
import { useWallet } from "../../lib/wallet";
import { RewardEstimate } from "../../components/RewardEstimate";

export function Overview() {
  const { accountId } = useWallet();
  const { balance, staked, boostBps, locks, challenges, meta, tiers } = useProtocol();
  const tm = meta(CONFIG.contracts.token);
  const active = locks.filter((l) => l.status === "active");
  const lockedTotal = active.reduce((a, l) => a + BigInt(l.amount) - BigInt(l.claimed_amount), 0n);
  const mine = challenges.filter((c) => active.some((l) => l.challenge_id === c.id));
  const claimableLocks = active.filter((l) => {
    const tail = nowTs() >= l.start_ts + l.max_duration_sec;
    const ch = l.challenge_id ? challenges.find((c) => c.id === l.challenge_id) : null;
    if (ch?.state === "active") return false;
    return tail || l.tranches.some((t) => !t.claimed && (t.ripe || t.conditions.some((c) => "time_after" in c && nowTs() >= c.time_after.ts))) || (ch && !l.reward_claimed);
  });
  const nextTier = tiers.find(([, b]) => b > boostBps);

  const tiles = [
    { k: `${tm.symbol} balance`, v: balance === null ? "…" : fromUnits(balance, tm.decimals, 0), s: "in your wallet" },
    { k: "Locked", v: fromUnits(lockedTotal, tm.decimals, 0), s: `${active.length} active lock${active.length === 1 ? "" : "s"}` },
    { k: "NEAR boost", v: mult(boostBps), s: staked === null ? "reading stake…" : `${fromUnits(staked, 24, 0)} NEAR staked${nextTier ? ` · ${fromUnits(nextTier[0], 24, 0)} for ${mult(nextTier[1])}` : ""}` },
    { k: "Claimable", v: String(claimableLocks.length), s: claimableLocks.length ? "locks ready to claim" : "nothing ready yet" },
  ];

  return (
    <section className="mx-auto max-w-[1180px] px-4 sm:px-6 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-2">Overview</div>
          <h1 className="mt-1 text-[26px] sm:text-[32px] tracking-tight leading-tight">
            gm, <span className="font-mono text-[0.8em]">{accountId}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/app/lock" className="btn btn-accent btn-sm">
            Create a lock
          </Link>
          <Link to="/app/challenges" className="btn btn-outline btn-sm">
            Browse Challenges
          </Link>
        </div>
      </div>

      <div className="mt-8 card grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {tiles.map((t, i) => (
          <motion.div key={t.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="p-6 border-b lg:border-b-0 border-line [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-ink-2">{t.k}</div>
            <div className="pixel text-[30px] sm:text-[36px] mt-2">{t.v}</div>
            <div className="mt-1 text-[12px] text-ink-2">{t.s}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-5">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] tracking-tight">Your Challenges</h2>
            <Link to="/app/challenges" className="text-[12px] text-ink-2 hover:text-ink">
              All →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-line">
            {mine.map((c) => (
              <div key={c.id} className="py-3 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Link to={`/app/challenges/${c.id}`} className="text-ink hover:underline underline-offset-4">
                      #{c.id} · {c.title}
                    </Link>
                    <div className="text-[11.5px] text-ink-2">
                      {fromUnits(c.total_locked, meta(c.token).decimals, 0)} / {fromUnits(c.threshold_amount, meta(c.token).decimals, 0)} {meta(c.token).symbol} · {countdown(c.deadline_ts)}
                    </div>
                  </div>
                  <span className={`tag ${c.state === "succeeded" ? "tag-ok" : c.state === "failed" ? "tag-bad" : "tag-live"}`}>{c.state}</span>
                </div>
                <div className="mt-2">
                  <RewardEstimate c={c} />
                </div>
              </div>
            ))}
            {!mine.length && <p className="py-3 text-[13px] text-ink-2">You're not in any Challenge yet. Join one and your locked amount counts toward its goal.</p>}
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] tracking-tight">Your locks</h2>
            <Link to="/app/locks" className="text-[12px] text-ink-2 hover:text-ink">
              Manage →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-line">
            {active.map((l) => {
              const m = meta(l.token);
              const done = l.tranches.filter((t) => t.claimed).length;
              return (
                <div key={l.id} className="py-3 flex items-center justify-between gap-3 text-[13px]">
                  <div>
                    <div className="text-ink">
                      Lock #{l.id} · {fromUnits(BigInt(l.amount) - BigInt(l.claimed_amount), m.decimals, 0)} {m.symbol}
                    </div>
                    <div className="text-[11.5px] text-ink-2">
                      {Object.keys(l.strategy)[0].replace("_", " ")} · {done}/{l.tranches.length} tranches claimed{l.challenge_id ? ` · Challenge #${l.challenge_id}` : ""}
                    </div>
                  </div>
                  {claimableLocks.includes(l) ? <span className="tag tag-ok">claimable</span> : <span className="tag tag-muted">locked</span>}
                </div>
              );
            })}
            {!active.length && <p className="py-3 text-[13px] text-ink-2">No active locks. Create one to start.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
