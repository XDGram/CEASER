import { useEffect, useState } from "react";
import { providers } from "near-api-js";
import { CONFIG } from "../config";
import { fromUnits, view } from "./near";

/**
 * What an account backs CEASER with, in NEAR, and the tier that follows.
 *
 * Two different NEAR numbers matter and they must not be confused:
 *  - backing  = held + staked. It gates what you can do in this app, and the
 *               app alone: the vault never sees it.
 *  - staked   = the balance in the staking pools (the real validator pool plus
 *               the testnet demo pool). The vault reads only the lock's own
 *               pool, and only to multiply a Challenge reward.
 */

export const YOCTO = 10n ** 24n;
/** Creating a community needs this much backing. */
export const COMMUNITY_REQUIREMENT = 5n * YOCTO;
/** Shown wherever a gate is enforced here rather than by a contract. */
export const GATE_NOTE = "Checked in the app from on-chain balances.";

export interface NearBacking {
  held: bigint;
  staked: bigint;
  total: bigint;
}

export interface Tier {
  name: "Visitor" | "Holder" | "Backer" | "Patron" | "Whale";
  /** Minimum backing in whole NEAR. */
  min: number;
  /** What this tier opens up, in the app. */
  unlocks: string;
}

export const TIERS: Tier[] = [
  { name: "Visitor", min: 0, unlocks: "Read everything, lock tokens, claim and exit" },
  { name: "Holder", min: 1, unlocks: "Post on the Floor, start small campaigns, create a community" },
  { name: "Backer", min: 10, unlocks: "Larger campaigns" },
  { name: "Patron", min: 100, unlocks: "Post community announcements" },
  { name: "Whale", min: 1000, unlocks: "Everything, including the largest campaigns" },
];

/** Powers and the backing each one needs, for the explainer. */
export const POWERS: { label: string; needs: string; note?: string }[] = [
  { label: "Lock, claim and exit", needs: "No NEAR needed" },
  { label: "Post on the Floor", needs: "1 Ⓝ" },
  { label: "Start a campaign", needs: "2 Ⓝ", note: "plus 1 Ⓝ per 1,000,000 tokens of threshold, up to 50 Ⓝ" },
  { label: "Create a community", needs: "5 Ⓝ" },
  { label: "Post an announcement", needs: "25 Ⓝ" },
  { label: "Reward boost", needs: "Staked NEAR only", note: "read by the vault from the whitelisted pool, not from your wallet balance" },
];

export function tierOf(total: bigint): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (total >= BigInt(x.min) * YOCTO) t = x;
  return t;
}

/** The tier above this one, or null at the top. */
export function nextTier(total: bigint): Tier | null {
  return TIERS.find((x) => total < BigInt(x.min) * YOCTO) ?? null;
}

/**
 * Backing needed to start a campaign: 2 NEAR plus 1 NEAR for every 1,000,000
 * tokens of threshold, never more than 50 NEAR.
 */
export function campaignRequirement(thresholdWholeTokens: number): bigint {
  const t = Number.isFinite(thresholdWholeTokens) && thresholdWholeTokens > 0 ? BigInt(Math.round(thresholdWholeTokens)) : 0n;
  const req = 2n * YOCTO + (t * YOCTO) / 1_000_000n;
  return req > 50n * YOCTO ? 50n * YOCTO : req;
}

/** NEAR with at most `dp` decimals and no trailing zeros. */
export function formatNear(yocto: bigint, dp = 2): string {
  return fromUnits(yocto, 24, dp);
}

// ---------- reads ----------

// Its own provider: `view` in lib/near only makes call_function queries, and a
// held balance needs view_account. Same failover list as every other read.
const provider = new providers.FailoverRpcProvider(
  CONFIG.rpcUrls.map((url) => new providers.JsonRpcProvider({ url }, { retries: 1, backoff: 1.5, wait: 300 })),
);

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<NearBacking> }>();

async function readBacking(account: string): Promise<NearBacking> {
  const [held, staked] = await Promise.all([
    (async () => {
      try {
        const r = (await provider.query({ request_type: "view_account", finality: "optimistic", account_id: account })) as unknown as { amount: string; locked: string };
        // What the account can actually spend: the rest is locked for storage.
        const avail = BigInt(r.amount) - BigInt(r.locked);
        return avail > 0n ? avail : 0n;
      } catch {
        return 0n;
      }
    })(),
    // Real validator pool plus the testnet demo pool that seeded accounts use.
    Promise.all(
      [CONFIG.contracts.validator_pool, CONFIG.contracts.staking_pool].map((pool) =>
        view<string>(pool, "get_account_staked_balance", { account_id: account })
          .then((v) => BigInt(v))
          .catch(() => 0n),
      ),
    ).then(([a, b]) => a + b),
  ]);
  return { held, staked, total: held + staked };
}

/** Held and staked NEAR for one account, cached for 30 seconds. */
export function nearBacking(account: string): Promise<NearBacking> {
  const hit = cache.get(account);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = readBacking(account).catch((e) => {
    cache.delete(account);
    throw e;
  });
  cache.set(account, { at: Date.now(), value });
  return value;
}

export const ZERO_BACKING: NearBacking = { held: 0n, staked: 0n, total: 0n };

export function useNearBacking(account: string | null): { backing: NearBacking | null; loading: boolean; reload: () => void } {
  const [backing, setBacking] = useState<NearBacking | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!account) {
      setBacking(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    nearBacking(account)
      .then((b) => {
        if (!cancelled) setBacking(b);
      })
      .catch(() => {
        if (!cancelled) setBacking(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, nonce]);

  return { backing, loading, reload: () => setNonce((n) => n + 1) };
}
