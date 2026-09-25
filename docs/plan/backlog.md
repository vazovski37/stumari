# Backlog — open follow-ups from builds and reviews

Owned by the lead engineer; agents read the section for their component. Tick items when done (with the commit).

## apps/web
- [x] **Landing copy (pricing review):** the "37%" problem card → "27% of ordinary bookings cancel" with the note "37% overall, including no-shows and group blocks (Hotel Booking Demand, 119,390 bookings)". The "1.58M" card → "1,579,764 visitors from Russia in 2025" (exact, not rounded), text: Russian-issued Visa/Mastercard cards do not work abroad, so many already pay small hotels in USDT/USDC informally. Update EN/KA/RU.
- [x] **Trust section:** add the honest limits from security.md — the program is still upgradeable by Stumari during the pilot (moves to a multisig / frozen before real money) and disputed bookings depend on Stumari's arbiter key.
- [x] `lib/public-config.ts`: read `fee_bps` and `release_delay_secs` from the on-chain Config (via `@stumari/escrow-client`) when available; startup check `STUMARI_PROGRAM_ID` == `onchain/artifacts/program-id.txt` (inline the id at build time).
- [x] Quote holds: on a local `file:` libsql DB, concurrent `BEGIN IMMEDIATE` fails with `SQLITE_BUSY` — use single-statement conditional writes (the rate limiter pattern) or retry with backoff.
- [x] Sync cron prunes old `rate_events`.
- [x] English-only pages (`/h`, `/b`, `/my`, `/model`, `/dashboard`, `/admin`) live under `app/(site)/`; avoid the paths `/`, `/apply`, `/en`, `/ka`, `/ru` there.
- [x] Policy validation in API/DB must match `@stumari/core` `validatePolicy` (reference template must be enabled). Checkout and the dashboard PATCH both use it (27-case parity test).
- [ ] Dashboard: after a payout-wallet change, show that open bookings still pay the wallet snapshotted at booking time (the new wallet's dashboard lists them; the old wallet loses access).
- [ ] SIWS: a wallet whose `solana:signMessage` returns a wrapped `signedMessage` (e.g. some hardware setups) fails verification; test Phantom and document supported wallets.
- [ ] Policy editor: friendlier wording than `validatePolicy`'s own messages for hotel owners.
- [ ] Sign in once with a real Phantom (`solana:signMessage`) before recording; only the demo wallet was clicked through.
- [ ] Not yet exercised over HTTP: release crank and dispute (need time travel), a real Phantom / sign-and-send wallet (only the demo wallet was clicked through).
- [x] `/model` page renders `ml/reports/reliability.json` + metrics summary (ADR-0016 wording: Platt; AUC 0.713 vs 0.634; ECE 0.038).
- [x] Rate-limit key: do not trust a client-supplied `X-Forwarded-For` first entry except on Vercel (`VERCEL` set); otherwise use the socket/`x-real-ip`.
- [x] Production build must fail (or loudly warn) when `NEXT_PUBLIC_SITE_URL` is missing — SSG bakes canonicals/sitemap/og:url at build time.
- [x] `AUTH_SECRET`: require ≥ 64 hex chars (32 bytes) as configuration.md says.
- [x] Features needing `OPERATOR_SECRET_KEY`, `STUMARI_MINT`, `CRON_SECRET` refuse clearly when they are null; a `libsql://` URL without `LIBSQL_AUTH_TOKEN` is an error in production.
- [x] Copy (ADR-0013): "earns you the same expected revenue" → "priced to target the same expected revenue"; soften "by exactly this guest's risk" → "by this guest's estimated risk" (EN/KA/RU).
- [x] Apply form placeholder contrast ≥ 4.5:1 (currently 3.66:1).
- [x] **Security (done as: every key the web app holds — operator and admin; the demo hotel and treasury keys are not held by the web app):** reject any `buyer_wallet` / guest wallet (quote, pay, cancel, dispute, MCP) that equals a server key address — operator, admin, `DEMO_HOTEL_WALLET`'s operator-held keys, the treasury owner — with 400 `INVALID_WALLET`. Otherwise the builders would sign the guest's token transfer with our own key (the escrow client also refuses this).
- [x] Before `buildCreateBookingTx`, `fetchMaybeBooking(bookingPda)` → 409 `ALREADY_PAID` (a duplicate create otherwise surfaces only as simulate `Custom(0)` / "already in use").
- [ ] Founders proofread `messages/ka.json` and `messages/ru.json` before calls; confirm `/privacy` promises.

## docs (sales, submission, runbook)
- [x] objections.md + demo-video-script.md: "No Stumari key can redirect funds" must add the honest limits (upgradeable program; disputed funds depend on the arbiter key).
- [x] Runbook §3: local chain is `scripts/localnet.sh` (Surfpool in Docker, ADR-0015), not surfpool in WSL; deploy with `surfnet_writeProgram` via `scripts/bootstrap.ts`.
- [x] Runbook + scripts: demo slug `stumari-demo`, `DEMO_HOTEL_WALLET`, `AGENT_SECRET_KEY` formats, `AGENT_MAX_AMOUNT_MINOR` default 500 USDC; replace `/h/{demo-slug}` with `/h/stumari-demo`.
- [x] onboarding-checklist.md: a real pilot hotel stays `paused` on the devnet deployment except during supervised test bookings, and its export feed is pasted into OTAs only at go-live (devnet demo bookings would otherwise block real nights).
- [x] pitch-video-script.md: trim ~40 words to fit 1:50; use "1,579,764" (no rounding).
- [x] call-script.md: the "30-second pitch" is ~160 words — trim to ~75.
- [x] demo-video-script.md: fix over-long beats; prep step confirms the direction of the repeat-guest price difference; disclose all three stubs (arbiter key, no hotel bond, Portugal-trained prior).
- [x] one-pager.md (EN/RU/KA) + call-script pitch: payout "unless the guest opens a dispute in that window".
- [x] objections.md: remove "Some owners keep part of it in dollars" (invented behaviour).
- [x] status.md "Final check": replace `git log -p | grep -i secret` with a check for key material (64-byte JSON arrays, base58 secrets, committed .env files).
- [x] Statistic wording everywhere: "27% of ordinary bookings (37% overall incl. no-shows and group blocks)".
- [x] docs/README.md links runbook.md and backlog.md.

## onchain
- [x] Decode emitted events in tests (`excess`, `by_admin`, `secs_before`, `refund_bps`).
- [x] Regression test with the devnet topology: `quote_signer == admin == rent_payer == fee payer` through admin void and `resolve_dispute`.
- [x] Exits: constraint `treasury.key() != vault.key()` (an admin setting a vault as treasury would otherwise block that booking's close).
- [x] Restore `skip_local_validator = true` in Anchor.toml (or document); note that bare `cargo test` needs a prior `anchor build`.

## packages/core
- [x] README: hazard is Platt by default (ADR-0016), isotonic supported.
- [x] quote.json drift test must fail when the fixture is missing (regenerate only with `UPDATE_VECTORS=1`).
- [x] `buildQuoteBody`: enforce MVP constants — `decimals == 6`, `deposit_bps == 10000`, unique option ids, non-empty `hotel_slug`.

## scripts
- [ ] Add `drizzle-orm`, `@libsql/client` and `@modelcontextprotocol/sdk` to `scripts/package.json` (today `scripts/lib/db.ts` imports `apps/web/lib/db` and `scripts/e2e/mcp.ts` the MCP SDK by relative path, resolving them from `apps/web` / `apps/mcp` node_modules).
- [x] E2E: time travel only after every create in a run (quotes are stamped with wall-clock time; a chain ahead of the wall clock fails `create_booking` with `QuoteExpired`), and `bootstrap --cluster localnet --reset` at the start of each E2E run.

## wave 3 review follow-ups (2026-09-25)
- [x] 21 verified findings fixed (security SEC-1..5, money M1..M4, specs/data SC-1..5, product PH-1..8); see the commit "Wave 3 review fixes".
- [ ] A hosted, shared MCP server puts every agent behind one IP hash: at most 2 concurrent agent holds, and agent hold owners are per wallet on that host. Forward a per-agent identity before hosting it for others.
- [ ] Index `quotes (ip_hash, status, expires_at)` if the quotes table grows (the HOLD_LIMIT count scans it).
- [ ] Program (post-hackathon): close the Booking account on terminal exits, or a permissionless `close_booking` after `closed_ts` + delay, so rent returns to `rent_payer` (today ~0.00334 SOL per booking is never returned).
- [ ] If the model is retrained, regenerate `apps/web/lib/contract-examples.ts` and the landing percentages (contract-examples.test.ts fails by design).

## demo recording
- [ ] Start from a fresh demo DB (or reject the 'E2E Test Guesthouse' application and hide old test bookings).
- [x] Repeat-guest gap: one released stay is enough (1–3 price the same); use check-in ~6–10 days out, where the gap is largest (~0.6 USDC on 130); Double room for the split screen (demo script updated).
- [ ] Test wallet label says 'devnet' on localnet too (cosmetic; the guest banner names the real cluster).

## packages/escrow-client
- [ ] Pin `latest` dependency specifiers (`@solana-program/*`, `codama`, `@codama/*`, `litesvm`) to the locked versions once no agent is installing.
- [ ] `sendAndConfirm`: periodic rebroadcast until `lastValidBlockHeight` if devnet drops transactions.

## onchain (later)
- [ ] Optionally reject in `update_config` a treasury whose token authority is a Booking PDA (fail at set time instead of at exit).

## ml
- [x] Platt calibration (ADR-0016) — 2d3e9a4
- [x] Representative parity sample (377/600 City Hotel) — 2d3e9a4
- [x] Missing artifacts fail the export tests unless `STUMARI_ALLOW_MISSING_ARTIFACTS=1` — 2d3e9a4
- [x] Adapter: assert `is_repeated_guest == (previous_bookings_not_canceled ≥ 1)` (Python + TS).

## Founders (only you can do)
- [ ] Fund the devnet operator `HUmeQqxXXNsXXZkXtXHWfJqmuWNsdDo81e92ER8Spxet` with ~10 SOL from faucet.solana.com (GitHub login).
- [ ] Create Vercel, Turso and Helius (devnet RPC) accounts.
- [ ] Proofread KA/RU copy; confirm the pilot offer and privacy page.
