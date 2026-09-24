# API Specification

All endpoints are Next.js route handlers under `apps/web/app/api`. JSON in/out. Errors: `{ "error": { "code": "SNAKE_CASE", "message": "human text" } }` with a fitting HTTP status. Validation with `zod`. Money is always a **decimal string of base units** (`"123450000"` = 123.45 USDC) plus display helpers where useful.

## Runtime rules

- Every route handler declares `export const runtime = 'nodejs'`. No auth or i18n logic in middleware/proxy — handlers and server components call `requireSession(role)`.
- Ed25519 via `@noble/curves/ed25519`; sha256 via `@noble/hashes`.
- Solana RPC only on the server (`SOLANA_RPC_URL`). Confirmation by polling `getSignatureStatuses` (no websockets in serverless).
- Rate limits are persisted in the `rate_events` table (serverless-safe), never in memory.
- Work after the response (iCal re-sync + `confirm_booking` after a payment lands) runs in `after()` from `next/server`.

## Transaction building contract ("server builds, wallet signs")

1. **Server** builds a **version 0** transaction with Kit: `pipe(createTransactionMessage({ version: 0 }), m => setTransactionMessageFeePayerSigner(operator, m), m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m), m => appendTransactionMessageInstructions(ixs, m))`, passing `createNoopSigner(address(guestWallet))` wherever the Codama builder needs the guest's signer. It prepends idempotent ATA creation for recipient ATAs, **simulates** the transaction (reject with `409 SIMULATION_FAILED` + program error name), then `partiallySignTransactionMessageWithSigners` (operator as fee payer; also as `quote_signer` for `create_booking`), and returns `getBase64EncodedWireTransaction(tx)`. It stores `sha256(messageBytes)` in `built_txs` with the action, booking id and `lastValidBlockHeight`, and **returns the same cached bytes** for repeat calls on the same `(booking, action)` while the blockhash is valid.
2. **Browser** uses **Wallet Standard directly** (`@wallet-standard/app` `getWallets()`): pick a wallet exposing `standard:connect` and `solana:signTransaction` (and `solana:signMessage` for sign-in). Call `wallet.features['solana:signTransaction'].signTransaction({ account, transaction: bytes, chain })` → signed bytes, then `POST /api/tx/send`. Wallets exposing only `solana:signAndSendTransaction` use that and `POST /api/bookings/{id}/submitted { signature }`. The browser may use `@solana/kit` codecs (base64 ⇄ bytes) but has no RPC connection and no program client.
3. **Demo wallet** (devnet, `demo_mode`): 32 random bytes in `localStorage['stumari_demo_sk']`, `createKeyPairSignerFromPrivateKeyBytes`, decode with `getTransactionDecoder`, `signer.signTransactions([tx])`, merge the signature, encode, `POST /api/tx/send`. Labelled "Test wallet — devnet, not real money".
4. **`POST /api/tx/send { tx }`** rejects `400 FOREIGN_TX` unless the fee payer (static account 0) is the operator **and** `sha256(messageBytes)` matches an unexpired `built_txs` row; verifies every signature (`400 WALLET_MODIFIED_TX` if any fails — some wallets add instructions or priority fees, which invalidates the operator signature); sends with preflight; polls until `confirmed` (≤ 30 s); updates the booking; returns `{ signature, booking }`.

## Pages

| Route | Audience | Notes |
|---|---|---|
| `/`, `/ka`, `/ru` | hotels | landing (i18n) |
| `/apply` (`/ka/apply`, `/ru/apply`) | hotels | pilot application |
| `/h/[slug]` | guests | hotel page + dates + "See prices" → quote menu → pay |
| `/b/[bookingId]` | guests | booking status, terms timeline, refund-if-cancel-now, cancel / dispute |
| `/my` | guests | connect wallet → "Find my bookings" |
| `/dashboard/[hotelId]` | hotel (or admin) | bookings, payouts, units + iCal, manual blocks, policy |
| `/admin` | admin | applications, hotels onboarding, bookings, disputes, cron |
| `/privacy` | all | |

Checkout, booking, dashboard and admin are English-only in the MVP. `booking_url = ${NEXT_PUBLIC_SITE_URL}/b/{booking_id}`.

