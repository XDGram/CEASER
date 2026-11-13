import { nowTs } from "./near";
import type { Challenge, Condition, Lock, Strategy } from "./types";
import { convictionWeight, type FloorPost } from "./floor";

// Pure helpers for /app/u/:account. Everything here is derived from vault
// state (locks, Challenges, sponsor contributions, staked NEAR) plus the
// account's Floor posts; nothing is stored.

export const DAY = 86400;
export const profilePath = (account: string) => `/app/u/${account}`;

/** The Challenge a lock joined. early_exit clears challenge_id, so exited
 *  locks are recognised by the collective_threshold strategy they submitted. */
export function joinedChallengeId(l: Lock): number | null {
  if (l.challenge_id !== null) return l.challenge_id;
  const m = JSON.stringify(l.strategy).match(/"collective_threshold":\{"challenge_id":(\d+)\}/);
  return m ? Number(m[1]) : null;
}

export function strategyLabel(s: Strategy): string {
  if ("time" in s) return "time lock";
  if ("roi_ladder" in s) return `ROI ladder · ${s.roi_ladder.tranches.length} rung${s.roi_ladder.tranches.length === 1 ? "" : "s"}`;
  if ("collective_threshold" in s) return "Challenge threshold";
  return `any of ${s.any.map(strategyLabel).join(", ")}`;
}

/** Penalty an exited lock paid: what was never returned. */
export const penaltyPaid = (l: Lock): bigint => (l.status === "exited" ? BigInt(l.amount) - BigInt(l.claimed_amount) : 0n);

/** Seconds the lock committed to, by its Challenge deadline or its max duration. */
export function committedSec(l: Lock, challenges: Challenge[]): number {
  const cid = joinedChallengeId(l);
  const c = cid !== null ? challenges.find((x) => x.id === cid) : null;
  return c ? Math.max(0, c.deadline_ts - l.start_ts) : l.max_duration_sec;
}

/** How long the lock has been (or was) held, where the chain lets us tell. */
export function heldSec(l: Lock, challenges: Challenge[]): number {
  const now = nowTs();
  if (l.status === "active") return now - l.start_ts;
  if (l.status === "closed") {
    const cid = joinedChallengeId(l);
    const c = cid !== null ? challenges.find((x) => x.id === cid) : null;
    return c && c.deadline_ts <= now ? c.deadline_ts - l.start_ts : 0;
  }
  return 0; // exited: the lock keeps no exit timestamp
}

export interface ProfileStats {
  lockedNow: bigint;
  everLocked: bigint;
  longestHoldSec: number;
  challengesJoined: number;
  penaltiesPaid: bigint;
  /** Base share of finalized pools for locks whose reward was claimed; null when none. */
  rewardsClaimed: bigint | null;
  /** Sum over active locks of remaining amount x seconds held. */
  conviction: bigint;
}

export function computeStats(locks: Lock[], challenges: Challenge[]): ProfileStats {
  const now = nowTs();
  const active = locks.filter((l) => l.status === "active");
  const remaining = (l: Lock) => BigInt(l.amount) - BigInt(l.claimed_amount);
  let rewards: bigint | null = null;
  for (const l of locks) {
    if (!l.reward_claimed) continue;
    const cid = joinedChallengeId(l);
    const c = cid !== null ? challenges.find((x) => x.id === cid) : null;
    if (!c || c.state === "active" || BigInt(c.total_conviction) === 0n) continue;
    rewards = (rewards ?? 0n) + (BigInt(c.base_pool) * BigInt(l.conviction)) / BigInt(c.total_conviction);
  }
  return {
    lockedNow: active.reduce((a, l) => a + remaining(l), 0n),
    everLocked: locks.reduce((a, l) => a + BigInt(l.amount), 0n),
    longestHoldSec: locks.reduce((a, l) => Math.max(a, heldSec(l, challenges)), 0),
    challengesJoined: new Set(locks.map(joinedChallengeId).filter((x): x is number => x !== null)).size,
    penaltiesPaid: locks.reduce((a, l) => a + penaltyPaid(l), 0n),
    rewardsClaimed: rewards,
    conviction: active.reduce((a, l) => a + remaining(l) * BigInt(Math.max(1, now - l.start_ts)), 0n),
  };
}

/** Rank by conviction among every account with an active lock. Null when unranked. */
export function convictionRank(all: Lock[], account: string): { rank: number; of: number; topPct: number } | null {
  const w = convictionWeight(all);
  const mine = w.get(account);
  if (!mine || mine <= 0n) return null;
  const sorted = [...w.values()].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  const rank = sorted.findIndex((v) => v === mine) + 1;
  return { rank, of: sorted.length, topPct: Math.max(1, Math.ceil((rank / sorted.length) * 100)) };
}

