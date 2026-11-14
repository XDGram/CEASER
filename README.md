# CEASER

> Memecoin dumps pay the diamond hands. Diamond hands who back NEAR get paid more.

A NEAR testnet protocol where memecoin holders lock tokens behind time, price
or community conditions. Leaving a lock early costs a penalty, and that penalty
flows to the lockers who stayed. Lockers who also stake NEAR earn a multiplier
on their Challenge reward.

Built for a NEAR hackathon. Testnet only. **The price oracle is a mock.**

**Live app:** https://ceaser-nine.vercel.app (connect a NEAR testnet wallet)

## Demo

```bash
./demo.sh
```

`demo.sh` plays the full arc on NEAR testnet and asserts every step from view
calls and emitted events (49 assertions, about 5 minutes). It uses the live
deployment below when the deployer keys are in the local keychain. From a fresh
clone it has no such keys, so it first builds every contract and deploys its own
fresh set with `scripts/deploy.sh` (about 2 more minutes, with its own checks),
then runs the same arc. It checks its prerequisites up front and prints an
install command for anything missing.

1. User A locks 100k CSTEST with an ROI ladder 50/25/25 at +50% / +100% / +200%,
   penalty 20% into Challenge C1.
2. User B locks 50k CSTEST into Challenge C1. B has 500 NEAR staked in the mock
   pool, so B's boost is 1.25x.
3. User A calls `early_exit`. A 20k CSTEST penalty appears in C1's `penalty_total`.
4. The mock oracle price advances, C1's deadline passes, `finalize(C1)` returns
   `succeeded`.
5. User B calls `claim` and receives principal plus the boosted reward.

Results observed on testnet:

| Step | Observed |
|---|---|
| A exits early | 80k CSTEST returned, 20k penalty moved into C1 |
| Price jumps $1.00 to $1.60 | TWAP read 1.10855 right after the jump and 1.60 only after a full window |
| `finalize(C1)` | `succeeded`, 16k base pool, 4k boost reserve |
| B claims | 50k principal + 20k reward at `boost_bps` 12500, reserve left at 0 |

Live testnet deployment (also in [scripts/deployed.json](scripts/deployed.json)):

| Contract | Testnet account |
|---|---|
| Vault | `ceaser-vault-756e8a.testnet` |
| Test token (CSTEST, 18 decimals) | `ceaser-token-756e8a.testnet` |
| Mock oracle | `ceaser-oracle-756e8a.testnet` |
| Mock staking pool | `ceaser-pool-756e8a.testnet` |
| Treasury (vault owner) | `ceaser-treasury-756e8a.testnet` |

The vault owner is a separate treasury account, not the vault itself. It
whitelists staking pools, sets the oracle and updates config, and it receives
the penalty of any lock whose sink is not a Challenge. `scripts/deploy.sh`
creates one for every fresh deployment.

The live vault runs with a 60 second TWAP window and a 30 second cooldown so the
demo finishes in minutes. The contract defaults are 30 minutes and 10 minutes.

## What CEASER is

Memecoin communities bleed out when holders dump on each other. CEASER turns
holding into a game with real stakes on both sides:

- A **Lock** is a personal commitment of a NEP-141 token. It unlocks in
  tranches, each gated by a condition: a date, a price target relative to the
  price at lock time, or the outcome of a community Challenge. Every tranche
  also unlocks at `start + max_duration_sec` no matter what, so principal is
  never trapped.
- A **Challenge** is a community goal: lock at least `threshold_amount` of a
  token before `deadline_ts`. Sponsors fund a reward pool. If the goal is met,
  the pool pays the lockers in proportion to their conviction. If not, sponsors
  get their deposits back. Locker principal is never confiscated either way.
- **Leaving early** costs `penalty_bps` of the unclaimed principal, and that
  penalty is routed to a Challenge pool. Dumpers pay diamond hands.
- **NEAR boost:** lockers with NEAR staked in a whitelisted staking pool get a
  multiplier on their Challenge reward, paid from a reserve each Challenge sets
  aside.

The full method list and every JSON shape live in [INTERFACE.md](INTERFACE.md).
That file is the contract between the pieces below and is the source of truth
if this README and the code ever disagree.

## NEAR at the core

NEAR is not a side feature in CEASER; it is what gives every action weight.

