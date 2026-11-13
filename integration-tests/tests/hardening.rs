//! Adversarial and edge-case flows against a local sandbox. Run `./build.sh` first.
//! Same helper pattern as flows.rs, with a separate treasury account as the vault
//! owner so treasury payouts are real transfers, and a configurable vault config.
#![allow(unused_must_use)]

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const TWAP_WINDOW: u64 = 20;
const COOLDOWN: u64 = 10;
const PRICE_1: u128 = 100_000_000;

fn tok(n: u128) -> u128 {
    n * 10u128.pow(18)
}

fn s(n: u128) -> String {
    n.to_string()
}

fn u(v: &Value) -> u128 {
    v.as_str().unwrap_or_else(|| panic!("not a U128 string: {v}")).parse().unwrap()
}

fn near(n: u128) -> String {
    s(n * 10u128.pow(24))
}

struct Env {
    worker: Worker<Sandbox>,
    vault: Contract,
    oracle: Contract,
    token: Contract,
    pool: Contract,
    owner: Account,
}

impl Env {
    async fn new() -> anyhow::Result<Self> {
        Self::with_config(json!({
            "max_penalty_bps": 2000, "twap_window_sec": TWAP_WINDOW, "cooldown_sec": COOLDOWN,
            "min_oracle_liquidity": "1000", "min_tranche_lock_sec": 0,
            "max_lock_duration_sec": 63072000}))
        .await
    }

