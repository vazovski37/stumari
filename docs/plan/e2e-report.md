# E2E report — localnet, 2026-09-25

The MVP loop runs end to end on the local chain (Surfpool in Docker, [ADR-0015](../decisions/README.md)). The headless E2E (`scripts/e2e.ts`) passed **20 of 20 steps on three consecutive runs**. The browser pass through the demo app passed too. Every token balance is asserted against `@stumari/core` math (`splitCancel`, `splitRelease`, `splitResolve`). Every account the program closes is checked as well: its stored refund, hotel and fee amounts must match.

At the end the localnet is running with a fresh chain whose clock matches wall time, and the demo hotel `stumari-demo` is registered on it (`bootstrap` reports `already up to date (0 changes)`). The web server is stopped.

## 1. Headless E2E (`pnpm --filter @stumari/scripts e2e`)

What the script does:

- Runs `bootstrap -- --cluster localnet --reset`.
- Creates a fresh database, `apps/web/.data/e2e.db`, so the demo database never collects test bookings. It seeds the demo hotel there and registers it on-chain with a **fresh payout wallet**, so hotel balances start at 0.
- Starts `next dev` on a free port against that database. It sets `NEXT_PUBLIC_SITE_URL` to that port (needed for SIWS) and sets `ICAL_ALLOW_LOOPBACK=true`.
- Serves a local OTA `.ics` fixture on `127.0.0.1`.
- Drives the public API with four guest keypairs. Each keypair has its own cookie jar and never holds SOL.
- Drives the admin API after a real SIWS sign-in as the operator.
- Drives `apps/mcp` over stdio with the MCP SDK client.
- Finishes with another `bootstrap --reset`, so the chain clock is realigned with wall time.

Order matters. **Every `create_booking` happens before the first time travel.** Quotes carry wall-clock expiries, so a chain that runs ahead fails with `QuoteExpired` (backlog, scripts).

| Step | Result | What is asserted |
|---|---|---|
| Setup: e2e DB, hotel registered, web app, SIWS admin, T1 imports the fixture feed | PASS | `/api/config/public` = localnet, fixed program id, bootstrap mint, quote signer = operator, `demo_mode`. Sync of T1 returns no errors |
| Setup: 4 guest wallets funded by `/api/demo/faucet` | PASS | Each holds 500.00 USDC and **0 lamports** |
| **(b)** Guest A: Standard, 30 d out → auto-confirm → cancel | PASS | The quote verifies against `quote_signer`. A repeated `/pay` returns the same cached bytes. The full price is in escrow. `refund_if_cancel_now` = 100%. `min_refund` = amount. `splitCancel` gives 10000 bps, and the booking's stored amounts match. Guest back to 500.00, hotel +0. Guest lamports still 0 |
| **(f)** Repeated `/pay` on the paid quote | PASS | `409 ALREADY_PAID` with the booking view |
| **(c)** Guest B: Flexible, 5 d out → auto-confirm | PASS | Confirmed by the post-payment `after()` |
| **(d)** Guest D: Standard, same dates → auto-confirm | PASS | Gets the other Double unit (D2) |
| **(e)** Guest E: pays after the OTA feed starts blocking the held Twin unit | PASS | A `sync_conflict` shows in `/api/dashboard/{id}/overview`. The status stays `pending` in the DB and on-chain |
| **(g)** MCP `search_availability` → `get_quote` → `book` → `booking_status` | PASS | Five tools are listed. `verification.verified` and `matches_request` are true. The agent key signs. The status reaches `confirmed`. The agent pays exactly the Flexible price (229.79 USDC). Its SOL is unchanged: the operator paid fees and rent |
| **(h)** D1 export feed | PASS | It contains `UID:{B}@stumari` (confirmed), not A's booking id (cancelled), and no guest name or email |
| Time travel → check-in + 10 s | PASS | The chain clock is inside `[checkin_ts, release_after_ts)` |
| **(d)** Guest D flags a dispute | PASS | `can_dispute` true and `can_cancel` false before the flag. `disputed` on-chain afterwards |
| **(e)** Void after the confirm deadline | PASS | The dashboard confirm is refused with `409 NOT_ALLOWED`. The guest-signed `void` succeeds: `voided`, refund = amount, hotel 0, fee 0. Guest back to 500.00 |
| Time travel → check-in + 120 s + 10 s | PASS | — |
| **(c)** `GET /api/bookings/{B}` cranks `release` | PASS | Status `released`. `splitRelease` matches the stored amounts. The hotel ATA gets +136.24 USDC |
| **(d)** Admin `POST /api/admin/bookings/{D}/resolve { guest_bps: 2500 }` | PASS | `splitResolve`: guest +32.50, hotel +97.50, fee 0 |
| Balances end to end | PASS | A 500.00 · B 363.76 · D 402.50 · E 500.00 · agent 770.21 · hotel 233.74 · treasury +0.00 (fee 0 bps), all exactly as computed. No guest ever held SOL |
| **(a)** Menus: fresh wallet vs guest B (one released stay), 60 d and 2 d lead | PASS | Lead time is exact. `is_repeated_guest` is 1 vs 0. B's P(cancel) is lower. The reference template = base rate. The menus differ. At 2 d, Non-refundable is withheld (`duplicate_terms` = Standard) |
| Teardown: `bootstrap --reset` | PASS | — |

