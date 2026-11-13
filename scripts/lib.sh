#!/usr/bin/env bash
# Shared helpers for scripts/deploy.sh and demo.sh (NEAR testnet).
#
# Transactions go through near-cli-rs (keys in ~/.near-credentials/testnet/),
# views and transaction results go through plain JSON-RPC so the scripts can
# parse real JSON instead of console output.

NETWORK="testnet"
RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
ONE_YOCTO="1 yoctoNEAR"

# --- output ---------------------------------------------------------------

if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_OFF=$'\033[0m'
else
  C_BOLD=""; C_DIM=""; C_GREEN=""; C_RED=""; C_CYAN=""; C_OFF=""
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s  %s%s\n' "$C_DIM" "$*" "$C_OFF"; }
head1() { printf '\n%s%s%s\n' "$C_BOLD$C_CYAN" "$*" "$C_OFF"; }
die()  { printf '%s%s%s\n' "$C_RED" "FAIL: $*" "$C_OFF" >&2; exit 1; }

# assert_eq LABEL ACTUAL EXPECTED
assert_eq() {
  if [ "$2" = "$3" ]; then
    printf '%s  ✔ %s = %s%s\n' "$C_GREEN" "$1" "$2" "$C_OFF"
  else
    die "$1: expected $3, got $2"
  fi
}

# assert_lt LABEL A B   (numeric, arbitrary size via python)
assert_lt() {
  if python3 -I -c "import sys; sys.exit(0 if int(sys.argv[1]) < int(sys.argv[2]) else 1)" "$2" "$3"; then
    printf '%s  ✔ %s: %s < %s%s\n' "$C_GREEN" "$1" "$2" "$3" "$C_OFF"
  else
    die "$1: expected $2 < $3"
  fi
}

# --- numbers --------------------------------------------------------------

# tok N -> N * 10^18 as a decimal string
tok() { python3 -I -c "import sys; print(int(sys.argv[1]) * 10**18)" "$1"; }
# near N -> N * 10^24 as a decimal string
near_yocto() { python3 -I -c "import sys; print(int(sys.argv[1]) * 10**24)" "$1"; }
# calc EXPR -> python integer expression
calc() { python3 -I -c "import sys; print(eval(sys.argv[1]))" "$1"; }
now_ts() { date +%s; }

