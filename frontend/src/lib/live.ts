import { useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config";
import { supabase } from "./floor";
import { loadCommunities, lockChallenge, type Community } from "./community";
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

/** Committed volume: the sum of total_locked over a community's Challenges. */
function committedOf(c: Community, challenges: Challenge[]): bigint {
  return challenges.filter((x) => c.challenge_ids.includes(x.id)).reduce((a, x) => a + BigInt(x.total_locked), 0n);
}

/** Communities ranked by committed volume, highest first. */
function rankOf(communities: Community[], challenges: Challenge[]): Map<string, number> {
  const ranked = communities
    .map((c) => ({ id: c.id, v: committedOf(c, challenges) }))
    .sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.id.localeCompare(b.id)));
  return new Map(ranked.map((r, i) => [r.id, i + 1]));
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
  const [cheap, locks] = await (async () => {
    const c = await readCheap();
    return [c, await fetchAllLocks(c.count)] as const;
  })();
  return { challenges: cheap.challenges, locks, communities: cheap.communities, decimals: cheap.decimals, symbol: cheap.symbol };
}

interface Cheap {
  count: number;
  challenges: Challenge[];
  communities: Community[];
  decimals: number;
  symbol: string;
}

/**
 * The two vault views plus the community list. Sweeping every lock costs one
 * view per active lock, so the poll takes this first and only sweeps when
 * something here moved.
 */
async function readCheap(): Promise<Cheap> {
  const [count, challenges, communities, meta] = await Promise.all([
    view<number>(CONFIG.contracts.vault, "get_lock_count"),
    view<Challenge[]>(CONFIG.contracts.vault, "get_challenges", { from_index: 0, limit: 50 }),
    loadCommunities().catch(() => [] as Community[]),
    tokenMeta(CONFIG.contracts.token).catch(() => ({ symbol: "CSTEST", decimals: 18, name: "CSTEST" })),
  ]);
  return { count, challenges, communities, decimals: meta.decimals, symbol: meta.symbol };
}

/** Changes here mean a lock changed too, so the sweep is worth its cost. */
const signatureOf = (c: Cheap) =>
  `${c.count}|` + c.challenges.map((x) => `${x.id}:${x.total_locked}:${x.penalty_total}:${x.sponsor_total}:${x.state}`).join(",");

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
  /** Absent when this poll skipped the lock sweep; the previous map carries over. */
  locks: Map<number, { status: Lock["status"]; claimed: number; reward: boolean }>;
  challenges: Map<number, { sponsor: bigint; state: Challenge["state"] }>;
  committed: Map<string, bigint>;
  ranks: Map<string, number>;
  signature: string;
  lastPost: string;
  lastReaction: string;
}

function snapshotOf(c: Cheap, locks: Snapshot["locks"], lastPost: string, lastReaction: string): Snapshot {
  return {
    locks,
    challenges: new Map(c.challenges.map((x) => [x.id, { sponsor: BigInt(x.sponsor_total), state: x.state }])),
    committed: new Map(c.communities.map((x) => [x.id, committedOf(x, c.challenges)])),
    ranks: rankOf(c.communities, c.challenges),
    signature: signatureOf(c),
    lastPost,
    lastReaction,
  };
}

const lockMapOf = (locks: Lock[]): Snapshot["locks"] =>
  new Map(locks.map((l) => [l.id, { status: l.status, claimed: l.tranches.filter((t) => t.claimed).length, reward: l.reward_claimed }]));

/**
 * Polls every 20 seconds and reports what changed since the previous poll.
 * The first poll only establishes a baseline, so nothing already on chain is
 * announced as if it had just happened.
 */
/**
 * One poller for the whole app. Several components subscribe (the pop-ups and
 * the leaderboard), and a second hook instance must not mean a second sweep of
 * the chain, so the timer, the snapshot and the event list live here.
 */
const engine = {
  snap: null as Snapshot | null,
  sweepTick: 0,
  seen: new Set<string>(),
  events: [] as ActivityEvent[],
  listeners: new Set<() => void>(),
  timer: null as number | null,
  running: false,
};

function emit(fresh: ActivityEvent[]) {
  const keep = fresh.filter((e) => !engine.seen.has(e.id));
  if (!keep.length) return;
  keep.forEach((e) => engine.seen.add(e.id));
  engine.events = [...keep, ...engine.events].slice(0, 50);
  engine.listeners.forEach((fn) => fn());
}

