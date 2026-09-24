# Architecture Decision Records

Short records of decisions that shape the MVP. Status is **Accepted** unless noted. Change a decision by adding a new ADR that supersedes it.

## ADR-0001 — Monorepo, TypeScript app + Anchor program + Python training
**Context:** two founders, 17 days, one deployable web product. **Decision:** pnpm workspace (`apps/web`, `apps/mcp`, `packages/core`), Anchor 1.1.2 workspace in `onchain/`, Python in `ml/`. One Next.js app holds landing, checkout, dashboard, admin and API routes (single Vercel deploy). **Consequence:** shared TS logic lives in `packages/core`; the program is built in WSL (ADR-0008).

## ADR-0002 — Full prepay into escrow (no partial deposits in the MVP)
**Context:** partial deposits need a second payment rail at the property and complicate the demo. **Decision:** the escrowed amount is the full price; `deposit_bps = 10000` stays in the quote format. **Consequence:** the model's levers are price and contract template, not deposit %. Partial deposits are a pure off-chain change later (the program already escrows any `amount`).

## ADR-0003 — Menu of templates priced by risk, instead of a bandit policy
**Context:** a Thompson-sampling bandit needs traffic we do not have and is hard to explain on a sales call. **Decision:** three fixed templates (flexible / standard / non-refundable); each priced so the hotel's expected revenue from this guest equals today's average (pricing-and-risk-model.md §5). **Consequence:** deterministic, explainable, testable; the bandit can later choose which templates to show and the reference price.

## ADR-0004 — Quote signer co-signs `create_booking` (no Ed25519 instruction introspection)
**Context:** terms must be authenticated on-chain. Options: verify an Ed25519 precompile instruction via the instructions sysvar, or require the quote signer as a transaction signer. **Decision:** co-signing. The server builds the transaction, so it can sign it; every argument is covered by the signature. **Consequence:** simpler program, no parsing of precompile data; the off-chain quote carries its own Ed25519 signature for agents, and `quote_hash` links the two.

## ADR-0005 — iCal first; Channex and PMS adapters later
**Context:** Tbilisi independents list on Booking.com/Airbnb and often have no channel manager. **Decision:** iCal import/export per unit + manual blocks; bookings start `Pending` until a fresh re-sync confirms no conflict. **Consequence:** 15-minute onboarding without partnerships; small double-booking window handled by confirm/void.

## ADR-0006 — Single admin key as arbiter stub (disclosed)
**Decision:** disputes are resolved by `config.admin`. Shown on screen and in docs as a stub; roadmap is a Squads multisig of bonded arbiters. **Consequence:** fast MVP; the trust property (escrow only to guest/hotel/treasury) limits the damage.

## ADR-0007 — GBDT hazard model exported to JSON, evaluated in TypeScript
**Context:** ONNX Runtime in a serverless Next.js function is heavy; a Python microservice is a second deployable. **Decision:** LightGBM with numeric-only features (one-hot categoricals), exported to a compact JSON tree format + isotonic table; a ~100-line TS evaluator in `packages/core`, verified against Python on parity vectors. **Consequence:** zero runtime dependencies, sub-millisecond scoring, identical results in browser, server and MCP.

## ADR-0008 — Build the program in WSL on a native filesystem
**Context:** Anchor/Solana toolchain is Linux-first; building on `/mnt/c` is slow. **Decision:** `scripts/program.sh` rsyncs `onchain/` to `~/stumari-onchain` inside WSL Ubuntu 24.04, runs `anchor build` / `cargo test` there, and copies `target/deploy/*.so`, `target/idl/*.json` back to `onchain/artifacts/`. **Consequence:** fast incremental builds; the repo holds the IDL the TS client is generated from.

## ADR-0009 — Server builds every transaction; browser only signs (gasless)
**Context:** Kit 8 + wallet plugins are new; guests (card-blocked tourists) may hold USDC but no SOL. **Decision:** API returns base64 v0 transactions with the operator as fee payer (and rent payer); the browser signs via Wallet Standard (`solana:signTransaction`) and posts back for relay. A devnet-only demo wallet (local keypair + faucet) signs the same bytes. **Consequence:** no Solana client code in the browser; guests need only USDC; judges and hotel prospects can try the live product without installing Phantom.

## ADR-0010 — Kit 8 + Codama client on the server, transaction version 0
**Context:** `@solana/kit` 8 with Codama clients is the maintained stack (Sep 2026); v1 transactions are live on mainnet but not all wallets sign them. **Decision:** generate a Kit client for `stumari_escrow` from the Anchor IDL with Codama; build **v0** transactions (all ours fit in 1232 bytes). **Consequence:** widest wallet compatibility now; switching to v1 later is a one-line change.
