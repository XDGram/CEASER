import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";
import { fetchAllLocks, fromUnits, view } from "./near";
import type { Challenge, Lock } from "./types";

// The Floor: community posts stored in Supabase, merged with "receipts"
// derived from vault state. Posting is tied to the connected wallet account
// (author = accountId). There is no cryptographic signing yet; when it lands,
// createPost gains a signature field and RLS verifies it, with no UI change.

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

export type PostKind = "thesis" | "confession" | "pledge" | "receipt" | "announcement" | "update";

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
  community_id: string | null;
  /** Hash of the verified 0.01 NEAR posting fee transfer, when one was paid. */
  fee_tx: string | null;
  fee_yocto: string | null;
  /**
   * An announcement whose author leads its community: the community creator or
   * the creator of one of its campaigns. Checked here in the app, because the
   * feed database is open on this testnet demo.
   */
  leader: boolean;
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
  /** Posts tagged with the community, or with any of its campaigns, in one query. */
  community?: { id: string; challengeIds: number[] };
  /** Mix in receipts derived from vault state. Default true. */
  derived?: boolean;
}

/** True for seeded demonstration posts, which the UI labels "Demo". */
export const isDemo = (p: { meta: Record<string, unknown> }) => p.meta?.demo === true;

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
  community_id?: string | null;
  fee_tx?: string | null;
  fee_yocto?: string | number | null;
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
    const base = { author: l.owner, parent_id: null, meta: {}, community_id: null, fee_tx: null, fee_yocto: null, leader: false, diamonds: 0, copes: 0, myReaction: null, replies: [], derived: true };
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
  if (filter.community) {
    const ors = [`community_id.eq.${filter.community.id}`];
    const ids = filter.community.challengeIds.filter((n) => Number.isInteger(n));
    if (ids.length) ors.push(`challenge_id.in.(${ids.join(",")})`);
    q = q.or(ors.join(","));
  }

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
  if (filter.community) derived = derived.filter((d) => d.challenge_id !== null && filter.community!.challengeIds.includes(d.challenge_id));
  if (filter.derived === false) derived = [];
  await markLeaders(posts, challenges);

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
    community_id: r.community_id ?? null,
    fee_tx: r.fee_tx ?? null,
    fee_yocto: r.fee_yocto === null || r.fee_yocto === undefined ? null : typeof r.fee_yocto === "number" ? BigInt(Math.trunc(r.fee_yocto)).toString() : r.fee_yocto.split(".")[0],
    leader: false,
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

// ---------- posting fee ----------
//
// Speech costs NEAR: a thesis, confession, update, announcement or reply is
// paid for with a plain 0.01 NEAR transfer to the protocol treasury, and the
// author must hold at least 1 NEAR (25 for an announcement). Pledges, which the
// lock flow writes for you, and reactions stay free.
//
// The fee is verified in the app, against the chain, before the row is
// inserted. The feed database is open on this testnet demo, so a direct
// insert can still skip this check; a server-side verifier is the next step.

const NEAR = 10n ** 24n;
export const POST_FEE_YOCTO = NEAR / 100n;
export const MIN_BALANCE_YOCTO = NEAR;
export const ANNOUNCE_BALANCE_YOCTO = 25n * NEAR;

/** True when this post must carry a verified fee. */
export function needsFee(p: { kind: PostKind; parent_id?: string | null }): boolean {
  return !!p.parent_id || p.kind === "thesis" || p.kind === "confession" || p.kind === "update" || p.kind === "announcement";
}

/** JSON-RPC with the same endpoint failover the rest of the app uses. */
async function rpc<T>(method: string, params: unknown): Promise<T> {
  let last: unknown = null;
  for (const url of CONFIG.rpcUrls) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "ceaser", method, params }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error?.cause?.name ?? j.error?.message ?? "RPC error");
      return j.result as T;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("No RPC endpoint answered");
}

/** Liquid NEAR balance in yocto, from view_account. */
export async function nearBalance(account: string): Promise<bigint> {
  const r = await rpc<{ amount: string }>("query", { request_type: "view_account", account_id: account, finality: "final" });
  return BigInt(r.amount);
}

interface TxResult {
  status: { SuccessValue?: string; Failure?: unknown };
  transaction: { signer_id: string; receiver_id: string; actions: (string | { Transfer?: { deposit: string } })[] };
}

/**
 * Checks a fee transaction on chain: final, successful, signed by the author,
 * sent to the treasury, carrying a Transfer of at least 0.01 NEAR, and not
 * already attached to another post. Returns the amount paid.
 */