## Public API

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/config/public` | | `{ cluster, program_id, mint, quote_signer, demo_mode, pilot_offer: { fee_bps, payout_delay_hours, amount_cap_minor, currency: "USDC" } }` — fee and delay read from the on-chain Config |
| `GET /api/hotels?city=` | | active hotels: `[{ slug, name, city, from_price_minor, room_types:[{id,name,max_adults,max_children,base_rate_minor,meal}] }]` |
| `GET /api/hotels/{slug}` | | public profile, room types, check-in/out times, enabled contracts with plain-language terms, address, phone |
| `GET /api/hotels/{slug}/availability` | `checkin, checkout, adults, children` | `[{ room_type_id, available, nights, base_price_minor }]` — **never holds** |
| `POST /api/quotes` | `{ hotel_slug, room_type_id, checkin_date, checkout_date, adults, children, buyer_type?: "guest"\|"agent", buyer_wallet? }` | `201` quote envelope · `409 UNAVAILABLE` · `400 INVALID_DATES`/`TOO_MANY_GUESTS` · `429 RATE_LIMITED`. Same-day check-in allowed while `now < checkin_ts`. |
| `GET /api/quotes/{id}` | | `{ envelope, status }` |
| `POST /api/quotes/{id}/pay` | `{ option_index, payer, guest_name?, guest_email?, guest_phone? }` | `{ booking_id, booking_pda, tx, signer, lastValidBlockHeight }` · `410 QUOTE_EXPIRED` · `409 HOLD_LOST` · `409 ALREADY_PAID` (booking account exists → booking view) · `403 WALLET_MISMATCH` · `422 AMOUNT_CAP` · `429` |
| `POST /api/tx/send` | `{ tx }` | `{ signature, booking }` (see contract) |
| `POST /api/bookings/{id}/submitted` | `{ signature }` | booking view (idempotent) |
| `GET /api/bookings/{id}` | | public booking view (below); lazily cranks `release`/`void_booking` when due |
| `POST /api/bookings/{id}/tx` | `{ action: "cancel"\|"dispute"\|"void", wallet }` | `{ tx, signer, lastValidBlockHeight, refund_minor? }` · `409 NOT_ALLOWED` with reason · `429`. For cancel, the server sets `min_refund` = refund at now + 90 s by the booking's tiers (escrow-program.md). |
| `POST /api/bookings/{id}/refresh` | | re-reads chain, updates DB, lazily cranks, returns view |
| `GET /api/wallets/{wallet}/bookings` | | public views of that wallet's bookings (on-chain data anyway) |
| `POST /api/applications` | application fields | `201 { id }` · `400` · `429`; honeypot → `201` and discarded; optional Telegram notification |
| `GET /api/ical/{export_token}` | | `text/calendar` (inventory-ical.md) |
| `POST /api/demo/faucet` | `{ wallet }` | demo mode only, never mainnet: mints 500 mock USDC to the wallet's ATA (operator is mint authority); 3/hour/wallet and 10/hour/IP |

**Public booking view** fields: `id, status, hotel {name, address, phone, checkin_time}, room_type, checkin_date, checkout_date, amount_minor, option_id, terms (tiers + plain language), refund_if_cancel_now_minor, can_cancel, can_dispute (status confirmed && checkin_ts ≤ now < release_after_ts), can_void, confirm_deadline_ts, release_after_ts, booking_pda, explorer links`. **Never** includes guest name/email/phone.

## Auth (Sign-In With Solana)

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/nonce?wallet=` | `{ nonce, message }`, message = `"{host} wants you to sign in to Stumari\nWallet: {wallet}\nNonce: {nonce}\nIssued: {iso}"`; nonce stored with the exact message |
| `POST /api/auth/verify` | `{ wallet, message, signature }` (base58 Ed25519 over UTF-8 message). Checks: message equals the stored one, host == `NEXT_PUBLIC_SITE_URL` host, nonce unused and ≤ 300 s old; marks used; sets `stumari_session` cookie (HMAC, httpOnly, sameSite=lax, secure in prod, 7 days) |
| `POST /api/auth/logout` | clears cookie |
| `GET /api/me` | `{ wallet, is_admin, hotels: [{id, slug, name}] }` |

Roles: **admin** if wallet ∈ `ADMIN_WALLETS`; **hotel** if wallet == `hotels.payout_wallet`. Note the payout wallet must be a self-custody wallet (it signs in) — never an exchange deposit address.

