import { fromUnits, mult } from "../lib/near";
import { estimateReward, useProtocol } from "../lib/protocol";
import type { Challenge } from "../lib/types";

/**
 * "Your estimated reward" for the connected user's stake in one Challenge.
 * Renders nothing when the user has no active lock in it.
 */
export function RewardEstimate({ c, detailed = false }: { c: Challenge; detailed?: boolean }) {
  const { locks, boostBps, meta } = useProtocol();
  const conviction = locks
    .filter((l) => l.challenge_id === c.id && l.status === "active")
    .reduce((a, l) => a + BigInt(l.conviction), 0n);
  if (conviction <= 0n) return null;
  const sm = meta(c.sponsor_token);
  const est = estimateReward(c, conviction, boostBps);
  if (detailed)
    return (
      <div className="card p-6 border-accent/40">
        <div className="text-[11px] uppercase tracking-[0.12em] text-ink-2 font-mono">Your estimated reward</div>
        <div className="pixel text-[30px] sm:text-[36px] mt-2 text-accent-2">
          {fromUnits(est.total, sm.decimals, 0)} <span className="text-[0.55em]">{sm.symbol}</span>
        </div>
        <div className="mt-1 text-[12px] text-ink-2">
          {fromUnits(est.base, sm.decimals, 0)} base + {fromUnits(est.boost, sm.decimals, 0)} boost at {mult(boostBps)}
        </div>
        <p className="mt-3 text-[11.5px] text-ink-3">
          Estimate only. It moves as lockers join or leave, penalties arrive and sponsors fund{c.state === "active" ? ", and assumes the Challenge succeeds" : ""}.
        </p>
      </div>
    );
  return (
    <div className="rounded-lg bg-paper px-3 py-2 text-[12px] flex items-baseline justify-between gap-3">
      <span className="text-ink-2">Your est. reward</span>
      <span className="text-ink">
        ~{fromUnits(est.total, sm.decimals, 0)} {sm.symbol} <span className="text-ink-3">at {mult(boostBps)}</span>
      </span>
    </div>
  );
}

