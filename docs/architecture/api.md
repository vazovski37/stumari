# API Specification

All endpoints are Next.js route handlers under `apps/web/app/api`. JSON in/out. Errors: `{ "error": { "code": "SNAKE_CASE", "message": "human text" } }` with a fitting HTTP status. Validation with `zod`. Money is always a **decimal string of base units** (`"123450000"` = 123.45 USDC) plus display helpers where useful.

## Runtime rules

- Every route handler declares `export const runtime = 'nodejs'`. No auth or i18n logic in middleware/proxy — route handlers call `requireSession(request, role)` with role `"user" | "admin" | { hotelId }`; server components call `pageSession()`. Admin is decided per request from `ADMIN_WALLETS`, never stored in the cookie. Session routes refuse non-GET requests whose `Origin` differs from the site's own (`403 BAD_ORIGIN`), on top of `SameSite=Lax`.
- Ed25519 and sha256: WebCrypto (`crypto.subtle`, Node ≥ 20 — what `@solana/kit` itself uses; `packages/escrow-client` does this) or `@noble/curves/ed25519` / `@noble/hashes`. Never a hand-rolled implementation.
- Solana RPC only on the server (`SOLANA_RPC_URL`). Confirmation by polling `getSignatureStatuses` (no websockets in serverless).
- Rate limits are persisted in the `rate_events` table (serverless-safe), never in memory.
- Work after the response (iCal re-sync + `confirm_booking` after a payment lands) runs in `after()` from `next/server`.

## Transaction building contract ("server builds, wallet signs")

1. **Server** builds a **version 0** transaction with Kit: `pipe(createTransactionMessage({ version: 0 }), m => setTransactionMessageFeePayerSigner(operator, m), m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m), m => appendTransactionMessageInstructions(ixs, m))`, passing `createNoopSigner(address(guestWallet))` wherever the Codama builder needs the guest's signer. It prepends idempotent ATA creation for recipient ATAs, **simulates** the transaction (reject with `409 SIMULATION_FAILED` + program error name), then `partiallySignTransactionMessageWithSigners` (operator as fee payer; also as `quote_signer` for `create_booking`), and returns `getBase64EncodedWireTransaction(tx)`. It stores `sha256(messageBytes)` in `built_txs` with the action, booking id and `lastValidBlockHeight`, and **returns the same cached bytes** for repeat calls on the same `(booking, action)` while the blockhash is valid.
2. **Browser** uses **Wallet Standard directly** (`@wallet-standard/app` `getWallets()`): pick a wallet exposing `standard:connect` and `solana:signTransaction` (and `solana:signMessage` for sign-in). Call `wallet.features['solana:signTransaction'].signTransaction({ account, transaction: bytes, chain })` → signed bytes, then `POST /api/tx/send`. Wallets exposing only `solana:signAndSendTransaction` use that and `POST /api/bookings/{id}/submitted { signature }`. The browser may use `@solana/kit` codecs (base64 ⇄ bytes) but has no RPC connection and no program client.
3. **Demo wallet** (devnet, `demo_mode`): 32 random bytes in `localStorage['stumari_demo_sk']`, `createKeyPairSignerFromPrivateKeyBytes`, decode with `getTransactionDecoder`, `signer.signTransactions([tx])`, merge the signature, encode, `POST /api/tx/send`. Labelled "Test wallet — devnet, not real money".
4. **`POST /api/tx/send { tx }`** rejects `400 INVALID_TX` if the bytes do not decode; `400 FOREIGN_TX` if the fee payer (static account 0) is not the operator, or the message hash is unknown and the operator signature is valid (not ours); `400 WALLET_MODIFIED_TX` if the hash is unknown but the operator signature fails (a wallet changed our message — some add instructions or priority fees), or the hash is known and any signature is missing or invalid. Then it runs its own signature-verifying simulation as the preflight (keeps the program error name), sends, polls until `confirmed` (≤ 30 s); updates the booking; returns `{ signature, booking }`. Failures: `409 SIMULATION_FAILED` (program error name), `409 TX_FAILED`, `410 TX_EXPIRED` (blockhash expired), `504 CONFIRMATION_TIMEOUT`.

## Pages

