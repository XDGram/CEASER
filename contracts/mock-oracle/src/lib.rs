//! MockOracle for the CEASER testnet demo.
//!
//! Implements the IOracle interface the vault calls (`twap`, `liquidity`),
//! with owner-only setters so the demo can move the price. The TWAP is a real
//! time-weighted average over stored observations, not a spot read: after
//! `set_price` jumps the price, `twap` only reaches the new price once a full
//! window has passed.
//!
//! See INTERFACE.md section 2.

mod ref_twap_oracle;
pub mod twap;

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

use twap::{push_observation, Observation};

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Observations,
    Liquidity,
}

/// Stored form of an observation (`(ts_ms, price)`).
#[near(serializers = [borsh])]
#[derive(Clone)]
struct StoredObservation {
    ts_ms: u64,
    price: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockOracle {
    owner_id: AccountId,
    /// Per token, oldest first, newest 64 only.
    observations: LookupMap<AccountId, Vec<StoredObservation>>,
    liquidity: LookupMap<AccountId, u128>,
}

#[near]
impl MockOracle {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            observations: LookupMap::new(StorageKey::Observations),
            liquidity: LookupMap::new(StorageKey::Liquidity),
        }
    }

    /// Owner only. Appends `(block_timestamp_ms, price)` to the token's observations.
    pub fn set_price(&mut self, token: AccountId, price: U128) {
        self.assert_owner();
        let now_ms = env::block_timestamp_ms();
        let mut obs = self.load_observations(&token);
        push_observation(
            &mut obs,
            Observation {
                ts_ms: now_ms,
                price: price.0,
            },
        );
        self.observations.insert(
            token,
            obs.into_iter()
                .map(|o| StoredObservation {
                    ts_ms: o.ts_ms,
                    price: o.price,
                })
                .collect(),
        );
    }

    /// Owner only.
    pub fn set_liquidity(&mut self, token: AccountId, liquidity: U128) {
        self.assert_owner();
        self.liquidity.insert(token, liquidity.0);
    }

    /// Time-weighted average price over the trailing `window_sec`, ending now.
    /// `null` if the token has no observations.
    pub fn twap(&self, token: AccountId, window_sec: u32) -> Option<U128> {
        let obs = self.load_observations(&token);
        let window_ms = (window_sec as u64) * 1000;
        twap::twap(&obs, env::block_timestamp_ms(), window_ms).map(U128)
    }

    /// `0` if never set.
    pub fn liquidity(&self, token: AccountId) -> U128 {
        U128(self.liquidity.get(&token).copied().unwrap_or(0))
    }

    /// Latest observation, `null` if none.
    pub fn spot(&self, token: AccountId) -> Option<U128> {
        self.observations
            .get(&token)
            .and_then(|v| v.last())
            .map(|o| U128(o.price))
    }

    /// All retained observations as `[[ts_ms, price], ...]`, oldest first.
    pub fn get_observations(&self, token: AccountId) -> Vec<(u64, U128)> {
        self.load_observations(&token)
            .into_iter()
            .map(|o| (o.ts_ms, U128(o.price)))
            .collect()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    fn load_observations(&self, token: &AccountId) -> Vec<Observation> {
        self.observations
            .get(token)
            .map(|v| {
                v.iter()
                    .map(|o| Observation {
                        ts_ms: o.ts_ms,
                        price: o.price,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only the owner can call this method"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NS_PER_MS: u64 = 1_000_000;

    fn at(predecessor: AccountId, ts_ms: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(predecessor)
            .block_timestamp(ts_ms * NS_PER_MS);
        testing_env!(b.build());
    }

    #[test]
    fn empty_oracle() {
        at(accounts(0), 0);
        let o = MockOracle::new(accounts(0));
        assert_eq!(o.twap(accounts(1), 60), None);
        assert_eq!(o.spot(accounts(1)), None);
        assert_eq!(o.liquidity(accounts(1)).0, 0);
        assert!(o.get_observations(accounts(1)).is_empty());
    }

    #[test]
    fn set_price_appends_at_block_time_and_twap_is_time_weighted() {
        let token = accounts(1);
        at(accounts(0), 0);
        let mut o = MockOracle::new(accounts(0));
        o.set_price(token.clone(), U128(100));
        o.set_liquidity(token.clone(), U128(5_000));

        at(accounts(0), 30_000);
        o.set_price(token.clone(), U128(300));

        assert_eq!(
            o.get_observations(token.clone()),
            vec![(0, U128(100)), (30_000, U128(300))]
        );
        assert_eq!(o.spot(token.clone()), Some(U128(300)));
        assert_eq!(o.liquidity(token.clone()).0, 5_000);

        // Right at the jump the 60s TWAP is still the old price.
        assert_eq!(o.twap(token.clone(), 60), Some(U128(100)));
        // 30s later: half old, half new.
        at(accounts(0), 60_000);
        assert_eq!(o.twap(token.clone(), 60), Some(U128(200)));
        // A full window after the jump: the new price.
        at(accounts(0), 90_000);
        assert_eq!(o.twap(token.clone(), 60), Some(U128(300)));
        // Window 0 returns the latest price.
        assert_eq!(o.twap(token.clone(), 0), Some(U128(300)));
    }

    #[test]
    fn tokens_are_independent() {
        at(accounts(0), 0);
        let mut o = MockOracle::new(accounts(0));
        o.set_price(accounts(1), U128(1));
        assert_eq!(o.twap(accounts(2), 60), None);
        assert_eq!(o.twap(accounts(1), 60), Some(U128(1)));
    }

    #[test]
    #[should_panic(expected = "Only the owner")]
    fn non_owner_cannot_set_price() {
        at(accounts(0), 0);
        let mut o = MockOracle::new(accounts(0));
        at(accounts(1), 0);
        o.set_price(accounts(1), U128(1));
    }

    #[test]
    #[should_panic(expected = "Only the owner")]
    fn non_owner_cannot_set_liquidity() {
        at(accounts(0), 0);
        let mut o = MockOracle::new(accounts(0));
        at(accounts(1), 0);
        o.set_liquidity(accounts(1), U128(1));
    }
}