rand_suffix() { head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# --- RPC ------------------------------------------------------------------

rpc() {
  curl -sS --fail-with-body --max-time 60 -X POST "$RPC_URL" \
    -H 'Content-Type: application/json' -d "$1"
}

# view CONTRACT METHOD [ARGS_JSON] -> prints the JSON result
view() {
  local args_b64 req resp err
  args_b64=$(printf '%s' "${3:-{\}}" | base64 -w0)
  req=$(jq -nc --arg c "$1" --arg m "$2" --arg a "$args_b64" \
    '{jsonrpc:"2.0",id:"view",method:"query",params:{request_type:"call_function",finality:"final",account_id:$c,method_name:$m,args_base64:$a}}')
  resp=$(rpc "$req") || die "RPC error calling $1.$2: $resp"
  err=$(jq -r '.error.data // .error.message // .result.error // empty' <<<"$resp")
  [ -z "$err" ] || die "view $1.$2 failed: $err"
  jq -r '.result.result | implode' <<<"$resp"
}

account_exists() {
  local req resp
  req=$(jq -nc --arg a "$1" '{jsonrpc:"2.0",id:"acc",method:"query",params:{request_type:"view_account",finality:"final",account_id:$a}}')
  resp=$(rpc "$req") || return 1
  [ "$(jq -r '.result.amount // empty' <<<"$resp")" != "" ]
}

# --- near-cli-rs ----------------------------------------------------------

# create_account NAME  (testnet faucet, key saved to ~/.near-credentials/testnet/)
create_account() {
  local out
  out=$(near account create-account sponsor-by-faucet-service "$1" autogenerate-new-keypair \
        save-to-legacy-keychain network-config "$NETWORK" create 2>&1) \
    || { printf '%s\n' "$out" >&2; die "faucet account creation failed for $1"; }
  local i
  for i in $(seq 1 30); do
    account_exists "$1" && return 0
    sleep 1
  done
  die "account $1 was not created"
}

# deploy ACCOUNT WASM INIT_ARGS_JSON   (calls `new` with the args)
deploy() {
  local out
  out=$(near contract deploy "$1" use-file "$2" with-init-call new json-args "$3" \
        prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
        network-config "$NETWORK" sign-with-legacy-keychain send 2>&1) \
    || { printf '%s\n' "$out" >&2; die "deploy to $1 failed"; }
  info "deployed $(basename "$2") to $1"
}

# tx SIGNER CONTRACT METHOD ARGS_JSON GAS DEPOSIT
# Sends the transaction, waits for finality and loads the result into
# TX_HASH / TX_JSON. Fails if the transaction or any receipt failed.
TX_HASH=""; TX_JSON=""
tx() {
  local signer=$1 contract=$2 method=$3 args=$4 gas=$5 deposit=$6 out req
  out=$(near contract call-function as-transaction "$contract" "$method" json-args "$args" \
        prepaid-gas "$gas" attached-deposit "$deposit" sign-as "$signer" \
        network-config "$NETWORK" sign-with-legacy-keychain send 2>&1) \
    || { printf '%s\n' "$out" >&2; die "$method on $contract (signed by $signer) failed"; }
  TX_HASH=$(grep -oE 'Transaction ID: [A-Za-z0-9]+' <<<"$out" | head -1 | awk '{print $3}')
  [ -n "$TX_HASH" ] || { printf '%s\n' "$out" >&2; die "could not find transaction id for $method"; }
  req=$(jq -nc --arg h "$TX_HASH" --arg s "$signer" \
    '{jsonrpc:"2.0",id:"tx",method:"tx",params:{tx_hash:$h,sender_account_id:$s,wait_until:"FINAL"}}')
  TX_JSON=$(rpc "$req") || die "could not fetch transaction $TX_HASH"
  if [ "$(jq -r '.error // empty' <<<"$TX_JSON")" != "" ]; then
    die "transaction lookup failed: $(jq -c .error <<<"$TX_JSON")"
  fi
  if [ "$(jq -r '.result.status | has("Failure")' <<<"$TX_JSON")" = "true" ]; then
    die "$method failed: $(jq -c .result.status.Failure <<<"$TX_JSON")"
  fi
  local failed
  failed=$(jq -c '[.result.receipts_outcome[].outcome.status | select(has("Failure"))] | .[0] // empty' <<<"$TX_JSON")
  [ -z "$failed" ] || die "$method: a receipt failed: $failed"
  info "$method ok (tx $TX_HASH)"
}

# Return value of the last tx, decoded (JSON or empty).
tx_value() { jq -r '.result.status.SuccessValue // empty' <<<"$TX_JSON" | base64 -d; }
# All logs of the last tx, one per line.
tx_logs() { jq -r '.result.receipts_outcome[].outcome.logs[]' <<<"$TX_JSON"; }
# Names of the CEASER events emitted by the last tx, one per line.
tx_events() { tx_logs | grep '^EVENT_JSON:' | sed 's/^EVENT_JSON://' | jq -r 'select(.standard=="ceaser") | .event'; }
# Prints the CEASER events of the last tx.
show_events() {
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    printf '%s  event %s%s\n' "$C_DIM" "$(jq -c '{event, data}' <<<"$line")" "$C_OFF"
  done < <(tx_logs | grep '^EVENT_JSON:' | sed 's/^EVENT_JSON://')
}
assert_event() {
  if tx_events | grep -qx "$1"; then
    printf '%s  ✔ event %s emitted%s\n' "$C_GREEN" "$1" "$C_OFF"
  else
    die "expected event $1, got: $(tx_events | tr '\n' ' ')"
  fi
}

# ft_balance TOKEN ACCOUNT -> decimal string
ft_balance() { view "$1" ft_balance_of "$(jq -nc --arg a "$2" '{account_id:$a}')" | jq -r .; }