| Route | Audience | Notes |
|---|---|---|
| `/`, `/ka`, `/ru` | hotels | landing (i18n) |
| `/apply` (`/ka/apply`, `/ru/apply`) | hotels | pilot application; `?type=demo` is the short "book a 15-minute demo" form for ad and call traffic (keeps `utm_*`) |
| `/h/[slug]` | guests | hotel page + dates + "See prices" → quote menu (each option has a "Why this price" drawer with the explain block: P(cancel), per-window q, risk cost, multiplier, resale assumptions) → pay. If a wallet is already connected, the quote request includes it as `buyer_wallet` (history pricing); otherwise the wallet is chosen at pay time. |
| `/model` | everyone | "How pricing works": renders `ml/reports/reliability.json` (calibration chart), the metrics summary and the honest limitations; linked from every explain drawer and from the landing page |
| `/b/[bookingId]` | guests | booking status, terms timeline, refund-if-cancel-now, cancel / dispute |
| `/my` | guests | connect wallet → "Find my bookings" |
| `/dashboard/[hotelId]` | hotel (or admin) | bookings, payouts, units + iCal, manual blocks, policy |
| `/admin` | admin | applications, hotels onboarding, bookings, disputes, cron |
| `/privacy` | all | includes the Meta Pixel section and consent control when `NEXT_PUBLIC_META_PIXEL_ID` is set |
| `/ads` | founders | hidden (noindex) gallery of ad images: `/ads/{en,ka,ru}/{usdc,contracts,founding}.png` (1080×1080) and `-wide.png` (1200×630), prerendered at build |

Checkout, booking, dashboard and admin are English-only in the MVP. `booking_url = ${NEXT_PUBLIC_SITE_URL}/b/{booking_id}`.

## Public API

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/config/public` | | `{ cluster, program_id, mint, quote_signer, demo_mode, pilot_offer: { fee_bps, payout_delay_hours, amount_cap_minor, currency: "USDC" } }` — fee and delay read from the on-chain Config (`payout_delay_hours` may be fractional: 0.0333 for the 120 s demo delay); the pilot constants (0 bps, 24 h) when the Config cannot be read. `quote_signer` is `null` while the operator key is not configured |
| `GET /api/hotels?city=` | | active hotels (city matched case-insensitively, trimmed): `[{ slug, name, city, from_price_minor, room_types:[{id,name,max_adults,max_children,base_rate_minor,meal}] }]` |
| `GET /api/hotels/{slug}` | | public profile, room types, check-in/out times, enabled contracts with plain-language terms, address, phone |
| `GET /api/hotels/{slug}/availability` | `checkin, checkout, adults, children` | `[{ room_type_id, available, nights, base_price_minor }]` — **never holds** |
| `POST /api/quotes` | `{ hotel_slug, room_type_id, checkin_date, checkout_date, adults, children, buyer_type?: "guest"\|"agent", buyer_wallet? }` | `201` quote envelope · `409 UNAVAILABLE` · `503 INVENTORY_UNAVAILABLE` (Mews hotel and Mews cannot answer — mews-inventory.md) · `400 INVALID_DATES` (also > 30 nights or check-in > 365 days ahead) / `TOO_MANY_GUESTS` / `INVALID_WALLET` (a server key) · `422 AMOUNT_CAP` (every option is above `AMOUNT_CAP_MINOR`; raised before any hold — options above the cap are otherwise withheld as `over_amount_cap`) · `429 RATE_LIMITED` · `429 HOLD_LIMIT` (the caller's IP already holds 2 units; `retry-after` = the earliest of those holds' expiry). Same-day check-in allowed while `now < checkin_ts`. |
| `GET /api/quotes/{id}` | | `{ envelope, status }` |
| `POST /api/quotes/{id}/pay` | `{ option_index, payer, guest_name?, guest_email?, guest_phone? }` | `{ booking_id, booking_pda, tx, signer, lastValidBlockHeight }` · `404 QUOTE_NOT_FOUND` · `400 INVALID_OPTION` · `400 INVALID_WALLET` · `410 QUOTE_EXPIRED` · `409 HOLD_LOST` · `409 ALREADY_PAID` (booking account exists → booking view) · `403 WALLET_MISMATCH` · `422 AMOUNT_CAP` · `409 INSUFFICIENT_FUNDS { balance_minor, amount_minor }` (the UI offers the demo faucet) · `409 SIMULATION_FAILED` · `429` (per IP 30 / 10 min; per (IP, payer) 20 / 10 min; demo mode: 20 new builds per IP and 300 in all per 24 h, cached bytes free) · `503 OPERATOR_LOW_BALANCE` (demo mode, operator < 0.05 SOL). If the quote already has a booking row, the chain is read first, so a create that landed unseen answers `409 ALREADY_PAID` even after the quote expired; after a `504 CONFIRMATION_TIMEOUT` the checkout goes to the booking page instead of offering to pay again |
| `POST /api/tx/send` | `{ tx }` | `{ signature, booking }` (see contract) |
| `POST /api/bookings/{id}/submitted` | `{ signature }` | booking view (idempotent) |
| `GET /api/bookings/{id}` | | public booking view (below); lazily cranks `release`/`void_booking` when due |
| `POST /api/bookings/{id}/tx` | `{ action: "cancel"\|"dispute"\|"void", wallet }` | `{ tx, signer, lastValidBlockHeight, refund_minor? }` · `409 NOT_ALLOWED` with reason · `429` (per IP 60 / 10 min; per (IP, wallet) 30 / 10 min — never keyed on the unauthenticated wallet alone). If `refund_minor` is below the refund the page showed, the booking page does not submit: it shows the new amount and asks again. For cancel, the server sets `min_refund` = refund at now + 90 s by the booking's tiers (escrow-program.md). |
| `POST /api/bookings/{id}/refresh` | | re-reads chain, updates DB, lazily cranks, returns view |
| `GET /api/wallets/{wallet}/bookings` | | public views of that wallet's bookings (on-chain data anyway) |
| `POST /api/applications` | application fields incl. `intent: pilot\|demo` (the short demo form at `/{lang}/apply?type=demo` sends name, hotel, WhatsApp/Telegram, rooms) and `utm` | `201 { id }` · `400` · `429`; honeypot → `201` and discarded; optional Telegram notification |
| `GET /api/ical/{export_token}` | | `text/calendar` (inventory-ical.md) |
| `POST /api/demo/faucet` | `{ wallet }` | demo mode only, never mainnet: mints 500 mock USDC to the wallet's ATA (operator is mint authority); 3/hour per (IP, wallet), 10/hour/IP, 200/day in all; `503 OPERATOR_LOW_BALANCE` under 0.05 SOL |

**Public booking view** (JSON, snake_case; `apps/mcp/src/schemas.ts` parses exactly this):

```
{ id: "<32 hex>", status: "awaiting_signature"|"pending"|"confirmed"|"cancelled"|"released"|"disputed"|"resolved"|"voided"|"failed",
  hotel: { name, address, phone, checkin_time: "HH:MM", timezone }, room_type: { id, name },
  checkin_date, checkout_date, checkin_ts: int, amount_minor: "<u64>", option_id,
  terms: { tiers: [{ secs_before, refund_bps }], text: ["<plain-language line>", …] },
  refund_if_cancel_now_minor: "<u64>" | null, can_cancel, can_dispute, can_void,
  confirm_deadline_ts: int | null, release_after_ts: int | null, booking_pda,
  explorer: { booking, create_tx, exit_tx },
  settled: { refund_minor, hotel_minor, fee_minor } | null,   // null until the booking closes
  now: int }                                                    // chain clock the view was built at
