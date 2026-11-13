//! CEASER VaultCore: programmable token locks, community Challenges,
//! the early-exit penalty bridge and the NEAR-staking reward boost.
//! The external surface is specified in INTERFACE.md at the repo root.

mod math;
mod types;

use math::mul_div;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{
    env, ext_contract, log, near, require, AccountId, Gas, NearToken, PanicOnDefault, PromiseError,
    PromiseOrValue,
};
pub use types::*;

const GAS_VIEW: Gas = Gas::from_tgas(5);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_TRANSFER: Gas = Gas::from_tgas(5);
const GAS_ON_LOCK_ORACLE: Gas = Gas::from_tgas(20);
const GAS_ON_CHECK: Gas = Gas::from_tgas(10);
const GAS_ON_BOOST: Gas = Gas::from_tgas(35);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[ext_contract(ext_oracle)]
pub trait IOracle {
    fn twap(&self, token: AccountId, window_sec: u32) -> Option<U128>;
    fn liquidity(&self, token: AccountId) -> U128;
}

#[ext_contract(ext_staking)]
pub trait StakingPool {
    fn get_account_staked_balance(&self, account_id: AccountId) -> U128;
}

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner_id: AccountId,
    oracle_id: AccountId,
    config: Config,
    staking_pools: IterableSet<AccountId>,
    locks: LookupMap<u64, Lock>,
    lock_count: u64,
    locks_by_owner: LookupMap<AccountId, Vec<u64>>,
    challenges: LookupMap<u64, Challenge>,
    challenge_count: u64,
    sponsors: LookupMap<(u64, AccountId), U128>,
    /// Payouts whose ft_transfer failed, withdrawable via `withdraw_owed`.
    owed: LookupMap<(AccountId, AccountId), U128>,
}

fn now() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn emit(event: &str, data: Value) {
    log!(
        "EVENT_JSON:{}",
        json!({"standard": "ceaser", "version": "1.0.0", "event": event, "data": data})
    );
}

