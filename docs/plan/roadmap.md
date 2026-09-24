# Roadmap to 12 October 2026

Deadline: **2026-10-12 11:59 PM PDT** (Tbilisi: 2026-10-13 10:59 AM). Final submission opens **2026-10-06 4:00 AM PDT**.

## Milestones

| # | Target date | Milestone | Owner |
|---|---|---|---|
| M0 | Sep 25 | Repo, specs, ADRs, toolchain (WSL: Rust 1.98, Agave 3.1.10, Anchor 1.1.2, Surfpool 1.6) | Claude ✅ |
| M1 | Sep 26 | Escrow program + tests green; model trained + exported; core library with parity tests | Claude |
| M2 | Sep 27 | Web app: landing (EN/KA/RU) + apply form live locally; checkout with demo wallet on devnet | Claude |
| M3 | Sep 28 | Hotel dashboard, admin, iCal sync, cron, MCP server; devnet demo hotel end to end | Claude |
| M4 | Sep 28 | **Start calling hotels** with the sales kit + live landing page | Vazovski, luka |
| M5 | Oct 1 | Deploy: Vercel + Turso (founders create accounts), devnet program; landing on a real domain | founders + Claude |
| M6 | Oct 3 | First pilot hotel onboarded (iCal connected, payout wallet, room types) | founders |
| M7 | Oct 5 | Security review pass; mainnet decision (pilot with amount cap) or stay devnet | Claude + founders |
| M8 | Oct 6–8 | First real booking (mainnet pilot) or recorded devnet booking with a real hotel's inventory | founders |
| M9 | Oct 9–11 | Demo video (≤3 min, live product) + pitch video (≤2 min); submission fields, profiles, logo, repo link | founders (scripts by Claude) |
| M10 | Oct 12 | Submit | founders |

## Build order (engineering)

1. `onchain/` — program per escrow-program.md; Rust logic tests over `spec/vectors/refund.json`; LiteSVM integration tests.
2. `ml/` — dataset → person-period → LightGBM → isotonic → metrics + plots → `model.json` + `parity.json`.
3. `packages/core` — refund math (vectors), tiers validation, templates, windows, feature adapter, GBDT evaluator (parity), pricing engine, quote canonicalization/sign/verify.
4. `packages/escrow-client` — Codama-generated Kit client from the IDL + PDA helpers.
5. `apps/web` — DB schema + migrations; API; landing + apply; checkout + demo wallet; booking page; dashboard; admin; iCal; cron.
6. `scripts/` — devnet bootstrap (mock USDC mint, config, demo hotel), E2E loop on Surfpool with time travel.
7. `apps/mcp` — 5 tools.
8. Docs: sales kit, submission kit, deploy guide.

## What founders must do (Claude cannot)

- Create accounts: Vercel, Turso (or any Postgres/libsql host), a domain; a Helius/Triton RPC key for mainnet if we go there.
- Fund the operator wallet (devnet SOL via faucet is automatable; mainnet SOL is yours to send).
- Call hotels, sign pilots, collect payout wallets.
- Record videos, complete Colosseum profiles (name, country, Telegram), accelerator decision.
- Decide the final pilot offer terms (drafted in docs/sales/offer.md).
