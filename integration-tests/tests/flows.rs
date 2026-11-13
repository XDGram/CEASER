//! End-to-end flows against a local sandbox. Run `./build.sh` first.
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

struct Env {
    worker: Worker<Sandbox>,
    vault: Contract,
    oracle: Contract,
    token: Contract,
    pool: Contract,
}

impl Env {
    async fn new() -> anyhow::Result<Self> {
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
            .args_json(json!({"owner_id": vault.id(), "oracle_id": oracle.id(), "config": {
                "max_penalty_bps": 2000, "twap_window_sec": TWAP_WINDOW, "cooldown_sec": COOLDOWN,
                "min_oracle_liquidity": "1000", "min_tranche_lock_sec": 0,
                "max_lock_duration_sec": 63072000}}))
            .transact()
            .await?);
        ok(vault.call("add_staking_pool").args_json(json!({"pool_id": pool.id()})).transact().await?);
        ok(token
            .call("storage_deposit")
            .args_json(json!({"account_id": vault.id()}))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?);

        let env = Self { worker, vault, oracle, token, pool };
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
        let v: Value = self
            .token
            .view("ft_balance_of")
            .args_json(json!({"account_id": account.id()}))
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

    async fn create_challenge(&self, threshold: u128, deadline_ts: u64) -> anyhow::Result<u64> {
        let res = self
            .vault
            .call("create_challenge")
            .args_json(json!({"params": {
                "title": "Hold the line", "token": self.token.id(), "threshold_amount": s(threshold),
                "deadline_ts": deadline_ts, "min_lock_duration_sec": 5,
                "sponsor_token": self.token.id(), "boost_reserve_bps": 2000}}))
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
}

/// Asserts the transaction and every receipt it spawned succeeded.
fn ok(res: ExecutionFinalResult) -> ExecutionFinalResult {
    assert!(res.is_success(), "transaction failed: {res:#?}");
    for failure in res.receipt_failures() {
        panic!("receipt failed: {failure:#?}");
    }
    res
}

fn ladder() -> Value {
    json!({"roi_ladder": {"tranches": [
        {"fraction_bps": 5000, "multiplier_bps": 15000},
        {"fraction_bps": 2500, "multiplier_bps": 20000},
        {"fraction_bps": 2500, "multiplier_bps": 30000}]}})
}

fn roi_params() -> Value {
    json!({"strategy": ladder(), "max_duration_sec": 1_000_000, "penalty_bps": 2000,
           "penalty_sink": null, "challenge_id": null, "staking_pool": null})
}

fn challenge_params(cid: u64, staking_pool: Option<&Contract>) -> Value {
    json!({"strategy": {"collective_threshold": {"challenge_id": cid}},
           "max_duration_sec": 1_000_000, "penalty_bps": 2000, "penalty_sink": null,
           "challenge_id": cid, "staking_pool": staking_pool.map(|p| p.id())})
}

#[tokio::test]
async fn roi_ladder_partial_claims() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let lock_id = env.lock(&alice, tok(100_000), roi_params()).await?;

    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(u(&lock["reference_price"]), PRICE_1);
    assert_eq!(lock["tranches"].as_array().unwrap().len(), 3);

    // Nothing is claimable before any target is hit.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());

    // Price moves to 1.6x: only the first rung (1.5x) can ripen.
    env.set_price(PRICE_1 * 16 / 10).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    let check = |idx: u32| env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": idx}));
    assert_eq!(ok(check(0).await?).json::<String>()?, "armed");
    assert_eq!(ok(check(0).await?).json::<String>()?, "cooling_down");
    assert_eq!(ok(check(1).await?).json::<String>()?, "not_met");

    // Armed is not ripe: still nothing to claim.
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());

    env.advance(COOLDOWN + 1).await?;
    assert_eq!(ok(check(0).await?).json::<String>()?, "ripe");

    let res: Value = ok(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));
    assert_eq!(env.balance(&alice).await?, tok(50_000));

    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["status"], "active");
    assert_eq!(lock["tranches"][0]["claimed"], true);
    assert_eq!(lock["tranches"][1]["claimed"], false);
    assert_eq!(u(&lock["claimed_amount"]), tok(50_000));
    Ok(())
}

