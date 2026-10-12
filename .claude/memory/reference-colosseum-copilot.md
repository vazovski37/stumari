---
name: reference-colosseum-copilot
description: "How to reach Colosseum Copilot: official skill + copilot-connect helper on API v2; old v1 PAT is retired — token never stored here"
metadata:
  node_type: memory
  type: reference
  modified: 2026-10-12T20:12:37.535Z
  originSessionId: 4ed76387-46b8-4225-bfa3-f4d0496fd177
---

Since 2026-10-13: use the official `colosseum-copilot` skill (installed globally via `npx skills add ColosseumOrg/colosseum-copilot -g -y -a claude-code`) and its sign-in helper `npx @colosseum-org/copilot-connect status|login|token`. Base `https://copilot.colosseum.com/api/v2`. Each request is one pipeline: `npx @colosseum-org/copilot-connect token | sed 's/^/Authorization: Bearer /' | curl --silent --show-error --include --header @- "$BASE/<route>"`. The skill's SKILL.md is the reference for routes and rules.

**Why:** v1 tokens stop working 2026-10-28 00:00 UTC, and the skill says never to read or use `COLOSSEUM_COPILOT_PAT` or call `/api/v1`. The old v1 PAT (expiring 2026-12-21) is obsolete. Never put a token in a file, argument or memory.

**How to apply:** On a new machine, run the install command, then `login` (a browser approval the user must do). Cloudflare blocked non-curl clients under v1 (error 1010), so keep using curl.

Related: [[project-stumari]].
