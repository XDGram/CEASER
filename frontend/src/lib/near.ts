import { providers } from "near-api-js";
import { CONFIG } from "../config";
import type { TokenMeta } from "./types";

const provider = new providers.JsonRpcProvider({ url: CONFIG.nodeUrl });

export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = (await provider.query({
    request_type: "call_function",
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    finality: "optimistic",
  })) as unknown as { result: number[] };
  const txt = new TextDecoder().decode(new Uint8Array(res.result));
  return (txt.length ? JSON.parse(txt) : null) as T;
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

export function countdown(ts: number): string {
  const d = ts - nowTs();
  if (d <= 0) return "ended";
  return `${fmtDur(d)} left`;
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
