# Data Model (off-chain)

Drizzle ORM over **`@libsql/client`** only (no better-sqlite3 → no native build on Windows): a local SQLite file in development (`file:./.data/stumari.db`), Turso in production (`libsql://…`, never `file:` on Vercel). drizzle-kit `dialect: "turso"`. Timestamps are unix **seconds** (integer). IDs are UUID v4 strings unless noted. JSON columns are TEXT with Drizzle `mode: "json"`.

The chain is the source of truth for money and booking status; the DB mirrors it for querying and holds inventory, quotes and CRM data.

## ID encoding

- `hotel_id` bytes (on-chain seed) = the 32 hex digits of the **lowercase** UUID string with dashes removed, parsed left to right (RFC 4122 order, no GUID byte swapping).
- `booking_id` = `sha256("stumari-booking-v1" ‖ quote.id as UTF-8)[0..16]` (one booking per quote). `bookings.id` = 32 lowercase hex chars, no dashes; public URL `/b/{bookings.id}`.
- Helpers `uuidToBytes`, `bytesToHex`, `deriveBookingId` live in `packages/core`, with vectors in `spec/vectors/quote.json`.

## Tables

### `applications` — hotel pilot applications from the landing page
| Column | Type | Notes |
|---|---|---|
| id | text pk | |
| created_at | int | |
| hotel_name | text | required |
| city | text | required, default "Tbilisi" |
| rooms_count | int | |
| contact_name | text | required |
| role | text | `owner` / `manager` / `other` |
| phone | text | WhatsApp-capable phone |
| email | text | |
| telegram | text | |
| channels | json string[] | e.g. `["booking.com","airbnb","direct","instagram"]` |
| channel_manager | text | free text ("none", "Exely", "Channex", …) |
| has_ical | int (bool) | "I can export an iCal link" |
| ical_single_unit | int (bool) | "Each room I sell on Booking.com/Airbnb is its own listing/room type" (qualifies iCal onboarding) |
| accepts_crypto_today | text | `no` / `sometimes` / `often` |
| message | text | |
| locale | text | `en` / `ka` / `ru` |
| utm | json | source attribution |
| consent | int (bool) | required true — consent to be contacted |
| ip_hash | text | sha256(ip + AUTH_SECRET) |
| status | text | `new` → `contacted` → `qualified` → `pilot` / `rejected` |
| notes | text | admin notes |

### `hotels`
| Column | Type | Notes |
|---|---|---|
| id | text pk | UUID (see ID encoding) |
| slug | text unique | public URL `/h/{slug}` |
| name, city, country, address, phone | text | |
| timezone | text | IANA, default `Asia/Tbilisi` (UTC+4, no DST) |
| checkin_time, checkout_time | text | `HH:MM`, defaults `14:00` / `12:00` |
| hotel_type | text | `City Hotel` \| `Resort Hotel` (model feature) |
| payout_wallet | text | hotel authority (base58, self-custody); also the dashboard login |
| onchain_hotel | text | Hotel PDA once registered |
| registered_sig | text | |
| status | text | `draft` \| `active` \| `paused` |
| policy | json | `{ reference_template, enabled_templates[], resale_bps[6], min_mult_bps, max_mult_bps }` — defaults `standard`, all three, `[9000,8000,6500,4500,2500,1000]`, `8500`, `13000`; validated per pricing-and-risk-model.md §5 |
| contact_email, contact_telegram | text | |
| application_id | text fk → applications | |
| created_at, updated_at | int | |

### `room_types`
| id pk | hotel_id fk | name | description | max_adults | max_children | base_rate_minor (text u64, per night) | weekend_rate_minor (text u64, nullable — Fri/Sat nights) | meal (`BB`\|`HB`\|`FB`\|`SC`) | photo_url | active | sort | created_at |

### `rooms` — physical units
| id pk | room_type_id fk | label | ical_import_urls (json string[]) | export_token (text unique, 32 random bytes hex) | last_synced_at | sync_error | active |

### `blocks` — nights a unit is unavailable (non-Stumari sources)
| id pk | room_id fk | start_date (`YYYY-MM-DD`) | end_date (exclusive) | source (`ical` \| `manual`) | feed_url | external_uid | summary | updated_at |
A sync replaces all `ical` rows of that `(room_id, feed_url)` in one transaction.

### `quotes`
| Column | Notes |
|---|---|
| id pk | UUID v4 (= `quote.id`) |
| hotel_id, room_type_id, room_id (held unit) | |
| checkin_date, checkout_date | |
| body (json) | the signed `quote` object |
| signature, hash (hex) | |
| explain (json) | |
| booking_id | hex, derived from `id` (ID encoding) |
| buyer_type, buyer_wallet | |
| client_id | value of httpOnly cookie `stumari_cid` (128-bit random, set on first quote); MCP uses `mcp:{ip_hash}:{agent wallet or 'anon'}` (bound to the caller's IP, so nobody else can claim an agent's hold by naming its wallet) |
| ip_hash | sha256(ip + AUTH_SECRET) |
| status | `active` \| `used` \| `expired` |
| expires_at, created_at | |