async function pollOnce(): Promise<void> {
  // A background tab does not need to poll the chain.
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (engine.running) return;
  engine.running = true;
  try {
    const prev = engine.snap;
    let cheap: Cheap;
    try {
      cheap = await readCheap();
    } catch {
      return; // a flaky read must never look like an absence of activity
    }
    // Sweeping every lock costs a view each, so only do it when the cheap
    // signature moved, on the first poll, or every sixth poll (two minutes) as
    // a backstop for a lock whose change touches no Challenge, such as an exit
    // whose penalty goes to an account rather than a pool.
    engine.sweepTick += 1;
    const sweep = !prev || prev.signature !== signatureOf(cheap) || engine.sweepTick % 6 === 0;
    let locks: Lock[] | null = null;
    if (sweep) {
      try {
        locks = await fetchAllLocks(cheap.count);
      } catch {
        return;
      }
    }
    const nowIso = new Date().toISOString();

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

    const next = snapshotOf(
      cheap,
      locks ? lockMapOf(locks) : (prev?.locks ?? new Map()),
      posts.length ? posts[posts.length - 1].created_at : (prev?.lastPost ?? nowIso),
      reactions.length ? reactions[reactions.length - 1].created_at : (prev?.lastReaction ?? nowIso),
    );

    if (!prev) {
      engine.snap = next;
      return;
    }

    const out: ActivityEvent[] = [];
    const live = { live: true, at: null as number | null };

    // Locks: created, exited, tranche claimed, reward claimed.
    for (const l of locks ?? []) {
      const before = prev.locks.get(l.id);
      const base = lockEvent(l, cheap.challenges, cheap.communities, cheap.decimals, cheap.symbol);
      if (!before) {
        out.push({ ...base, ...live });
        continue;
      }
      if (before.status === "active" && l.status === "exited") {
        const penalty = BigInt(l.amount) - BigInt(l.claimed_amount);
        const sink = "challenge" in l.penalty_sink ? challengeTitle(cheap.challenges, l.penalty_sink.challenge) : null;
        out.push({
          ...base,
          ...live,
          id: `exit-${l.id}`,
          kind: "exit",
          text: `left a lock early and paid ${fromUnits(penalty, cheap.decimals, 0)} ${cheap.symbol}${sink ? ` to the stayers of ${sink}` : " to the treasury"}`,
          amount: `${fromUnits(penalty, cheap.decimals, 0)} ${cheap.symbol}`,
        });
      }
      const claimedNow = l.tranches.filter((t) => t.claimed).length;
      if (claimedNow > before.claimed) {
        out.push({
          ...base,
          ...live,
          id: `claim-${l.id}-${claimedNow}`,
          kind: "claim",
          text: `claimed ${fromUnits(BigInt(l.claimed_amount), cheap.decimals, 0)} ${cheap.symbol} from a lock`,
          amount: `${fromUnits(BigInt(l.claimed_amount), cheap.decimals, 0)} ${cheap.symbol}`,
        });
      }
      if (!before.reward && l.reward_claimed) {
        out.push({ ...base, ...live, id: `reward-${l.id}`, kind: "claim", text: `claimed a Challenge reward` });
      }
    }

    // Challenges: sponsor money in, and finalize.
    for (const c of cheap.challenges) {
      const before = prev.challenges.get(c.id);
      if (!before) continue;
      const sponsor = BigInt(c.sponsor_total);
      if (sponsor > before.sponsor) {
        const delta = sponsor - before.sponsor;
        out.push({
          id: `sponsor-${c.id}-${sponsor}`,
          kind: "sponsor",
          account: null,
          text: `${fromUnits(delta, cheap.decimals, 0)} ${cheap.symbol} sponsored into ${c.title}`,
          href: `/app/challenges/${c.id}`,
          at: null,
          live: true,
          demo: false,
          communityId: communityOf(cheap.communities, c.id),
          amount: `${fromUnits(delta, cheap.decimals, 0)} ${cheap.symbol}`,
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
          communityId: communityOf(cheap.communities, c.id),
        });
      }
    }

    // Communities: milestones crossed and rank moves.
    for (const c of cheap.communities) {
      const was = prev.committed.get(c.id);
      const now = next.committed.get(c.id) ?? 0n;
      if (was === undefined) continue;
      if (now > was) {
        const unit = 10n ** BigInt(cheap.decimals);
        for (const m of c.milestones) {
          const target = BigInt(Math.round(Number(m))) * unit;
          if (was < target && now >= target) {
            out.push({
              id: `ms-${c.id}-${m}`,
              kind: "milestone",
              account: null,
              text: `${c.name} passed ${fromUnits(target, cheap.decimals, 0)} ${cheap.symbol} committed`,
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
    for (const p of posts) out.push({ ...postEvent(p, cheap.communities), live: true });
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
        communityId: target ? (target.community_id ?? communityOf(cheap.communities, target.challenge_id)) : null,
      });
    }

    engine.snap = next;
    if (out.length) emit(out);
  } finally {
    engine.running = false;
  }
}

/**
 * Polls every 20 seconds and reports what changed since the previous poll.
 * The first poll only establishes a baseline, so nothing already on chain is
 * announced as if it had just happened.
 */
export function useLiveActivity(opts: { communityId?: string } = {}): { events: ActivityEvent[]; latest: ActivityEvent | null } {
  const { communityId } = opts;
  const [, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    engine.listeners.add(listener);
    if (engine.timer === null) {
      void pollOnce();
      engine.timer = window.setInterval(() => void pollOnce(), POLL_MS);
    }
    return () => {
      engine.listeners.delete(listener);
      if (!engine.listeners.size && engine.timer !== null) {
        window.clearInterval(engine.timer);
        engine.timer = null;
      }
    };
  }, []);

  const events = useMemo(
    () => (communityId ? engine.events.filter((e) => e.communityId === communityId) : engine.events),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communityId, engine.events],
  );
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
      let c: Cheap;
      try {
        c = await readCheap();
      } catch {
        return;
      }
      if (cancelled || !c.communities.length) return;
      const now: Record<string, number> = {};
      for (const [id, rank] of rankOf(c.communities, c.challenges)) now[id] = rank;

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
