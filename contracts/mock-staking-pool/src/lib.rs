//! Mock staking pool for the CEASER testnet demo.
//!
//! Mirrors the single view method of NEAR's core staking pool contract that
//! the vault needs (`get_account_staked_balance`), plus an owner-only setter
//! so the demo can pretend an account has NEAR staked.
//!
//! See INTERFACE.md section 3.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Balances,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockStakingPool {
    owner_id: AccountId,
    /// Staked balance per account, in yoctoNEAR.
    balances: LookupMap<AccountId, u128>,
}

#[near]
impl MockStakingPool {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            balances: LookupMap::new(StorageKey::Balances),
        }
    }

    /// Owner only. Sets the staked balance (yoctoNEAR) reported for `account_id`.
    pub fn set_account_staked_balance(&mut self, account_id: AccountId, amount: U128) {
        self.assert_owner();
        self.balances.insert(account_id, amount.0);
    }

    /// Returns the staked balance in yoctoNEAR, `0` if the account is unknown.
    /// Same signature as NEAR's core staking pool contract.
    pub fn get_account_staked_balance(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
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

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(predecessor);
        b
    }

    #[test]
    fn unknown_account_is_zero() {
        testing_env!(ctx(accounts(0)).build());
        let pool = MockStakingPool::new(accounts(0));
        assert_eq!(pool.get_account_staked_balance(accounts(1)).0, 0);
    }

    #[test]
    fn owner_sets_balance() {
        testing_env!(ctx(accounts(0)).build());
        let mut pool = MockStakingPool::new(accounts(0));
        let five_hundred_near = 500 * 10u128.pow(24);
        pool.set_account_staked_balance(accounts(1), U128(five_hundred_near));
        assert_eq!(
            pool.get_account_staked_balance(accounts(1)).0,
            five_hundred_near
        );
        assert_eq!(pool.get_account_staked_balance(accounts(2)).0, 0);
    }

    #[test]
    #[should_panic(expected = "Only the owner")]
    fn non_owner_cannot_set() {
        testing_env!(ctx(accounts(0)).build());
        let mut pool = MockStakingPool::new(accounts(0));
        testing_env!(ctx(accounts(1)).build());
        pool.set_account_staked_balance(accounts(1), U128(1));
    }
}