Menus printed by step (a) (Double room, base 130.00 USDC):

| | Fresh wallet, 60 d | Guest B, 60 d | Fresh wallet, 2 d | Guest B, 2 d |
|---|---|---|---|---|
| P(cancel) | 0.1741 | 0.1663 | 0.0652 | 0.0621 |
| Flexible | 134.18 | 133.93 | 135.17 | 134.84 |
| Standard (reference) | 130.00 | 130.00 | 130.00 | 130.00 |
| Non-refundable | 126.75 | 126.94 | withheld (= Standard) | withheld (= Standard) |

## 2. Browser pass (Claude Browser pane, demo DB, `http://localhost:3000`)

| Page / flow | Result | Notes |
|---|---|---|
| Landing `/`, `/ka`, `/ru` | PASS | The EN copy shows "27% of ordinary bookings", "37% overall, including no-shows and group blocks" and "1,579,764" (backlog landing item). KA and RU render in Georgian and Cyrillic |
| `/apply` form submission | PASS | Clearly fake test data ("E2E Test Guesthouse", Telegram `e2e_test_only`). The page shows "Application received". The application appears in `/admin` → Applications. No Telegram token is configured, so nothing was sent |
| `/h/stumari-demo` with the Test wallet | PASS | Connect → Test wallet → "Get 500 test USDC" (balance 500.00) → dates 30 Sep – 2 Oct → See prices (Flexible 136.24 / Standard 130.00 / Non-refundable 129.78) → Pay 130.00 USDC (one click, no SOL) |
| `/b/{id}` → cancel | PASS | Confirmed after the auto-confirm. "Refund if you cancel now" = 65.00 USDC (Standard, 5 days out). Cancel → confirm dialog → Cancelled, "Refunded to you 65.00 / Paid to the hotel 65.00" |
| `/model` | PASS | Calibration chart (Platt vs uncalibrated), AUC 0.713, Brier 0.1917, ECE 0.038 |
| `/admin` signed in (SIWS with the Test wallet) | PASS | A non-admin wallet correctly gets "Admins only". After its address was temporarily added to `ADMIN_WALLETS` (removed again afterwards) the console loaded: applications, hotels, bookings |
| `/dashboard/{hotelId}` signed in as admin | PASS | Overview, bookings, rooms and calendars (export feeds, import URLs, manual blocks) |

