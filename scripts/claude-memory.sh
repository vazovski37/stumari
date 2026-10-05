#!/usr/bin/env bash
# Sync Claude Code's project memory between this machine and the repo (.claude/memory/), so a fresh
# clone on another laptop starts with the same context.
#
#   scripts/claude-memory.sh push   # this machine's memory → .claude/memory/ (then commit)
#   scripts/claude-memory.sh pull   # .claude/memory/ → this machine's memory (after cloning or pulling)
#
# Claude Code keeps memory in ~/.claude/projects/<key>/memory/, where <key> is the repo's absolute path
# with every non-alphanumeric character replaced by "-" (C:\Users\User\Workspace\colosseum →
# C--Users-User-Workspace-colosseum). CLAUDE.md imports .claude/memory/MEMORY.md, so even without a pull
# Claude sees the index. The repo will be public: keep secrets and personal contacts out of memory.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
key=$(cd "$root" && { pwd -W 2>/dev/null || pwd; } | sed 's/[^A-Za-z0-9]/-/g')
local_dir="$HOME/.claude/projects/$key/memory"
repo_dir="$root/.claude/memory"

case "${1:-}" in
  push) src=$local_dir dst=$repo_dir ;;
  pull) src=$repo_dir dst=$local_dir ;;
  *) echo "usage: $0 push|pull" >&2; exit 2 ;;
esac

[ -d "$src" ] || { echo "nothing to copy: $src does not exist" >&2; exit 1; }
mkdir -p "$dst"
# Mirror: files deleted at the source are deleted at the destination too.
for f in "$dst"/*.md; do [ -e "$f" ] && [ ! -e "$src/$(basename "$f")" ] && rm -v "$f"; done
for f in "$src"/*.md; do
  name=$(basename "$f")
  if ! cmp -s "$f" "$dst/$name"; then cp "$f" "$dst/$name" && echo "updated $name"; fi
done
echo "$1: $src → $dst"