#[tokio::test]
async fn two_read_commit_blocks_price_spikes() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let lock_id = env.lock(&alice, tok(100_000), roi_params()).await?;
    let check = || env.call(&alice, "check_unlock", json!({"lock_id": lock_id, "tranche_idx": 0}));

    // A fresh spot spike does not move the TWAP enough.
    env.set_price(PRICE_1 * 16 / 10).await?;
    assert_eq!(ok(check().await?).json::<String>()?, "not_met");

    // The attacker sustains the price for a full window and arms the tranche...
    env.advance(TWAP_WINDOW + 2).await?;
    assert_eq!(ok(check().await?).json::<String>()?, "armed");

    // ...but cannot hold it through the cooldown. The second read disarms.
    env.set_price(PRICE_1).await?;
    env.advance(TWAP_WINDOW + COOLDOWN + 2).await?;
    assert_eq!(ok(check().await?).json::<String>()?, "not_met");

    let lock = env.view("get_lock", json!({"lock_id": lock_id})).await?;
    assert_eq!(lock["tranches"][0]["armed_at_ts"], Value::Null);
    assert_eq!(lock["tranches"][0]["ripe"], false);
    assert!(env.call(&alice, "claim", json!({"lock_id": lock_id})).await?.is_failure());
    assert_eq!(env.balance(&alice).await?, 0);

    // Thin liquidity also blocks a price that would otherwise qualify.
    env.set_price(PRICE_1 * 2).await?;
    env.advance(TWAP_WINDOW + 2).await?;
    ok(env
        .oracle
        .call("set_liquidity")
        .args_json(json!({"token": env.token.id(), "liquidity": "1"}))
        .transact()
        .await?);
    assert_eq!(ok(check().await?).json::<String>()?, "not_met");
    Ok(())
}

#[tokio::test]
async fn collective_threshold_success_pays_pro_rata() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let sponsor = env.user(10_000).await?;
    let bob = env.user(60_000).await?;
    let carol = env.user(60_000).await?;

    let deadline = env.now().await? + 60;
    let cid = env.create_challenge(tok(100_000), deadline).await?;
    ok(env.deposit(&sponsor, tok(10_000), json!({"sponsor": {"challenge_id": cid}})).await?);
    let bob_lock = env.lock(&bob, tok(60_000), challenge_params(cid, None)).await?;
    let carol_lock = env.lock(&carol, tok(60_000), challenge_params(cid, None)).await?;

    // Committed until the challenge resolves.
    assert!(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?.is_failure());
    assert!(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?.is_failure());

    env.advance_to(deadline).await?;
    let ch: Value = ok(env.call(&bob, "finalize", json!({"challenge_id": cid})).await?).json()?;
    assert_eq!(ch["state"], "succeeded");
    assert_eq!(u(&ch["base_pool"]), tok(8_000));
    assert_eq!(u(&ch["reserve_remaining"]), tok(2_000));

    let bob_res: Value = ok(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?).json()?;
    let carol_res: Value = ok(env.call(&carol, "claim", json!({"lock_id": carol_lock})).await?).json()?;
    assert_eq!(u(&bob_res["principal"]), tok(60_000));
    assert_eq!(u(&carol_res["principal"]), tok(60_000));
    assert_eq!(bob_res["boost_bps"], 10000);

    // Bob locked first, so his conviction (amount x time) and reward are larger.
    let (bob_reward, carol_reward) = (u(&bob_res["reward"]), u(&carol_res["reward"]));
    assert!(bob_reward > carol_reward && carol_reward > 0);
    let total = bob_reward + carol_reward;
    assert!(total <= tok(8_000) && total >= tok(8_000) - 2, "base pool fully paid pro-rata");
    assert_eq!(env.balance(&bob).await?, tok(60_000) + bob_reward);

    let lock = env.view("get_lock", json!({"lock_id": bob_lock})).await?;
    assert_eq!(lock["status"], "closed");
    // Sponsor money is not refundable after success.
    assert!(env
        .call(&sponsor, "refund_sponsor", json!({"challenge_id": cid, "sponsor_id": sponsor.id()}))
        .await?
        .is_failure());
    Ok(())
}

#[tokio::test]
async fn collective_threshold_failure_keeps_principal_safe() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let sponsor = env.user(10_000).await?;
    let bob = env.user(50_000).await?;

    let deadline = env.now().await? + 40;
    let cid = env.create_challenge(tok(1_000_000), deadline).await?;
    ok(env.deposit(&sponsor, tok(10_000), json!({"sponsor": {"challenge_id": cid}})).await?);
    let bob_lock = env.lock(&bob, tok(50_000), challenge_params(cid, None)).await?;
    assert_eq!(env.balance(&sponsor).await?, 0);

    env.advance_to(deadline).await?;
    // claim finalizes an overdue challenge on its own.
    let res: Value = ok(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?).json()?;
    assert_eq!(u(&res["principal"]), tok(50_000));
    assert_eq!(u(&res["reward"]), 0);
    assert_eq!(env.balance(&bob).await?, tok(50_000));

    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(ch["state"], "failed");

    let refund = env
        .call(&bob, "refund_sponsor", json!({"challenge_id": cid, "sponsor_id": sponsor.id()}))
        .await?;
    assert_eq!(u(&ok(refund).json::<Value>()?), tok(10_000));
    assert_eq!(env.balance(&sponsor).await?, tok(10_000));
    Ok(())
}