    async fn with_config(config: Value) -> anyhow::Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let deploy = |name: &'static str| {
            let worker = worker.clone();
            async move {
                let wasm = std::fs::read(format!("../res/{name}.wasm"))
                    .unwrap_or_else(|_| panic!("res/{name}.wasm missing, run ./build.sh"));
                worker.dev_deploy(&wasm).await
            }
        };
        let vault = deploy("ceaser_vault").await?;
        let oracle = deploy("mock_oracle").await?;
        let token = deploy("test_token").await?;
        let pool = deploy("mock_staking_pool").await?;
        let owner = worker.dev_create_account().await?;

        ok(oracle.call("new").args_json(json!({"owner_id": oracle.id()})).transact().await?);
        ok(pool.call("new").args_json(json!({"owner_id": pool.id()})).transact().await?);
        ok(token
            .call("new")
            .args_json(json!({"owner_id": token.id(), "total_supply": s(tok(10_000_000)),
                              "name": "Ceaser Test", "symbol": "CSTEST", "decimals": 18}))
            .transact()
            .await?);
        ok(vault
            .call("new")
            .args_json(json!({"owner_id": owner.id(), "oracle_id": oracle.id(), "config": config}))
            .transact()
            .await?);
        ok(owner
            .call(vault.id(), "add_staking_pool")
            .args_json(json!({"pool_id": pool.id()}))
            .transact()
            .await?);
        for acc in [vault.id(), owner.id()] {
            ok(token
                .call("storage_deposit")
                .args_json(json!({"account_id": acc}))
                .deposit(NearToken::from_millinear(10))
                .transact()
                .await?);
        }

        let env = Self { worker, vault, oracle, token, pool, owner };
        env.set_price(PRICE_1).await?;
        ok(env
            .oracle
            .call("set_liquidity")
            .args_json(json!({"token": env.token.id(), "liquidity": "1000000"}))
            .transact()
            .await?);
        Ok(env)
    }

    async fn user(&self, tokens: u128) -> anyhow::Result<Account> {
        let account = self.worker.dev_create_account().await?;
        ok(self
            .token
            .call("mint")
            .args_json(json!({"account_id": account.id(), "amount": s(tok(tokens))}))
            .transact()
            .await?);
        Ok(account)
    }

    /// An account that is not registered on the token, so transfers to it fail.
    async fn unregistered(&self) -> anyhow::Result<Account> {
        Ok(self.worker.dev_create_account().await?)
    }

    async fn register(&self, account: &Account) -> anyhow::Result<()> {
        ok(self
            .token
            .call("storage_deposit")
            .args_json(json!({"account_id": account.id()}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?);
        Ok(())
    }

    async fn stake(&self, account: &Account, near_amount: u128) -> anyhow::Result<()> {
        ok(self
            .pool
            .call("set_account_staked_balance")
            .args_json(json!({"account_id": account.id(), "amount": near(near_amount)}))
            .transact()
            .await?);
        Ok(())
    }

    async fn now(&self) -> anyhow::Result<u64> {
        Ok(self.worker.view_block().await?.timestamp() / 1_000_000_000)
    }

    async fn advance(&self, secs: u64) -> anyhow::Result<()> {
        let target = self.now().await? + secs;
        while self.now().await? < target {
            self.worker.fast_forward(secs.max(2)).await?;
        }
        Ok(())
    }

    async fn advance_to(&self, ts: u64) -> anyhow::Result<()> {
        let now = self.now().await?;
        if ts >= now {
            self.advance(ts - now + 1).await?;
        }
        Ok(())
    }

    async fn set_price(&self, price: u128) -> anyhow::Result<()> {
        ok(self
            .oracle
            .call("set_price")
            .args_json(json!({"token": self.token.id(), "price": s(price)}))
            .transact()
            .await?);
        Ok(())
    }

    async fn balance(&self, account: &Account) -> anyhow::Result<u128> {
        self.balance_of(account.id()).await
    }

    async fn balance_of(&self, account: &near_workspaces::AccountId) -> anyhow::Result<u128> {
        let v: Value = self
            .token
            .view("ft_balance_of")
            .args_json(json!({"account_id": account}))
            .await?
            .json()?;
        Ok(u(&v))
    }

    async fn deposit(&self, from: &Account, amount: u128, msg: Value) -> anyhow::Result<ExecutionFinalResult> {
        Ok(from
            .call(self.token.id(), "ft_transfer_call")
            .args_json(json!({"receiver_id": self.vault.id(), "amount": s(amount), "msg": msg.to_string()}))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?)
    }

    /// Locks tokens and returns the new lock id.
    async fn lock(&self, from: &Account, amount: u128, params: Value) -> anyhow::Result<u64> {
        let before = self.balance(from).await?;
        ok(self.deposit(from, amount, json!({"lock": params})).await?);
        assert_eq!(self.balance(from).await?, before - amount, "lock deposit was refunded");
        let count: u64 = self.vault.view("get_lock_count").await?.json()?;
        Ok(count)
    }

    /// Attempts a lock that must be rejected: the deposit comes back in full.
    async fn lock_rejected(&self, from: &Account, amount: u128, params: Value) -> anyhow::Result<()> {
        let before = self.balance(from).await?;
        let count_before: u64 = self.vault.view("get_lock_count").await?.json()?;
        self.deposit(from, amount, json!({"lock": params})).await?;
        assert_eq!(self.balance(from).await?, before, "rejected lock was not refunded");
        let count: u64 = self.vault.view("get_lock_count").await?.json()?;
        assert_eq!(count, count_before, "rejected lock was created");
        Ok(())
    }

    async fn create_challenge(&self, threshold: u128, deadline_ts: u64) -> anyhow::Result<u64> {
        self.create_challenge_with(threshold, deadline_ts, 5, self.token.id().clone()).await
    }

    async fn create_challenge_with(
        &self,
        threshold: u128,
        deadline_ts: u64,
        min_lock: u64,
        sponsor_token: near_workspaces::AccountId,
    ) -> anyhow::Result<u64> {
        let res = self
            .vault
            .call("create_challenge")
            .args_json(json!({"params": {
                "title": "Hold the line", "token": self.token.id(), "threshold_amount": s(threshold),
                "deadline_ts": deadline_ts, "min_lock_duration_sec": min_lock,
                "sponsor_token": sponsor_token, "boost_reserve_bps": 2000}}))
            .transact()
            .await?;
        Ok(ok(res).json()?)
    }

    async fn call(&self, from: &Account, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
        Ok(from.call(self.vault.id(), method).args_json(args).max_gas().transact().await?)
    }

    async fn view(&self, method: &str, args: Value) -> anyhow::Result<Value> {
        Ok(self.vault.view(method).args_json(args).await?.json()?)
    }

    async fn owed(&self, account: &Account) -> anyhow::Result<u128> {
        Ok(u(&self
            .view("get_owed", json!({"account_id": account.id(), "token": self.token.id()}))
            .await?))
    }

    async fn check(&self, from: &Account, lock_id: u64, idx: u32) -> anyhow::Result<String> {
        Ok(ok(self
            .call(from, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": idx}))
            .await?)
        .json()?)
    }
}

/// Asserts the transaction and every receipt it spawned succeeded.
fn ok(res: ExecutionFinalResult) -> ExecutionFinalResult {
    assert!(res.is_success(), "transaction failed: {res:#?}");
    for failure in res.receipt_failures() {
        panic!("receipt failed: {failure:#?}");
    }
    res
}

/// The top-level call succeeded even though a spawned receipt (e.g. a payout) failed.
fn call_ok(res: ExecutionFinalResult) -> ExecutionFinalResult {
    assert!(res.is_success(), "transaction failed: {res:#?}");
    res
}

fn ladder() -> Value {
    json!({"roi_ladder": {"tranches": [
        {"fraction_bps": 5000, "multiplier_bps": 15000},
        {"fraction_bps": 2500, "multiplier_bps": 20000},
        {"fraction_bps": 2500, "multiplier_bps": 30000}]}})
}

fn params(strategy: Value) -> Value {
    json!({"strategy": strategy, "max_duration_sec": 1_000_000, "penalty_bps": 2000,
           "penalty_sink": null, "challenge_id": null, "staking_pool": null})
}

fn challenge_params(cid: u64, staking_pool: Option<&Contract>) -> Value {
    json!({"strategy": {"collective_threshold": {"challenge_id": cid}},
           "max_duration_sec": 1_000_000, "penalty_bps": 2000, "penalty_sink": null,
           "challenge_id": cid, "staking_pool": staking_pool.map(|p| p.id())})
}

// ---------------------------------------------------------------- strategies

#[tokio::test]
async fn plain_time_lock_unlocks_once_and_only_once() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(1_000).await?;
    let end = env.now().await? + 30;
    let lock_id = env.lock(&alice, tok(1_000), params(json!({"time": {"end_ts": end}}))).await?;

    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["tranches"].as_array().unwrap().len(), 1);
    assert_eq!(lock["tranches"][0]["conditions"], json!([{"time_after": {"ts": end}}]));
    assert_eq!(lock["reference_price"], Value::Null);

    // Too early: nothing to claim, and check_unlock has no price condition to read.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": 0})).await?.is_failure());
    let claimable = env.view("get_claimable", json!({"lock_id": lock_id})).await?;
    assert_eq!(u(&claimable["principal"]), 0);

    // A stranger cannot claim or exit someone else's lock.
    let mallory = env.user(0).await?;
    assert!(env.call(&mallory, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&mallory, "early_exit", json!({"lock_id": lock_id})).await?.is_failure());

    env.advance_to(end).await?;
    let claimable = env.view("get_claimable", json!({"lock_id": lock_id})).await?;
    assert_eq!(u(&claimable["principal"]), tok(1_000));
    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(1_000));
    assert_eq!(u(&res["reward"]), 0);
    assert_eq!(env.balance(&alice).await?, tok(1_000));
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["status"], "closed");
    assert_eq!(u(&lock["claimed_amount"]), tok(1_000));

    // Double claim and exit-after-claim are rejected and move no tokens.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&alice, "early_exit", json!({"lock_id": lock_id})).await?.is_failure());
    assert_eq!(env.balance(&alice).await?, tok(1_000));
    assert_eq!(env.balance_of(env.vault.id()).await?, 0);
    Ok(())
}

