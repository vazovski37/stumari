---
name: reference-colosseum-copilot
description: "How to call the Colosseum Copilot research API (base URL, quirks, filters) — token is NOT stored here"
metadata:
  node_type: memory
  type: reference
  originSessionId: b20568f5-8065-4c51-9467-d75999be6137
  modified: 2026-09-24T21:12:22.380Z
---

Base: `https://copilot.colosseum.com/api/v1`, header `Authorization: Bearer $COLOSSEUM_COPILOT_PAT`. The user's PAT (scope `colosseum_copilot:read`) expires 2026-12-21; it was pasted in chat once — never write it to disk or memory; ask the user to set the env var.

Quirks learned 2026-09-22:
- Cloudflare blocks non-curl user agents with **error 1010** — call via `curl` (Python urllib fails).
- `winnersOnly` works only nested: `{"filters":{"winnersOnly":true}}`.
- Corpus covers Renaissance, Radar, Breakout, Cypherpunk only (5,428 projects / 293 winners) — not Frontier or the current season.
- Endpoints used: `/status`, `/filters`, `POST /search/projects {query,limit}`, `GET /projects/by-slug/<slug>`, `POST /search/archives {query,limit,intent}`, `POST /analyze {cohort,dimensions,topK}` → `{totals,buckets}`, `POST /compare {cohortA,cohortB,dimensions,topK}` → `{totalsA,totalsB,results}` with `lift`, `GET /clusters/<key>` → `projectCount`, `winnerCount`.

Related: [[project-stumari]].
