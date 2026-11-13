#!/usr/bin/env bash
# Deploys CEASER to NEAR testnet: creates faucet-funded accounts, deploys and
# initializes the four contracts with the short demo config, wires them up and
# writes scripts/deployed.json.
#
# Usage: scripts/deploy.sh
# Requires: cargo-near, near (near-cli-rs), jq, curl, python3.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib.sh
source scripts/lib.sh

SUFFIX="${CEASER_SUFFIX:-$(rand_suffix)}"
VAULT="ceaser-vault-$SUFFIX.testnet"
ORACLE="ceaser-oracle-$SUFFIX.testnet"
TOKEN="ceaser-token-$SUFFIX.testnet"
POOL="ceaser-pool-$SUFFIX.testnet"

# Short demo config: 60s TWAP window, 30s cooldown, everything else default.
VAULT_CONFIG='{"max_penalty_bps":2000,"twap_window_sec":60,"cooldown_sec":30,"min_oracle_liquidity":"0","min_tranche_lock_sec":0,"max_lock_duration_sec":63072000}'
PRICE_1="100000000"           # $1.00, 8 decimals
LIQUIDITY="1000000000000"     # arbitrary, above any floor
TOTAL_SUPPLY=$(tok 10000000)  # 10M CSTEST to the token account itself

head1 "Building contracts"
./build.sh >/dev/null
for w in ceaser_vault mock_oracle test_token mock_staking_pool; do
  [ -f "res/$w.wasm" ] || die "res/$w.wasm missing after build"
done
say "  res/*.wasm ready"

head1 "Creating testnet accounts (faucet)"
for a in "$VAULT" "$ORACLE" "$TOKEN" "$POOL"; do
  create_account "$a"
  say "  created $a"
done

head1 "Deploying and initializing"
deploy "$POOL"   res/mock_staking_pool.wasm "$(jq -nc --arg o "$POOL" '{owner_id:$o}')"
deploy "$ORACLE" res/mock_oracle.wasm       "$(jq -nc --arg o "$ORACLE" '{owner_id:$o}')"
deploy "$TOKEN"  res/test_token.wasm \
  "$(jq -nc --arg o "$TOKEN" --arg s "$TOTAL_SUPPLY" '{owner_id:$o,total_supply:$s,name:"CEASER Test",symbol:"CSTEST",decimals:18}')"
deploy "$VAULT"  res/ceaser_vault.wasm \
  "$(jq -nc --arg o "$VAULT" --arg r "$ORACLE" --argjson c "$VAULT_CONFIG" '{owner_id:$o,oracle_id:$r,config:$c}')"

head1 "Wiring"
tx "$VAULT" "$VAULT" add_staking_pool "$(jq -nc --arg p "$POOL" '{pool_id:$p}')" '30 Tgas' '0 NEAR'
say "  vault whitelisted staking pool $POOL"
tx "$VAULT" "$TOKEN" storage_deposit "$(jq -nc --arg a "$VAULT" '{account_id:$a}')" '30 Tgas' '0.01 NEAR'
say "  vault storage-registered on $TOKEN"
tx "$ORACLE" "$ORACLE" set_price "$(jq -nc --arg t "$TOKEN" --arg p "$PRICE_1" '{token:$t,price:$p}')" '30 Tgas' '0 NEAR'
tx "$ORACLE" "$ORACLE" set_liquidity "$(jq -nc --arg t "$TOKEN" --arg l "$LIQUIDITY" '{token:$t,liquidity:$l}')" '30 Tgas' '0 NEAR'
say "  oracle price \$1.00 ($PRICE_1), liquidity $LIQUIDITY"

head1 "Verifying"
assert_eq "vault.get_oracle" "$(view "$VAULT" get_oracle | jq -r .)" "$ORACLE"
assert_eq "vault.get_staking_pools" "$(view "$VAULT" get_staking_pools | jq -c .)" "[\"$POOL\"]"
assert_eq "vault config twap_window_sec" "$(view "$VAULT" get_config | jq -r .twap_window_sec)" "60"
assert_eq "vault config cooldown_sec" "$(view "$VAULT" get_config | jq -r .cooldown_sec)" "30"
assert_eq "token symbol" "$(view "$TOKEN" ft_metadata | jq -r .symbol)" "CSTEST"
assert_eq "oracle spot" "$(view "$ORACLE" spot "$(jq -nc --arg t "$TOKEN" '{token:$t}')" | jq -r .)" "$PRICE_1"
assert_eq "vault registered on token" \
  "$(view "$TOKEN" storage_balance_of "$(jq -nc --arg a "$VAULT" '{account_id:$a}')" | jq -r 'if . == null then "no" else "yes" end')" "yes"

jq -n --arg v "$VAULT" --arg o "$ORACLE" --arg t "$TOKEN" --arg p "$POOL" \
  '{network:"testnet",vault:$v,oracle:$o,token:$t,staking_pool:$p}' > scripts/deployed.json
head1 "Done"
cat scripts/deployed.json
say "  keys are in ~/.near-credentials/testnet/. Next: ./demo.sh"
