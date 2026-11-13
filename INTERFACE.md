# CEASER interface spec (v1)

This file is the shared agreement between everyone building CEASER in parallel.
If you need something changed, do not improvise: note it under "Open questions"
in your own PR description and keep building against this file.

## What CEASER is (30 seconds)

A NEAR testnet protocol where memecoin holders lock tokens.

- **Lock**: a personal commitment of a NEP-141 token that unlocks in tranches
  (by time, by price target, or when a community Challenge resolves).
- **Challenge**: a community goal ("lock X tokens in total before the deadline")
  with a sponsor reward pool. Success pays the lockers. Failure refunds the
  sponsors. Locker principal is never confiscated.
- **Bridge**: leaving a lock early costs a penalty, and that penalty flows into
  a Challenge pool. Dumpers pay diamond hands.
- **NEAR boost**: lockers with NEAR staked in a whitelisted staking pool get a
  multiplier on their Challenge reward.

Pitch line: "Memecoin dumps pay the diamond hands. Diamond hands who back NEAR
get paid more."

## Repo layout and ownership

| Path | Owner | Contents |
|---|---|---|
| `contracts/vault/` | Max session | VaultCore contract (crate `ceaser-vault`) |
| `integration-tests/` | Max session | near-workspaces tests |
| `contracts/test-token/` | Pro 1 | NEP-141 toy token, crate `test-token` |
| `contracts/mock-oracle/` | Pro 1 | MockOracle, crate `mock-oracle` |
| `contracts/mock-staking-pool/` | Pro 1 | staking pool stand-in, crate `mock-staking-pool` |
| `scripts/`, `demo.sh` | Pro 1 | testnet deploy and demo script |
| `frontend/` | Pro 2 | one-page HTML app |
| `README.md`, `LICENSE` | Pro 2 | docs |
| `Cargo.toml`, `build.sh`, `INTERFACE.md`, `.gitignore` | Max session | shared, do not edit |

Only touch the paths you own.

## Build

- Rust stable with `wasm32-unknown-unknown`, plus `cargo-near` (0.23) and `near` (near-cli-rs).
- `near-sdk = { workspace = true }` (5.30.1) and `near-contract-standards = { workspace = true }`.
- Every contract crate sets `crate-type = ["cdylib", "rlib"]`.
- `./build.sh` builds every crate under `contracts/*` and copies the wasm to `res/`:
  `res/ceaser_vault.wasm`, `res/test_token.wasm`, `res/mock_oracle.wasm`, `res/mock_staking_pool.wasm`.
- `res/*.wasm` is gitignored. Scripts must call `./build.sh` first.

## Conventions

- Token amounts and prices are `U128`, JSON-encoded as decimal **strings**.
- Timestamps (`*_ts`) are unix **seconds**, JSON **numbers**. Durations (`*_sec`) are seconds, JSON numbers.
- Basis points: `10000` = 100% = 1.00x. `multiplier_bps: 15000` means price is 1.5x the reference (+50%).
- Ids (`lock_id`, `challenge_id`) are JSON numbers, starting at 1.
- Prices are an arbitrary fixed-point `U128`. Mock convention: USD with 8 decimals per whole token (`"100000000"` = $1). The vault only compares ratios.
- Staked balances are yoctoNEAR (`1 NEAR = 10^24`).
- Events are logged as `EVENT_JSON:{"standard":"ceaser","version":"1.0.0","event":"<name>","data":{...}}`.

---

## 1. Vault (`contracts/vault`, crate `ceaser-vault`)

### Init and admin

```
new(owner_id: AccountId, oracle_id: AccountId, config: Option<Config>)   // #[init]
add_staking_pool(pool_id: AccountId)      // owner only
remove_staking_pool(pool_id: AccountId)   // owner only
set_oracle(oracle_id: AccountId)          // owner only
update_config(config: Config)             // owner only
```

```jsonc
// Config (all fields required when passed; these are the defaults)
{
  "max_penalty_bps": 2000,          // cap on a lock's penalty_bps
  "twap_window_sec": 1800,          // TWAP window used for every oracle read
  "cooldown_sec": 600,              // wait between the two reads of check_unlock
  "min_oracle_liquidity": "0",      // oracle liquidity floor, price checks fail below it
  "min_tranche_lock_sec": 0,        // no price tranche can ripen before start + this
  "max_lock_duration_sec": 63072000 // cap on a lock's max_duration_sec
}
```