#[tokio::test]
async fn early_exit_penalty_funds_the_challenge_pool() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let bob = env.user(50_000).await?;

    let deadline = env.now().await? + 60;
    let cid = env.create_challenge(tok(50_000), deadline).await?;

    // Alice: personal ROI ladder whose exit penalty feeds challenge `cid`.
    let mut params = roi_params();
    params["penalty_sink"] = json!({"challenge": cid});
    let alice_lock = env.lock(&alice, tok(100_000), params).await?;
    let bob_lock = env.lock(&bob, tok(50_000), challenge_params(cid, None)).await?;

    let exit: Value = ok(env.call(&alice, "early_exit", json!({"lock_id": alice_lock})).await?).json()?;
    assert_eq!(u(&exit["penalty"]), tok(20_000));
    assert_eq!(u(&exit["returned"]), tok(80_000));
    assert_eq!(exit["sink"], json!({"challenge": cid}));
    assert_eq!(env.balance(&alice).await?, tok(80_000));

    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(u(&ch["penalty_total"]), tok(20_000));
    let lock = env.view("get_lock", json!({"lock_id": alice_lock})).await?;
    assert_eq!(lock["status"], "exited");
    assert!(env.call(&alice, "early_exit", json!({"lock_id": alice_lock})).await?.is_failure());

    env.advance_to(deadline).await?;
    let res: Value = ok(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?).json()?;
    // The dumper's 20k penalty is the diamond hand's reward: 80% base, 20% boost reserve.
    assert_eq!(u(&res["principal"]), tok(50_000));
    assert_eq!(u(&res["reward"]), tok(16_000));
    assert_eq!(env.balance(&bob).await?, tok(66_000));
    Ok(())
}

#[tokio::test]
async fn participant_exit_leaves_the_challenge() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let bob = env.user(60_000).await?;
    let carol = env.user(60_000).await?;

    let deadline = env.now().await? + 60;
    let cid = env.create_challenge(tok(100_000), deadline).await?;
    let bob_lock = env.lock(&bob, tok(60_000), challenge_params(cid, None)).await?;
    let carol_lock = env.lock(&carol, tok(60_000), challenge_params(cid, None)).await?;

    ok(env.call(&bob, "early_exit", json!({"lock_id": bob_lock})).await?);
    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(u(&ch["total_locked"]), tok(60_000));
    assert_eq!(ch["participant_count"], 1);
    assert_eq!(u(&ch["penalty_total"]), tok(12_000));

    // Bob's exit sinks the threshold, yet his penalty still pays Carol.
    env.advance_to(deadline).await?;
    let res: Value = ok(env.call(&carol, "claim", json!({"lock_id": carol_lock})).await?).json()?;
    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(ch["state"], "failed");
    assert_eq!(u(&res["principal"]), tok(60_000));
    assert_eq!(u(&res["reward"]), tok(9_600));
    Ok(())
}

#[tokio::test]
async fn near_staking_boost_multiplies_reward() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user(100_000).await?;
    let bob = env.user(50_000).await?;
    let near = |n: u128| s(n * 10u128.pow(24));

    ok(env
        .pool
        .call("set_account_staked_balance")
        .args_json(json!({"account_id": bob.id(), "amount": near(500)}))
        .transact()
        .await?);

    let deadline = env.now().await? + 60;
    let cid = env.create_challenge(tok(50_000), deadline).await?;
    let mut params = roi_params();
    params["penalty_sink"] = json!({"challenge": cid});
    let alice_lock = env.lock(&alice, tok(100_000), params).await?;
    let bob_lock = env.lock(&bob, tok(50_000), challenge_params(cid, Some(&env.pool))).await?;
    ok(env.call(&alice, "early_exit", json!({"lock_id": alice_lock})).await?);

    // A pool that is not whitelisted is rejected and the deposit refunded.
    let carol = env.user(1_000).await?;
    let mut bad = challenge_params(cid, None);
    bad["staking_pool"] = json!(env.oracle.id());
    env.deposit(&carol, tok(1_000), json!({"lock": bad})).await?;
    assert_eq!(env.balance(&carol).await?, tok(1_000));

    env.advance_to(deadline).await?;
    let res: Value = ok(env.call(&bob, "claim", json!({"lock_id": bob_lock})).await?).json()?;
    // 500 NEAR staked => 1.25x. Base 16k, boost +4k drawn from the 4k reserve.
    assert_eq!(res["boost_bps"], 12500);
    assert_eq!(u(&res["principal"]), tok(50_000));
    assert_eq!(u(&res["reward"]), tok(20_000));
    assert_eq!(env.balance(&bob).await?, tok(70_000));

    let ch = env.view("get_challenge", json!({"challenge_id": cid})).await?;
    assert_eq!(u(&ch["reserve_remaining"]), 0);
    Ok(())
}
