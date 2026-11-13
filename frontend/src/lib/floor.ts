import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";
import { fetchAllLocks, fromUnits, view } from "./near";
import type { Challenge, Lock } from "./types";

// The Floor: community posts stored in Supabase, merged with "receipts"
// derived from vault state. Posting is tied to the connected wallet account
// (author = accountId). There is no cryptographic signing yet; when it lands,
// createPost gains a signature field and RLS verifies it, with no UI change.

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

export type PostKind = "thesis" | "confession" | "pledge" | "receipt";

export interface FloorPost {
  id: string;
  created_at: string;
  author: string;
  kind: PostKind;
  body: string;
  challenge_id: number | null;
  lock_id: number | null;
  parent_id: string | null;
  meta: Record<string, unknown>;
  diamonds: number;
  copes: number;
  myReaction: "diamond" | "cope" | null;
  replies: FloorPost[];
  /** True for receipts derived from vault state; these cannot be reacted to. */
  derived: boolean;
}

export interface FeedFilter {
  kind?: PostKind;
  challengeId?: number;
}

interface PostRow {
  id: string;
  created_at: string;
  author: string;
  kind: PostKind;
  body: string;
  challenge_id: number | null;
  lock_id: number | null;
  parent_id: string | null;
  meta: Record<string, unknown> | null;
}

interface StatRow {
  id: string;
  diamonds: number;
  copes: number;
  replies: number;
}

const sym = () => "CSTEST";
const amt = (units: string) => fromUnits(units, 18, 0);

/**
 * Receipts derived from vault state at load time, not stored anywhere: every
 * lock becomes a "pledge" and every exited lock a paper-hands "receipt".
 * A later step is to store receipts when a poller sees the vault's
 * lock_created / early_exit events, so they get stable ids, replies and
 * reactions; until then they are recomputed on each load and are read-only.
 */
export function deriveReceipts(locks: Lock[], challenges: Challenge[], skipLockIds: Set<number>): FloorPost[] {
  const out: FloorPost[] = [];
  const title = (id: number | null) => {
    const c = id ? challenges.find((x) => x.id === id) : null;
    return c ? `"${c.title}"` : id ? `Challenge #${id}` : null;
  };
  for (const l of locks) {
    const base = { author: l.owner, parent_id: null, meta: {}, diamonds: 0, copes: 0, myReaction: null, replies: [], derived: true };
    if (!skipLockIds.has(l.id)) {
      const where = l.challenge_id ? `joined ${title(l.challenge_id)} with ${amt(l.amount)} ${sym()}` : `locked ${amt(l.amount)} ${sym()} behind a ladder`;
      out.push({ ...base, id: `derived-pledge-${l.id}`, created_at: new Date(l.start_ts * 1000).toISOString(), kind: "pledge", body: where, challenge_id: l.challenge_id, lock_id: l.id });
    }
    if (l.status === "exited") {
      const penalty = BigInt(l.amount) - BigInt(l.claimed_amount);
      const sink = "challenge" in l.penalty_sink ? ` into ${title(l.penalty_sink.challenge) ?? "the pool"}` : "";
      out.push({
        ...base,
        id: `derived-exit-${l.id}`,
        // The chain keeps no exit timestamp on the lock, so the receipt sits
        // just after its pledge; the poller step above fixes this too.
        created_at: new Date(l.start_ts * 1000 + 60_000).toISOString(),
        kind: "receipt",
        body: `paper hands: left lock #${l.id} early and paid a ${amt(penalty.toString())} ${sym()} penalty${sink}`,
        challenge_id: "challenge" in l.penalty_sink ? l.penalty_sink.challenge : l.challenge_id,
        lock_id: l.id,
      });
    }
  }
  return out;
}

export interface FeedData {
  posts: FloorPost[];
  names: Record<string, string>;
  locks: Lock[];
}