#[tokio::test]
async fn any_strategy_ladder_or_time_unlocks_on_either() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let end = env.now().await? + 60;
    let strategy = json!({"any": [ladder(), {"time": {"end_ts": end}}]});
    let lock_id = env.lock(&alice, tok(100_000), params(strategy)).await?;

    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    let tranches = lock["tranches"].as_array().unwrap();
    assert_eq!(tranches.len(), 3, "the ladder sets the split");
    for t in tranches {
        assert_eq!(t["conditions"].as_array().unwrap().len(), 2, "every rung also unlocks on time");
        assert_eq!(t["conditions"][1], json!({"time_after": {"ts": end}}));
    }
    assert_eq!(u(&lock["reference_price"]), PRICE_1);

    // The price path still works on its own: rung 0 ripens at 1.6x.
    env.set_price(PRICE_1 * 16 / 10).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "armed");
    env.advance(COOLDOWN + 1).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "ripe");
    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));

    // The time path releases the two unripe rungs together.
    env.advance_to(end).await?;
    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));
    assert_eq!(env.balance(&alice).await?, tok(100_000));
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["status"], "closed");

    // Malformed strategies are rejected and refunded: two ladders, an empty any,
    // rungs that do not sum to 100%, and a rung at or below 1.0x.
    let bob = env.user(1_000).await?;
    env.lock_rejected(&bob, tok(1_000), params(json!({"any": [ladder(), ladder()]}))).await?;
    env.lock_rejected(&bob, tok(1_000), params(json!({"any": []}))).await?;
    env.lock_rejected(&bob, tok(1_000), params(json!({"roi_ladder": {"tranches": [
        {"fraction_bps": 5000, "multiplier_bps": 15000}]}}))).await?;
    env.lock_rejected(&bob, tok(1_000), params(json!({"roi_ladder": {"tranches": [
        {"fraction_bps": 10000, "multiplier_bps": 10000}]}}))).await?;
    Ok(())
}

