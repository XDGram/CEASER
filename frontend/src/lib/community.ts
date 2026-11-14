import { supabase } from "./floor";
import { joinedChallengeId } from "./profile";
import type { Challenge, Lock } from "./types";

export interface Community {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  token: string;
  creator: string;
  challenge_ids: number[];
  milestones: string[];
  created_at: string;
}

const COLS = "id,name,tagline,description,token,creator,challenge_ids,milestones,created_at";
const norm = (r: Record<string, unknown>): Community => ({ ...(r as unknown as Community), milestones: ((r.milestones as unknown[]) ?? []).map(String) });

export async function loadCommunities(): Promise<Community[]> {
  const { data, error } = await supabase.from("communities").select(COLS).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(norm);
}

export async function loadCommunity(id: string): Promise<Community | null> {
  const { data, error } = await supabase.from("communities").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? norm(data) : null;
}

export async function createCommunity(c: Omit<Community, "created_at">): Promise<void> {
  const { error } = await supabase.from("communities").insert({ ...c, milestones: c.milestones.map(Number) });
  if (error) throw error;
}

/** Appends a Challenge to a community. Read-modify-write: fine for a demo, racy under concurrent edits. */
export async function attachChallenge(id: string, challengeId: number): Promise<void> {
  const c = await loadCommunity(id);
  if (!c) throw new Error(`No community ${id}`);
  if (c.challenge_ids.includes(challengeId)) return;
  const { error } = await supabase.from("communities").update({ challenge_ids: [...c.challenge_ids, challengeId] }).eq("id", id);
  if (error) throw error;
}

export interface CommunityStats {
  committed: bigint;
  activeLockers: number;
  everLockers: number;
  retentionPct: number;
  conviction: bigint;
  campaigns: { total: number; active: number; succeeded: number; failed: number };
  successRatePct: number | null;
  treasury: { sponsored: bigint; penalties: bigint; reserveRemaining: bigint; basePool: bigint; paidOut: bigint };
  growth: { day: string; newLockers: number }[];
  milestones: { target: bigint; reached: boolean }[];
}

/** The Challenge a lock belongs to for community purposes, including exited locks
 *  (which lose challenge_id) via their strategy or a Challenge penalty sink. */
export function lockChallenge(l: Lock): number | null {
  const joined = joinedChallengeId(l);
  if (joined !== null) return joined;
  if (l.status === "exited" && "challenge" in l.penalty_sink) return l.penalty_sink.challenge;
  return null;
}

export function computeCommunityStats(c: Community, challenges: Challenge[], allLocks: Lock[], decimals: number): CommunityStats {
  const ids = new Set(c.challenge_ids);
  const chs = challenges.filter((x) => ids.has(x.id));
  const locks = allLocks.filter((l) => {
    const cid = lockChallenge(l);
    return cid !== null && ids.has(cid);
  });
  const active = locks.filter((l) => l.status === "active");
  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

  const finalized = chs.filter((x) => x.state !== "active");
  const succeeded = chs.filter((x) => x.state === "succeeded").length;
  const failed = chs.filter((x) => x.state === "failed").length;

  // Reserve originally set aside is distributable * bps; base_pool is the rest, so reserve = base_pool * bps / (10000 - bps).
  const paidOut = sum(
    finalized.map((x) => {
      const eligible = locks.filter((l) => lockChallenge(l) === x.id && BigInt(l.conviction) > 0n);
      if (!eligible.some((l) => l.reward_claimed)) return 0n;
      const claimedConv = sum(eligible.filter((l) => l.reward_claimed).map((l) => BigInt(l.conviction)));
      const totalConv = BigInt(x.total_conviction);
      const base = totalConv > 0n ? (BigInt(x.base_pool) * claimedConv) / totalConv : 0n;
      const reserveSet = x.boost_reserve_bps < 10000 ? (BigInt(x.base_pool) * BigInt(x.boost_reserve_bps)) / BigInt(10000 - x.boost_reserve_bps) : 0n;
      const boostPaid = reserveSet > BigInt(x.reserve_remaining) ? reserveSet - BigInt(x.reserve_remaining) : 0n;
      return base + boostPaid;
    }),
  );

  const firstLock = new Map<string, number>();
  for (const l of locks) firstLock.set(l.owner, Math.min(firstLock.get(l.owner) ?? Infinity, l.start_ts));
  const today = Math.floor(Date.now() / 86400000);
  const growth = Array.from({ length: 14 }, (_, i) => {
    const d = today - 13 + i;
    return {
      day: new Date(d * 86400000).toISOString().slice(0, 10),
      newLockers: [...firstLock.values()].filter((ts) => Math.floor(ts / 86400) === d).length,
    };
  });

  const committed = sum(chs.map((x) => BigInt(x.total_locked)));
  const unit = 10n ** BigInt(decimals);
  return {
    committed,
    activeLockers: new Set(active.map((l) => l.owner)).size,
    everLockers: new Set(locks.map((l) => l.owner)).size,
    retentionPct: locks.length ? Math.round((active.length / locks.length) * 1000) / 10 : 0,
    conviction: sum(active.map((l) => BigInt(l.conviction))),
    campaigns: { total: chs.length, active: chs.length - finalized.length, succeeded, failed },
    successRatePct: finalized.length ? Math.round((succeeded / finalized.length) * 1000) / 10 : null,
    treasury: {
      sponsored: sum(chs.map((x) => BigInt(x.sponsor_total))),
      penalties: sum(chs.map((x) => BigInt(x.penalty_total))),
      reserveRemaining: sum(chs.map((x) => BigInt(x.reserve_remaining))),
      basePool: sum(chs.map((x) => BigInt(x.base_pool))),
      paidOut,
    },
    growth,
    milestones: c.milestones.map((m) => {
      const target = BigInt(Math.round(Number(m))) * unit;
      return { target, reached: committed >= target };
    }),
  };
}
