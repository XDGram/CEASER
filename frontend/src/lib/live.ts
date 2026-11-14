import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONFIG } from "../config";
import { supabase } from "./floor";
import { computeCommunityStats, loadCommunities, lockChallenge, type Community } from "./community";
import { fetchAllLocks, fromUnits, tokenMeta, view } from "./near";
import type { Challenge, Lock } from "./types";

/**
 * The activity engine. Every event here comes from a real source: a vault view
 * or a Supabase row. Nothing is synthesised.
 *
 * The vault stores no timestamp for an exit, a claim or a sponsor deposit, so
 * those can never be dated. They appear only when this browser catches the
 * change between two polls, and then they are "just now" by construction.
 * `recentActivity` therefore returns only events whose time is really known:
 * locks (start_ts) and Supabase rows (created_at).
 */

export type ActivityKind =
  | "lock"
  | "join"
  | "exit"
  | "claim"
  | "sponsor"
  | "milestone"
  | "campaign_finalized"
  | "post"
  | "reply"
  | "reaction"
  | "announcement"
  | "rank_change";

export interface ActivityEvent {
  /** Stable across polls, so the same change is never shown twice. */
  id: string;
  kind: ActivityKind;
  account: string | null;
  text: string;
  href: string | null;
  /** Unix seconds when the source records one, else null. */
  at: number | null;
  /** Detected as a change while this page was open. */
  live: boolean;
  demo: boolean;
  communityId: string | null;
  amount?: string;
}

/** Accounts created by scripts/seed.sh for the demo data set. */
const DEMO_ACCOUNT = /^ceaser-[a-z0-9]+-7e8558\.testnet$/;
const POLL_MS = 20_000;
const RANK_KEY = "ceaser:rank-snapshot";

interface PostRow {
  id: string;
  created_at: string;
  author: string;
  kind: string;
  body: string;
  challenge_id: number | null;
  community_id: string | null;
  parent_id: string | null;
  meta: Record<string, unknown> | null;
}

interface ReactionRow {
  post_id: string;
  account: string;
  kind: string;
  created_at: string;
}

const POST_COLS = "id,created_at,author,kind,body,challenge_id,community_id,parent_id,meta";
const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const isDemo = (account: string | null, meta?: Record<string, unknown> | null) =>
  meta?.demo === true || (!!account && DEMO_ACCOUNT.test(account));
const snippet = (s: string, n = 90) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/** Which community owns a Challenge, by its id. */
function communityOf(communities: Community[], challengeId: number | null): string | null {
  if (challengeId === null) return null;
  return communities.find((c) => c.challenge_ids.includes(challengeId))?.id ?? null;
}

function challengeTitle(challenges: Challenge[], id: number | null): string | null {
  if (id === null) return null;
  const c = challenges.find((x) => x.id === id);
  return c ? c.title : `Challenge #${id}`;
}

/** Where a Supabase post sends you: its Challenge, else its community, else the Floor. */
function postHref(p: PostRow): string {
  if (p.challenge_id !== null) return `/app/challenges/${p.challenge_id}`;
  if (p.community_id) return `/app/c/${p.community_id}`;
  return "/app/community";
}

function postEvent(p: PostRow, communities: Community[]): ActivityEvent {
  const reply = p.parent_id !== null;
  const announcement = p.kind === "announcement" || p.kind === "update";
  const verb = reply ? "replied" : announcement ? (p.kind === "update" ? "posted an update" : "announced") : `posted a ${p.kind}`;
  return {
    id: `post-${p.id}`,
    kind: reply ? "reply" : announcement ? "announcement" : "post",
    account: p.author,
    text: `${verb}: ${snippet(p.body)}`,
    href: postHref(p),
    at: secs(p.created_at),
    live: false,
    demo: isDemo(p.author, p.meta),
    communityId: p.community_id ?? communityOf(communities, p.challenge_id),
  };
}

function lockEvent(l: Lock, challenges: Challenge[], communities: Community[], decimals: number, symbol: string): ActivityEvent {
  const cid = lockChallenge(l);
  const title = challengeTitle(challenges, cid);
  const amount = `${fromUnits(l.amount, decimals, 0)} ${symbol}`;
  return {
    id: cid === null ? `lock-${l.id}` : `join-${l.id}`,
    kind: cid === null ? "lock" : "join",
    account: l.owner,
    text: cid === null ? `locked ${amount}` : `locked ${amount} into ${title}`,
    href: cid === null ? `/app/u/${l.owner}` : `/app/challenges/${cid}`,
    at: l.start_ts,
    live: false,
    demo: isDemo(l.owner),
    communityId: communityOf(communities, cid),
    amount,
  };
}

