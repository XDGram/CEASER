#!/usr/bin/env bash
# Builds every contract in contracts/* and copies the wasm to res/<crate_name>.wasm
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p res
for dir in contracts/*/; do
  [ -f "$dir/Cargo.toml" ] || continue
  (cd "$dir" && cargo near build non-reproducible-wasm --no-abi)
done
cp target/near/*/*.wasm res/ 2>/dev/null || cp target/near/*.wasm res/
ls -la res/*.wasm