#[tokio::test]
async fn max_duration_tail_releases_unripe_price_tranches() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let mut p = params(ladder());
    p["max_duration_sec"] = json!(40);
    let lock_id = env.lock(&alice, tok(100_000), p).await?;
    let start = env.view("get_lock", json!({"lock_id": lock_id})).await?["start_ts"].as_u64().unwrap();

    // Price never moves, so no rung ever ripens.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert_eq!(env.check(&alice, lock_id, 2).await?, "not_met");

    env.advance_to(start + 40).await?;
    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(100_000));
    assert_eq!(env.balance(&alice).await?, tok(100_000));
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["status"], "closed");
    for t in lock["tranches"].as_array().unwrap() {
        assert_eq!(t["claimed"], true);
        assert_eq!(t["ripe"], false, "the tail guard pays without faking ripeness");
    }
    // Out of range durations are rejected and refunded.
    let bob = env.user(1_000).await?;
    let mut p = params(ladder());
    p["max_duration_sec"] = json!(0);
    env.lock_rejected(&bob, tok(1_000), p.clone()).await?;
    p["max_duration_sec"] = json!(63_072_001);
    env.lock_rejected(&bob, tok(1_000), p).await?;
    Ok(())
}

#[tokio::test]
async fn min_tranche_lock_sec_delays_arming() -> anyhow::Result<()> {
    let env = Env::with_config(json!({
        "max_penalty_bps": 2000, "twap_window_sec": TWAP_WINDOW, "cooldown_sec": COOLDOWN,
        "min_oracle_liquidity": "1000", "min_tranche_lock_sec": 60,
        "max_lock_duration_sec": 63072000}))
    .await?;
    let alice = env.user(100_000).await?;
    let lock_id = env.lock(&alice, tok(100_000), params(ladder())).await?;
    let start = env.view("get_lock", json!({"lock_id": lock_id})).await?["start_ts"].as_u64().unwrap();

    // The price qualifies for a full window, but the lock is too young to arm.
    env.set_price(PRICE_1 * 2).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "not_met");
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["tranches"][0]["armed_at_ts"], Value::Null);
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());

    env.advance_to(start + 60).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "armed");
    env.advance(COOLDOWN + 1).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "ripe");
    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));
    Ok(())
}

