#!/usr/bin/env bash
# CEASER testnet demo: the 5-step arc from INTERFACE.md section 5, run against
# the contracts in scripts/deployed.json. Prints and asserts every step.
#
#   1. User A locks 100k CSTEST, ROI ladder 50/25/25 at +50/+100/+200%, 20% penalty into Challenge C1.
#   2. User B locks 50k CSTEST into C1. B has 500 NEAR staked in the mock pool (1.25x boost).
#   3. User A early-exits. 20k CSTEST penalty lands in C1.penalty_total.
#   4. Oracle price advances; C1 deadline passes; finalize(C1) -> succeeded.
#   5. User B claims: principal + boosted reward.
#
# Usage: ./demo.sh
#   Uses the deployment in scripts/deployed.json when this machine holds the
#   keys for its accounts (~/.near-credentials/testnet/). Otherwise it runs
#   scripts/deploy.sh first to create a fresh deployment.
#   DEADLINE_SEC=150          seconds from challenge creation to its deadline
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/lib.sh
source scripts/lib.sh

head1 "Checking prerequisites"
check_prereqs

# A usable deployment needs scripts/deployed.json, a local key for each of its
# accounts (demo.sh signs as the oracle, pool, token and the treasury, which
# owns the vault) and the accounts to exist on testnet. Anything else means:
# deploy afresh.
needs_deploy=""
if [ ! -f scripts/deployed.json ]; then
  needs_deploy="scripts/deployed.json is missing"
else
  for role in vault oracle token staking_pool treasury; do
    acct=$(jq -r ".$role // empty" scripts/deployed.json 2>/dev/null || true)
    if [ -z "$acct" ]; then needs_deploy="scripts/deployed.json has no \"$role\" entry"; break; fi
    if ! have_key "$acct"; then needs_deploy="no key for the $role account $acct in $CREDENTIALS_DIR"; break; fi
    if ! account_exists "$acct"; then needs_deploy="the $role account $acct does not exist on testnet"; break; fi
  done
fi
if [ -n "$needs_deploy" ]; then
  head1 "No usable deployment: $needs_deploy"
  say "  running scripts/deploy.sh to create a fresh one (about 2 minutes)"
  scripts/deploy.sh
  head1 "Fresh deployment ready, continuing with the demo"
else
  info "using the deployment in scripts/deployed.json (keys found in $CREDENTIALS_DIR)"
fi

VAULT=$(jq -r .vault scripts/deployed.json)
ORACLE=$(jq -r .oracle scripts/deployed.json)
TOKEN=$(jq -r .token scripts/deployed.json)
POOL=$(jq -r .staking_pool scripts/deployed.json)
TREASURY=$(jq -r .treasury scripts/deployed.json)
DEADLINE_SEC="${DEADLINE_SEC:-150}"

A_AMOUNT=$(tok 100000)   # 100k CSTEST
B_AMOUNT=$(tok 50000)    # 50k CSTEST
THRESHOLD=$(tok 50000)   # C1 succeeds once 50k is locked
PRICE_1="100000000"      # $1.00
PRICE_UP=$(calc "$PRICE_1 * 16 // 10")   # $1.60
TWAP_WINDOW=$(view "$VAULT" get_config | jq -r .twap_window_sec)

# Args helpers
j() { jq -nc "$@"; }
ft_call() { # signer amount msg_json
  tx "$1" "$TOKEN" ft_transfer_call \
    "$(j --arg r "$VAULT" --arg a "$2" --arg m "$3" '{receiver_id:$r,amount:$a,msg:$m}')" '300 Tgas' "$ONE_YOCTO"
}
challenge() { view "$VAULT" get_challenge "$(j --argjson c "$CID" '{challenge_id:$c}')"; }
lock() { view "$VAULT" get_lock "$(j --argjson l "$1" '{lock_id:$l}')"; }
twap() { view "$ORACLE" twap "$(j --arg t "$TOKEN" --argjson w "$TWAP_WINDOW" '{token:$t,window_sec:$w}')" | jq -r .; }

head1 "CEASER demo on testnet"
say "  vault        $VAULT"
say "  oracle       $ORACLE"
say "  token        $TOKEN"
say "  staking pool $POOL"
say "  treasury     $TREASURY (vault owner)"

head1 "Setup: users, tokens, stake, oracle, Challenge C1"
SUFFIX=$(rand_suffix)
USER_A="ceaser-a-$SUFFIX.testnet"
USER_B="ceaser-b-$SUFFIX.testnet"
create_account "$USER_A"; say "  user A $USER_A"
create_account "$USER_B"; say "  user B $USER_B"
tx "$TOKEN" "$TOKEN" mint "$(j --arg a "$USER_A" --arg n "$A_AMOUNT" '{account_id:$a,amount:$n}')" '30 Tgas' '0 NEAR'
tx "$TOKEN" "$TOKEN" mint "$(j --arg a "$USER_B" --arg n "$B_AMOUNT" '{account_id:$a,amount:$n}')" '30 Tgas' '0 NEAR'
assert_eq "A CSTEST balance" "$(ft_balance "$TOKEN" "$USER_A")" "$A_AMOUNT"
assert_eq "B CSTEST balance" "$(ft_balance "$TOKEN" "$USER_B")" "$B_AMOUNT"