interface Sources {
  challenges: Challenge[];
  locks: Lock[];
  communities: Community[];
  decimals: number;
  symbol: string;
}

/** One read of everything the engine needs. */
async function readSources(): Promise<Sources> {
  const [count, challenges, communities, meta] = await Promise.all([
    view<number>(CONFIG.contracts.vault, "get_lock_count"),
    view<Challenge[]>(CONFIG.contracts.vault, "get_challenges", { from_index: 0, limit: 50 }),
    loadCommunities().catch(() => [] as Community[]),
    tokenMeta(CONFIG.contracts.token).catch(() => ({ symbol: "CSTEST", decimals: 18, name: "CSTEST" })),
  ]);
  const locks = await fetchAllLocks(count);
  return { challenges, locks, communities, decimals: meta.decimals, symbol: meta.symbol };
}

/**
 * Dated history, newest first: locks and joins by their start_ts, and Supabase
 * posts, replies and reactions by created_at. Undated kinds are left out on
 * purpose; see the note at the top of this file.
 */
export async function recentActivity(opts: { communityId?: string; limit?: number } = {}): Promise<ActivityEvent[]> {
  const limit = opts.limit ?? 20;
  const [{ challenges, locks, communities, decimals, symbol }, postsRes, reactionsRes] = await Promise.all([
    readSources(),
    supabase.from("posts").select(POST_COLS).order("created_at", { ascending: false }).limit(60),
    supabase.from("reactions").select("post_id,account,kind,created_at").order("created_at", { ascending: false }).limit(40),
  ]);

  const posts = (postsRes.data ?? []) as PostRow[];
  const byId = new Map(posts.map((p) => [p.id, p]));
  const events: ActivityEvent[] = [
    ...locks.map((l) => lockEvent(l, challenges, communities, decimals, symbol)),
    ...posts.map((p) => postEvent(p, communities)),
    ...((reactionsRes.data ?? []) as ReactionRow[]).map((r) => {
      const target = byId.get(r.post_id);
      return {
        id: `react-${r.post_id}-${r.account}-${r.kind}`,
        kind: "reaction" as const,
        account: r.account,
        text: r.kind === "cope" ? "coped at a post on the Floor" : "backed a post on the Floor",
        href: target ? postHref(target) : "/app/community",
        at: secs(r.created_at),
        live: false,
        demo: isDemo(r.account, target?.meta),
        communityId: target ? (target.community_id ?? communityOf(communities, target.challenge_id)) : null,
      };
    }),
  ];

  return events
    .filter((e) => (opts.communityId ? e.communityId === opts.communityId : true))
    .filter((e) => e.at !== null)
    .sort((a, b) => (b.at as number) - (a.at as number))
    .slice(0, limit);
}

interface Snapshot {
  locks: Map<number, { status: Lock["status"]; claimed: number; reward: boolean }>;
  challenges: Map<number, { sponsor: bigint; state: Challenge["state"] }>;
  committed: Map<string, bigint>;
  ranks: Map<string, number>;
  lastPost: string;
  lastReaction: string;
}

function snapshotOf(s: Sources, lastPost: string, lastReaction: string): Snapshot {
  const committed = new Map<string, bigint>();
  const ranked: { id: string; v: bigint }[] = [];
  for (const c of s.communities) {
    const st = computeCommunityStats(c, s.challenges, s.locks, s.decimals);
    committed.set(c.id, st.committed);
    ranked.push({ id: c.id, v: st.committed });
  }
  ranked.sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.id.localeCompare(b.id)));
  return {
    locks: new Map(s.locks.map((l) => [l.id, { status: l.status, claimed: l.tranches.filter((t) => t.claimed).length, reward: l.reward_claimed }])),
    challenges: new Map(s.challenges.map((c) => [c.id, { sponsor: BigInt(c.sponsor_total), state: c.state }])),
    committed,
    ranks: new Map(ranked.map((r, i) => [r.id, i + 1])),
    lastPost,
    lastReaction,
  };
}

