//! `RefTwapOracle`: a documented, **unimplemented** sketch of the production
//! oracle that would replace `MockOracle` by reading a Ref Finance pool.
//!
//! It is compiled (so the signatures stay honest) but has no `#[near]`
//! bindings and is never deployed. The vault only depends on the two view
//! methods `twap(token, window_sec)` and `liquidity(token)`, which keep the
//! exact same signatures as `MockOracle`.
//!
//! # How it would work
//!
//! Ref Finance (`v2.ref-finance.near`, `ref-finance-101.testnet`) does not
//! keep price accumulators on-chain for its simple pools, so this contract
//! samples the pool itself and reuses the same piecewise-constant TWAP math as
//! the mock (`crate::twap`):
//!
//! 1. The owner registers a token with `add_token(token, pool_id, quote_token)`
//!    where `pool_id` is a Ref simple pool whose two tokens are `token` and
//!    `quote_token` (for example wNEAR or USDC).
//! 2. A keeper (anyone; a cron job in practice) calls `record(token)`. That
//!    schedules a cross-contract call to Ref `get_pool(pool_id)`, which returns
//!    `{ token_account_ids, amounts, total_fee, shares_total_supply, ... }`.
//! 3. In the `#[private]` callback `on_get_pool(token)`:
//!    - The spot price is derived from the reserves:
//!      `price = amounts[quote] * 10^(decimals_token + 8) / (amounts[token] * 10^decimals_quote)`
//!      so it lands on the same fixed-point convention as the mock
//!      (8 decimals per whole token, in quote-token units). A `quote_token`
//!      that is itself priced in USD (USDC) makes this a USD price; for a
//!      wNEAR quote a second hop through a wNEAR/USDC pool would be composed.
//!    - `(block_timestamp_ms, price)` is appended with
//!      `crate::twap::push_observation` (newest 64 kept).
//!    - Liquidity is recorded as the quote-side reserve expressed in the same
//!      8-decimal fixed point (`amounts[quote] * 2` for a balanced pool is the
//!      usual approximation of total pool value).
//! 4. `twap` and `liquidity` are plain views over the stored observations,
//!    identical to `MockOracle`.
//!
//! Manipulation resistance comes from the vault side: it uses the TWAP, not
//! spot, over `twap_window_sec`, it requires `min_oracle_liquidity`, and it
//! double-reads with `cooldown_sec` between reads (`check_unlock`). A sampler
//! that records once per block (or once per minute) is enough for that.
//!
//! Sampling is permissionless but rate-limited (`record` is a no-op if the
//! last observation is newer than `min_sample_interval_ms`), so an attacker
//! cannot flood the 64-slot ring with a single-block price spike.

#![allow(dead_code)]

use near_sdk::json_types::U128;
use near_sdk::AccountId;

use crate::twap::Observation;

/// Ref Finance pool bookkeeping for one listed token.
pub struct RefPoolSource {
    /// Ref simple pool id (`get_pool(pool_id)`).
    pub pool_id: u64,
    /// The pool's other token; the price is quoted in it.
    pub quote_token: AccountId,
    pub token_decimals: u8,
    pub quote_decimals: u8,
}

/// Per-token state kept by the oracle.
pub struct RefTokenState {
    pub source: RefPoolSource,
    pub observations: Vec<Observation>,
    /// Quote-side liquidity from the latest sample, 8-decimal fixed point.
    pub liquidity: u128,
}

/// Not a contract. See the module docs for the intended methods:
/// `new(owner_id, ref_exchange_id)`, `add_token(..)`, `record(token)`,
/// `on_get_pool(token)` (private callback), `twap(..)`, `liquidity(..)`.
pub struct RefTwapOracle {
    pub owner_id: AccountId,
    /// `v2.ref-finance.near` on mainnet, `ref-finance-101.testnet` on testnet.
    pub ref_exchange_id: AccountId,
    pub min_sample_interval_ms: u64,
    // tokens: LookupMap<AccountId, RefTokenState>
}

impl RefTwapOracle {
    /// Same signature as `MockOracle::twap`. Would be:
    /// `crate::twap::twap(&state.observations, env::block_timestamp_ms(), window_sec as u64 * 1000)`.
    pub fn twap(&self, _token: AccountId, _window_sec: u32) -> Option<U128> {
        unimplemented!("RefTwapOracle is a documented stub; see module docs")
    }

    /// Same signature as `MockOracle::liquidity`. Would return the quote-side
    /// reserve from the latest `get_pool` sample, `0` if never sampled.
    pub fn liquidity(&self, _token: AccountId) -> U128 {
        unimplemented!("RefTwapOracle is a documented stub; see module docs")
    }
}