## Hotel dashboard

Authorized when `session.wallet == hotels.payout_wallet` **or** `session.is_admin` (admins onboard hotels on their behalf). `{unitId}` = `rooms.id` everywhere.

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard/{hotelId}/overview` | counts, upcoming arrivals, payouts released / pending, conflicts (lazily cranks due bookings) |
| `GET /api/dashboard/{hotelId}/bookings?status=` | list incl. guest contact |
| `PATCH /api/dashboard/{hotelId}/policy` | `{ enabled_templates, reference_template, resale_bps[6], min_mult_bps, max_mult_bps }` (bounds in pricing-and-risk-model.md §5) |
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
| `GET/POST /api/admin/hotels` · `PATCH /api/admin/hotels/{id}` | CRUD; on a registered hotel `status: paused\|active` sends `update_hotel(active)`, a new `payout_wallet` sends `update_hotel(authority)` + idempotent ATA create (affects new bookings only) |
| `POST /api/admin/hotels/{id}/room-types` · `PATCH …/room-types/{rtId}` | rates in USD (base units) |
| `POST /api/admin/hotels/{id}/room-types/{rtId}/units` | `{ label, ical_import_urls? }` → `{ id, export_url }` |
| `POST /api/admin/hotels/{id}/register` | idempotent ATA create for the payout wallet + `register_hotel`; status → `active` |
| `GET /api/admin/bookings` · `POST …/{id}/resolve {guest_bps}` · `…/void` · `…/confirm` · `…/release` | operations |
| `POST /api/admin/cron/{sync\|release}` | run a job now |

**Onboarding sequence:** application → convert (draft hotel) → room types + nightly rates → units + iCal import URLs → payout wallet (hotel's Phantom) → register (ATA + `register_hotel`) → active → hotel pastes each unit's `export_url` into Booking.com/Airbnb → test booking with the demo wallet.

## Cron

`/api/cron/sync` and `/api/cron/release` export **GET and POST** (Vercel Cron sends GET), require `Authorization: Bearer ${CRON_SECRET}`, set `export const maxDuration = 60`, and process at most 20 units/bookings per call with concurrency 4.

- `sync`: iCal imports for units stale > 10 min; expire quotes; reconcile `awaiting_signature` and `pending` bookings against chain; auto-confirm `pending` bookings without conflicts (inventory-ical.md) while before their deadline.
- `release`: `release` every `confirmed` booking past `release_after_ts`; `void_booking` every `pending` booking past `confirm_deadline_ts` (automatic refund).

Scheduling: Vercel Hobby runs cron at most once a day, so production uses an external scheduler (cron-job.org or Upstash QStash) with the same header — `release` every minute, `sync` every 10 minutes (or Vercel Pro). The demo never depends on the scheduler: booking and dashboard reads crank due bookings lazily. Locally: `pnpm --filter web cron` loops both every 60 s.

## MCP server (`apps/mcp`)

`@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport`; **log only to stderr** (stdout is the protocol). Wraps the public REST API at `STUMARI_API_URL`. Optional `AGENT_SECRET_KEY` (devnet demo) lets it sign as the agent's wallet: then `get_quote` defaults `wallet` to the agent pubkey, and `book` refuses unless `cluster != mainnet-beta` and `price_minor ≤ AGENT_MAX_AMOUNT_MINOR`; before signing it decodes the tx and checks the fee payer is the configured `quote_signer` and that it contains exactly one `stumari_escrow` instruction.

| Tool | Input | Output |
|---|---|---|
| `search_availability` | `{ city?, hotel_slug?, checkin, checkout, adults, children? }` | available room types with base prices |
| `get_quote` | `{ hotel_slug, room_type_id, checkin, checkout, adults, children?, wallet? }` | signed envelope + plain-language summary per option; verifies the signature against `/api/config/public.quote_signer` and says so |
| `book` | `{ quote_id, option_index, wallet? }` | with agent key: `{ booking_id, signature, booking_url }`; without: `{ booking_id, tx, signer }` |
| `cancel` | `{ booking_id }` | refund preview + signature (agent key) or tx |
| `booking_status` | `{ booking_id }` | status, terms, refund-if-cancel-now, booking_url, explorer link |