| NEAR role | What it does | Enforced by |
|---|---|---|
| **Reward boost** | NEAR staked in a whitelisted pool multiplies your share of any Challenge pool, up to 2x | the vault contract, at claim time |
| **Price of a voice** | Every Floor or community post and reply costs 0.01 NEAR, paid to the protocol treasury; each post links its fee transaction | the app, which verifies the transfer on chain before publishing |
| **Backing tiers** | NEAR held plus staked sets your tier: Holder (1), Backer (10), Patron (100), Whale (1,000) | the app, from on-chain balances |
| **Right to post** | Posting needs at least 1 NEAR in the account | the app |
| **Right to launch** | Starting a campaign needs 2 NEAR plus 1 NEAR per 1M tokens of target (capped at 50); creating a community needs 5 NEAR; announcements need 25 NEAR held | the app |
| **Community strength** | Communities rank by the NEAR backing of their active lockers, next to committed volume | derived from on-chain balances |

Memecoin activity becomes NEAR demand: to hold, speak, lead or launch on CEASER you hold, stake or spend NEAR.
Gates marked "the app" are checked against on-chain balances and transactions in the client; on this
testnet demo the feed database is open, so they are not contract-enforced. Moving them into the vault is
the first roadmap item.

## The three core mechanics

### 1. Tranche locks with a two-read price commit

A lock's strategy compiles into tranches at creation:

| Strategy | Tranches | Unlock condition |
|---|---|---|
| `time` | one, 100% | `time_after` a timestamp |
| `roi_ladder` | one per rung, fractions sum to 100% | oracle TWAP ≥ reference price × multiplier |
| `collective_threshold` | one, 100% | the named Challenge is finalized |
| `any` | OR of the above, at most one ladder | any inner condition |

`reference_price` is the oracle TWAP read once when the lock is created and
never changes. Price tranches cannot be claimed on a single read. `check_unlock`
is a two-step commit: the first read **arms** the tranche if the TWAP is above
target and liquidity is above the floor; a second read at least `cooldown_sec`
later **ripens** it if the condition still holds, or disarms it if not. Spikes
inside one TWAP window do not unlock anything.

### 2. Challenges: lock together, win together

`create_challenge` opens a goal on a token with a threshold, a deadline, a
minimum lock duration, a sponsor token and a boost reserve share. Anyone can
sponsor by sending the sponsor token to the vault with a `{"sponsor": …}` msg.
A lock joins by naming the Challenge at creation.

After the deadline anyone calls `finalize`. The Challenge becomes `succeeded`
if `total_locked ≥ threshold_amount`, otherwise `failed`. `claim` finalizes
lazily if nobody has yet.

Each participating lock's share of the pool is its **conviction** weight,
`amount × (deadline − start)`: bigger and earlier locks earn more.

### 3. The bridge: penalties fund the pool

`early_exit` pays out every tranche that is already claimable in full, charges
`penalty_bps` on the rest, sends the penalty to the lock's `penalty_sink`, and
returns the remainder. The default sink is the lock's own Challenge, so a dump
by one participant directly raises the payout for everyone who stays.

## Design rules worth knowing

These come straight from INTERFACE.md and are enforced by the vault:

- **Penalties always pay the lockers who stayed, even when the Challenge
  fails.** At finalize, `distributable = penalty_total + sponsor_total` on
  success and `distributable = penalty_total` on failure. Sponsor deposits are
  the only thing refunded on failure.
- **Boosts are paid from a per-Challenge reserve.** `boost_reserve_bps` of the
  distributable amount is set aside. Base rewards are split pro rata from the
  rest and always sum to at most `base_pool`. A locker's boost extra is
  `base_reward × (boost_bps − 10000) / 10000`, capped by what is left in the
  reserve, first come first served. Boosts can never dilute other lockers.
- **Joining a Challenge commits the lock until it is finalized.** A
  participating lock cannot `claim` principal while its Challenge is `active`,
  whatever its own strategy says. `early_exit` is always available, at the
  penalty.
- **Principal is never confiscated.** Every tranche unlocks at
  `start + max_duration_sec` regardless of price or Challenge outcome.
- **Invalid lock parameters refund the deposit.** A bad strategy, a
  non-whitelisted staking pool or a failed oracle read at creation returns the
  full `ft_transfer_call` amount via the standard NEP-141 refund.

Boost tiers, read from the lock's staking pool via `get_account_staked_balance`:

| Staked NEAR | Multiplier |
|---|---|
| < 10 | 1.00x |
| ≥ 10 | 1.10x |
| ≥ 100 | 1.25x |
| ≥ 1,000 | 1.50x |
| ≥ 10,000 | 2.00x |

## Architecture

