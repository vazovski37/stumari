#!/usr/bin/env bash
# Local Solana network for development: Surfpool in Docker (ADR-0015).
# Windows cannot reach ports inside WSL on this machine, but Docker Desktop's
# port publishing works, so the Linux surfpool binary (copied from WSL) runs in
# an ubuntu:24.04 container on http://127.0.0.1:8899 (ws 8900).
#
# Usage (Git Bash):  scripts/localnet.sh start|stop|status|logs|reset
# Deploy programs with the surfnet_writeProgram cheatcode, move the clock with
# surfnet_timeTravel, fund accounts with surfnet_setAccount (see scripts/bootstrap.ts).
set -euo pipefail
export MSYS_NO_PATHCONV=1
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$REPO/.localnet/bin"
NAME=stumari-localnet
RPC=http://127.0.0.1:8899

rpc_ok() { curl -s -m 2 -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' "$RPC" | grep -q surfnet-version; }

ensure_bin() {
  if [ ! -f "$BIN_DIR/surfpool" ]; then
    mkdir -p "$BIN_DIR"
    local wsl_dir; wsl_dir="$(echo "$BIN_DIR" | sed -E 's#^/([a-zA-Z])/#/mnt/\L\1/#')"
    wsl -d Ubuntu-24.04 -- cp /root/.local/bin/surfpool "$wsl_dir/surfpool"
  fi
}

start() {
  if rpc_ok; then echo "localnet already running at $RPC"; return; fi
  ensure_bin
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p 8899:8899 -p 8900:8900 \
    -v "$(cygpath -m "$BIN_DIR"):/opt/sp:ro" ubuntu:24.04 \
    /opt/sp/surfpool start --offline --host 0.0.0.0 --port 8899 --ws-port 8900 --no-deploy --no-tui >/dev/null
  for _ in $(seq 1 60); do rpc_ok && { echo "localnet up at $RPC"; return; }; sleep 1; done
  echo "localnet failed to start"; docker logs --tail 50 "$NAME"; exit 1
}

case "${1:-status}" in
  start) start ;;
  stop) docker rm -f "$NAME" >/dev/null 2>&1 && echo "stopped" || echo "not running" ;;
  reset) docker rm -f "$NAME" >/dev/null 2>&1 || true; start ;;
  status) rpc_ok && echo "up at $RPC" || { echo "down"; exit 1; } ;;
  logs) docker logs --tail "${2:-100}" "$NAME" ;;
  *) echo "usage: $0 start|stop|status|logs|reset" >&2; exit 2 ;;
esac