Screenshots (768 × 480 PNG) are in [`e2e-screens/`](e2e-screens/). Regenerate them with `pnpm --filter @stumari/scripts e2e:screens -- --booking <id>`, which runs headless Edge or Chrome over DevTools against a running app. Admin pages are captured after a SIWS sign-in as the operator: `01-landing-en`, `02-landing-ka`, `03-landing-ru`, `04-apply`, `05-checkout-menu`, `06-booking` (the cancelled browser booking), `07-model`, `08-admin`, `09-dashboard`.

## 3. Bugs found and changes made

No step of the loop failed. The only product-code change is the test-only iCal allowance the assignment anticipated. Step (e) needs it, because the SSRF guard (correctly) refuses `http:` and loopback URLs.

| Change | Where |
|---|---|
| `UrlPolicy { allowLoopback }`: `http:` or `https:` URLs whose host is `localhost`, `127.0.0.1` or `::1` pass `assertSafeUrl` and are fetched without the public-address DNS guard. Everything else (credentials, private IPs, redirects to private hosts, `http:` to public hosts) is still refused | `apps/web/lib/inventory/ssrf.ts:82-111`, `:164-195` |
| `ICAL_ALLOW_LOOPBACK` env flag → `icalAllowLoopback`. It is an **EnvError on `mainnet-beta` and on Vercel** | `apps/web/lib/env-schema.ts:70`, `:133-135`, `:160` |
| The flag is applied to import-URL validation and to sync fetches | `apps/web/lib/dashboard/units.ts:21`, `apps/web/lib/inventory/ical-sync.ts:11`, `:44` |
| Documented as a commented line | `apps/web/.env.example` (last lines) |
| Tests: loopback accepted only under the policy; private, credentialed and non-http URLs still refused; a real `http://127.0.0.1` fetch with and without the policy; redirects still re-checked; env refused on mainnet and Vercel | `apps/web/lib/inventory/ssrf.test.ts`, `apps/web/lib/env-schema.test.ts` |
| `e2e` and `e2e:screens` scripts; tsconfig includes `e2e/**` | `scripts/package.json`, `scripts/tsconfig.json` |
| `web-demo` preview config on port 3000. SIWS checks the host against `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, so the existing 3200 and 3210 configs cannot sign in | `.claude/launch.json` |

## 4. Findings and known limitations (not fixed; for the lead)

1. **The dashboard's "Paid out to your wallet" counts released stays only.** After a 50% cancel the hotel really received 65.00 USDC, but the card shows 0.00 USDC and "0 stays settled". This matches api.md (`payouts.released_minor`) but misleads a hotel owner. Consider adding cancellation shares ("hotel_minor" of cancelled and resolved bookings) or renaming the card.
2. **The repeat-guest price difference is small.** With one released stay, Flexible drops by 0.25 USDC at 60 d and 0.33 USDC at 2 d. The demo script's Guest B beat needs up to 3 released stays (the feature is capped at 3), or a longer lead, before it is visible on camera. Otherwise cut the sentence (demo script prep says so).
3. **Holds and demo profiles.** Every browser profile or cookie that clicks "See prices" holds one unit for 10 minutes. Twin and Family have one unit each and Double has two, so a third profile (or a re-run of `e2e:screens`) on the same room and dates sees "Not available for these dates". This is correct behaviour per data-model.md, but rehearsals should use different dates or wait 10 minutes.
4. The Test wallet label says "devnet, not real money" on localnet as well. The banner correctly says "local test chain". This is cosmetic.
5. Not covered: a real Phantom and sign-and-send wallets (`/submitted`), and a devnet run (the operator is not funded yet; see backlog Founders). Explorer links on localnet use `?cluster=custom&customUrl=http://127.0.0.1:8899`, which works only on this machine.
6. `scripts/e2e/mcp.ts` imports `@modelcontextprotocol/sdk` from `apps/mcp/node_modules` by path. It is not a dependency of `@stumari/scripts`, and no install was allowed. It should be added to `scripts/package.json`, the same kind of item as the existing drizzle/libsql backlog item.
7. The loopback hop has no 2 MB cap. It is test-only (the flag is refused on mainnet and Vercel).
8. After `--reset`, bookings that the demo DB created on an earlier chain stay in the DB (runbook §3). The demo DB now contains 8 cancelled test bookings from earlier smoke/E2E work and this browser pass, plus the test application "E2E Test Guesthouse". Set its status to `rejected` in `/admin` before recording, or delete `apps/web/.data/stumari.db` and re-bootstrap for a clean demo.

