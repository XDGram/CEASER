import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  boostBps: number;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<ProtocolCtx | null>(null);
const DEFAULT_META: TokenMeta = { symbol: "TOKEN", decimals: 18, name: "Token" };

export function boostFor(staked: bigint, tiers: BoostTier[]): number {
  let bps = 10000;
  for (const [min, b] of tiers) if (staked >= BigInt(min)) bps = b;
  return bps;
}

export function ProtocolProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [pools, setPools] = useState<string[]>([]);
  const [tiers, setTiers] = useState<BoostTier[]>(FALLBACK_TIERS);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [lockCount, setLockCount] = useState(0);
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [locks, setLocks] = useState<Lock[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [staked, setStaked] = useState<bigint | null>(null);

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
      setReachable(true);
      await loadMetas([C.token, ...list.flatMap((c) => [c.token, c.sponsor_token])]);
    } catch {
      setReachable(false);
    }
  }, [loadMetas]);

  const refreshUser = useCallback(async () => {
    if (!accountId) {
      setLocks([]);
      setBalance(null);
      setStaked(null);
      return;
    }
    const [l, b, s] = await Promise.all([
      view<Lock[]>(C.vault, "get_locks_by_owner", { account_id: accountId, from_index: 0, limit: 50 }).catch(() => []),
      view<string>(C.token, "ft_balance_of", { account_id: accountId }).catch(() => "0"),
      view<string>(C.staking_pool, "get_account_staked_balance", { account_id: accountId }).catch(() => "0"),
    ]);
    setLocks(l);
    setBalance(BigInt(b));
    setStaked(BigInt(s));
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
  const boostBps = boostFor(staked ?? 0n, tiers);

  const value = useMemo<ProtocolCtx>(
    () => ({ reachable, config, pools, tiers, challenges, lockCount, metas, meta, locks, balance, staked, boostBps, refresh, refreshUser }),
    [reachable, config, pools, tiers, challenges, lockCount, metas, meta, locks, balance, staked, boostBps, refresh, refreshUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProtocol(): ProtocolCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProtocol outside ProtocolProvider");
  return v;
}