```
contracts/
  vault/              VaultCore: locks, tranches, Challenges, rewards, penalties
  test-token/         NEP-141 + NEP-145 + NEP-148 token (CSTEST) with a public mint faucet
  mock-oracle/        MockOracle: owner-set prices, real time-weighted TWAP, liquidity floor
  mock-staking-pool/  owner-set get_account_staked_balance, mirrors the core staking pool
integration-tests/    near-workspaces sandbox tests (tests/flows.rs, tests/hardening.rs)
frontend/             Vite + React app: landing page and the app (src/config.ts holds the contract ids)
scripts/              deploy, seed and helper scripts, deployed.json (live account ids)
demo.sh               the scripted testnet demo arc
INTERFACE.md          the binding spec for every method and JSON shape
build.sh              builds every contract and copies wasm to res/
```

How the pieces talk:

```
 user ──ft_transfer_call(msg)──▶ test-token ──ft_on_transfer──▶ vault
                                                                 │
   check_unlock / claim at lock creation ── twap, liquidity ──▶ mock-oracle
   claim (reward) ────────────── get_account_staked_balance ──▶ mock-staking-pool
   claim / early_exit / refund ── ft_transfer ───────────────▶ test-token ──▶ user
```

All deposits enter through `ft_transfer_call` on the token with a JSON `msg`
of `{"lock": …}` or `{"sponsor": …}`. The vault never holds NEAR for users.
If a payout transfer fails, the amount is recorded and can be pulled with
`withdraw_owed`.

**The oracle is a mock.** `MockOracle` keeps up to 64 owner-set observations
per token and computes a genuine piecewise-constant TWAP over the requested
window, so the two-read commit behaves realistically. Prices are whatever the
owner sets. A `RefTwapOracle` stub in `contracts/mock-oracle/src/ref_twap_oracle.rs`
documents how a production read from a Ref Finance pool would look; its body
is unimplemented and it is not deployed. Do not use this protocol with real
value until a real oracle replaces the mock.

## Running the tests

Requirements: Rust stable with the `wasm32-unknown-unknown` target, `cargo-near`
0.23, and `near` (near-cli-rs) for the testnet scripts.

```bash
rustup target add wasm32-unknown-unknown
cargo install cargo-near near-cli-rs
```

Build every contract, then run the sandbox suite:

```bash
./build.sh
```

```bash
cargo test -p integration-tests
```

`build.sh` writes `res/ceaser_vault.wasm`, `res/test_token.wasm`,
`res/mock_oracle.wasm` and `res/mock_staking_pool.wasm`. The tests deploy those
to a local near-workspaces sandbox (downloaded on first run). There are 18
integration tests in two files. `integration-tests/tests/flows.rs` covers the
seven core flows:

| Test | What it proves |
|---|---|
| `roi_ladder_partial_claims` | rungs ripen and pay one at a time as the TWAP crosses each multiplier |
| `two_read_commit_blocks_price_spikes` | a spike that reverts before the cooldown is disarmed, not paid |
| `collective_threshold_success_pays_pro_rata` | a met threshold pays the sponsor pool by conviction |
| `collective_threshold_failure_keeps_principal_safe` | a missed threshold refunds sponsors and returns every locker's principal |
| `early_exit_penalty_funds_the_challenge_pool` | the exit penalty lands in `penalty_total` of the sink Challenge |
| `participant_exit_leaves_the_challenge` | an exited lock stops counting toward the threshold, and its penalty still pays the remaining locker even though the Challenge then fails |
| `near_staking_boost_multiplies_reward` | staked NEAR raises the reward by the tier multiplier, out of the reserve |

The second file, `integration-tests/tests/hardening.rs`, holds 11 adversarial
tests that came out of an independent audit pass over the vault: double claims
and exits, the `any` strategy, the max-duration tail guard, oracle outages,
failed payouts and their recovery, exits around the deadline, owner handover,
and a four-party check that rewards never exceed the pool. Both files run with
the command above.

Known limits from that audit, accepted for the testnet MVP: creating a
Challenge needs no storage deposit, so the vault account pays for storage;
staked NEAR is read at claim time, so a boost can be earned by staking just
before claiming; rounding dust and unused boost reserve stay in the vault.

Unit tests for the TWAP math live in the oracle crate: `cargo test -p mock-oracle`.

## Frontend

`frontend/` is a Vite + React + TypeScript app styled with Tailwind, using
near-api-js and NEAR Wallet Selector (MyNearWallet, Meteor) on testnet. The
hosted version is at https://ceaser-nine.vercel.app.

```bash
cd frontend && npm install && npm run dev
```

`frontend/src/config.ts` points at the live deployment above. To use your own,
copy the ids from `scripts/deployed.json` into it. `npm run build` writes
`frontend/dist/`.

