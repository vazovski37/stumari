# API Specification

All endpoints are Next.js route handlers under `apps/web/app/api`. JSON in/out. Errors: `{ "error": { "code": "SNAKE_CASE", "message": "human text" } }` with an appropriate HTTP status. Validation with `zod`. Money is always a **decimal string of base units** (`"123450000"` = 123.45 USDC) plus a display helper field where useful.

## Transaction building contract ("server builds, wallet signs")

Every on-chain action a guest takes is built by the server:

1. Server builds a **version 0** transaction (fits 1232 bytes; widest wallet support) with Kit + the Codama-generated `stumari_escrow` client.
2. **Fee payer = operator key** (gasless for the guest). Server partially signs with the operator (and as `quote_signer` for `create_booking`).
3. Response: `{ "tx": "<base64 wire transaction>", "signer": "<wallet that must sign>", "lastValidBlockHeight": n }`.
4. Browser decodes nothing — it hands the bytes to the wallet via Wallet Standard `solana:signTransaction`, then POSTs the fully signed bytes to `POST /api/tx/send`, which relays them to RPC (so the server always sees the signature). Wallets that only offer `solana:signAndSendTransaction` use that and POST the signature to the relevant `…/submitted` endpoint.
5. The **demo wallet** (devnet only) signs the same bytes with a local keypair.

The browser never needs a Solana RPC connection or the program client.