tx "$POOL" "$POOL" set_account_staked_balance "$(j --arg a "$USER_B" --arg n "$(near_yocto 500)" '{account_id:$a,amount:$n}')" '30 Tgas' '0 NEAR'
assert_eq "B staked NEAR (yocto)" \
  "$(view "$POOL" get_account_staked_balance "$(j --arg a "$USER_B" '{account_id:$a}')" | jq -r .)" "$(near_yocto 500)"

# Reset the oracle to $1.00 so the run is reproducible. A previous run leaves
# the price at $1.60, and the TWAP only settles once a full window has passed,
# so wait for it: lock A's reference price must be exactly $1.00.
tx "$ORACLE" "$ORACLE" set_price "$(j --arg t "$TOKEN" --arg p "$PRICE_1" '{token:$t,price:$p}')" '30 Tgas' '0 NEAR'
if [ "$(twap)" != "$PRICE_1" ]; then
  say "  TWAP($TWAP_WINDOW s) is $(twap), waiting up to $((TWAP_WINDOW + 20))s for it to settle at \$1.00..."
  for _ in $(seq 1 $(( (TWAP_WINDOW + 20) / 5 ))); do
    sleep 5
    [ "$(twap)" != "$PRICE_1" ] || break
  done
fi
assert_eq "oracle TWAP($TWAP_WINDOW s) at \$1.00" "$(twap)" "$PRICE_1"

DEADLINE=$(( $(now_ts) + DEADLINE_SEC ))
tx "$TREASURY" "$VAULT" create_challenge "$(j --arg t "$TOKEN" --arg th "$THRESHOLD" --argjson d "$DEADLINE" \
  '{params:{title:"Hold the line",token:$t,threshold_amount:$th,deadline_ts:$d,min_lock_duration_sec:5,sponsor_token:$t,boost_reserve_bps:2000}}')" '30 Tgas' '0 NEAR'
CID=$(tx_value)
show_events
assert_event challenge_created
say "  Challenge C1 = #$CID, threshold 50k CSTEST, deadline in ${DEADLINE_SEC}s, boost reserve 20%"
assert_eq "C1 state" "$(challenge | jq -r .state)" "active"

head1 "Step 1: A locks 100k CSTEST (ROI ladder 50/25/25 at +50/+100/+200%, 20% penalty -> C1)"
LOCK_MSG=$(j --argjson c "$CID" '{lock:{
  strategy:{roi_ladder:{tranches:[
    {fraction_bps:5000,multiplier_bps:15000},
    {fraction_bps:2500,multiplier_bps:20000},
    {fraction_bps:2500,multiplier_bps:30000}]}},
  max_duration_sec:2592000, penalty_bps:2000, penalty_sink:{challenge:$c},
  challenge_id:null, staking_pool:null}}')
ft_call "$USER_A" "$A_AMOUNT" "$LOCK_MSG"
show_events
assert_event lock_created
LOCK_A=$(tx_logs | grep '^EVENT_JSON:' | sed 's/^EVENT_JSON://' | jq -r 'select(.event=="lock_created") | .data.lock_id')
say "  lock A = #$LOCK_A"
assert_eq "A balance after lock" "$(ft_balance "$TOKEN" "$USER_A")" "0"
assert_eq "lock A amount" "$(lock "$LOCK_A" | jq -r .amount)" "$A_AMOUNT"
assert_eq "lock A tranches" "$(lock "$LOCK_A" | jq -r '.tranches | length')" "3"
assert_eq "lock A tranche fractions" "$(lock "$LOCK_A" | jq -c '[.tranches[].fraction_bps]')" "[5000,2500,2500]"
assert_eq "lock A penalty sink" "$(lock "$LOCK_A" | jq -c .penalty_sink)" "{\"challenge\":$CID}"
assert_eq "lock A reference_price (\$1.00 TWAP at creation)" "$(lock "$LOCK_A" | jq -r .reference_price)" "$PRICE_1"
assert_eq "lock A status" "$(lock "$LOCK_A" | jq -r .status)" "active"

head1 "Step 2: B locks 50k CSTEST into C1 (500 NEAR staked -> 1.25x boost)"
LOCK_MSG=$(j --argjson c "$CID" --arg p "$POOL" '{lock:{
  strategy:{collective_threshold:{challenge_id:$c}},
  max_duration_sec:2592000, penalty_bps:2000, penalty_sink:null,
  challenge_id:$c, staking_pool:$p}}')
