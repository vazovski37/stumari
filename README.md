# Stumari

**Stablecoin checkout for merchants with cancellable inventory — starting with independent hotels in Tbilisi.**

The hotel's own model writes each booking's cancellation contract; a Solana USDC escrow enforces it.

- A seller agent returns one signed quote per request: a menu of contracts (flexible / standard / non-refundable), each priced by a calibrated time-to-cancel model to target the hotel's expected revenue at today's level.
- The guest (or an AI agent) pays USDC into a per-booking escrow that encodes the exact refund schedule. Guests need no SOL — Stumari pays the fees.
- Cancellations refund by the schedule automatically; the hotel is paid 24 hours after check-in unless the guest flags a problem.

Built for the Colosseum **Crypto World's Fair** hackathon (2026). Not an OTA: the hotel owns the guest, the price bounds and the terms.

## Repository

| Path | What |
|---|---|
| [`docs/`](docs/README.md) | Product, architecture specs, ADRs, plan, sales kit, submission kit, research |
| `onchain/` | Anchor 1.1.2 program `stumari_escrow` |
| `packages/core` | Pricing engine, model evaluator, refund math, quote signing (pure TS) |
| `packages/escrow-client` | Codama-generated `@solana/kit` client |
| `apps/web` | Next.js: landing + apply, checkout, booking page, hotel dashboard, admin, API |
| `apps/mcp` | MCP server — AI agents can search, quote, book, cancel |
| `ml/` | Hazard-model training on the Hotel Booking Demand dataset |
| `spec/vectors/` | Shared test vectors (Rust ⇄ TS) |
| `scripts/` | WSL program build, devnet bootstrap, end-to-end loop |

## Quick start (local chain, Windows + Docker)

```bash
pnpm install
pnpm --filter @stumari/scripts bootstrap --cluster localnet   # Surfpool in Docker + program + mock USDC + demo hotel + apps/web/.env.local
pnpm dev                                                      # http://localhost:3000/h/stumari-demo → Test wallet → Get 500 test USDC → book → cancel
pnpm --filter @stumari/scripts e2e                            # the whole loop headless: 20 steps, balances checked against the refund math
```

Setup, devnet bootstrap, Vercel deployment and the MCP server for Claude Desktop: [docs/plan/runbook.md](docs/plan/runbook.md). What the E2E proves, with screenshots: [docs/plan/e2e-report.md](docs/plan/e2e-report.md).

**Program id** (fixed across clusters): `6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf`.

## Status (2026-09-25)

The MVP loop works end to end on a local Solana chain: a hotel is onboarded with its iCal calendars, a guest (or an AI agent over MCP) gets a signed menu of cancellation contracts priced by the model, pays USDC without holding SOL, and cancels, disputes or is released to the hotel exactly by the schedule. Devnet deployment is next ([roadmap](docs/plan/roadmap.md)).

**Stubbed, and said so on screen:** disputes are decided by a single Stumari arbiter key (roadmap: a multisig with bonded arbiters); there is no hotel bond yet; the cancellation model is trained on the public Hotel Booking Demand dataset (Portugal, 2015–17), not yet recalibrated per hotel. The escrow program is upgradeable by Stumari during the pilot; it moves to a multisig or is frozen before real money ([security.md](docs/architecture/security.md)).

Model on held-out 2017 bookings: AUC 0.713 vs 0.634 for lead time alone, Brier 0.1917 vs 0.2136 for the base rate, expected calibration error 0.038 ([ml/reports/metrics.md](ml/reports/metrics.md)).