export async function loadFeed(filter: FeedFilter, viewer: string | null, challenges: Challenge[], limit = 50): Promise<FeedData> {
  let q = supabase.from("posts").select("*").is("parent_id", null).order("created_at", { ascending: false }).limit(limit);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.challengeId !== undefined) q = q.eq("challenge_id", filter.challengeId);

  const lockCount = await view<number>(CONFIG.contracts.vault, "get_lock_count").catch(() => 0);
  const [{ data: top, error }, { data: profileRows }, locks] = await Promise.all([
    q,
    supabase.from("profiles").select("account, display_name"),
    fetchAllLocks(lockCount).catch(() => [] as Lock[]),
  ]);
  if (error) throw new Error(error.message);
  const topRows = (top ?? []) as PostRow[];

  const ids = topRows.map((p) => p.id);
  const [{ data: replyRows }, { data: statRows }, { data: mine }] = await Promise.all([
    ids.length ? supabase.from("posts").select("*").in("parent_id", ids).order("created_at", { ascending: true }) : Promise.resolve({ data: [] as PostRow[] }),
    supabase.from("post_stats").select("*"),
    viewer ? supabase.from("reactions").select("post_id, kind").eq("account", viewer) : Promise.resolve({ data: [] as { post_id: string; kind: string }[] }),
  ]);

  const decorate = decorator(statRows, mine);

  const byParent = new Map<string, FloorPost[]>();
  for (const r of (replyRows ?? []) as PostRow[]) {
    const d = decorate(r);
    byParent.set(r.parent_id as string, [...(byParent.get(r.parent_id as string) ?? []), d]);
  }
  const posts = topRows.map((r) => ({ ...decorate(r), replies: byParent.get(r.id) ?? [] }));

  // Stored pledges created by the lock flow carry a lock_id; the derived
  // pledge for that lock would duplicate them.
  const storedLockIds = new Set((posts.filter((p) => p.kind === "pledge" && p.lock_id !== null).map((p) => p.lock_id) as number[]) ?? []);
  let derived = deriveReceipts(locks, challenges, storedLockIds);
  if (filter.kind) derived = derived.filter((d) => d.kind === filter.kind);
  if (filter.challengeId !== undefined) derived = derived.filter((d) => d.challenge_id === filter.challengeId);

  const merged = [...posts, ...derived].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
  const names = Object.fromEntries(((profileRows ?? []) as { account: string; display_name: string }[]).map((p) => [p.account, p.display_name]));
  return { posts: merged, names, locks };
}

type ReactionRow = { post_id: string; kind: "diamond" | "cope" };

function decorator(statRows: unknown, mine: unknown): (r: PostRow) => FloorPost {
  const stats = new Map<string, StatRow>(((statRows ?? []) as StatRow[]).map((s) => [s.id, s]));
  const myMap = new Map<string, "diamond" | "cope">(((mine ?? []) as ReactionRow[]).map((r) => [r.post_id, r.kind]));
  return (r: PostRow): FloorPost => ({
    ...r,
    meta: r.meta ?? {},
    diamonds: stats.get(r.id)?.diamonds ?? 0,
    copes: stats.get(r.id)?.copes ?? 0,
    myReaction: myMap.get(r.id) ?? null,
    replies: [],
    derived: false,
  });
}

/** Display names for every account that set one. */
export async function loadNames(): Promise<Record<string, string>> {
  const { data } = await supabase.from("profiles").select("account, display_name");
  return Object.fromEntries(((data ?? []) as { account: string; display_name: string }[]).map((p) => [p.account, p.display_name]));
}

/** ISO time of the account's first Floor post, or null. */
export async function firstPostAt(account: string): Promise<string | null> {
  const { data } = await supabase.from("posts").select("created_at").eq("author", account).order("created_at", { ascending: true }).limit(1);
  return (data?.[0] as { created_at: string } | undefined)?.created_at ?? null;
}

/**
 * Every stored post by one account, newest first: top-level posts with their
 * replies attached, and the account's own replies to other posts as cards.
 */
