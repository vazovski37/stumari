# Roadmap to 12 October 2026

Deadline: **2026-10-12 11:59 PM PDT** (Tbilisi: 2026-10-13 10:59 AM). Final submission opens **2026-10-06 4:00 AM PDT**.

## Milestones

| # | Target date | Milestone | Owner |
|---|---|---|---|
| M0 | Sep 25 | Repo, specs, ADRs, toolchain (WSL: Rust 1.98, Agave 3.1.10, Anchor 1.1.2, Surfpool 1.6) | Claude ✅ |
| M0b | Sep 25 | **Founders:** create Vercel, Turso and Helius (free devnet RPC) accounts; fund the devnet operator via faucet.solana.com if the airdrop stays rate-limited | Vazovski, luka |
| M1 | Sep 26 | Landing (EN/KA/RU) + apply + sales kit; escrow program + tests green; model trained + exported; core library with parity tests | Claude ✅ Sep 25 |
| M2 | Sep 26–27 | Landing deployed on the `*.vercel.app` URL; **start calling hotels** | founders + Claude |
| M3 | Sep 27 | Escrow client; devnet deploy + bootstrap (mock USDC, config, demo hotel); checkout with demo wallet on devnet | Claude — ✅ on localnet Sep 25; devnet waits for M0b (funded operator) |
| M4 | Sep 28 | Hotel dashboard, admin onboarding, iCal sync, cron, MCP server; devnet demo end to end | Claude — ✅ on localnet Sep 25 (E2E 20/20, [e2e-report](e2e-report.md)); devnet after M0b |
| M5 | Oct 1 | Custom domain; external cron scheduler; first hotel onboarding calls | founders + Claude |
| M6 | Oct 3 | First pilot hotel onboarded (iCal connected, payout wallet, room types) | founders |
| M7 | Oct 5 | Security review pass; mainnet decision (pilot with amount cap) or stay devnet | Claude + founders — review ✅ Sep 25 (wave 3, 21 fixes); mainnet decision open |
| M8 | Oct 6–8 | First real booking (mainnet pilot) or recorded devnet booking with a real hotel's inventory | founders |
| M9 | Oct 9–11 | Demo video (≤3 min, live product) + pitch video (≤2 min); submission fields, profiles, logo, repo link | founders (scripts by Claude) |
| M10 | Oct 12 | Submit | founders |

## Build order (engineering)

Wave 1 (parallel): `apps/web` foundation (DB schema, landing EN/KA/RU, apply) · sales + submission kits + runbook · `onchain/` program with logic + LiteSVM tests · `ml/` model → `model.json` + `parity.json` · `packages/core` (refund math, tiers, dates, features, evaluator, pricing, quotes).
Wave 2: `packages/escrow-client` (Codama + tx builders, tested on a dedicated Surfpool container, ADR-0015) → devnet deploy + `scripts/bootstrap.ts` → `apps/web` quote/pay/booking/cancel + demo wallet → dashboard + admin + iCal + cron · `apps/mcp` in parallel.
Wave 3: E2E on Surfpool (time travel) ✅ and devnet in the browser (after M0b); adversarial code review ✅; deploy (after M0b).

## What founders must do (Claude cannot)

- Create accounts **now**: Vercel, Turso, Helius (free devnet RPC URL → `SOLANA_RPC_URL`), later a domain; a mainnet RPC key only if M7 goes mainnet.
- Fund the operator wallet (devnet SOL via faucet is automatable; mainnet SOL is yours to send).
- Call hotels, sign pilots, collect payout wallets.
- Record videos, complete Colosseum profiles (name, country, Telegram), accelerator decision.
- Decide the final pilot offer terms (drafted in docs/sales/offer.md).