#[tokio::test]
async fn failed_oracle_read_does_not_disarm() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let lock_id = env.lock(&alice, tok(100_000), params(ladder())).await?;
    env.set_price(PRICE_1 * 2).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "armed");

    // The oracle goes away. A failed read is not "the condition is no longer true".
    let bogus: near_workspaces::AccountId = "nobody.test.near".parse()?;
    ok(env.owner.call(env.vault.id(), "set_oracle").args_json(json!({"oracle_id": bogus})).transact().await?);
    env.advance(COOLDOWN + 1).await?;
    // The oracle receipt itself fails, so only the vault call is asserted here.
    let status: String = call_ok(env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": 0})).await?).json()?;
    assert_ne!(status, "ripe", "a failed read must never ripen a tranche");
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert!(lock["tranches"][0]["armed_at_ts"].is_number(), "oracle outage disarmed the tranche");

    // Oracle back: the original arming still counts and the tranche ripens.
    ok(env.owner.call(env.vault.id(), "set_oracle").args_json(json!({"oracle_id": env.oracle.id()})).transact().await?);
    assert_eq!(env.check(&alice, lock_id, 0).await?, "ripe");
    Ok(())
}

// ---------------------------------------------------------------- payouts

#[tokio::test]
async fn failed_payout_is_owed_and_withdrawable() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let sink = env.unregistered().await?;
    let mut p = params(ladder());
    p["penalty_sink"] = json!({"account": sink.id()});
    let lock_id = env.lock(&alice, tok(100_000), p).await?;

    // The 20k penalty cannot be delivered to an unregistered account.
    let res = call_ok(env.call(&alice, "early_exit", json!({"lock_id": lock_id})).await?);
    let exit: Value = res.json()?;
    assert_eq!(u(&exit["penalty"]), tok(20_000));
    assert_eq!(env.balance(&alice).await?, tok(80_000));
    assert_eq!(env.owed(&sink).await?, tok(20_000));
    assert_eq!(env.balance_of(env.vault.id()).await?, tok(20_000), "the penalty stayed in the vault");

    // Retrying while still unregistered fails again and keeps the debt.
    call_ok(env.call(&sink, "withdraw_owed", json!({"token": env.token.id()})).await?);
    assert_eq!(env.owed(&sink).await?, tok(20_000));
    // Nobody else can pull it.
    assert!(env.call(&alice, "withdraw_owed", json!({"token": env.token.id()})).await?.is_failure());

    env.register(&sink).await?;
    let got: Value = ok(env.call(&sink, "withdraw_owed", json!({"token": env.token.id()})).await?).json()?;
    assert_eq!(u(&got), tok(20_000));
    assert_eq!(env.balance(&sink).await?, tok(20_000));
    assert_eq!(env.owed(&sink).await?, 0);
    assert!(env.call(&sink, "withdraw_owed", json!({"token": env.token.id()})).await?.is_failure());
    assert_eq!(env.balance_of(env.vault.id()).await?, 0);
    Ok(())
}

