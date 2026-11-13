import { providers } from "near-api-js";
import { CONFIG } from "../config";
import type { Lock, TokenMeta } from "./types";

// Public RPCs rate-limit browsers, so every read goes through a failover
// provider that rotates to the next endpoint when one errors or returns 429.
const provider = new providers.FailoverRpcProvider(
  CONFIG.rpcUrls.map((url) => new providers.JsonRpcProvider({ url }, { retries: 1, backoff: 1.5, wait: 300 })),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pages like the Challenge detail fan out to dozens of view calls at once.
// A small gate keeps the burst under public-RPC rate limits.
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const waiters: (() => void)[] = [];
async function gated<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const query = async () => {
    const res = (await provider.query({
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
      finality: "optimistic",
    })) as unknown as { result: number[] };
    const txt = new TextDecoder().decode(new Uint8Array(res.result));
    return (txt.length ? JSON.parse(txt) : null) as T;
  };
  return gated(async () => {
    try {
      return await query();
    } catch (e) {
      // One retry after a short backoff; the failover has moved to another endpoint by now.
      if (isContractError(e)) throw e;
      await sleep(400 + Math.random() * 400);
      return query();
    }
  });
}

/** A panic or missing method inside the contract will not get better on retry. */
function isContractError(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /Smart contract panicked|MethodNotFound|does not exist|CodeDoesNotExist/.test(m);
}

const metaCache = new Map<string, Promise<TokenMeta>>();
export function tokenMeta(token: string): Promise<TokenMeta> {
  let p = metaCache.get(token);
  if (!p) {
    p = view<{ symbol: string; decimals: number; name: string }>(token, "ft_metadata").then((m) => ({
      symbol: m.symbol,
      decimals: m.decimals,
      name: m.name,
    }));
    metaCache.set(token, p);
  }
  return p;
}

export function decodeResult<T>(outcome: unknown): T | null {
  try {
    const v = (outcome as { status?: { SuccessValue?: string } })?.status?.SuccessValue;
    if (!v) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v), (c) => c.charCodeAt(0)))) as T;
  } catch {
    return null;
  }
}

export function txHash(outcome: unknown): string | null {
  return (outcome as { transaction?: { hash?: string } })?.transaction?.hash ?? null;
}

// ---------- numbers ----------

export function toUnits(value: string, decimals: number): string {
  const s = value.trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") throw new Error("Enter a valid amount");
  const [int, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  const units = BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error("Amount must be positive");
  return units.toString();
}

export function fromUnits(units: string | bigint, decimals: number, dp = 2): string {
  const n = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const int = n / base;
  const frac = n % base;
  const intStr = int.toLocaleString("en-US");
  if (dp === 0) return intStr;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, dp).replace(/0+$/, "");
  return fracStr ? `${intStr}.${fracStr}` : intStr;
}

export function compact(units: string | bigint, decimals: number): string {
  const n = Number(BigInt(units) / 10n ** BigInt(Math.max(decimals - 2, 0))) / (decimals >= 2 ? 100 : 1);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const pct = (bps: number) => (bps / 100).toFixed(bps % 100 ? 2 : 0) + "%";
export const mult = (bps: number) => (bps / 10000).toFixed(2) + "x";
export const nowTs = () => Math.floor(Date.now() / 1000);

export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)}h`;
  return `${(sec / 86400).toFixed(sec % 86400 ? 1 : 0)}d`;
}

export function timeAgo(iso: string): string {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function countdown(ts: number): string {
  const d = ts - nowTs();
  if (d <= 0) return "ended";
  return `${fmtDur(d)} left`;
}

/** "3d 4h" style countdown for display numbers. */
export function countdownParts(ts: number): string {
  const d = ts - nowTs();
  if (d <= 0) return "0h 0m";
  const days = Math.floor(d / 86400);
  const hours = Math.floor((d % 86400) / 3600);
  const mins = Math.floor((d % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Share of `part` in `total` as a percentage string with one decimal, BigInt-safe. */
export function sharePct(part: string | bigint, total: string | bigint): string {
  const t = BigInt(total);
  if (t === 0n) return "0%";
  const bps = (BigInt(part) * 1000n) / t;
  return `${(Number(bps) / 10).toFixed(1)}%`;
}

export function localDatetimeValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function datetimeToTs(v: string): number {
  if (!v) throw new Error("Pick a date");
  return Math.floor(new Date(v).getTime() / 1000);
}

export function short(id: string, n = 18): string {
  return id.length > n ? id.slice(0, n - 1) + "…" : id;
}

// ---------- lock enumeration ----------
// The vault has no per-Challenge lock index, so pages that need one read
// get_lock for ids 1..get_lock_count. Finished locks (closed or exited) are
// immutable and cached forever; active ones are refetched on each call.
const lockCache = new Map<number, Lock>();

export async function fetchAllLocks(count: number): Promise<Lock[]> {
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const out = await Promise.all(
    ids.map(async (id) => {
      const hit = lockCache.get(id);
      if (hit && hit.status !== "active") return hit;
      const lock = await view<Lock | null>(CONFIG.contracts.vault, "get_lock", { lock_id: id }).catch(() => null);
      if (lock) lockCache.set(id, lock);
      return lock ?? hit ?? null;
    }),
  );
  return out.filter((l): l is Lock => l !== null);
}

const stakeCache = new Map<string, Promise<bigint>>();
/** Staked yoctoNEAR of `owner` in `pool`, cached per session. */
export function stakedBalance(pool: string, owner: string): Promise<bigint> {
  const key = `${pool}:${owner}`;
  let p = stakeCache.get(key);
  if (!p) {
    p = view<string>(pool, "get_account_staked_balance", { account_id: owner })
      .then((v) => BigInt(v))
      .catch(() => 0n);
    stakeCache.set(key, p);
  }
  return p;
}
