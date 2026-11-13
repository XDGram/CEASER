export type Strategy =
  | { time: { end_ts: number } }
  | { roi_ladder: { tranches: { fraction_bps: number; multiplier_bps: number }[] } }
  | { collective_threshold: { challenge_id: number } }
  | { any: Strategy[] };

export type Condition =
  | { price_above: { multiplier_bps: number } }
  | { time_after: { ts: number } }
  | { challenge_finalized: { challenge_id: number } };

export type PenaltySink = { challenge: number } | { account: string };

export interface Tranche {
  fraction_bps: number;
  conditions: Condition[];
  armed_at_ts: number | null;
  ripe: boolean;
  claimed: boolean;
}

export interface Lock {
  id: number;
  owner: string;
  token: string;
  amount: string;
  claimed_amount: string;
  start_ts: number;
  max_duration_sec: number;
  penalty_bps: number;
  penalty_sink: PenaltySink;
  reference_price: string | null;
  strategy: Strategy;
  tranches: Tranche[];
  challenge_id: number | null;
  staking_pool: string | null;
  conviction: string;
  reward_claimed: boolean;
  status: "active" | "exited" | "closed";
}

export interface Challenge {
  id: number;
  title: string;
  creator: string;
  token: string;
  threshold_amount: string;
  deadline_ts: number;
  min_lock_duration_sec: number;
  sponsor_token: string;
  boost_reserve_bps: number;
  sponsor_total: string;
  penalty_total: string;
  total_locked: string;
  total_conviction: string;
  participant_count: number;
  state: "active" | "succeeded" | "failed";
  base_pool: string;
  reserve_remaining: string;
}

export interface VaultConfig {
  max_penalty_bps: number;
  twap_window_sec: number;
  cooldown_sec: number;
  min_oracle_liquidity: string;
  min_tranche_lock_sec: number;
  max_lock_duration_sec: number;
}

export interface TokenMeta {
  symbol: string;
  decimals: number;
  name: string;
}

export type BoostTier = [string, number];