#[tokio::test]
async fn double_claim_and_double_exit_are_rejected() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let lock_id = env.lock(&alice, tok(100_000), params(ladder())).await?;

    env.set_price(PRICE_1 * 16 / 10).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "armed");
    env.advance(COOLDOWN + 1).await?;
    assert_eq!(env.check(&alice, lock_id, 0).await?, "ripe");

    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));
    // Same ripe tranche again: nothing to claim, check_unlock refuses a claimed tranche.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": 0})).await?.is_failure());
    assert_eq!(env.balance(&alice).await?, tok(50_000));

    // Exit pays the rest minus the penalty on the unripe half only.
    let exit: Value = ok(env.call(&alice, "early_exit", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&exit["penalty"]), tok(10_000));
    assert_eq!(u(&exit["returned"]), tok(40_000));
    assert_eq!(env.balance(&alice).await?, tok(90_000));
    assert_eq!(env.balance(&env.owner).await?, tok(10_000), "default sink is the treasury");

    // Exited is final: no second exit, no claim, no check_unlock.
    assert!(env.call(&alice, "early_exit", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert!(env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": 1})).await?.is_failure());
    assert_eq!(env.balance(&alice).await?, tok(90_000));
    assert_eq!(env.balance_of(env.vault.id()).await?, 0);
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["status"], "exited");
    assert_eq!(u(&lock["claimed_amount"]), tok(90_000));
    Ok(())
}

// ---------------------------------------------------------------- challenges

#[tokio::test]
async fn exit_after_deadline_before_finalize_keeps_the_earned_reward() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let sponsor = env.user(10_000).await?;
    let bob = env.user(50_000).await?;
    let deadline = env.now().await? + 40;
    let cid = env.create_challenge(tok(50_000), deadline).await?;
    ok(env.deposit(&sponsor, tok(10_000), json!({"sponsor": {"challenge_id": cid}})).await?);
    let bob_lock = env.lock(&bob, tok(50_000), challenge_params(cid, None)).await?;

    // Nobody called finalize. Bob leaves after the deadline.
    env.advance_to(deadline).await?;
    let exit: Value = ok(env.call(&bob, "early_exit", json!({"lock_id": bob_lock})).await?).json()?;
    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(ch["state"], "succeeded", "exit finalized the overdue challenge first");
    assert_eq!(ch["participant_count"], 1, "a finalized challenge keeps its roster");
    // The challenge is over, so every tranche is free and no penalty applies.
    assert_eq!(u(&exit["penalty"]), 0);
    assert_eq!(u(&exit["returned"]), tok(50_000));

    // Bob stayed the whole challenge, so his reward is his. Base pool is 8k of the 10k.
    let lock = env.view("get_lock", json!({"lock_id": bob_lock})).await?;
    assert_eq!(lock["status"], "exited");
    assert_eq!(lock["reward_claimed"], true, "reward stranded in the vault");
    assert_eq!(env.balance(&bob).await?, tok(50_000) + tok(8_000));
    assert!(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?.is_failure());
    // Only the boost reserve is left in the vault.
    assert_eq!(env.balance_of(env.vault.id()).await?, tok(2_000));
    Ok(())
}

#[tokio::test]
async fn multi_participant_rewards_never_exceed_the_pool() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let sponsor = env.user(10_000).await?;
    let dave = env.user(100_000).await?;
    let bob = env.user(40_000).await?;
    let carol = env.user(30_000).await?;
    let erin = env.user(30_000).await?;
    env.stake(&carol, 100).await?; // 1.25x
    env.stake(&erin, 10_000).await?; // 2.00x

    let deadline = env.now().await? + 90;
    let cid = env.create_challenge(tok(100_000), deadline).await?;
    ok(env.deposit(&sponsor, tok(10_000), json!({"sponsor": {"challenge_id": cid}})).await?);
    let mut dp = params(ladder());
    dp["penalty_sink"] = json!({"challenge": cid});
    let dave_lock = env.lock(&dave, tok(100_000), dp).await?;
    let bob_lock = env.lock(&bob, tok(40_000), challenge_params(cid, Some(&env.pool))).await?;
    let carol_lock = env.lock(&carol, tok(30_000), challenge_params(cid, Some(&env.pool))).await?;
    let erin_lock = env.lock(&erin, tok(30_000), challenge_params(cid, Some(&env.pool))).await?;
    ok(env.call(&dave, "early_exit", json!({"lock_id": dave_lock})).await?);

    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(u(&ch["total_locked"]), tok(100_000));
    assert_eq!(ch["participant_count"], 3);
    assert_eq!(u(&ch["penalty_total"]), tok(20_000));
    assert_eq!(u(&ch["sponsor_total"]), tok(10_000));
    let mut total_conv = 0;
    for id in [bob_lock, carol_lock, erin_lock] {
        total_conv += u(&env.view("get_lock", json!({"lock_id": id})).await?["conviction"]);
    }
    assert_eq!(u(&ch["total_conviction"]), total_conv);

    env.advance_to(deadline).await?;
    let ch: Value = ok(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?).json()?;
    assert_eq!(ch["state"], "succeeded");
    let distributable = tok(30_000);
    let base_pool = u(&ch["base_pool"]);
    let reserve = u(&ch["reserve_remaining"]);
    assert_eq!(base_pool + reserve, distributable);
    assert_eq!(reserve, tok(6_000));

    // Everyone claims; the biggest booster goes first and eats the most reserve.
    let (mut paid, mut extras) = (0u128, 0u128);
    for (who, id, boost) in [(&erin, erin_lock, 20000u128), (&carol, carol_lock, 12500), (&bob, bob_lock, 10000)] {
        let res: Value = ok(env.call(who, "claim", json!({"lock_id": id})).await?).json()?;
        assert_eq!(res["boost_bps"].as_u64().unwrap() as u128, boost);
        let lock = env.view("get_lock", json!({"lock_id": id})).await?;
        // Amounts are whole tokens, so the 1e18 factor cancels exactly and nothing overflows.
        let base = base_pool * (u(&lock["conviction"]) / tok(1)) / (total_conv / tok(1));
        let reward = u(&res["reward"]);
        assert!(reward >= base, "reward below pro-rata base");
        assert!(reward <= base * boost / 10000, "reward above the boosted base");
        paid += reward;
        extras += reward - base;
        assert!(env.call(who, "claim", json!({"lock_id": id})).await?.is_failure(), "reward paid twice");
    }
    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert!(paid <= distributable, "rewards exceed the pool");
    assert!(paid - extras >= base_pool - 3, "base pool not fully distributed");
    assert!(extras <= reserve, "boosts exceed the reserve");
    assert_eq!(u(&ch["reserve_remaining"]), reserve - extras, "reserve bookkeeping");
    // Every principal left, every reward left, and exactly the unpaid remainder stays.
    assert_eq!(env.balance_of(env.vault.id()).await?, distributable - paid);
    assert_eq!(env.balance(&bob).await? + env.balance(&carol).await? + env.balance(&erin).await?, tok(100_000) + paid);
    Ok(())
}

