import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONFIG } from "../config";
import { tokenMeta, view } from "./near";
import type { BoostTier, Challenge, Lock, TokenMeta, VaultConfig } from "./types";
import { useWallet } from "./wallet";

const C = CONFIG.contracts;

const FALLBACK_TIERS: BoostTier[] = [
  ["10000000000000000000000000", 11000],
  ["100000000000000000000000000", 12500],
  ["1000000000000000000000000000", 15000],
  ["10000000000000000000000000000", 20000],
];

interface ProtocolCtx {
  reachable: boolean | null;
  config: VaultConfig | null;
  pools: string[];
  tiers: BoostTier[];
  challenges: Challenge[];
  lockCount: number;
  metas: Record<string, TokenMeta>;
  meta: (token: string) => TokenMeta;
  locks: Lock[];
  balance: bigint | null;
  staked: bigint | null;
  /** Pool new locks use for the boost (the real validator pool once whitelisted). */
  boostPool: string;
  boostBps: number;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<ProtocolCtx | null>(null);
const DEFAULT_META: TokenMeta = { symbol: "TOKEN", decimals: 18, name: "Token" };

/** The pool new locks should use for the NEAR boost: the real validator pool when whitelisted. */
export function boostPoolOf(pools: string[]): string {
  return pools.includes(CONFIG.contracts.validator_pool) ? CONFIG.contracts.validator_pool : CONFIG.contracts.staking_pool;
}

export function boostFor(staked: bigint, tiers: BoostTier[]): number {
  let bps = 10000;
  for (const [min, b] of tiers) if (staked >= BigInt(min)) bps = b;
  return bps;
}

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const [reachable, setReachable] = useState<boolean | null>(null);
  // Only flag unreachable after two consecutive full refresh failures, and keep
  // showing the last good data meanwhile; a single flaky read is not an outage.
  const failStreak = useRef(0);
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [pools, setPools] = useState<string[]>([]);
  const [tiers, setTiers] = useState<BoostTier[]>(FALLBACK_TIERS);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [lockCount, setLockCount] = useState(0);
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [locks, setLocks] = useState<Lock[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  // Staked NEAR in the real validator pool and in the legacy demo pool.
  const [stakedReal, setStakedReal] = useState<bigint | null>(null);
  const [stakedMock, setStakedMock] = useState<bigint | null>(null);

  const loadMetas = useCallback(async (tokens: string[]) => {
    const unique = [...new Set(tokens)];
    const entries = await Promise.all(unique.map(async (t) => [t, await tokenMeta(t).catch(() => DEFAULT_META)] as const));
    setMetas((m) => ({ ...m, ...Object.fromEntries(entries) }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [cfg, p, t, count, list] = await Promise.all([
        view<VaultConfig>(C.vault, "get_config"),
        view<string[]>(C.vault, "get_staking_pools"),
        view<BoostTier[]>(C.vault, "get_boost_tiers"),
        view<number>(C.vault, "get_lock_count"),
        view<Challenge[]>(C.vault, "get_challenges", { from_index: 0, limit: 50 }),
      ]);
      setConfig(cfg);
      setPools(p);
      if (t?.length) setTiers(t);
      setLockCount(count);
      setChallenges(list);
      failStreak.current = 0;
      setReachable(true);
      await loadMetas([C.token, ...list.flatMap((c) => [c.token, c.sponsor_token])]);
    } catch {
      failStreak.current += 1;
      if (failStreak.current >= 2) setReachable(false);
    }
  }, [loadMetas]);

  const refreshUser = useCallback(async () => {
    if (!accountId) {
      setLocks([]);
      setBalance(null);
      setStakedReal(null);
      setStakedMock(null);
      return;
    }
    const [l, b, s, r] = await Promise.all([
      view<Lock[]>(C.vault, "get_locks_by_owner", { account_id: accountId, from_index: 0, limit: 50 }).catch(() => []),
      view<string>(C.token, "ft_balance_of", { account_id: accountId }).catch(() => "0"),
      view<string>(C.staking_pool, "get_account_staked_balance", { account_id: accountId }).catch(() => "0"),
      view<string>(C.validator_pool, "get_account_staked_balance", { account_id: accountId }).catch(() => "0"),
    ]);
    setLocks(l);
    setBalance(BigInt(b));
    setStakedMock(BigInt(s));
    setStakedReal(BigInt(r));
    await loadMetas(l.map((x) => x.token));
  }, [accountId, loadMetas]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const meta = useCallback((token: string) => metas[token] ?? DEFAULT_META, [metas]);
  // New locks use the real validator pool once the vault whitelists it; until then the demo pool.
  const boostPool = boostPoolOf(pools);
  const staked = boostPool === C.validator_pool ? stakedReal : stakedMock;
  const boostBps = boostFor(staked ?? 0n, tiers);

  const value = useMemo<ProtocolCtx>(
    () => ({ reachable, config, pools, tiers, challenges, lockCount, metas, meta, locks, balance, staked, boostPool, boostBps, refresh, refreshUser }),
    [reachable, config, pools, tiers, challenges, lockCount, metas, meta, locks, balance, staked, boostPool, boostBps, refresh, refreshUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


/**
 * Estimated Challenge reward for one lock, per INTERFACE.md's reward formula.
 * Finalized: base_pool share. Active: (sponsors + penalties) less the boost
 * reserve, split by conviction. The boost multiplies the base and is capped by
 * the reserve (reserve_remaining once finalized, the full reserve before).
 */
export function estimateReward(c: Challenge, conviction: bigint, boostBps: number): { base: bigint; boost: bigint; total: bigint } {
  const totalConv = BigInt(c.total_conviction);
  if (conviction <= 0n || totalConv === 0n) return { base: 0n, boost: 0n, total: 0n };
  const finalized = c.state !== "active";
  let basePool: bigint;
  let reserve: bigint;
  if (finalized) {
    basePool = BigInt(c.base_pool);
    reserve = BigInt(c.reserve_remaining);
  } else {
    const distributable = BigInt(c.sponsor_total) + BigInt(c.penalty_total);
    reserve = (distributable * BigInt(c.boost_reserve_bps)) / 10000n;
    basePool = distributable - reserve;
  }
  const base = (basePool * conviction) / totalConv;
  let boost = (base * BigInt(boostBps - 10000)) / 10000n;
  if (boost > reserve) boost = reserve;
  return { base, boost, total: base + boost };
}

export function useProtocol(): ProtocolCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProtocol outside ProtocolProvider");
  return v;
}