## 5. Reproduce

```bash
# Git Bash, repo root, Docker Desktop running
bash scripts/localnet.sh reset
pnpm --filter @stumari/scripts bootstrap -- --cluster localnet
pnpm --filter @stumari/scripts e2e              # ~90 s; resets the chain at start and end (--keep-chain to inspect)
pnpm --filter web test                          # 22 files, 188 tests (2026-09-25)
pnpm --filter web typecheck
pnpm --filter @stumari/scripts typecheck
# screenshots: start the demo app on :3000 (e.g. `pnpm dev`), then
pnpm --filter @stumari/scripts e2e:screens -- --booking <booking id>
```

The web log of the E2E server is `%TEMP%\stumari-e2e-web.log`. If a run fails, the chain is left as it was so you can inspect it. The next run resets it.

## 6. Demo-recording checklist ([demo-video-script.md](../submission/demo-video-script.md))

The script records on **devnet**. This list covers what is ready, beat by beat. Everything below was exercised on localnet in this run.

- [ ] **Prep:** fund the devnet operator, deploy, then `bootstrap --cluster devnet` (runbook §5). None of this is done yet. Rehearse locally with `pnpm dev` + the localnet meanwhile.
- [ ] **Prep:** clear or archive the test application and old test bookings in the database you record from (finding 8).
- [ ] **0:00 Problem:** landing `/`. Statistics verified: 27%, 37% overall, 1,579,764.
- [ ] **0:22 iCal onboarding:** `/admin` → hotel → a unit with an import URL → Sync → blocked dates → copy the export URL. The seeded demo has no import URLs, so add one in rehearsal. On devnet or Vercel it must be a real **https** feed: `ICAL_ALLOW_LOOPBACK` is refused on Vercel. The export feed was verified to list confirmed and exclude cancelled bookings (step h).
- [ ] **0:35 Two guests, three contracts:** two profiles, same room and dates, wallet connected **before** See prices. Use the Double room: it is the only one with 2 units (finding 3). Give Guest B up to 3 released stays, or drop the repeat-guest sentence (finding 2). Open "Why this price", then `/model` (chart verified).
- [ ] **1:15 Pay:** Test wallet → Pay (no SOL) → `/b/{id}` shows **Confirmed** within about 2 s (auto-confirm). The Explorer links work on devnet (`?cluster=devnet`).
- [ ] **1:35 Cancel:** check-in 4–6 days out, Standard → "Refund if you cancel now" = 50% → Cancel → "Refunded 65.00 / Paid to the hotel 65.00" (verified in the browser pass).
- [ ] **1:55 Release:** a same-day booking before check-in (admin sets the hotel's check-in a few minutes ahead), then wait for check-in + 120 s and refresh `/b/{id}`. The lazy crank releases it (verified via time travel, step c).
- [ ] **2:10 MCP:** Claude Desktop config per runbook §8 with `onchain/keys/agent-devnet.json` (the bootstrap tops it up to 1,000 test USDC). `search_availability` → `get_quote` ("Signature verified") → `book` → `booking_url` (verified over stdio, step g).
- [ ] **2:30 Trust + limits:** overlay text only.
- [ ] Never show `.env.local`, `onchain/keys/*` or a terminal that printed `OPERATOR_SECRET_KEY`.