#[tokio::test]
async fn challenge_edge_cases() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let bob = env.user(10_000).await?;
    let sponsor = env.user(10_000).await?;

    // A challenge nobody joins: penalties sent to it are orphaned to the treasury.
    let deadline = env.now().await? + 40;
    let cid = env.create_challenge(tok(1_000), deadline).await?;
    let mut p = params(ladder());
    p["penalty_sink"] = json!({"challenge": cid});
    let alice_lock = env.lock(&alice, tok(50_000), p.clone()).await?;
    ok(env.call(&alice, "early_exit", json!({"lock_id": alice_lock})).await?);
    ok(env.deposit(&sponsor, tok(10_000), json!({"sponsor": {"challenge_id": cid}})).await?);
    assert!(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?.is_failure(), "before deadline");

    // Joining with too little time left before the deadline is rejected and refunded.
    env.advance_to(deadline - 3).await?;
    env.lock_rejected(&bob, tok(1_000), challenge_params(cid, None)).await?;
    env.advance_to(deadline).await?;
    env.lock_rejected(&bob, tok(1_000), challenge_params(cid, None)).await?;

    let ch: Value = ok(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?).json()?;
    assert_eq!(ch["state"], "failed");
    assert_eq!(u(&ch["penalty_total"]), tok(10_000));
    assert_eq!(u(&ch["base_pool"]), 0);
    assert_eq!(env.owed(&env.owner).await?, tok(10_000), "orphaned penalties go to the treasury");
    assert!(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?.is_failure(), "twice");
    // Sponsors of a failed challenge get their money back, once.
    let r: Value = ok(env.call(&bob, "refund_sponsor", json!({"challenge_id": cid, "sponsor_id": sponsor.id()})).await?).json()?;
    assert_eq!(u(&r), tok(10_000));
    assert!(env.call(&bob, "refund_sponsor", json!({"challenge_id": cid, "sponsor_id": sponsor.id()})).await?.is_failure());
    assert_eq!(env.balance(&sponsor).await?, tok(10_000));
    // The treasury pulls what it is owed.
    ok(env.owner.call(env.vault.id(), "withdraw_owed").args_json(json!({"token": env.token.id()})).max_gas().transact().await?);
    assert_eq!(env.balance(&env.owner).await?, tok(10_000));

    // Joining, sponsoring or sinking into a finalized challenge.
    env.lock_rejected(&bob, tok(1_000), challenge_params(cid, None)).await?;
    let before = env.balance(&bob).await?;
    env.deposit(&bob, tok(1_000), json!({"sponsor": {"challenge_id": cid}})).await?;
    assert_eq!(env.balance(&bob).await?, before, "sponsoring a finalized challenge is refunded");
    let bob_lock = env.lock(&bob, tok(10_000), p).await?;
    let exit: Value = ok(env.call(&bob, "early_exit", json!({"lock_id": bob_lock})).await?).json()?;
    assert_eq!(exit["sink"], json!({"account": env.owner.id()}), "finalized sink falls back to the treasury");
    assert_eq!(env.balance(&env.owner).await?, tok(12_000));

    // A sink challenge whose pool token differs from the locked token is rejected.
    let token2 = env.worker.dev_deploy(&std::fs::read("../res/test_token.wasm")?).await?;
    ok(token2.call("new").args_json(json!({"owner_id": token2.id(), "total_supply": "0",
        "name": "Other", "symbol": "OTHER", "decimals": 18})).transact().await?);
    let deadline = env.now().await? + 60;
    let mixed = env.create_challenge_with(tok(1_000), deadline, 5, token2.id().clone()).await?;
    let mut p = params(ladder());
    p["penalty_sink"] = json!({"challenge": mixed});
    env.lock_rejected(&bob, tok(1_000), p).await?;
    // And a wrong-token sponsor deposit is refunded.
    let before = env.balance(&bob).await?;
    env.deposit(&bob, tok(1_000), json!({"sponsor": {"challenge_id": mixed}})).await?;
    assert_eq!(env.balance(&bob).await?, before);

    // Unknown ids and garbage messages never keep the tokens.
    env.lock_rejected(&bob, tok(1_000), challenge_params(999, None)).await?;
    let before = env.balance(&bob).await?;
    env.deposit(&bob, tok(1_000), json!({"nonsense": 1})).await?;
    assert_eq!(env.balance(&bob).await?, before);
    assert_eq!(env.balance_of(env.vault.id()).await?, 0, "the vault holds nothing it does not owe");
    Ok(())
}