## Public

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/hotels?city=` | | `[{ slug, name, city, from_price_minor, room_types:[{id,name,max_adults,max_children,base_rate_minor,meal}] }]` (active hotels only) |
| `GET /api/hotels/{slug}` | | hotel public profile, room types, check-in/out times, enabled templates with plain-language terms |
| `GET /api/hotels/{slug}/availability` | `checkin, checkout, adults, children` | `[{ room_type_id, available: bool, nights, base_price_minor }]` |
| `POST /api/quotes` | `{ hotel_slug, room_type_id, checkin_date, checkout_date, adults, children, buyer_type?: "guest"\|"agent", buyer_wallet? }` | `201` quote envelope (see quote-protocol.md) · `409 UNAVAILABLE` · `400 INVALID_DATES` / `TOO_MANY_GUESTS` |
| `GET /api/quotes/{id}` | | `{ envelope, status }` |
| `POST /api/quotes/{id}/pay` | `{ option_index, payer, guest_name?, guest_email?, guest_phone? }` | `{ booking_id, booking_pda, tx, signer, lastValidBlockHeight }` · `410 QUOTE_EXPIRED` · `409 HOLD_LOST` · `403 WALLET_MISMATCH` |
| `POST /api/tx/send` | `{ tx }` (fully signed, base64) | `{ signature }` — relays; for `create_booking` txs it also records the signature against the booking |
| `POST /api/bookings/{id}/submitted` | `{ signature }` | booking view after verification (idempotent) |
| `GET /api/bookings/{id}` | | booking view: status, dates, hotel, amount, tiers (plain language), `refund_if_cancel_now_minor`, `can_cancel`, `can_dispute`, `can_void`, explorer links, on-chain account |
| `POST /api/bookings/{id}/tx` | `{ action: "cancel"\|"dispute"\|"void", wallet }` | `{ tx, signer, lastValidBlockHeight }` · `409 NOT_ALLOWED` with reason |
| `POST /api/bookings/{id}/refresh` | | re-reads chain, updates DB, returns booking view |
| `POST /api/applications` | application fields (data-model.md) | `201 { id }` · `400` · rate-limited per IP |
| `GET /api/ical/{export_token}` | | `text/calendar` feed of the unit's Stumari bookings + manual blocks (no guest PII) |
| `GET /api/config/public` | | `{ cluster, program_id, mint, quote_signer, demo_mode, pilot_offer }` |

### Demo mode (only when `STUMARI_DEMO_MODE=true` and cluster ≠ mainnet)
| `POST /api/demo/faucet` | `{ wallet }` | mints 500 mock USDC to the wallet's ATA (operator is the mock mint authority); rate limit 3/hour/wallet | `{ signature, balance_minor }` |

## Auth (Sign-In With Solana)

| `GET /api/auth/nonce?wallet=` | → `{ nonce, message }` — message: `"Stumari sign-in\nWallet: {wallet}\nNonce: {nonce}\nIssued: {iso}"` |
| `POST /api/auth/verify` | `{ wallet, message, signature }` (base58 Ed25519 over UTF-8 message) → sets `stumari_session` cookie |
| `POST /api/auth/logout` | clears cookie |
| `GET /api/me` | `{ wallet, is_admin, hotels: [{id, slug, name}] }` |

Roles: **admin** if wallet ∈ `ADMIN_WALLETS` (comma-separated env). **Hotel** if wallet == some `hotels.payout_wallet`.

## Hotel dashboard (session wallet owns the hotel)

| `GET /api/dashboard/{hotelId}/overview` | counts, upcoming arrivals, payouts released / pending (sums from chain-mirrored rows) |
| `GET /api/dashboard/{hotelId}/bookings?status=` | list with guest contact |
| `PATCH /api/dashboard/{hotelId}/policy` | `{ enabled_templates, reference_template, resale_probs, min_mult, max_mult }` (validated bounds) |
| `GET /api/dashboard/{hotelId}/rooms` | room types + units + export feed URLs + last sync status |
| `PUT /api/dashboard/{hotelId}/rooms/{roomId}/ical` | `{ import_urls: string[] }` (https only, ≤ 5) |
| `POST /api/dashboard/{hotelId}/sync` | runs import sync now |
| `POST /api/dashboard/{hotelId}/bookings/{id}/confirm` | server sends `confirm_booking` with operator key |

## Admin (session wallet ∈ ADMIN_WALLETS)

| `GET /api/admin/applications` · `PATCH /api/admin/applications/{id}` `{status, notes}` |
| `POST /api/admin/applications/{id}/convert` → creates a draft hotel prefilled from the application |
| `GET /api/admin/hotels` · `POST /api/admin/hotels` · `PATCH /api/admin/hotels/{id}` |
| `POST /api/admin/hotels/{id}/room-types` · `PATCH …/room-types/{rtId}` · `POST …/room-types/{rtId}/rooms` |
| `POST /api/admin/hotels/{id}/register` → creates hotel authority ATA (idempotent) + `register_hotel` on-chain; sets status `active` |
| `GET /api/admin/bookings` |
| `POST /api/admin/bookings/{id}/resolve` `{ guest_bps }` · `POST …/void` · `POST …/confirm` · `POST …/release` |
| `POST /api/admin/cron/{job}` — run `sync` or `release` manually |

## Cron (header `Authorization: Bearer ${CRON_SECRET}`)

| `POST /api/cron/sync` | iCal imports for all active units (stale > 10 min); expire quotes; reconcile `awaiting_signature` / `pending` bookings against chain; auto-confirm `pending` bookings with no conflict |
| `POST /api/cron/release` | `release` every `confirmed` booking past `release_after_ts`; `void` every `pending` booking past `confirm_deadline_ts` (automatic refund) |

Locally: `pnpm --filter web cron` runs both every 60 s. Production: Vercel Cron (see deploy guide).

## MCP server (`apps/mcp`)

Stdio MCP server (TypeScript SDK) wrapping the public REST API at `STUMARI_API_URL`. Optional `AGENT_SECRET_KEY` (devnet demo) lets the server sign as the agent's wallet so an LLM can complete a booking autonomously; without it, tools return transactions for the host's wallet to sign.

| Tool | Input | Output |
|---|---|---|
| `search_availability` | `{ city?, hotel_slug?, checkin, checkout, adults, children? }` | available room types with base prices |
| `get_quote` | `{ hotel_slug, room_type_id, checkin, checkout, adults, children?, wallet? }` | signed quote envelope + human summary of each option; the tool verifies the signature against `/api/config/public` `quote_signer` and says so |
| `book` | `{ quote_id, option_index, wallet? }` | with agent key: `{ booking_id, signature, booking_url }`; without: `{ booking_id, tx, signer }` |
| `cancel` | `{ booking_id }` | refund preview + signature (agent key) or tx |
| `booking_status` | `{ booking_id }` | status, terms, refund-if-cancel-now, explorer link |