export async function verifyFee(hash: string, author: string): Promise<bigint> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash)) throw new Error("That fee transaction id is not valid.");
  const { data: used } = await supabase.from("posts").select("id").eq("fee_tx", hash).limit(1);
  if (used && used.length) throw new Error("That fee transaction already paid for another post.");
  let tx: TxResult;
  try {
    tx = await rpc<TxResult>("tx", { tx_hash: hash, sender_account_id: author, wait_until: "FINAL" });
  } catch {
    throw new Error("The fee transaction was not found on chain for this account.");
  }
  if (!tx.status || tx.status.Failure !== undefined || tx.status.SuccessValue === undefined) throw new Error("The fee transaction did not succeed.");
  if (tx.transaction.signer_id !== author) throw new Error("The fee was paid by a different account.");
  if (tx.transaction.receiver_id !== CONFIG.contracts.treasury) throw new Error("The fee was not sent to the CEASER treasury.");
  const paid = tx.transaction.actions.reduce((a, x) => a + (typeof x === "object" && x.Transfer ? BigInt(x.Transfer.deposit) : 0n), 0n);
  if (paid < POST_FEE_YOCTO) throw new Error("The fee transaction sent less than 0.01 NEAR.");
  return paid;
}

export interface PostDraft {
  author: string;
  kind: PostKind;
  body: string;
  challenge_id?: number | null;
  lock_id?: number | null;
  parent_id?: string | null;
  community_id?: string | null;
}

export async function createPost(p: PostDraft & { fee_tx?: string | null; fee_yocto?: string | null }): Promise<void> {
  const body = p.body.trim();
  if (!body) throw new Error("Write something first");
  if (body.length > 600) throw new Error("At most 600 characters");
  let fee_tx: string | null = null;
  let fee_yocto: string | null = null;
  if (needsFee(p)) {
    if (!p.fee_tx) throw new Error("This post needs its 0.01 NEAR fee.");
    // The amount stored is what the chain says was paid, not what the caller claims.
    fee_yocto = (await verifyFee(p.fee_tx, p.author)).toString();
    fee_tx = p.fee_tx;
  }
  const { error } = await supabase.from("posts").insert({
    author: p.author,
    kind: p.kind,
    body,
    challenge_id: p.challenge_id ?? null,
    lock_id: p.lock_id ?? null,
    parent_id: p.parent_id ?? null,
    community_id: p.community_id ?? null,
    fee_tx,
    fee_yocto,
  });
  if (error) throw new Error(error.code === "23505" ? "That fee transaction already paid for another post." : error.message);
}

/** Sum of verified posting fees on posts in a community's scope, in yocto. */
export async function feesCollected(communityId: string, challengeIds: number[]): Promise<bigint> {
  const ors = [`community_id.eq.${communityId}`];
  const ids = challengeIds.filter((n) => Number.isInteger(n));
  if (ids.length) ors.push(`challenge_id.in.(${ids.join(",")})`);
  // numeric comes back as a JSON number (1e22 prints as "1e+22"), so read it as exact text.
  const { data, error } = await supabase.from("posts").select("fee:fee_yocto::text").not("fee_tx", "is", null).or(ors.join(","));
  if (error) throw new Error(error.message);
  return ((data ?? []) as { fee: string | null }[]).reduce((a, r) => a + (r.fee ? BigInt(r.fee.split(".")[0]) : 0n), 0n);
}

// ---------- pending post across a wallet redirect ----------

const PENDING = "ceaser:pending-post";
export function savePendingPost(d: PostDraft) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(d));
  } catch {
    /* private mode */
  }
}
export function takePendingPost(): PostDraft | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return raw ? (JSON.parse(raw) as PostDraft) : null;
  } catch {
    return null;
  }
}
export function hasPendingPost(): boolean {
  try {
    return sessionStorage.getItem(PENDING) !== null;
  } catch {
    return false;
  }
}

/** Fired after a post lands, so open feeds can refresh at once. */
export const POSTED_EVENT = "ceaser:posted";

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

/**
 * Marks announcements written by a leader of their community. Leaders are the
 * community creator and the creators of its campaigns (vault Challenges). The
 * communities table is read directly here, not through lib/community.ts, which
 * itself imports this module.
 */
async function markLeaders(posts: FloorPost[], challenges: Challenge[]): Promise<void> {
  const ids = [...new Set(posts.filter((p) => p.kind === "announcement" && p.community_id).map((p) => p.community_id as string))];
  if (!ids.length) return;
  const { data } = await supabase.from("communities").select("id,creator,challenge_ids").in("id", ids);
  const leaders = new Map<string, Set<string>>();
  for (const c of (data ?? []) as { id: string; creator: string; challenge_ids: number[] }[]) {
    const set = new Set<string>([c.creator]);
    for (const ch of challenges) if (c.challenge_ids.includes(ch.id)) set.add(ch.creator);
    leaders.set(c.id, set);
  }
  for (const p of posts) if (p.kind === "announcement" && p.community_id) p.leader = leaders.get(p.community_id)?.has(p.author) ?? false;
}