fn validate_config(c: &Config) {
    require!(c.max_penalty_bps <= BPS, "max_penalty_bps over 10000");
    require!(c.twap_window_sec > 0, "twap_window_sec must be positive");
    require!(c.max_lock_duration_sec > 0, "max_lock_duration_sec must be positive");
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner_id: AccountId, oracle_id: AccountId, config: Option<Config>) -> Self {
        let config = config.unwrap_or_default();
        validate_config(&config);
        Self {
            owner_id,
            oracle_id,
            config,
            staking_pools: IterableSet::new(b"p"),
            locks: LookupMap::new(b"l"),
            lock_count: 0,
            locks_by_owner: LookupMap::new(b"o"),
            challenges: LookupMap::new(b"c"),
            challenge_count: 0,
            sponsors: LookupMap::new(b"s"),
            owed: LookupMap::new(b"w"),
        }
    }

    // ---------- admin ----------

    pub fn add_staking_pool(&mut self, pool_id: AccountId) {
        self.assert_owner();
        self.staking_pools.insert(pool_id);
    }

    pub fn remove_staking_pool(&mut self, pool_id: AccountId) {
        self.assert_owner();
        self.staking_pools.remove(&pool_id);
    }

    pub fn set_oracle(&mut self, oracle_id: AccountId) {
        self.assert_owner();
        self.oracle_id = oracle_id;
    }

    pub fn update_config(&mut self, config: Config) {
        self.assert_owner();
        validate_config(&config);
        self.config = config;
    }

    // ---------- challenges ----------

    pub fn create_challenge(&mut self, params: ChallengeParams) -> u64 {
        require!(params.threshold_amount.0 > 0, "threshold_amount must be positive");
        require!(params.deadline_ts > now(), "deadline_ts must be in the future");
        require!(params.boost_reserve_bps <= MAX_BOOST_RESERVE_BPS, "boost_reserve_bps over 5000");
        require!(params.title.len() <= 100, "title too long");
        self.challenge_count += 1;
        let id = self.challenge_count;
        let challenge = Challenge {
            id,
            title: params.title,
            creator: env::predecessor_account_id(),
            token: params.token,
            threshold_amount: params.threshold_amount,
            deadline_ts: params.deadline_ts,
            min_lock_duration_sec: params.min_lock_duration_sec,
            sponsor_token: params.sponsor_token,
            boost_reserve_bps: params.boost_reserve_bps,
            sponsor_total: U128(0),
            penalty_total: U128(0),
            total_locked: U128(0),
            total_conviction: U128(0),
            participant_count: 0,
            state: ChallengeState::Active,
            base_pool: U128(0),
            reserve_remaining: U128(0),
        };
        emit(
            "challenge_created",
            json!({"challenge_id": id, "creator": challenge.creator, "token": challenge.token,
                   "threshold_amount": challenge.threshold_amount, "deadline_ts": challenge.deadline_ts}),
        );
        self.challenges.insert(id, challenge);
        id
    }

    pub fn finalize(&mut self, challenge_id: u64) -> Challenge {
        let ch = self.challenge(challenge_id);
        require!(ch.state == ChallengeState::Active, "Challenge already finalized");
        require!(now() >= ch.deadline_ts, "Deadline not reached");
        self.internal_finalize(ch)
    }

    pub fn refund_sponsor(&mut self, challenge_id: u64, sponsor_id: AccountId) -> U128 {
        let ch = self.challenge(challenge_id);
        require!(ch.state == ChallengeState::Failed, "Refunds only after a failed challenge");
        let amount = self
            .sponsors
            .remove(&(challenge_id, sponsor_id.clone()))
            .unwrap_or_else(|| env::panic_str("Nothing to refund"));
        self.pay(&ch.sponsor_token, &sponsor_id, amount.0);
        emit(
            "sponsor_refunded",
            json!({"challenge_id": challenge_id, "sponsor": sponsor_id, "amount": amount}),
        );
        amount
    }

    // ---------- deposits ----------

    /// NEP-141 receiver. Returns the unused amount; a panic refunds everything.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be positive");
        let msg: TransferMsg = serde_json::from_str(&msg)
            .unwrap_or_else(|e| env::panic_str(&format!("Invalid msg: {e}")));
        match msg {
            TransferMsg::Sponsor { challenge_id } => {
                let mut ch = self.challenge(challenge_id);
                require!(ch.state == ChallengeState::Active, "Challenge is not active");
                require!(ch.sponsor_token == token, "Wrong sponsor token");
                ch.sponsor_total.0 += amount.0;
                let key = (challenge_id, sender_id.clone());
                let prev = self.sponsors.get(&key).map(|v| v.0).unwrap_or(0);
                self.sponsors.insert(key, U128(prev + amount.0));
                emit(
                    "sponsor_funded",
                    json!({"challenge_id": challenge_id, "sponsor": sender_id, "amount": amount,
                           "sponsor_total": ch.sponsor_total}),
                );
                self.challenges.insert(challenge_id, ch);
                PromiseOrValue::Value(U128(0))
            }
            TransferMsg::Lock(params) => {
                let compiled = Compiled::from_strategy(&params.strategy)
                    .unwrap_or_else(|e| env::panic_str(e));
                if compiled.ladder.is_none() {
                    self.internal_create_lock(sender_id, token, amount.0, params, None);
                    return PromiseOrValue::Value(U128(0));
                }
                // Price-based locks capture their immutable reference price first.
                let oracle = || ext_oracle::ext(self.oracle_id.clone()).with_static_gas(GAS_VIEW);
                oracle()
                    .twap(token.clone(), self.config.twap_window_sec)
                    .and(oracle().liquidity(token.clone()))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_ON_LOCK_ORACLE)
                            .on_lock_oracle(sender_id, token, amount, params),
                    )
                    .into()
            }
        }
    }

    #[private]
    pub fn on_lock_oracle(
        &mut self,
        sender_id: AccountId,
        token: AccountId,
        amount: U128,
        params: LockParams,
        #[callback_result] twap: Result<Option<U128>, PromiseError>,
        #[callback_result] liquidity: Result<U128, PromiseError>,
    ) -> U128 {
        let price = self
            .valid_price(twap, liquidity)
            .unwrap_or_else(|| env::panic_str("Oracle has no usable price for this token"));
        self.internal_create_lock(sender_id, token, amount.0, params, Some(price));
        U128(0)
    }

    // ---------- two-read commit ----------

    /// First successful read arms a price tranche; a second read after the
    /// cooldown must still see the condition true to make it ripe.
    pub fn check_unlock(&mut self, lock_id: u64, tranche_idx: u32) -> PromiseOrValue<TrancheStatus> {
        let lock = self.lock(lock_id);
        require!(lock.status == LockStatus::Active, "Lock is not active");
        let tranche = lock
            .tranches
            .get(tranche_idx as usize)
            .unwrap_or_else(|| env::panic_str("No such tranche"));
        require!(!tranche.claimed, "Tranche already claimed");
        require!(tranche.price_multiplier().is_some(), "Tranche has no price condition");
        if tranche.ripe {
            return PromiseOrValue::Value(TrancheStatus::Ripe);
        }
        if now() < lock.start_ts + self.config.min_tranche_lock_sec {
            return PromiseOrValue::Value(TrancheStatus::NotMet);
        }
        if tranche.armed_at_ts.is_some_and(|t| now() < t + self.config.cooldown_sec as u64) {
            return PromiseOrValue::Value(TrancheStatus::CoolingDown);
        }
        let oracle = || ext_oracle::ext(self.oracle_id.clone()).with_static_gas(GAS_VIEW);
        oracle()
            .twap(lock.token.clone(), self.config.twap_window_sec)
            .and(oracle().liquidity(lock.token.clone()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_CHECK)
                    .on_check_unlock(lock_id, tranche_idx),
            )
            .into()
    }

    #[private]
    pub fn on_check_unlock(
        &mut self,
        lock_id: u64,
        tranche_idx: u32,
        #[callback_result] twap: Result<Option<U128>, PromiseError>,
        #[callback_result] liquidity: Result<U128, PromiseError>,
    ) -> TrancheStatus {
        let mut lock = self.lock(lock_id);
        let reference = lock.reference_price.map(|p| p.0).unwrap_or(0);
        let tranche = &mut lock.tranches[tranche_idx as usize];
        if lock.status != LockStatus::Active || tranche.claimed {
            return TrancheStatus::NotMet;
        }
        if tranche.ripe {
            return TrancheStatus::Ripe;
        }
        if twap.is_err() || liquidity.is_err() {
            // A failed oracle read says nothing about the price: leave the tranche as it is.
            return if tranche.armed_at_ts.is_some() { TrancheStatus::CoolingDown } else { TrancheStatus::NotMet };
        }
        let multiplier = tranche.price_multiplier().unwrap_or(u32::MAX) as u128;
        let price = self.valid_price(twap, liquidity);
        let met = price.is_some_and(|p| {
            reference > 0 && p.saturating_mul(BPS as u128) >= reference.saturating_mul(multiplier)
        });
        let data = json!({"lock_id": lock_id, "tranche_idx": tranche_idx, "twap": price.map(U128)});
        let status = match (met, tranche.armed_at_ts) {
            (true, None) => {
                tranche.armed_at_ts = Some(now());
                emit("tranche_armed", data);
                TrancheStatus::Armed
            }
            (true, Some(t)) if now() >= t + self.config.cooldown_sec as u64 => {
                tranche.ripe = true;
                emit("tranche_ripe", data);
                TrancheStatus::Ripe
            }
            (true, Some(_)) => TrancheStatus::CoolingDown,
            (false, Some(_)) => {
                tranche.armed_at_ts = None;
                emit("tranche_disarmed", data);
                TrancheStatus::NotMet
            }
            (false, None) => TrancheStatus::NotMet,
        };
        self.locks.insert(lock_id, lock);
        status
    }

    // ---------- claim ----------

    pub fn claim(&mut self, lock_id: u64) -> PromiseOrValue<ClaimResult> {
        let mut lock = self.lock(lock_id);
        require!(env::predecessor_account_id() == lock.owner, "Only the lock owner can claim");
        require!(lock.status == LockStatus::Active, "Lock is not active");
        self.finalize_if_due(lock.challenge_id);

        let principal = self.take_claimable(&mut lock);
        let reward_due = !lock.reward_claimed
            && lock
                .challenge_id
                .is_some_and(|c| self.challenge(c).state != ChallengeState::Active);
        require!(principal > 0 || reward_due, "Nothing to claim");

        lock.claimed_amount.0 += principal;
        lock.reward_claimed |= reward_due;
        if lock.tranches.iter().all(|t| t.claimed)
            && (lock.challenge_id.is_none() || lock.reward_claimed)
        {
            lock.status = LockStatus::Closed;
        }
        self.locks.insert(lock_id, lock.clone());

        self.pay(&lock.token, &lock.owner, principal);
        if principal > 0 {
            emit(
                "claimed",
                json!({"lock_id": lock_id, "owner": lock.owner, "principal": U128(principal)}),
            );
        }
        if !reward_due {
            return PromiseOrValue::Value(ClaimResult {
                principal: U128(principal),
                reward: U128(0),
                boost_bps: BPS,
            });
        }
        match &lock.staking_pool {
            Some(pool) if lock.conviction.0 > 0 => ext_staking::ext(pool.clone())
                .with_static_gas(GAS_VIEW)
                .get_account_staked_balance(lock.owner.clone())
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_BOOST)
                        .on_boost(lock_id, U128(principal)),
                )
                .into(),
            _ => PromiseOrValue::Value(self.pay_reward(&lock, principal, 0)),
        }
    }

    #[private]
    pub fn on_boost(
        &mut self,
        lock_id: u64,
        principal: U128,
        #[callback_result] staked: Result<U128, PromiseError>,
    ) -> ClaimResult {
        let lock = self.lock(lock_id);
        self.pay_reward(&lock, principal.0, staked.map(|s| s.0).unwrap_or(0))
    }

    // ---------- early exit: the bridge ----------

    pub fn early_exit(&mut self, lock_id: u64) -> ExitResult {
        let mut lock = self.lock(lock_id);
        require!(env::predecessor_account_id() == lock.owner, "Only the lock owner can exit");
        require!(lock.status == LockStatus::Active, "Lock is not active");
        self.finalize_if_due(lock.challenge_id);
        if let PenaltySink::Challenge(c) = lock.penalty_sink {
            self.finalize_if_due(Some(c));
        }

        // Leaving an active challenge removes the lock's weight from it.
        if let Some(cid) = lock.challenge_id {
            let mut ch = self.challenge(cid);
            if ch.state == ChallengeState::Active {
                ch.total_locked.0 -= lock.amount.0;
                ch.total_conviction.0 -= lock.conviction.0;
                ch.participant_count -= 1;
                lock.conviction = U128(0);
                lock.challenge_id = None;
                self.challenges.insert(cid, ch);
            } else if !lock.reward_claimed && lock.conviction.0 > 0 {
                // The lock stayed through a finalized challenge: its reward is earned.
                // Paid here without the boost so it is not stranded in the vault.
                lock.reward_claimed = true;
                self.pay_reward(&lock, 0, 0);
            }
        }

        let free = self.take_claimable(&mut lock);
        let rest = lock.amount.0 - lock.claimed_amount.0 - free;
        let penalty = mul_div(rest, lock.penalty_bps as u128, BPS as u128);
        let returned = free + rest - penalty;

        let mut sink = lock.penalty_sink.clone();
        if penalty > 0 {
            let to_challenge = match sink {
                PenaltySink::Challenge(c) => {
                    let mut ch = self.challenge(c);
                    if ch.state == ChallengeState::Active && ch.sponsor_token == lock.token {
                        ch.penalty_total.0 += penalty;
                        self.challenges.insert(c, ch);
                        true
                    } else {
                        false
                    }
                }
                PenaltySink::Account(_) => false,
            };
            if !to_challenge {
                let receiver = match &sink {
                    PenaltySink::Account(a) => a.clone(),
                    PenaltySink::Challenge(_) => self.owner_id.clone(),
                };
                self.pay(&lock.token, &receiver, penalty);
                sink = PenaltySink::Account(receiver);
            }
        }

        lock.tranches.iter_mut().for_each(|t| t.claimed = true);
        lock.claimed_amount = U128(lock.amount.0 - penalty);
        lock.status = LockStatus::Exited;
        self.pay(&lock.token, &lock.owner, returned);
        emit(
            "early_exit",
            json!({"lock_id": lock_id, "owner": lock.owner, "returned": U128(returned),
                   "penalty": U128(penalty), "sink": sink}),
        );
        self.locks.insert(lock_id, lock);
        ExitResult { returned: U128(returned), penalty: U128(penalty), sink }
    }

    // ---------- failed payout recovery ----------

    #[private]
    pub fn on_transfer(
        &mut self,
        account_id: AccountId,
        token: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if result.is_err() {
            let key = (account_id.clone(), token.clone());
            let prev = self.owed.get(&key).map(|v| v.0).unwrap_or(0);
            self.owed.insert(key, U128(prev + amount.0));
            emit(
                "transfer_failed",
                json!({"account_id": account_id, "token": token, "amount": amount}),
            );
        }
    }

    /// Retries a payout that failed, e.g. because the receiver was not registered on the token.
    pub fn withdraw_owed(&mut self, token: AccountId) -> U128 {
        let account_id = env::predecessor_account_id();
        let amount = self
            .owed
            .remove(&(account_id.clone(), token.clone()))
            .unwrap_or_else(|| env::panic_str("Nothing owed"));
        self.pay(&token, &account_id, amount.0);
        amount
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_oracle(&self) -> AccountId {
        self.oracle_id.clone()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_staking_pools(&self) -> Vec<AccountId> {
        self.staking_pools.iter().cloned().collect()
    }

    pub fn get_boost_tiers(&self) -> Vec<(U128, u32)> {
        BOOST_TIERS.iter().map(|(min, bps)| (U128(*min), *bps)).collect()
    }

    pub fn get_lock(&self, lock_id: u64) -> Option<Lock> {
        self.locks.get(&lock_id).cloned()
    }

    pub fn get_locks_by_owner(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Lock> {
        self.locks_by_owner
            .get(&account_id)
            .map(|ids| {
                ids.iter()
                    .skip(from_index.unwrap_or(0) as usize)
                    .take(limit.unwrap_or(50) as usize)
                    .filter_map(|id| self.locks.get(id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_lock_count(&self) -> u64 {
        self.lock_count
    }

    pub fn get_challenge(&self, challenge_id: u64) -> Option<Challenge> {
        self.challenges.get(&challenge_id).cloned()
    }

    pub fn get_challenges(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Challenge> {
        let from = from_index.unwrap_or(0) + 1;
        (from..=self.challenge_count)
            .take(limit.unwrap_or(50) as usize)
            .filter_map(|id| self.challenges.get(&id).cloned())
            .collect()
    }

    pub fn get_challenge_count(&self) -> u64 {
        self.challenge_count
    }

    pub fn get_sponsor_contribution(&self, challenge_id: u64, account_id: AccountId) -> U128 {
        self.sponsors.get(&(challenge_id, account_id)).copied().unwrap_or(U128(0))
    }

    pub fn get_owed(&self, account_id: AccountId, token: AccountId) -> U128 {
        self.owed.get(&(account_id, token)).copied().unwrap_or(U128(0))
    }

    pub fn get_claimable(&self, lock_id: u64) -> Claimable {
        let mut lock = self.lock(lock_id);
        let principal = if lock.status == LockStatus::Active { self.take_claimable(&mut lock) } else { 0 };
        let base_reward = match lock.challenge_id.map(|c| self.challenge(c)) {
            Some(ch)
                if lock.status == LockStatus::Active
                    && !lock.reward_claimed
                    && ch.state != ChallengeState::Active =>
            {
                Self::base_reward(&ch, &lock)
            }
            _ => 0,
        };
        Claimable { principal: U128(principal), base_reward: U128(base_reward) }
    }
}

impl Vault {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "Owner only");
    }

    fn lock(&self, lock_id: u64) -> Lock {
        self.locks.get(&lock_id).cloned().unwrap_or_else(|| env::panic_str("No such lock"))
    }

    fn challenge(&self, challenge_id: u64) -> Challenge {
        self.challenges
            .get(&challenge_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No such challenge"))
    }

    /// A TWAP is usable only if both reads succeeded and liquidity clears the floor.
    fn valid_price(
        &self,
        twap: Result<Option<U128>, PromiseError>,
        liquidity: Result<U128, PromiseError>,
    ) -> Option<u128> {
        let price = twap.ok().flatten()?.0;
        let liquidity = liquidity.ok()?.0;
        (price > 0 && liquidity >= self.config.min_oracle_liquidity.0).then_some(price)
    }

    fn internal_create_lock(
        &mut self,
        owner: AccountId,
        token: AccountId,
        amount: u128,
        params: LockParams,
        reference_price: Option<u128>,
    ) -> u64 {
        let start_ts = now();
        let compiled =
            Compiled::from_strategy(&params.strategy).unwrap_or_else(|e| env::panic_str(e));
        require!(params.penalty_bps <= self.config.max_penalty_bps, "penalty_bps over the protocol max");
        require!(
            params.max_duration_sec > 0 && params.max_duration_sec <= self.config.max_lock_duration_sec,
            "max_duration_sec out of range"
        );
        if let Some(pool) = &params.staking_pool {
            require!(self.staking_pools.contains(pool), "Staking pool is not whitelisted");
        }
        require!(
            compiled.challenge.is_none()
                || params.challenge_id.is_none()
                || compiled.challenge == params.challenge_id,
            "challenge_id does not match the strategy"
        );
        let challenge_id = compiled.challenge.or(params.challenge_id);
        let tranches = compiled.tranches();
        require!(
            challenge_id.is_some() || tranches.iter().all(|t| !t.conditions.is_empty()),
            "Strategy has no unlock condition"
        );

        let mut conviction = 0u128;
        if let Some(cid) = challenge_id {
            let mut ch = self.challenge(cid);
            require!(ch.state == ChallengeState::Active, "Challenge is not active");
            require!(ch.token == token, "Wrong token for this challenge");
            require!(
                ch.deadline_ts > start_ts && ch.deadline_ts - start_ts >= ch.min_lock_duration_sec,
                "Too late to join this challenge"
            );
            require!(
                start_ts + params.max_duration_sec >= ch.deadline_ts,
                "max_duration_sec must reach the challenge deadline"
            );
            conviction = amount
                .checked_mul((ch.deadline_ts - start_ts) as u128)
                .unwrap_or_else(|| env::panic_str("Amount too large"));
            ch.total_locked.0 += amount;
            ch.total_conviction.0 += conviction;
            ch.participant_count += 1;
            self.challenges.insert(cid, ch);
        }

        let penalty_sink = params.penalty_sink.unwrap_or_else(|| match challenge_id {
            Some(cid) => PenaltySink::Challenge(cid),
            None => PenaltySink::Account(self.owner_id.clone()),
        });
        if let PenaltySink::Challenge(cid) = penalty_sink {
            require!(
                self.challenge(cid).sponsor_token == token,
                "Penalty sink challenge uses a different pool token"
            );
        }

        self.lock_count += 1;
        let id = self.lock_count;
        let lock = Lock {
            id,
            owner: owner.clone(),
            token,
            amount: U128(amount),
            claimed_amount: U128(0),
            start_ts,
            max_duration_sec: params.max_duration_sec,
            penalty_bps: params.penalty_bps,
            penalty_sink,
            reference_price: reference_price.map(U128),
            strategy: params.strategy,
            tranches,
            challenge_id,
            staking_pool: params.staking_pool,
            conviction: U128(conviction),
            reward_claimed: false,
            status: LockStatus::Active,
        };
        emit(
            "lock_created",
            json!({"lock_id": id, "owner": lock.owner, "token": lock.token, "amount": lock.amount,
                   "challenge_id": lock.challenge_id, "reference_price": lock.reference_price,
                   "penalty_sink": lock.penalty_sink}),
        );
        self.locks.insert(id, lock);
        let mut ids = self.locks_by_owner.get(&owner).cloned().unwrap_or_default();
        ids.push(id);
        self.locks_by_owner.insert(owner, ids);
        id
    }

    fn tranche_satisfied(&self, lock: &Lock, tranche: &Tranche, now: u64) -> bool {
        now >= lock.start_ts + lock.max_duration_sec
            || tranche.conditions.iter().any(|c| match c {
                Condition::PriceAbove { .. } => tranche.ripe,
                Condition::TimeAfter { ts } => now >= *ts,
                Condition::ChallengeFinalized { challenge_id } => {
                    self.challenge(*challenge_id).state != ChallengeState::Active
                }
            })
    }

    /// Marks every currently claimable tranche as claimed and returns their total.
    /// Locks in a still-active challenge are committed until it is finalized.
    fn take_claimable(&self, lock: &mut Lock) -> u128 {
        if lock.challenge_id.is_some_and(|c| self.challenge(c).state == ChallengeState::Active) {
            return 0;
        }
        let now = now();
        let mut total = 0;
        for i in 0..lock.tranches.len() {
            if !lock.tranches[i].claimed && self.tranche_satisfied(lock, &lock.tranches[i], now) {
                total += lock.tranche_amount(i);
                lock.tranches[i].claimed = true;
            }
        }
        total
    }

    fn finalize_if_due(&mut self, challenge_id: Option<u64>) {
        if let Some(ch) = challenge_id.map(|c| self.challenge(c)) {
            if ch.state == ChallengeState::Active && now() >= ch.deadline_ts {
                self.internal_finalize(ch);
            }
        }
    }

    fn internal_finalize(&mut self, mut ch: Challenge) -> Challenge {
        let succeeded = ch.total_locked.0 >= ch.threshold_amount.0;
        ch.state = if succeeded { ChallengeState::Succeeded } else { ChallengeState::Failed };
        // Penalties always go to the lockers who stayed; sponsor money only on success.
        let distributable = ch.penalty_total.0 + if succeeded { ch.sponsor_total.0 } else { 0 };
        if ch.total_conviction.0 == 0 {
            // Nobody stayed to be paid: route the orphaned pool to the treasury.
            let key = (self.owner_id.clone(), ch.sponsor_token.clone());
            let prev = self.owed.get(&key).map(|v| v.0).unwrap_or(0);
            self.owed.insert(key, U128(prev + distributable));
        } else {
            let reserve = mul_div(distributable, ch.boost_reserve_bps as u128, BPS as u128);
            ch.reserve_remaining = U128(reserve);
            ch.base_pool = U128(distributable - reserve);
        }
        emit(
            "challenge_finalized",
            json!({"challenge_id": ch.id, "state": ch.state, "total_locked": ch.total_locked,
                   "threshold_amount": ch.threshold_amount, "base_pool": ch.base_pool,
                   "reserve": ch.reserve_remaining}),
        );
        self.challenges.insert(ch.id, ch.clone());
        ch
    }

    fn base_reward(ch: &Challenge, lock: &Lock) -> u128 {
        if ch.total_conviction.0 == 0 {
            return 0;
        }
        mul_div(ch.base_pool.0, lock.conviction.0, ch.total_conviction.0)
    }

    /// Pays a lock's challenge reward: pro-rata base plus a NEAR-staking boost
    /// drawn from the challenge's reserve and capped by what is left in it.
    fn pay_reward(&mut self, lock: &Lock, principal: u128, staked: u128) -> ClaimResult {
        let mut ch = self.challenge(lock.challenge_id.unwrap());
        let base = Self::base_reward(&ch, lock);
        let boost_bps = boost_for(staked);
        let extra = mul_div(base, (boost_bps - BPS) as u128, BPS as u128).min(ch.reserve_remaining.0);
        ch.reserve_remaining.0 -= extra;
        let reward = base + extra;
        self.pay(&ch.sponsor_token, &lock.owner, reward);
        emit(
            "reward_claimed",
            json!({"lock_id": lock.id, "owner": lock.owner, "challenge_id": ch.id,
                   "base_reward": U128(base), "boost_extra": U128(extra), "reward": U128(reward),
                   "boost_bps": boost_bps, "staked_near": U128(staked)}),
        );
        self.challenges.insert(ch.id, ch);
        ClaimResult { principal: U128(principal), reward: U128(reward), boost_bps }
    }

    /// Sends tokens out; a failed transfer is recorded in `owed` instead of being lost.
    fn pay(&self, token: &AccountId, to: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        ext_ft::ext(token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_TRANSFER)
                    .on_transfer(to.clone(), token.clone(), U128(amount)),
            )
            .detach();
    }
}