export async function loadAuthorPosts(author: string, viewer: string | null): Promise<FloorPost[]> {
  const [{ data: rows, error }, { data: statRows }, { data: mine }] = await Promise.all([
    supabase.from("posts").select("*").eq("author", author).order("created_at", { ascending: false }).limit(100),
    supabase.from("post_stats").select("*"),
    viewer ? supabase.from("reactions").select("post_id, kind").eq("account", viewer) : Promise.resolve({ data: [] as ReactionRow[] }),
  ]);
  if (error) throw new Error(error.message);
  const own = (rows ?? []) as PostRow[];
  const topIds = own.filter((r) => r.parent_id === null).map((r) => r.id);
  const { data: replyRows } = topIds.length
    ? await supabase.from("posts").select("*").in("parent_id", topIds).order("created_at", { ascending: true })
    : { data: [] as PostRow[] };
  const decorate = decorator(statRows, mine);
  const byParent = new Map<string, FloorPost[]>();
  for (const r of (replyRows ?? []) as PostRow[]) {
    const d = decorate(r);
    byParent.set(r.parent_id as string, [...(byParent.get(r.parent_id as string) ?? []), d]);
  }
  return own.map((r) => ({ ...decorate(r), replies: r.parent_id === null ? (byParent.get(r.id) ?? []) : [] }));
}

export async function createPost(p: { author: string; kind: PostKind; body: string; challenge_id?: number | null; lock_id?: number | null; parent_id?: string | null }): Promise<void> {
  const body = p.body.trim();
  if (!body) throw new Error("Write something first");
  if (body.length > 600) throw new Error("At most 600 characters");
  const { error } = await supabase.from("posts").insert({ author: p.author, kind: p.kind, body, challenge_id: p.challenge_id ?? null, lock_id: p.lock_id ?? null, parent_id: p.parent_id ?? null });
  if (error) throw new Error(error.message);
}

/** Adds the reaction, switches it, or removes it when `kind` is already set. */
export async function toggleReaction(postId: string, account: string, kind: "diamond" | "cope", current: "diamond" | "cope" | null): Promise<"diamond" | "cope" | null> {
  if (current) {
    const { error } = await supabase.from("reactions").delete().eq("post_id", postId).eq("account", account).eq("kind", current);
    if (error) throw new Error(error.message);
  }
  if (current === kind) return null;
  const { error } = await supabase.from("reactions").insert({ post_id: postId, account, kind });
  if (error) throw new Error(error.message);
  return kind;
}

export async function setDisplayName(account: string, displayName: string): Promise<void> {
  const name = displayName.trim().slice(0, 32);
  const { error } = await supabase.from("profiles").upsert({ account, display_name: name }, { onConflict: "account" });
  if (error) throw new Error(error.message);
}

// ---------- conviction ----------

export interface ConvictionInfo {
  lockedNow: bigint;
  longestSec: number;
}

/** Per-account conviction read from vault locks: what is locked right now and the longest-running active lock. */
export function convictionByOwner(locks: Lock[]): Map<string, ConvictionInfo> {
  const now = Math.floor(Date.now() / 1000);
  const map = new Map<string, ConvictionInfo>();
  for (const l of locks) {
    if (l.status !== "active") continue;
    const cur = map.get(l.owner) ?? { lockedNow: 0n, longestSec: 0 };
    cur.lockedNow += BigInt(l.amount) - BigInt(l.claimed_amount);
    cur.longestSec = Math.max(cur.longestSec, now - l.start_ts);
    map.set(l.owner, cur);
  }
  return map;
}

/** Leaderboard weight: sum over active locks of amount x time locked so far. */
export function convictionWeight(locks: Lock[]): Map<string, bigint> {
  const now = Math.floor(Date.now() / 1000);
  const map = new Map<string, bigint>();
  for (const l of locks) {
    if (l.status !== "active") continue;
    const w = (BigInt(l.amount) - BigInt(l.claimed_amount)) * BigInt(Math.max(1, now - l.start_ts));
    map.set(l.owner, (map.get(l.owner) ?? 0n) + w);
  }
  return map;
}
