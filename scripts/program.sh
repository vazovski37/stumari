#!/usr/bin/env bash
# Build/test/deploy the Anchor program inside WSL on a native filesystem (ADR-0008).
#
# From Git Bash on Windows:
#   MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/User/Workspace/colosseum/scripts/program.sh build
#
# Commands: build | test | fmt | deploy <cluster> | id | shell-path
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
. "$REPO/scripts/wsl-env.sh"
WORK="${STUMARI_ONCHAIN_WORKDIR:-$HOME/stumari-onchain}"
KEYS="$REPO/onchain/keys"
ART="$REPO/onchain/artifacts"
PROGRAM=stumari_escrow

sync_in() {
  mkdir -p "$WORK"
  # remove source dirs so deleted files do not linger; keep target/ for incremental builds
  rm -rf "$WORK/programs" "$WORK/tests" "$WORK/Anchor.toml" "$WORK/Cargo.toml" "$WORK/Cargo.lock" "$WORK/rust-toolchain.toml"
  (cd "$REPO/onchain" && tar cf - --exclude=./target --exclude=./.anchor --exclude=./node_modules --exclude=./artifacts --exclude=./keys .) | (cd "$WORK" && tar xmf -)
  # shared test vectors: Rust tests read $CARGO_MANIFEST_DIR/../../spec/vectors/*.json at runtime
  rm -rf "$WORK/spec" && mkdir -p "$WORK/spec" && cp -r "$REPO/spec/vectors" "$WORK/spec/vectors"
  mkdir -p "$WORK/target/deploy"
  if [ -f "$KEYS/$PROGRAM-keypair.json" ]; then
    cp "$KEYS/$PROGRAM-keypair.json" "$WORK/target/deploy/$PROGRAM-keypair.json"
  fi
}

sync_out() {
  mkdir -p "$ART/idl" "$KEYS"
  [ -f "$WORK/target/deploy/$PROGRAM.so" ] && cp "$WORK/target/deploy/$PROGRAM.so" "$ART/$PROGRAM.so"
  [ -f "$WORK/target/idl/$PROGRAM.json" ] && cp "$WORK/target/idl/$PROGRAM.json" "$ART/idl/$PROGRAM.json"
  # persist a generated program keypair back to the repo (gitignored) so the id never changes
  if [ ! -f "$KEYS/$PROGRAM-keypair.json" ] && [ -f "$WORK/target/deploy/$PROGRAM-keypair.json" ]; then
    cp "$WORK/target/deploy/$PROGRAM-keypair.json" "$KEYS/$PROGRAM-keypair.json"
  fi
  # Cargo.lock must be committed (edition2024 crate pinning issues otherwise)
  [ -f "$WORK/Cargo.lock" ] && cp "$WORK/Cargo.lock" "$REPO/onchain/Cargo.lock"
}

cmd="${1:-build}"
case "$cmd" in
  build)
    sync_in; (cd "$WORK" && anchor build); sync_out
    echo "artifacts: $ART" ;;
  test)
    sync_in; (cd "$WORK" && anchor build && cargo test -- --nocapture); sync_out ;;
  fmt)
    # rustfmt only rewrites sources in place; nothing is built on /mnt/c
    (cd "$REPO/onchain" && cargo fmt --all) ;;
  deploy)
    cluster="${2:-devnet}"
    sync_in; (cd "$WORK" && anchor build)
    solana program deploy --url "$cluster" --program-id "$WORK/target/deploy/$PROGRAM-keypair.json" \
      ${DEPLOYER_KEYPAIR:+--keypair "$DEPLOYER_KEYPAIR"} "$WORK/target/deploy/$PROGRAM.so"
    sync_out ;;
  id)
    solana-keygen pubkey "$KEYS/$PROGRAM-keypair.json" ;;
  shell-path)
    echo "$WORK" ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