#[tokio::test]
async fn owner_handover_default_sink_fallback_and_late_sponsoring() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let bob = env.user(10_000).await?;

    // Only the owner can hand the treasury role to another account.
    assert!(env.call(&bob, "set_owner", json!({"owner_id": bob.id()})).await?.is_failure());
    let treasury = env.user(0).await?;
    ok(env.call(&env.owner, "set_owner", json!({"owner_id": treasury.id()})).await?);
    assert_eq!(env.view("get_owner", json!({})).await?, json!(treasury.id()));
    assert!(env.call(&env.owner, "set_owner", json!({"owner_id": env.owner.id()})).await?.is_failure());

    // Joining a challenge whose pool token differs works with the default sink,
    // which falls back to the treasury.
    let token2 = env.worker.dev_deploy(&std::fs::read("../res/test_token.wasm")?).await?;
    ok(token2.call("new").args_json(json!({"owner_id": token2.id(), "total_supply": "0",
        "name": "Other", "symbol": "OTHER", "decimals": 18})).transact().await?);
    let deadline = env.now().await? + 60;
    let mixed = env.create_challenge_with(tok(1_000), deadline, 5, token2.id().clone()).await?;
    let lock_id = env.lock(&bob, tok(1_000), challenge_params(mixed, None)).await?;
    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["penalty_sink"], json!({"account": treasury.id()}));
    let exit: Value = ok(env.call(&bob, "early_exit", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&exit["penalty"]), tok(200));
    assert_eq!(env.balance(&treasury).await?, tok(200), "penalty reaches the new treasury");

    // Sponsoring is closed once the deadline has passed, even before finalize.
    let deadline = env.now().await? + 20;
    let cid = env.create_challenge(tok(1_000), deadline).await?;
    ok(env.deposit(&bob, tok(100), json!({"sponsor": {"challenge_id": cid}})).await?);
    env.advance_to(deadline).await?;
    let before = env.balance(&bob).await?;
    env.deposit(&bob, tok(100), json!({"sponsor": {"challenge_id": cid}})).await?;
    assert_eq!(env.balance(&bob).await?, before, "late sponsor deposit is refunded");
    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(u(&ch["sponsor_total"]), tok(100));
    Ok(())
}