**Landing page** (`/`): what CEASER is, a scroll-driven walkthrough of the demo
arc with the real testnet numbers, the three mechanics, who it is for, the
manipulation defenses, and the live Challenges read from the vault.

**App** (`/app`, after connecting a wallet):

- **Overview**: CSTEST balance, locked total, NEAR boost tier, claimable locks
  and your Challenges.
- **Lock**: strategy picker (time, ROI ladder, collective threshold) with a live
  preview of the exact `ft_transfer_call` msg. Submitting runs an animated lock
  flow (waiting for the wallet, confirming on NEAR, locked) and then jumps to
  the new lock in My locks. An optional pledge note is posted to the Floor
  alongside the lock.
- **Challenges**: join, sponsor, create, finalize and refund. Each Challenge
  has a detail page with a lockers leaderboard ordered by conviction, the
  paper hands who exited, the sponsors, and an estimated reward for your lock.
- **My locks**: per-tranche status, `check_unlock`, `claim` and `early_exit`.
  Exiting opens a dialog with the breakdown (what is paid out, the penalty,
  where it goes) and a hold-to-confirm button.
- **The Floor** (`/app/community`): a community feed of theses, confessions,
  pledges and exit receipts, with deterministic pixel avatars and a conviction
  badge per account (amount locked now and longest hold). Posts are stored in Supabase through its public anon key
  and are not wallet-signed yet. Receipts (pledges for active locks, paper-hands
  receipts for exited locks) are derived from vault state on every load, not
  stored.

## Scripts

Every script reads the shared helpers in `scripts/lib.sh` and talks to testnet
through near-cli-rs and JSON-RPC.

| Script | What it does |
|---|---|
| `scripts/deploy.sh` | builds, creates faucet-funded accounts (vault, oracle, token, staking pool, treasury), deploys and initializes the four contracts with the short demo config, wires them up and writes `scripts/deployed.json` |
| `demo.sh` | the five-step demo arc above, with assertions; deploys first if the keys for `scripts/deployed.json` are missing |
| `scripts/seed.sh` | seeds the deployment with live Challenges, sponsors, lockers and a few early exits so the app shows real data; needs no deployer keys |
| `scripts/seed-floor.mjs` | seeds the Floor with community posts, replies and reactions from the seeded locker accounts (`node scripts/seed-floor.mjs`) |

## Roadmap: not shipped

- **NEAR campaign bonds in the vault.** Creating a Challenge locks a NEAR bond scaled
  to its target inside the contract: returned on success, paid to the lockers on
  failure. Today the NEAR requirement to launch is a balance check in the app.
- **Contract-enforced NEAR gates and post fees.** Move the posting fee and tier
  checks from the app into a contract (or a verified server) so they cannot be
  bypassed by writing to the feed database directly.
- **Real oracle.** `RefTwapOracle` is a documented stub. A production deploy
  needs a Ref Finance (or other DEX) TWAP read with on-chain liquidity checks.
- **Pyth integration** for NEAR, BTC or ETH denominated price targets, and a
  multi-oracle setup with cross-source sanity checks.
- **Keeper for `check_unlock`.** Someone has to call it twice per price tranche.
  A small bot or a cron-triggered caller is the obvious next step.
- **Multi-token Challenges.** A Challenge is tied to one lock token and one
  sponsor token.
- **Reward claims for exited locks.** Exiting removes the lock from its
  Challenge entirely; there is no partial-stay credit.
- **Governance.** The vault owner whitelists staking pools, sets the oracle and
  updates config directly. No DAO, no timelock.
- **Wallet-signed Floor posts** (posts already carry a verified NEAR fee transaction). Posts are written with the public Supabase
  key and carry no signature. The next step is a NEP-413 signed message per
  post, verified by row-level security.
- **Stored receipts poller.** Exit receipts are derived from vault state on
  each load and carry no timestamp. A poller that watches `early_exit` events
  and stores receipts with their block time is the fix.
- **A vault view to enumerate sponsors.** The vault exposes
  `get_sponsor_contribution(challenge_id, account_id)` but no list, so the
  detail page can only show sponsors it already knows about.
- **Event history in the app.** The app reads state, not the event log.
- **Transferable lock positions** (lock as NFT) and a public sell-schedule
  dashboard showing when locked supply can unlock.
- **Sputnik DAO integration** so community treasuries can sponsor Challenges.
- **No native token.** CEASER deliberately does not have one.
- **External audit.** None yet. Testnet only.

## License

[MIT](LICENSE).
