import { CONFIG } from "../config";
import { nowTs, view } from "./near";
import type { Challenge, Lock } from "./types";

/**
 * What early_exit will do to a lock, computed before signing. Mirrors the
 * vault's early_exit step by step:
 *  1. An overdue Challenge (lock's own, then the sink) is finalized first.
 *  2. If the lock's Challenge is still active, the lock leaves it.
 *     If it is finalized and the reward is unclaimed, the base reward is paid
 *     out without the NEAR boost.
 *  3. Free tranches are paid in full; the penalty applies only to the rest:
 *     penalty = (amount - claimed - free) * penalty_bps / 10000.
 *  4. The penalty goes to the sink Challenge only while it is active and pays
 *     out in the locked token; otherwise to the sink account, or the treasury.
 */
export interface ExitPreview {
  lockId: number;
  remaining: bigint;
  free: bigint;
  penalty: bigint;
  returned: bigint;
  sink: { kind: "challenge"; challenge: Challenge; stayers: number } | { kind: "account"; account: string; treasury: boolean };
  leaves: Challenge | null;
  rewardOnExit: boolean;
}

/** Predicted Challenge state after early_exit's finalize_if_due. */
function settled(c: Challenge): Challenge["state"] {
  if (c.state !== "active" || nowTs() < c.deadline_ts) return c.state;
  return BigInt(c.total_locked) >= BigInt(c.threshold_amount) ? "succeeded" : "failed";
}

export async function previewExit(lock: Lock, challenges: Challenge[]): Promise<ExitPreview> {
  const find = (id: number) => challenges.find((c) => c.id === id) ?? null;
  const own = lock.challenge_id !== null ? find(lock.challenge_id) : null;
  const ownState = own ? settled(own) : null;
  const leaves = own && ownState === "active" ? own : null;
  const rewardOnExit = !!own && ownState !== "active" && !lock.reward_claimed && BigInt(lock.conviction) > 0n;

  const remaining = BigInt(lock.amount) - BigInt(lock.claimed_amount);

  // get_claimable is the source for free principal. It reports 0 while the
  // lock's Challenge is active, but early_exit removes the lock from the
  // Challenge before taking claimables, so in that case the free tranches are
  // computed here with the vault's own tranche rules instead.
  let free: bigint;
  if (own && own.state === "active") {
    const now = nowTs();
    const amount = BigInt(lock.amount);
    const part = (bps: number) => (amount / 10000n) * BigInt(bps) + ((amount % 10000n) * BigInt(bps)) / 10000n;
    free = 0n;
    lock.tranches.forEach((t, i) => {
      if (t.claimed) return;
      const ok =
        now >= lock.start_ts + lock.max_duration_sec ||
        t.conditions.some((c) => {
          if ("price_above" in c) return t.ripe;
          if ("time_after" in c) return now >= c.time_after.ts;
          const ch = find(c.challenge_finalized.challenge_id);
          return ch ? settled(ch) !== "active" : false;
        });
      if (!ok) return;
      // The last tranche absorbs rounding dust, as in Lock::tranche_amount.
      if (i === lock.tranches.length - 1) free += amount - lock.tranches.slice(0, i).reduce((a, x) => a + part(x.fraction_bps), 0n);
      else free += part(t.fraction_bps);
    });
  } else {
    const c = await view<{ principal: string }>(CONFIG.contracts.vault, "get_claimable", { lock_id: lock.id });
    free = BigInt(c.principal);
  }
  if (free > remaining) free = remaining;

  const penalty = ((remaining - free) * BigInt(lock.penalty_bps)) / 10000n;
  const returned = remaining - penalty;

  let sink: ExitPreview["sink"];
  if ("challenge" in lock.penalty_sink) {
    const sc = find(lock.penalty_sink.challenge);
    if (sc && settled(sc) === "active" && sc.sponsor_token === lock.token) {
      // The lock itself stops counting if it is leaving this same Challenge.
      const stayers = sc.participant_count - (leaves && leaves.id === sc.id ? 1 : 0);
      sink = { kind: "challenge", challenge: sc, stayers };
    } else {
      const owner = await view<string>(CONFIG.contracts.vault, "get_owner").catch(() => "the vault owner");
      sink = { kind: "account", account: owner, treasury: true };
    }
  } else {
    sink = { kind: "account", account: lock.penalty_sink.account, treasury: false };
  }

  return { lockId: lock.id, remaining, free, penalty, returned, sink, leaves, rewardOnExit };
}

// ---------- redirect resume ----------

const KEY = "ceaser:pending-exit";

export interface PendingExit {
  lockId: number;
  claimedBefore: string;
  amount: string;
  sinkLabel: string;
}

export function savePendingExit(p: PendingExit) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

export function takePendingExit(): PendingExit | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as PendingExit) : null;
  } catch {
    return null;
  }
}

export function clearPendingExit() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Polls get_lock until the lock reads exited; null if it never does. */
export async function awaitExited(lockId: number): Promise<Lock | null> {
  for (let i = 0; i < 14; i++) {
    const l = await view<Lock | null>(CONFIG.contracts.vault, "get_lock", { lock_id: lockId }).catch(() => null);
    if (l && l.status === "exited") return l;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