The testnet demo deploys with short values (`twap_window_sec: 60`, `cooldown_sec: 30`) so it runs in minutes.

### Deposits: `ft_transfer_call` into the vault

All token deposits are `ft_transfer_call(receiver_id = vault, amount, msg)` on the token contract, with 1 yoctoNEAR attached and at least 100 TGas. `msg` is JSON, one of:

**Create a lock**

```jsonc
{"lock": {
  "strategy": <Strategy>,
  "max_duration_sec": 2592000,       // every tranche unlocks at start + this, no matter what
  "penalty_bps": 2000,               // early-exit penalty, 0..=max_penalty_bps
  "penalty_sink": {"challenge": 1},  // or {"account": "x.testnet"}, or null
  "challenge_id": 1,                 // or null. Joins this Challenge.
  "staking_pool": "pool.testnet"     // or null. Must be whitelisted.
}}
```

- `penalty_sink: null` defaults to the lock's Challenge if it has one, otherwise the vault owner (treasury).
- `penalty_sink: {"challenge": id}` requires that Challenge's `sponsor_token` to equal the locked token.
- Invalid params or a failed oracle read refund the full deposit (standard NEP-141 refund).

**Fund a sponsor pool** (must be sent on the Challenge's `sponsor_token`)

```json
{"sponsor": {"challenge_id": 1}}
```

### Strategy

```jsonc
{"time": {"end_ts": 1790000000}}
{"roi_ladder": {"tranches": [
    {"fraction_bps": 5000, "multiplier_bps": 15000},
    {"fraction_bps": 2500, "multiplier_bps": 20000},
    {"fraction_bps": 2500, "multiplier_bps": 30000}]}}   // fractions must sum to 10000
{"collective_threshold": {"challenge_id": 1}}
{"any": [<Strategy>, <Strategy>, ...]}
```

Strategies compile into tranches at lock creation:

- `time` and `collective_threshold` produce one tranche of 10000 bps.
- `roi_ladder` produces one tranche per rung.
- `any` ORs conditions together: it may contain at most one `roi_ladder` (which sets the tranche split); every other inner strategy adds an alternative unlock condition to every tranche. Nested `any` is flattened. `any` only ever makes a lock unlock sooner.
- `collective_threshold` implies `challenge_id` (they must match if both are given).

Tranche conditions:

```jsonc
{"price_above": {"multiplier_bps": 15000}}     // oracle TWAP >= reference_price * multiplier
{"time_after": {"ts": 1790000000}}
{"challenge_finalized": {"challenge_id": 1}}   // Challenge is Succeeded or Failed
```

`reference_price` is the oracle TWAP read once at lock creation (only for locks with a price condition) and never changes.

### Challenge membership rules

A lock with `challenge_id` set is a participant in that Challenge.

- Requires: lock token == Challenge token, Challenge is `Active`, and `deadline_ts - now >= min_lock_duration_sec`.
- A participating lock cannot `claim` principal until its Challenge is finalized. After that its own strategy governs. `early_exit` is always available.
- Conviction weight = `amount * (deadline_ts - start_ts)`.

### Change methods

```
create_challenge(params: ChallengeParams) -> u64
check_unlock(lock_id: u64, tranche_idx: u32) -> Promise<TrancheStatus>
claim(lock_id: u64) -> Promise<ClaimResult>
early_exit(lock_id: u64) -> Promise<ExitResult>      // lock owner only
finalize(challenge_id: u64) -> ChallengeView          // anyone, after deadline
refund_sponsor(challenge_id: u64, sponsor_id: AccountId) -> Promise<U128>  // anyone, Failed only
```

Attach 100 TGas to `check_unlock`, `claim`, `early_exit`, `refund_sponsor`. No deposit needed.

```jsonc
// ChallengeParams
{
  "title": "Hold the line",
  "token": "cstest.testnet",          // token that must be locked
  "threshold_amount": "100000000000000000000000",
  "deadline_ts": 1790000000,
  "min_lock_duration_sec": 3600,
  "sponsor_token": "cstest.testnet",  // token the reward pool is paid in
  "boost_reserve_bps": 2000           // share of the pool set aside to pay NEAR boosts, 0..=5000
}
```

**`check_unlock`** is the two-read commit for `price_above` tranches. Anyone can call it.

1. First call: reads oracle TWAP and liquidity. If the price condition holds, liquidity is at or above the floor, and `min_tranche_lock_sec` has elapsed, the tranche becomes `armed`.
2. Second call, at least `cooldown_sec` later: reads again. Still true makes the tranche `ripe`. No longer true disarms it.

Returns `"not_met" | "armed" | "cooling_down" | "ripe"`.

**`claim`** pays every claimable tranche (ripe price tranches, elapsed time tranches, finalized-challenge tranches, and everything after `start + max_duration_sec`). If the lock participated in a finalized Challenge and its reward is unclaimed, it also pays the reward, reading the staking pool for the boost. If the Challenge deadline has passed but nobody finalized it, `claim` finalizes it first.

```jsonc
// ClaimResult
{"principal": "50000", "reward": "1250", "boost_bps": 12500}
```

**`early_exit`** pays claimable tranches in full, charges `penalty_bps` on the rest, sends the penalty to the sink, returns the remainder, closes the lock, and removes it from its Challenge.

```jsonc
// ExitResult
{"returned": "80000", "penalty": "20000", "sink": {"challenge": 1}}
```

If the sink Challenge is already finalized, the penalty goes to the vault owner instead.

**`finalize`** sets `Succeeded` if `total_locked >= threshold_amount`, else `Failed`.

### Rewards

At finalize, `distributable = penalty_total + (sponsor_total if Succeeded else 0)`.
Penalties are paid to the lockers who stayed even when the Challenge fails. Sponsor deposits are refundable only on failure.

```
reserve       = distributable * boost_reserve_bps / 10000
base_pool     = distributable - reserve
base_reward   = base_pool * lock_conviction / total_conviction
boost_extra   = min(base_reward * (boost_bps - 10000) / 10000, reserve_remaining)
reward        = base_reward + boost_extra
```

Base rewards always sum to at most `base_pool`. Boosts are paid from the reserve, first come first served, and can never exceed it.

Boost tiers (staked NEAR read from the lock's `staking_pool` via `get_account_staked_balance`):

| Staked NEAR | `boost_bps` |
|---|---|
| < 10 | 10000 |
| >= 10 | 11000 |
| >= 100 | 12500 |
| >= 1,000 | 15000 |
| >= 10,000 | 20000 |

No `staking_pool` on the lock, or a failed read, means 10000.

### View methods

```
get_config() -> Config
get_oracle() -> AccountId
get_owner() -> AccountId
get_staking_pools() -> [AccountId]
get_boost_tiers() -> [[U128 min_staked_yocto, u32 boost_bps]]
get_lock(lock_id: u64) -> LockView | null
get_locks_by_owner(account_id: AccountId, from_index: Option<u64>, limit: Option<u64>) -> [LockView]
get_lock_count() -> u64
get_challenge(challenge_id: u64) -> ChallengeView | null
get_challenges(from_index: Option<u64>, limit: Option<u64>) -> [ChallengeView]
get_challenge_count() -> u64
get_sponsor_contribution(challenge_id: u64, account_id: AccountId) -> U128
get_claimable(lock_id: u64) -> {"principal": U128, "base_reward": U128}
```

```jsonc
// LockView
{
  "id": 1,
  "owner": "alice.testnet",
  "token": "cstest.testnet",
  "amount": "100000000000000000000000",   // original deposit
  "claimed_amount": "0",                  // principal already paid out
  "start_ts": 1780000000,
  "max_duration_sec": 2592000,
  "penalty_bps": 2000,
  "penalty_sink": {"challenge": 1},       // or {"account": "..."}
  "reference_price": "100000000",         // or null
  "strategy": { ... },                    // as submitted
  "tranches": [
    {"fraction_bps": 5000,
     "conditions": [{"price_above": {"multiplier_bps": 15000}}],
     "armed_at_ts": null,                 // set by the first check_unlock read
     "ripe": false,                       // price condition confirmed by the second read
     "claimed": false}
  ],
  "challenge_id": 1,                      // or null
  "staking_pool": "pool.testnet",         // or null
  "conviction": "0",
  "reward_claimed": false,
  "status": "active"                      // "active" | "exited" | "closed"
}
```

```jsonc
// ChallengeView
{
  "id": 1,
  "title": "Hold the line",
  "creator": "bob.testnet",
  "token": "cstest.testnet",
  "threshold_amount": "100000000000000000000000",
  "deadline_ts": 1790000000,
  "min_lock_duration_sec": 3600,
  "sponsor_token": "cstest.testnet",
  "boost_reserve_bps": 2000,
  "sponsor_total": "0",        // refundable sponsor deposits
  "penalty_total": "0",        // early-exit penalties received
  "total_locked": "0",         // sum of participating lock amounts
  "total_conviction": "0",
  "participant_count": 0,
  "state": "active",           // "active" | "succeeded" | "failed"
  "base_pool": "0",            // set at finalize
  "reserve_remaining": "0"     // set at finalize, decreases as boosts are paid
}
```

### Events

`challenge_created`, `sponsor_funded`, `lock_created`, `tranche_armed`, `tranche_ripe`, `tranche_disarmed`, `claimed`, `reward_claimed`, `early_exit`, `challenge_finalized`, `sponsor_refunded`. `data` carries the relevant ids, accounts and amounts.

---

## 2. MockOracle (`contracts/mock-oracle`, crate `mock-oracle`)

Implements the IOracle interface the vault calls.

```
new(owner_id: AccountId)                                   // #[init]
set_price(token: AccountId, price: U128)                   // owner only, appends an observation at the current block time
set_liquidity(token: AccountId, liquidity: U128)           // owner only
twap(token: AccountId, window_sec: u32) -> Option<U128>    // view
liquidity(token: AccountId) -> U128                        // view, 0 if never set
spot(token: AccountId) -> Option<U128>                     // view, latest observation
get_observations(token: AccountId) -> [[u64 ts_ms, U128 price]]   // view
```

TWAP semantics (real time-weighting, not a spot read):

- Observations are `(block_timestamp_ms, price)`, kept per token, newest 64 only.
- The price is piecewise constant: each observation holds until the next one.
- `twap` integrates over `[max(now - window, first_observation_ts), now]` and returns `floor(integral / span)`.
- No observations returns `null`. A span of 0 returns the latest price.

So after `set_price` jumps the price, the TWAP only reaches the new price once a full window has passed.

A `RefTwapOracle` stub (same `twap` / `liquidity` signatures, body documented but unimplemented, describing the Ref Finance pool read) may live in the same crate as a commented module or a separate file. It is not deployed.

## 3. Mock staking pool (`contracts/mock-staking-pool`, crate `mock-staking-pool`)

Mirrors the one method of NEAR's core staking pool contract that the vault needs.

```
new(owner_id: AccountId)                                              // #[init]
set_account_staked_balance(account_id: AccountId, amount: U128)       // owner only
get_account_staked_balance(account_id: AccountId) -> U128             // view, yoctoNEAR, 0 if unknown
```

## 4. Test token (`contracts/test-token`, crate `test-token`)

Standard NEP-141 + NEP-145 (storage) + NEP-148 (metadata) using `near-contract-standards`, following the NEAR examples fungible token exactly.

```
new(owner_id: AccountId, total_supply: U128, name: String, symbol: String, decimals: u8)   // #[init]
mint(account_id: AccountId, amount: U128)   // public faucet, registers the account if needed
```

Deployed as symbol `CSTEST`, 18 decimals. The vault account and every user must be storage-registered on the token (`storage_deposit`) before receiving it. `mint` handles registration for its target.

---

## 5. Testnet demo arc (`demo.sh`)

1. User A locks 100k CSTEST with an ROI ladder 50/25/25 at +50% / +100% / +200%, penalty 20% into Challenge C1.
2. User B locks 50k CSTEST into Challenge C1. B has 500 NEAR staked in the mock pool, so 1.25x.
3. User A calls `early_exit`. 20k CSTEST penalty appears in C1 `penalty_total`.
4. MockOracle price advances; C1 deadline passes; `finalize(C1)` gives `succeeded`.
5. User B calls `claim` and receives principal plus the boosted reward.

`demo.sh` prints and asserts each step's observable output (view calls and events).
Deployed account ids are written to `scripts/deployed.json`:

```json
{"network": "testnet", "vault": "...", "oracle": "...", "token": "...", "staking_pool": "..."}
```

The frontend reads its contract ids from `frontend/config.js`, which mirrors that file.
