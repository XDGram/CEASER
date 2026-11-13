use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub const BPS: u32 = 10_000;
pub const MAX_BOOST_RESERVE_BPS: u32 = 5_000;
pub const MAX_TRANCHES: usize = 10;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const BOOST_TIERS: [(u128, u32); 4] = [
    (10 * NEAR, 11_000),
    (100 * NEAR, 12_500),
    (1_000 * NEAR, 15_000),
    (10_000 * NEAR, 20_000),
];

pub fn boost_for(staked: u128) -> u32 {
    BOOST_TIERS
        .iter()
        .rev()
        .find(|(min, _)| staked >= *min)
        .map(|(_, bps)| *bps)
        .unwrap_or(BPS)
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub max_penalty_bps: u32,
    pub twap_window_sec: u32,
    pub cooldown_sec: u32,
    pub min_oracle_liquidity: U128,
    pub min_tranche_lock_sec: u64,
    pub max_lock_duration_sec: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_penalty_bps: 2_000,
            twap_window_sec: 1_800,
            cooldown_sec: 600,
            min_oracle_liquidity: U128(0),
            min_tranche_lock_sec: 0,
            max_lock_duration_sec: 63_072_000,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct RoiTranche {
    pub fraction_bps: u32,
    pub multiplier_bps: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Time { end_ts: u64 },
    RoiLadder { tranches: Vec<RoiTranche> },
    CollectiveThreshold { challenge_id: u64 },
    Any(Vec<Strategy>),
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Condition {
    PriceAbove { multiplier_bps: u32 },
    TimeAfter { ts: u64 },
    ChallengeFinalized { challenge_id: u64 },
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Tranche {
    pub fraction_bps: u32,
    pub conditions: Vec<Condition>,
    pub armed_at_ts: Option<u64>,
    pub ripe: bool,
    pub claimed: bool,
}

impl Tranche {
    pub fn price_multiplier(&self) -> Option<u32> {
        self.conditions.iter().find_map(|c| match c {
            Condition::PriceAbove { multiplier_bps } => Some(*multiplier_bps),
            _ => None,
        })
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PenaltySink {
    Challenge(u64),
    Account(AccountId),
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LockStatus {
    Active,
    Exited,
    Closed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Lock {
    pub id: u64,
    pub owner: AccountId,
    pub token: AccountId,
    pub amount: U128,
    pub claimed_amount: U128,
    pub start_ts: u64,
    pub max_duration_sec: u64,
    pub penalty_bps: u32,
    pub penalty_sink: PenaltySink,
    pub reference_price: Option<U128>,
    pub strategy: Strategy,
    pub tranches: Vec<Tranche>,
    pub challenge_id: Option<u64>,
    pub staking_pool: Option<AccountId>,
    pub conviction: U128,
    pub reward_claimed: bool,
    pub status: LockStatus,
}

impl Lock {
    /// The last tranche absorbs rounding dust so tranches always sum to `amount`.
    pub fn tranche_amount(&self, idx: usize) -> u128 {
        let part = |t: &Tranche| self.amount.0 / BPS as u128 * t.fraction_bps as u128
            + self.amount.0 % BPS as u128 * t.fraction_bps as u128 / BPS as u128;
        if idx + 1 == self.tranches.len() {
            self.amount.0 - self.tranches[..idx].iter().map(part).sum::<u128>()
        } else {
            part(&self.tranches[idx])
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChallengeState {
    Active,
    Succeeded,
    Failed,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Challenge {
    pub id: u64,
    pub title: String,
    pub creator: AccountId,
    pub token: AccountId,
    pub threshold_amount: U128,
    pub deadline_ts: u64,
    pub min_lock_duration_sec: u64,
    pub sponsor_token: AccountId,
    pub boost_reserve_bps: u32,
    pub sponsor_total: U128,
    pub penalty_total: U128,
    pub total_locked: U128,
    pub total_conviction: U128,
    pub participant_count: u32,
    pub state: ChallengeState,
    pub base_pool: U128,
    pub reserve_remaining: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ChallengeParams {
    pub title: String,
    pub token: AccountId,
    pub threshold_amount: U128,
    pub deadline_ts: u64,
    pub min_lock_duration_sec: u64,
    pub sponsor_token: AccountId,
    pub boost_reserve_bps: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LockParams {
    pub strategy: Strategy,
    pub max_duration_sec: u64,
    pub penalty_bps: u32,
    pub penalty_sink: Option<PenaltySink>,
    pub challenge_id: Option<u64>,
    pub staking_pool: Option<AccountId>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum TransferMsg {
    Lock(LockParams),
    Sponsor { challenge_id: u64 },
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrancheStatus {
    NotMet,
    Armed,
    CoolingDown,
    Ripe,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ClaimResult {
    pub principal: U128,
    pub reward: U128,
    pub boost_bps: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ExitResult {
    pub returned: U128,
    pub penalty: U128,
    pub sink: PenaltySink,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Claimable {
    pub principal: U128,
    pub base_reward: U128,
}

/// Flattened result of compiling a `Strategy` tree.
#[derive(Default)]
pub struct Compiled {
    pub ladder: Option<Vec<RoiTranche>>,
    pub extra: Vec<Condition>,
    pub challenge: Option<u64>,
}

impl Compiled {
    pub fn from_strategy(strategy: &Strategy) -> Result<Self, &'static str> {
        let mut c = Compiled::default();
        c.visit(strategy, 0)?;
        Ok(c)
    }

    fn visit(&mut self, s: &Strategy, depth: u8) -> Result<(), &'static str> {
        match s {
            Strategy::Time { end_ts } => self.extra.push(Condition::TimeAfter { ts: *end_ts }),
            Strategy::RoiLadder { tranches } => {
                if self.ladder.is_some() {
                    return Err("At most one roi_ladder per lock");
                }
                if tranches.is_empty() || tranches.len() > MAX_TRANCHES {
                    return Err("roi_ladder needs 1 to 10 tranches");
                }
                if tranches.iter().any(|t| t.fraction_bps == 0 || t.multiplier_bps <= BPS) {
                    return Err("Each rung needs fraction_bps > 0 and multiplier_bps > 10000");
                }
                if tranches.iter().map(|t| t.fraction_bps as u64).sum::<u64>() != BPS as u64 {
                    return Err("roi_ladder fractions must sum to 10000");
                }
                self.ladder = Some(tranches.clone());
            }
            Strategy::CollectiveThreshold { challenge_id } => {
                if self.challenge.is_some_and(|c| c != *challenge_id) {
                    return Err("A lock can reference only one challenge");
                }
                if self.challenge.is_none() {
                    self.challenge = Some(*challenge_id);
                    self.extra.push(Condition::ChallengeFinalized { challenge_id: *challenge_id });
                }
            }
            Strategy::Any(inner) => {
                if inner.is_empty() || depth >= 4 {
                    return Err("any must be non-empty and at most 4 levels deep");
                }
                for s in inner {
                    self.visit(s, depth + 1)?;
                }
            }
        }
        Ok(())
    }

    pub fn tranches(&self) -> Vec<Tranche> {
        let make = |fraction_bps: u32, mut conditions: Vec<Condition>| {
            conditions.extend(self.extra.iter().cloned());
            Tranche { fraction_bps, conditions, armed_at_ts: None, ripe: false, claimed: false }
        };
        match &self.ladder {
            Some(rungs) => rungs
                .iter()
                .map(|r| make(r.fraction_bps, vec![Condition::PriceAbove { multiplier_bps: r.multiplier_bps }]))
                .collect(),
            None => vec![make(BPS, vec![])],
        }
    }
}