```

`can_dispute` = status confirmed && checkin_ts ≤ now < release_after_ts. `refund_if_cancel_now_minor` is the cancel's `min_refund` — the refund by the tier schedule at chain now + 90 s (`minRefundForCancel`) — also while `pending`: a pending booking gets everything back only if the hotel has not confirmed when the cancel lands, and the UI states that as conditional (ADR-0012). `/submitted` fills `create_sig` / `confirm_sig` / `final_sig` from the transaction's own escrow instruction — the one whose IDL `booking` account (parsed with the generated Codama parser) is this booking's PDA; the PDA anywhere else does not count — and a column is written once, only when the chain shows that step happened. `now` is the chain clock (unix seconds) the view was built at; clients time the refund schedule and check-in step by it. **Never** includes guest name/email/phone or the guest wallet. Other conventions: `lastValidBlockHeight` is a JSON number (a safe integer); hotel slugs match `^[a-z0-9][a-z0-9-]{0,63}$`; error bodies are `{ error: { code: "UPPER_SNAKE", message } }`.

**Clocks.** Quotes, holds and DB timestamps use wall-clock time. Everything the program will check against its `Clock` — lazy cranks, the `can_*` flags, `refund_if_cancel_now_minor` and `min_refund` — uses the chain's Clock sysvar (cached 2 s, wall time as fallback), so a surfnet after time travel behaves like the program. **Program id:** at startup the web app compares `STUMARI_PROGRAM_ID` with `onchain/artifacts/program-id.txt` (copied into the build); on a mismatch it logs an error and every chain route answers `503 PROGRAM_ID_MISMATCH`, while the landing page keeps serving. Routes that need unset chain settings answer `503 CHAIN_NOT_CONFIGURED`. **Landing-only deployment:** without `STUMARI_MINT` or `OPERATOR_SECRET_KEY` the landing, `/apply` (pilot and `?type=demo`), `/privacy`, `/model`, `/ads` and SIWS + `/admin` work; `/h/*`, `/b/*` and `/my` render a "Checkout is not open yet" page and the guest header hides "My bookings" and the wallet ([go-live-landing.md](../plan/go-live-landing.md)).

## Auth (Sign-In With Solana)

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/nonce?wallet=` | `{ nonce, message }`, message = `"{host} wants you to sign in to Stumari\nWallet: {wallet}\nNonce: {nonce}\nIssued: {iso}"`; nonce stored with the exact message |
| `POST /api/auth/verify` | `{ wallet, message, signature }` (base58 Ed25519 over UTF-8 message). Checks: message equals the stored one, host == `NEXT_PUBLIC_SITE_URL` host, nonce unused and ≤ 300 s old; marks it used with one conditional `UPDATE` (two parallel verifies cannot both win); sets `stumari_session` cookie (HMAC, httpOnly, sameSite=lax, secure in prod, 7 days). Nonce and verify share a limit of 20 per IP per 10 min; the sync cron prunes old nonces |
| `POST /api/auth/logout` | clears cookie |
| `GET /api/me` | `{ wallet, is_admin, hotels: [{id, slug, name}] }` |

Roles: **admin** if wallet ∈ `ADMIN_WALLETS`; **hotel** if wallet == `hotels.payout_wallet`. Note the payout wallet must be a self-custody wallet (it signs in) — never an exchange deposit address.

## Hotel dashboard

Authorized when `session.wallet == hotels.payout_wallet` **or** `session.is_admin` (admins onboard hotels on their behalf). A non-admin asking for another hotel gets `403` whether or not it exists (ids cannot be probed); an admin gets `404` for a missing hotel. `{unitId}` = `rooms.id` everywhere.

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard/{hotelId}/overview` | `{ counts, upcoming, payouts: { released_minor, pending_minor, disputed_minor }, conflicts }` (`released_minor` = everything paid to the hotel: released and resolved stays plus its share of cancellations) (lazily cranks due bookings first) |
| `GET /api/dashboard/{hotelId}/bookings?status=` | list incl. guest contact |
| `PATCH /api/dashboard/{hotelId}/policy` | `{ enabled_templates, reference_template, resale_bps[6], min_mult_bps, max_mult_bps }` validated by `@stumari/core` `validatePolicy` (the same function checkout uses; bounds in pricing-and-risk-model.md §5) |
| `GET /api/dashboard/{hotelId}/units` | room types + units + export URLs + last sync |
| `PUT /api/dashboard/{hotelId}/units/{unitId}/ical` | `{ import_urls: string[] }` (https, ≤ 5) |
| `GET/POST /api/dashboard/{hotelId}/units/{unitId}/blocks` | manual blocks `{ start_date, end_date, summary? }` (end exclusive) |
| `DELETE /api/dashboard/{hotelId}/units/{unitId}/blocks/{blockId}` | manual only |
| `POST /api/dashboard/{hotelId}/sync` | import sync now |
| `POST /api/dashboard/{hotelId}/bookings/{id}/confirm` | operator sends `confirm_booking` (only before the confirm deadline) |

## Admin

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/applications` · `PATCH …/{id}` `{status, notes}` | pipeline |
| `POST /api/admin/applications/{id}/convert` | draft hotel prefilled from the application |
| `GET/POST /api/admin/hotels` · `PATCH /api/admin/hotels/{id}` | CRUD (incl. `confirm_mode: auto\|manual`, `inventory_provider: ical\|mews`, `mews_service_id`, `mews_rate_id`; room types take `mews_room_type_id`); on a registered hotel `status: paused\|active` sends `update_hotel(active)`, a new `payout_wallet` sends `update_hotel(authority)` + idempotent ATA create (affects new bookings only) |
| `POST /api/admin/hotels/{id}/room-types` · `PATCH …/room-types/{rtId}` | rates in USD (base units) |
| `POST /api/admin/hotels/{id}/room-types/{rtId}/units` | `{ label, ical_import_urls? }` → `{ id, export_url }` |
| `POST /api/admin/hotels/{id}/mews-test` | "Test Mews connection", read-only: enterprise, timezone check, services, Mews room types, rates, mapping problems, next 7 nights of free units per mapped room type. 8 s per call, no retries, 40 s in total · `503 MEWS_NOT_CONFIGURED` (tokens unset or a Mews setting invalid) · `502 MEWS_ERROR` (Mews refused, rate-limited, slow or unreachable) (mews-inventory.md) |
| `POST /api/admin/hotels/{id}/register` | idempotent ATA create for the payout wallet + `register_hotel` (an existing Hotel account is aligned with `update_hotel`); status → `active`. `409 NO_PAYOUT_WALLET` / `409 NO_UNITS` (needs ≥ 1 active unit). Activating an unregistered hotel: `409 NOT_REGISTERED`. A payout wallet equal to a key the web app holds (operator, admin): `400 INVALID_WALLET` |
| `GET /api/admin/bookings` · `POST …/{id}/resolve {guest_bps}` · `…/void` · `…/confirm` · `…/release` | operations |
| `POST /api/admin/cron/{sync\|release}` | run a job now |

**Onboarding sequence:** application → convert (draft hotel) → room types + nightly rates → units + iCal import URLs → payout wallet (hotel's Phantom) → register (ATA + `register_hotel`) → active → hotel pastes each unit's `export_url` into Booking.com/Airbnb → test booking with the demo wallet.

## Cron

`/api/cron/sync` and `/api/cron/release` export **GET and POST** (Vercel Cron sends GET), require `Authorization: Bearer ${CRON_SECRET}`, set `export const maxDuration = 60`, and process at most 20 units/bookings per call with concurrency 4.

- `sync`: iCal imports for units stale > 10 min; expire quotes; reconcile `awaiting_signature` and `pending` bookings against chain; auto-confirm `pending` bookings without conflicts (inventory-ical.md) while before their deadline — at a Mews hotel this creates the Mews reservation first (mews-inventory.md); retry Mews cancellations of cancelled/voided bookings not settled yet.
- `release`: `release` every `confirmed` booking past `release_after_ts`; `void_booking` every `pending` booking past `confirm_deadline_ts` (automatic refund).

Scheduling: Vercel Hobby runs cron at most once a day, so production uses an external scheduler (cron-job.org or Upstash QStash) with the same header — `release` every minute, `sync` every 10 minutes (or Vercel Pro). The demo never depends on the scheduler: booking and dashboard reads crank due bookings lazily. Locally: `pnpm --filter web cron` loops both every 60 s.

## MCP server (`apps/mcp`)

`@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport`; **log only to stderr** (stdout is the protocol). Wraps the public REST API at `STUMARI_API_URL`. Optional `AGENT_SECRET_KEY` (devnet/localnet demo) lets it sign as the agent's wallet: then `get_quote` and `cancel` default `wallet` to the agent pubkey, and `book`/`cancel` refuse unless `cluster != mainnet-beta`, `program_id` is the fixed id (ADR-0008) and `price_minor ≤ AGENT_MAX_AMOUNT_MINOR` (default 500 USDC). Before signing it decodes the tx and requires: v0 without lookup tables; fee payer = the configured `quote_signer`; the agent among the signers; **exactly one** `stumari_escrow` instruction of the expected kind whose guest is the agent and whose booking account is the PDA of the booking id; `create_booking` escrowing exactly the option price and recording exactly the verified quote's hash, option index, tiers, check-in/out, expiry, hotel PDA and mint; `cancel_booking` with `min_refund` = the API's `refund_minor` (a response without it is refused); every other instruction a compute-budget instruction or an idempotent ATA creation paid by the fee payer. Quotes are verified with `@stumari/core` `verifyQuote` against `quote_signer`; `book` refuses unverified quotes (a `null` `quote_signer` means unverifiable). Text from the API reaching the model is typed or length-clipped; terms and links are rebuilt locally.

| Tool | Input | Output |
|---|---|---|
| `search_availability` | `{ city?, hotel_slug?, checkin, checkout, adults, children? }` | available room types with base prices |
| `get_quote` | `{ hotel_slug, room_type_id, checkin, checkout, adults, children?, wallet? }` | signed envelope + plain-language summary per option; verifies the signature against `/api/config/public.quote_signer` and says so |
| `book` | `{ quote_id, option_index, wallet? }` | with agent key: `{ booking_id, signature, booking_url }`; without: `{ booking_id, tx, signer }` |
| `cancel` | `{ booking_id, wallet? }` | refund preview + signature (agent key) or tx; without an agent key `wallet` is required (the public booking view omits it) |
| `booking_status` | `{ booking_id }` | status, terms, refund-if-cancel-now, booking_url, explorer link |