export interface Badge {
  key: string;
  label: string;
  tip: string;
}

export function computeBadges(args: { account: string; locks: Lock[]; challenges: Challenge[]; decimals: number; sponsored: boolean; boostBps: number }): Badge[] {
  const { account, locks, challenges, decimals, sponsored, boostBps } = args;
  const out: Badge[] = [];
  const neverExited = !locks.some((l) => l.status === "exited");
  const diamond = locks.some((l) => l.status !== "exited" && (heldSec(l, challenges) >= 7 * DAY || (l.status === "active" && committedSec(l, challenges) >= 7 * DAY)));
  if (diamond && neverExited) out.push({ key: "diamond", label: "Diamond hands", tip: "Committed to a lock for 7 or more days and never exited early" });
  if (locks.some((l) => l.status === "exited")) out.push({ key: "paper", label: "Paper hands", tip: "Exited a lock early at least once and paid the penalty" });
  const founder = 500_000n * 10n ** BigInt(decimals);
  if (locks.some((l) => BigInt(l.amount) >= founder)) out.push({ key: "founder", label: "Founder lock", tip: "Locked 500k or more in a single lock" });
  if (sponsored) out.push({ key: "sponsor", label: "Sponsor", tip: "Funded a Challenge reward pool" });
  if (challenges.some((c) => c.creator === account)) out.push({ key: "creator", label: "Challenge creator", tip: "Created a Challenge" });
  if (boostBps > 10000) out.push({ key: "near", label: "NEAR backer", tip: "Staked NEAR in a whitelisted pool, boost above 1.00x" });
  const climber = locks.some((l) => l.tranches.some((t) => t.ripe || (t.claimed && t.conditions.some((c: Condition) => "price_above" in c))));
  if (climber) out.push({ key: "ladder", label: "Ladder climber", tip: "Has a ripe or claimed ROI ladder tranche" });
  return out;
}

export interface ActivityItem {
  id: string;
  ts: number;
  tone: "ok" | "bad" | "neutral";
  text: string;
  /** The chain does not store this moment; the time is inferred. */
  approx: boolean;
  link?: string;
}

export function lockActivity(locks: Lock[], challenges: Challenge[], fmt: (units: bigint | string) => string): ActivityItem[] {
  const out: ActivityItem[] = [];
  const now = nowTs();
  const title = (id: number) => {
    const c = challenges.find((x) => x.id === id);
    return c ? `#${id} · ${c.title}` : `#${id}`;
  };
  for (const l of locks) {
    out.push({ id: `lock-${l.id}`, ts: l.start_ts, tone: "neutral", approx: false, text: `Locked ${fmt(l.amount)} behind a ${strategyLabel(l.strategy)} (lock #${l.id})` });
    const cid = joinedChallengeId(l);
    if (cid !== null) out.push({ id: `join-${l.id}`, ts: l.start_ts + 1, tone: "neutral", approx: false, text: `Joined Challenge ${title(cid)}`, link: `/app/challenges/${cid}` });
    if (l.status === "exited") {
      const sink = "challenge" in l.penalty_sink ? ` to the stayers of Challenge ${title(l.penalty_sink.challenge)}` : " to the treasury";
      out.push({ id: `exit-${l.id}`, ts: l.start_ts + 60, tone: "bad", approx: true, text: `Paper hands: exited lock #${l.id} early and paid ${fmt(penaltyPaid(l))}${sink}`, link: "challenge" in l.penalty_sink ? `/app/challenges/${l.penalty_sink.challenge}` : undefined });
    }
    if (l.status === "closed") {
      const c = cid !== null ? challenges.find((x) => x.id === cid) : null;
      const ts = c && c.deadline_ts <= now ? c.deadline_ts + 1 : l.start_ts + 2;
      out.push({ id: `claim-${l.id}`, ts, tone: "ok", approx: true, text: `Claimed ${fmt(l.claimed_amount)} from lock #${l.id}${l.reward_claimed ? " plus the Challenge reward" : ""}`, link: cid !== null ? `/app/challenges/${cid}` : undefined });
    }
  }
  return out;
}

export function postActivity(posts: FloorPost[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const add = (p: FloorPost) => {
    if (p.derived) return;
    const body = p.body.length > 140 ? p.body.slice(0, 139) + "…" : p.body;
    items.push({ id: `post-${p.id}`, ts: Math.floor(new Date(p.created_at).getTime() / 1000), tone: p.kind === "confession" && !p.parent_id ? "bad" : "neutral", approx: false, text: `${p.parent_id ? "Replied" : p.kind === "thesis" ? "Thesis" : p.kind === "confession" ? "Confession" : "Pledge"}: ${body}`, link: p.challenge_id !== null ? `/app/challenges/${p.challenge_id}` : "/app/community" });
  };
  posts.forEach(add);
  return items;
}