ft_call "$USER_B" "$B_AMOUNT" "$LOCK_MSG"
show_events
assert_event lock_created
LOCK_B=$(tx_logs | grep '^EVENT_JSON:' | sed 's/^EVENT_JSON://' | jq -r 'select(.event=="lock_created") | .data.lock_id')
say "  lock B = #$LOCK_B"
assert_eq "B balance after lock" "$(ft_balance "$TOKEN" "$USER_B")" "0"
assert_eq "lock B challenge_id" "$(lock "$LOCK_B" | jq -r .challenge_id)" "$CID"
assert_eq "lock B staking_pool" "$(lock "$LOCK_B" | jq -r .staking_pool)" "$POOL"
assert_eq "C1 total_locked" "$(challenge | jq -r .total_locked)" "$B_AMOUNT"
assert_eq "C1 participant_count" "$(challenge | jq -r .participant_count)" "1"

head1 "Step 3: A early-exits (dumps): 20% penalty flows into C1"
tx "$USER_A" "$VAULT" early_exit "$(j --argjson l "$LOCK_A" '{lock_id:$l}')" '100 Tgas' '0 NEAR'
EXIT=$(tx_value)
show_events
assert_event early_exit
say "  early_exit -> $EXIT"
PENALTY=$(calc "$A_AMOUNT * 2000 // 10000")
assert_eq "exit.returned" "$(jq -r .returned <<<"$EXIT")" "$(calc "$A_AMOUNT - $PENALTY")"
assert_eq "exit.penalty" "$(jq -r .penalty <<<"$EXIT")" "$PENALTY"
assert_eq "exit.sink" "$(jq -c .sink <<<"$EXIT")" "{\"challenge\":$CID}"
assert_eq "A balance after exit" "$(ft_balance "$TOKEN" "$USER_A")" "$(calc "$A_AMOUNT - $PENALTY")"
assert_eq "lock A status" "$(lock "$LOCK_A" | jq -r .status)" "exited"
assert_eq "C1 penalty_total" "$(challenge | jq -r .penalty_total)" "$PENALTY"

head1 "Step 4: oracle price advances to \$1.60, deadline passes, finalize(C1)"
tx "$ORACLE" "$ORACLE" set_price "$(j --arg t "$TOKEN" --arg p "$PRICE_UP" '{token:$t,price:$p}')" '30 Tgas' '0 NEAR'
assert_eq "oracle spot" "$(view "$ORACLE" spot "$(j --arg t "$TOKEN" '{token:$t}')" | jq -r .)" "$PRICE_UP"
assert_lt "TWAP lags the jump" "$(twap)" "$PRICE_UP"
WAIT=$(( DEADLINE + 2 - $(now_ts) ))
[ "$WAIT" -gt $(( TWAP_WINDOW + 2 )) ] || WAIT=$(( TWAP_WINDOW + 2 ))
say "  waiting ${WAIT}s for the TWAP window and the C1 deadline..."
sleep "$WAIT"
assert_eq "TWAP after a full window" "$(twap)" "$PRICE_UP"
say "  observations: $(view "$ORACLE" get_observations "$(j --arg t "$TOKEN" '{token:$t}')" | jq -c '.[-2:]')"
tx "$USER_B" "$VAULT" finalize "$(j --argjson c "$CID" '{challenge_id:$c}')" '100 Tgas' '0 NEAR'
FIN=$(tx_value)
show_events
assert_event challenge_finalized
assert_eq "C1 state" "$(jq -r .state <<<"$FIN")" "succeeded"
BASE_POOL=$(calc "$PENALTY * 8000 // 10000")
RESERVE=$(calc "$PENALTY - $BASE_POOL")
assert_eq "C1 base_pool (80% of penalties)" "$(jq -r .base_pool <<<"$FIN")" "$BASE_POOL"
assert_eq "C1 reserve_remaining (20% boost reserve)" "$(jq -r .reserve_remaining <<<"$FIN")" "$RESERVE"

head1 "Step 5: B claims principal + boosted reward"
tx "$USER_B" "$VAULT" claim "$(j --argjson l "$LOCK_B" '{lock_id:$l}')" '100 Tgas' '0 NEAR'
CLAIM=$(tx_value)
show_events
assert_event claimed
assert_event reward_claimed
say "  claim -> $CLAIM"
REWARD=$(calc "$BASE_POOL + min($BASE_POOL * 2500 // 10000, $RESERVE)")
assert_eq "claim.principal" "$(jq -r .principal <<<"$CLAIM")" "$B_AMOUNT"
assert_eq "claim.boost_bps (500 NEAR staked)" "$(jq -r .boost_bps <<<"$CLAIM")" "12500"
assert_eq "claim.reward (base 16k + 4k boost)" "$(jq -r .reward <<<"$CLAIM")" "$REWARD"
assert_eq "B final balance" "$(ft_balance "$TOKEN" "$USER_B")" "$(calc "$B_AMOUNT + $REWARD")"
assert_eq "lock B status" "$(lock "$LOCK_B" | jq -r .status)" "closed"
assert_eq "C1 reserve_remaining" "$(challenge | jq -r .reserve_remaining)" "0"

head1 "Demo complete: the dumper's 20k penalty paid the diamond hand 20k (1.25x NEAR boost)."
say "  A: 100k -> $(calc "($A_AMOUNT - $PENALTY) // 10**21")k CSTEST.   B: 50k -> $(calc "($B_AMOUNT + $REWARD) // 10**21")k CSTEST."