/**
 * Polls every 20 seconds and reports what changed since the previous poll.
 * The first poll only establishes a baseline, so nothing already on chain is
 * announced as if it had just happened.
 */
export function useLiveActivity(opts: { communityId?: string } = {}): { events: ActivityEvent[]; latest: ActivityEvent | null } {
  const { communityId } = opts;
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const snap = useRef<Snapshot | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const push = useCallback(
    (fresh: ActivityEvent[]) => {
      const keep = fresh.filter((e) => !seen.current.has(e.id) && (communityId ? e.communityId === communityId : true));
      if (!keep.length) return;
      keep.forEach((e) => seen.current.add(e.id));
      setEvents((prev) => [...keep, ...prev].slice(0, 50));
    },
    [communityId],
  );

  const tick = useCallback(async () => {
    // A background tab does not need to poll the chain.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    let s: Sources;
    try {
      s = await readSources();
    } catch {
      return; // a flaky read must never look like an absence of activity
    }
    const nowIso = new Date().toISOString();
    const prev = snap.current;

    let posts: PostRow[] = [];
    let reactions: ReactionRow[] = [];
    if (prev) {
      const [p, r] = await Promise.all([
        supabase.from("posts").select(POST_COLS).gt("created_at", prev.lastPost).order("created_at", { ascending: true }).limit(20),
        supabase.from("reactions").select("post_id,account,kind,created_at").gt("created_at", prev.lastReaction).order("created_at", { ascending: true }).limit(20),
      ]);
      posts = (p.data ?? []) as PostRow[];
      reactions = (r.data ?? []) as ReactionRow[];
    }

    const next = snapshotOf(s, posts.length ? posts[posts.length - 1].created_at : (prev?.lastPost ?? nowIso), reactions.length ? reactions[reactions.length - 1].created_at : (prev?.lastReaction ?? nowIso));

    if (!prev) {
      snap.current = next;
      return;
    }

    const out: ActivityEvent[] = [];
    const live = { live: true, at: null as number | null };

    // Locks: created, exited, tranche claimed, reward claimed.
    for (const l of s.locks) {
      const before = prev.locks.get(l.id);
      const base = lockEvent(l, s.challenges, s.communities, s.decimals, s.symbol);
      if (!before) {
        out.push({ ...base, ...live });
        continue;
      }
      if (before.status === "active" && l.status === "exited") {
        const penalty = BigInt(l.amount) - BigInt(l.claimed_amount);
        const sink = "challenge" in l.penalty_sink ? challengeTitle(s.challenges, l.penalty_sink.challenge) : null;
        out.push({
          ...base,
          ...live,
          id: `exit-${l.id}`,
          kind: "exit",
          text: `left a lock early and paid ${fromUnits(penalty, s.decimals, 0)} ${s.symbol}${sink ? ` to the stayers of ${sink}` : " to the treasury"}`,
          amount: `${fromUnits(penalty, s.decimals, 0)} ${s.symbol}`,
        });
      }
      const claimedNow = l.tranches.filter((t) => t.claimed).length;
      if (claimedNow > before.claimed) {
        out.push({
          ...base,
          ...live,
          id: `claim-${l.id}-${claimedNow}`,
          kind: "claim",
          text: `claimed ${fromUnits(BigInt(l.claimed_amount), s.decimals, 0)} ${s.symbol} from a lock`,
          amount: `${fromUnits(BigInt(l.claimed_amount), s.decimals, 0)} ${s.symbol}`,
        });
      }
      if (!before.reward && l.reward_claimed) {
        out.push({ ...base, ...live, id: `reward-${l.id}`, kind: "claim", text: `claimed a Challenge reward` });
      }
    }

    // Challenges: sponsor money in, and finalize.
    for (const c of s.challenges) {
      const before = prev.challenges.get(c.id);
      if (!before) continue;
      const sponsor = BigInt(c.sponsor_total);
      if (sponsor > before.sponsor) {
        const delta = sponsor - before.sponsor;
        out.push({
          id: `sponsor-${c.id}-${sponsor}`,
          kind: "sponsor",
          account: null,
          text: `${fromUnits(delta, s.decimals, 0)} ${s.symbol} sponsored into ${c.title}`,
          href: `/app/challenges/${c.id}`,
          at: null,
          live: true,
          demo: false,
          communityId: communityOf(s.communities, c.id),
          amount: `${fromUnits(delta, s.decimals, 0)} ${s.symbol}`,
        });
      }
      if (before.state === "active" && c.state !== "active") {
        out.push({
          id: `final-${c.id}-${c.state}`,
          kind: "campaign_finalized",
          account: null,
          text: `${c.title} finalized as ${c.state}`,
          href: `/app/challenges/${c.id}`,
          at: null,
          live: true,
          demo: false,
          communityId: communityOf(s.communities, c.id),
        });
      }
    }

    // Communities: milestones crossed and rank moves.
    for (const c of s.communities) {
      const was = prev.committed.get(c.id);
      const now = next.committed.get(c.id) ?? 0n;
      if (was === undefined) continue;
      if (now > was) {
        const unit = 10n ** BigInt(s.decimals);
        for (const m of c.milestones) {
          const target = BigInt(Math.round(Number(m))) * unit;
          if (was < target && now >= target) {
            out.push({
              id: `ms-${c.id}-${m}`,
              kind: "milestone",
              account: null,
              text: `${c.name} passed ${fromUnits(target, s.decimals, 0)} ${s.symbol} committed`,
              href: `/app/c/${c.id}`,
              at: null,
              live: true,
              demo: false,
              communityId: c.id,
            });
          }
        }
      }
      const wasRank = prev.ranks.get(c.id);
      const nowRank = next.ranks.get(c.id);
      if (wasRank !== undefined && nowRank !== undefined && nowRank < wasRank) {
        out.push({
          id: `rank-${c.id}-${wasRank}-${nowRank}`,
          kind: "rank_change",
          account: null,
          text: `${c.name} moved up to #${nowRank} by committed volume`,
          href: `/app/c/${c.id}`,
          at: null,
          live: true,
          demo: false,
          communityId: c.id,
        });
      }
    }

    // Supabase rows created since the last poll.
    const byId = new Map(posts.map((p) => [p.id, p]));
    for (const p of posts) out.push({ ...postEvent(p, s.communities), live: true });
    for (const r of reactions) {
      const target = byId.get(r.post_id);
      out.push({
        id: `react-${r.post_id}-${r.account}-${r.kind}`,
        kind: "reaction",
        account: r.account,
        text: r.kind === "cope" ? "coped at a post on the Floor" : "backed a post on the Floor",
        href: target ? postHref(target) : "/app/community",
        at: secs(r.created_at),
        live: true,
        demo: isDemo(r.account, target?.meta),
        communityId: target ? (target.community_id ?? communityOf(s.communities, target.challenge_id)) : null,
      });
    }

    snap.current = next;
    if (out.length) push(out);
  }, [push]);

  useEffect(() => {
    let stop = false;
    const run = () => {
      if (!stop) void tick();
    };
    run();
    const id = window.setInterval(run, POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [tick]);

  return useMemo(() => ({ events, latest: events[0] ?? null }), [events]);
}

/**
 * Rank movement by committed volume since this browser last looked, from a
 * localStorage snapshot. Positive means the community climbed. The snapshot is
 * rewritten once the current ranking is known, so a reload shows no movement.
 */
export function useRankMovement(): Map<string, number> {
  const [moves, setMoves] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let s: Sources;
      try {
        s = await readSources();
      } catch {
        return;
      }
      if (cancelled || !s.communities.length) return;
      const ranked = s.communities
        .map((c) => ({ id: c.id, v: computeCommunityStats(c, s.challenges, s.locks, s.decimals).committed }))
        .sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.id.localeCompare(b.id)));
      const now: Record<string, number> = {};
      ranked.forEach((r, i) => (now[r.id] = i + 1));

      let before: Record<string, number> = {};
      try {
        before = JSON.parse(localStorage.getItem(RANK_KEY) ?? "{}") as Record<string, number>;
      } catch {
        before = {};
      }
      const out = new Map<string, number>();
      for (const [id, rank] of Object.entries(now)) {
        const was = before[id];
        if (typeof was === "number" && was !== rank) out.set(id, was - rank);
      }
      try {
        localStorage.setItem(RANK_KEY, JSON.stringify(now));
      } catch {
        /* a blocked store just means no movement next time */
      }
      if (!cancelled) setMoves(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return moves;
}
