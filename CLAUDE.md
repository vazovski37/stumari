# Stumari — project knowledge for Claude

Stumari (სტუმარი, "guest"): stablecoin checkout for merchants with cancellable inventory, starting with independent hotels in Tbilisi. A calibrated time-to-cancel model prices a menu of cancellation contracts per request; a Solana USDC escrow (`stumari_escrow`) enforces the chosen contract. Built for the Colosseum **Crypto World's Fair** hackathon — final submission opens 2026-10-06, closes **2026-10-12 11:59 PM PDT**.

## Read first
- `docs/README.md` — index of all docs.
- `docs/product/mvp-scope.md` — what is in / stubbed / cut. Do not build cut features.
- `docs/architecture/*.md` — **specs are contracts.** If code must diverge, update the spec (and add an ADR in `docs/decisions/README.md`) in the same change.
- `spec/vectors/refund.json` — Rust and TS must both pass every case.

## Layout
`onchain/` Anchor 1.1.2 workspace · `packages/core` pure TS domain logic (no Solana deps) · `packages/escrow-client` Codama Kit client · `apps/web` Next.js (landing, checkout, dashboard, admin, API) · `apps/mcp` MCP server · `ml/` Python training · `scripts/` bootstrap/E2E/build helpers · `docs/` specs, ADRs, plan, sales, submission.

## Conventions
- Money: `bigint` in TS, `u64` on-chain, **decimal strings** in JSON/DB (`"123450000"` = 123.45 USDC, 6 decimals). Never floats for money.
- Timestamps: unix seconds. Dates: `YYYY-MM-DD` in the hotel timezone (`Asia/Tbilisi`).
- bps everywhere for percentages (`10000` = 100%).
- Server builds every transaction (v0, operator = fee payer); browser only signs via Wallet Standard (ADR-0009, ADR-0010).
- Positioning language: "stablecoin checkout for merchants", never "travel app" or "escrow app" in user-facing copy (see docs/product/vision-and-positioning.md).
- Default cluster **devnet**. Never touch mainnet without an explicit instruction from the user.

## Toolchain (Windows host + WSL)
- Host: Node 24, pnpm 9, Python 3.11, Docker Desktop. C: drive nearly full (~25 GB free) — avoid large installs.
- WSL Ubuntu-24.04 (root): Rust 1.98 (+1.89 via rust-toolchain), Agave/Solana CLI 3.1.10, Anchor 1.1.2, Surfpool 1.6 at `~/.local/bin/surfpool`. PATH is NOT set for non-interactive shells — source `scripts/wsl-env.sh`.
- Calling WSL from Git Bash: variables inside `wsl bash -lc '...'` get mangled and `/mnt/c/...` paths get rewritten. **Write a script file and run `MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash /mnt/c/...script.sh`.**
- **Local chain:** `scripts/localnet.sh start` → Surfpool in Docker at `http://127.0.0.1:8899` (WSL ports are unreachable from Windows here — ADR-0015). Deploy via `surfnet_writeProgram`, time travel via `surfnet_timeTravel`.
- Program build: `scripts/program.sh build|test|deploy` (rsyncs `onchain/` to `~/stumari-onchain` in WSL, builds there, copies `.so` + IDL to `onchain/artifacts/`).
- Solana reference docs (current as of Sep 2026: Kit 8, Codama, Anchor 1.x, Surfpool, tx v1): `~/.agents/skills/solana-dev/` inside WSL. Prefer them over memory for API details.
- Prefix Anchor/Surfpool commands with `NO_DNA=1`.

## Colosseum
- Project draft: https://colosseum.com/arena/projects/stumari (category Stablecoins, chain Solana). Status in `docs/submission/status.md`.
- Copilot API: see memory `reference-colosseum-copilot` (curl only; token is never stored).
