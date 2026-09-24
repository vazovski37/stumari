# Stumari

**Stablecoin checkout for merchants with cancellable inventory — starting with independent hotels in Tbilisi.**

The hotel's own model writes each booking's cancellation contract; a Solana USDC escrow enforces it.

- A seller agent returns one signed quote per request: a menu of contracts (flexible / standard / non-refundable), each priced by a calibrated time-to-cancel model so the hotel's expected revenue stays at today's level.
- The guest (or an AI agent) pays USDC into a per-booking escrow that encodes the exact refund schedule. Guests need no SOL — Stumari pays the fees.
- Cancellations refund by the schedule automatically; the hotel is paid 24 hours after check-in.

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

## Quick start

See [docs/plan/runbook.md](docs/plan/runbook.md) for setup, local development, devnet bootstrap and deployment.

## Status

MVP in progress — see [docs/plan/roadmap.md](docs/plan/roadmap.md).