Rules: `POST /api/quotes` holds a unit with **one atomic batch**: an `INSERT … SELECT` that picks the lowest-numbered unit free under the availability rule and inserts the quote in the same statement, plus a conditional `UPDATE` expiring the client's other active quotes. Concurrent requests cannot hold the same unit; `SQLITE_BUSY` from another process is retried with backoff. (An explicit `BEGIN IMMEDIATE` transaction fails with `SQLITE_BUSY` on a local `file:` database, so it is not used.) Creating a quote marks every other `active` quote with the same `client_id` `expired` (a client holds at most one unit), and the same `INSERT … SELECT` refuses a hold when the caller's `ip_hash` already has 2 active, unexpired holds from other owners (`429 HOLD_LIMIT`) — cookie-less requests cannot squat every unit. Limit 10 quotes per `ip_hash` per 10 min. The UI calls `POST /api/quotes` only on an explicit "See prices" click.

### `bookings`
| Column | Notes |
|---|---|
| id | text pk — 32-hex `booking_id` |
| quote_id, option_index, option_id | option fields are overwritten from the on-chain account once observed |
| hotel_id, room_type_id, room_id | |
| guest_wallet | payer |
| guest_name, guest_email, guest_phone | optional, off-chain only, visible to the hotel only |
| checkin_date, checkout_date, checkin_ts, checkout_ts | |
| amount_minor | text u64 (from chain once observed) |
| tiers | json (from chain once observed) |
| fee_bps | int (snapshot, from chain) |
| hotel_authority | payout owner snapshot (from chain) |
| booking_pda, vault | |
| status | `awaiting_signature` → `pending` → `confirmed` → `cancelled` \| `released` \| `disputed` → `resolved` \| `voided`; also `failed` (never landed) |
| refund_minor, hotel_minor, fee_minor | text u64, from chain on terminal |
| create_sig, confirm_sig, final_sig | |
| confirm_deadline_ts, release_after_ts | from chain |
| created_at, updated_at | |

`/pay` upserts the single row for the quote's derived `booking_id` while it is `awaiting_signature`.

**Occupancy:** a booking occupies its unit's nights `[checkin_date, checkout_date)` when its status is `pending`, `confirmed`, `disputed`, `released` or `resolved`, or `awaiting_signature` while `quote.expires_at + 300 s > now` (the create may have landed unseen until then; after it, a create that has not landed never will and the row becomes `failed`). Only `cancelled`, `voided` and `failed` free nights. (`released`/`resolved` are terminal on-chain, but the guest may still be in the room.)

### `booking_events` — audit / public-label mirror
| id pk | booking_id | type (`created`, `confirmed`, `cancelled`, `released`, `disputed`, `resolved`, `voided`, `sync_conflict`, `failed`) | sig | data (json) | created_at |

### `built_txs` — cache + allow-list for `/api/tx/send`
| id pk | booking_id | quote_id | action (`create`, `cancel`, `dispute`, `void`) | message_hash (hex sha256 of message bytes) | tx_base64 | last_valid_block_height | expires_at | created_at |
Repeat build requests for the same `(booking_id, action)` return the cached `tx_base64` while valid.

### `rate_events`
| id pk | bucket (`apply`, `faucet`, `quote`, `pay`, `tx`, `nonce` — 20 per IP per 10 min, `sync` — dashboard "Sync now", 10 per hotel per 10 min, `pay_daily` / `faucet_daily` — demo-mode daily caps, key `global` for deployment-wide ones; the sync cron prunes events older than 24 h) | key (ip_hash or wallet) | created_at |
Index `(bucket, key, created_at)`. A limit is `COUNT(*)` in the window; old rows are pruned by the sync cron.

### `auth_nonces`
| nonce pk | wallet | message | created_at | used |

Sessions are stateless: an HMAC-signed cookie (`AUTH_SECRET`) holding `{ wallet, iat, exp }`, 7-day expiry.

## Availability rule

Unit `u` is free for `[checkin, checkout)` iff no night in that range is covered by:
1. a `blocks` row of `u`;
2. a booking on `u` that **occupies** it (above);
3. an `active`, unexpired quote holding `u` whose `client_id` differs from the caller's.

A room type is available if at least one active unit is free. The quote endpoint picks the free unit with the lowest `label`.

## Wallet history features (model inputs)

Only when the quote has a `buyer_wallet` (otherwise both are 0), across all hotels:
- `previous_bookings_not_canceled` = count of the wallet's bookings with status `released` (not `resolved` — a dispute is not a clean stay), **capped at 3**;
- `is_repeated_guest` = that count > 0.

Cancellations are recorded but are **not** a model input (a fresh wallet would evade them, so they would only penalise honest wallets).
