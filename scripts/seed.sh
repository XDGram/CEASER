#!/usr/bin/env bash
# Seeds the deployment in scripts/deployed.json with realistic community
# Challenges, sponsors, lockers and a couple of early exits, so the app and
# the landing page show living data. Safe to run more than once: every run
# creates fresh accounts and new Challenges. Needs no deployer keys.
#
#   ./scripts/seed.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
source scripts/lib.sh

[ -f scripts/deployed.json ] || die "scripts/deployed.json not found"
VAULT=$(jq -r .vault scripts/deployed.json)
TOKEN=$(jq -r .token scripts/deployed.json)
POOL=$(jq -r .staking_pool scripts/deployed.json)
GAS_CALL=100000000000000
GAS_FT=150000000000000
SFX=$(rand_suffix)

head1 "Seeding $VAULT"
check_prereqs

# ---- people ----
NAMES=(whale frog chad degen hodler sponsor)
declare -A ACC
for n in "${NAMES[@]}"; do
  ACC[$n]="ceaser-$n-$SFX.testnet"
  create_account "${ACC[$n]}"
done
for n in "${NAMES[@]}"; do
  tx "${ACC[$n]}" "$TOKEN" mint "$(jq -nc --arg a "${ACC[$n]}" --arg x "$(tok 5000000)" '{account_id:$a,amount:$x}')" 30000000000000 0
done

mk_challenge() { # creator title threshold deadline_offset_sec min_lock_sec -> id
  local creator=$1 title=$2 threshold=$3 offset=$4 minlock=$5
  tx "$creator" "$VAULT" create_challenge "$(jq -nc --arg t "$title" --arg tok "$TOKEN" --arg th "$(tok "$threshold")" \
       --argjson dl "$(( $(now_ts) + offset ))" --argjson ml "$minlock" \
       '{params:{title:$t,token:$tok,threshold_amount:$th,deadline_ts:$dl,min_lock_duration_sec:$ml,sponsor_token:$tok,boost_reserve_bps:2000}}')" \
     30000000000000 0
  tx_value
}
sponsor() { # who cid amount
  tx "$1" "$TOKEN" ft_transfer_call "$(jq -nc --arg r "$VAULT" --arg a "$(tok "$3")" --arg m "{\"sponsor\":{\"challenge_id\":$2}}" '{receiver_id:$r,amount:$a,msg:$m}')" "$GAS_FT" 1
}
lock_in() { # who cid amount days penalty_bps [staking_pool]
  local pool=${6:-null}; [ "$pool" = null ] || pool="\"$pool\""
  local msg="{\"lock\":{\"strategy\":{\"collective_threshold\":{\"challenge_id\":$2}},\"max_duration_sec\":$(( $4 * 86400 )),\"penalty_bps\":$5,\"penalty_sink\":null,\"challenge_id\":$2,\"staking_pool\":$pool}}"
  tx "$1" "$TOKEN" ft_transfer_call "$(jq -nc --arg r "$VAULT" --arg a "$(tok "$3")" --arg m "$msg" '{receiver_id:$r,amount:$a,msg:$m}')" "$GAS_FT" 1
}
lock_ladder() { # who cid_sink amount days
  local msg="{\"lock\":{\"strategy\":{\"roi_ladder\":{\"tranches\":[{\"fraction_bps\":5000,\"multiplier_bps\":15000},{\"fraction_bps\":2500,\"multiplier_bps\":20000},{\"fraction_bps\":2500,\"multiplier_bps\":30000}]}},\"max_duration_sec\":$(( $4 * 86400 )),\"penalty_bps\":2000,\"penalty_sink\":{\"challenge\":$2},\"challenge_id\":null,\"staking_pool\":null}}"
  tx "$1" "$TOKEN" ft_transfer_call "$(jq -nc --arg r "$VAULT" --arg a "$(tok "$3")" --arg m "$msg" '{receiver_id:$r,amount:$a,msg:$m}')" "$GAS_FT" 1
}
last_lock_id() { view "$VAULT" get_lock_count '{}' | jq -r .; }

head1 "Challenges"
C1=$(mk_challenge "${ACC[chad]}"   "Diamond hands season: 2M CSTEST by Sunday" 2000000 $((6*86400))  86400)
C2=$(mk_challenge "${ACC[frog]}"   "No paper hands until the listing"          1000000 $((12*86400)) 172800)
C3=$(mk_challenge "${ACC[whale]}"  "Founder allocation, locked in public"       500000  $((30*86400)) 604800)
C4=$(mk_challenge "${ACC[hodler]}" "Hold through the dip"                       250000  $((3*86400))  3600)
say "created challenges $C1 $C2 $C3 $C4"

head1 "Sponsors"
sponsor "${ACC[sponsor]}" "$C1" 150000
sponsor "${ACC[whale]}"   "$C1" 50000
sponsor "${ACC[sponsor]}" "$C2" 80000
sponsor "${ACC[sponsor]}" "$C4" 25000

head1 "Lockers"
lock_in "${ACC[whale]}"  "$C1" 900000 7  2000 "$POOL"
lock_in "${ACC[chad]}"   "$C1" 420000 7  1500 "$POOL"
lock_in "${ACC[hodler]}" "$C1" 310000 7  2000
lock_in "${ACC[degen]}"  "$C1" 200000 7  2000; DEGEN_C1=$(last_lock_id)
lock_in "${ACC[frog]}"   "$C2" 350000 13 2000 "$POOL"
lock_in "${ACC[degen]}"  "$C2" 120000 13 1000; DEGEN_C2=$(last_lock_id)
lock_in "${ACC[hodler]}" "$C2" 240000 13 2000
lock_in "${ACC[whale]}"  "$C3" 500000 31 2000 "$POOL"
lock_in "${ACC[chad]}"   "$C4" 140000 4  2000
lock_in "${ACC[frog]}"   "$C4" 60000  4  2000
lock_ladder "${ACC[chad]}" "$C1" 250000 60

head1 "Paper hands"
tx "${ACC[degen]}" "$VAULT" early_exit "{\"lock_id\":$DEGEN_C1}" "$GAS_CALL" 0
tx "${ACC[degen]}" "$VAULT" early_exit "{\"lock_id\":$DEGEN_C2}" "$GAS_CALL" 0

head1 "Result"
for c in $C1 $C2 $C3 $C4; do
  view "$VAULT" get_challenge "{\"challenge_id\":$c}" | jq -c '{id,title,total_locked,penalty_total,sponsor_total,participant_count}'
done
