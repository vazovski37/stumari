# Data Model (off-chain)

Drizzle ORM over **libsql**: a local SQLite file in development (`file:./.data/stumari.db`), Turso in production (same driver, `LIBSQL_URL` + `LIBSQL_AUTH_TOKEN`). Timestamps are unix **seconds** (integer). IDs are UUID v4 strings unless noted. JSON columns are TEXT with Drizzle `mode: "json"`.

The chain is the source of truth for money and booking status; the DB mirrors it for querying, holds inventory, quotes and CRM data.

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
| role | text | owner / manager / other |
| phone | text | WhatsApp-capable phone |
| email | text | |
| telegram | text | |
| channels | json string[] | e.g. `["booking.com","airbnb","direct","instagram"]` |
| channel_manager | text | free text (e.g. "none", "Exely", "Channex") |
| has_ical | int (bool) | "I can export an iCal link" |
| accepts_crypto_today | text | `no` / `sometimes` / `often` |
| message | text | |
| locale | text | `en` / `ka` / `ru` |
| utm | json | source attribution |
| consent | int (bool) | required true — consent to be contacted |
| status | text | `new` → `contacted` → `qualified` → `pilot` / `rejected` |
| notes | text | admin notes |

### `hotels`
| Column | Type | Notes |
|---|---|---|
| id | text pk | UUID; its 16 bytes = on-chain `hotel_id` |
| slug | text unique | public URL `/h/{slug}` |
| name, city, country, address | text | |
| timezone | text | IANA, default `Asia/Tbilisi` |
| checkin_time, checkout_time | text | `HH:MM`, defaults `14:00` / `12:00` |
| hotel_type | text | `City Hotel` \| `Resort Hotel` (model feature) |
| payout_wallet | text | hotel authority (base58); also the dashboard login |
| onchain_hotel | text | Hotel PDA once registered |
| registered_sig | text | |
| status | text | `draft` \| `active` \| `paused` |
| policy | json | `{ reference_template, enabled_templates[], resale_probs[6], min_mult, max_mult }` |
| contact_phone, contact_email, contact_telegram | text | |
| application_id | text fk → applications | |
| created_at, updated_at | int | |

### `room_types`
| id pk | hotel_id fk | name | description | max_adults | max_children | base_rate_minor (text u64, per night) | weekend_rate_minor (text u64, nullable — Fri/Sat nights) | meal (`BB`\|`HB`\|`FB`\|`SC`) | photo_url | active | sort | created_at |

### `rooms` — physical units
| id pk | room_type_id fk | label | ical_import_urls (json string[]) | export_token (text unique, 32 random bytes hex) | last_synced_at | sync_error | active |

### `blocks` — nights a unit is unavailable (non-Stumari sources)
| id pk | room_id fk | start_date (`YYYY-MM-DD`) | end_date (exclusive) | source (`ical` \| `manual`) | feed_url | external_uid | summary | updated_at |
Unique `(room_id, source, feed_url, external_uid)` for `ical` rows; a sync replaces all rows of that feed atomically.

### `quotes`
| id pk | hotel_id | room_type_id | room_id (held unit) | checkin_date | checkout_date | body (json — signed `quote` object) | signature | hash (hex) | explain (json) | buyer_type | buyer_wallet | status (`active` \| `used` \| `expired`) | expires_at | created_at |

A unit is **held** by every `active` quote with `expires_at > now`.

### `bookings`
| Column | Notes |
|---|---|
| id | text pk — hex of the 16-byte `booking_id` |
| quote_id, option_index, option_id | |
| hotel_id, room_type_id, room_id | |
| guest_wallet | payer |
| guest_name, guest_email, guest_phone | optional, off-chain only, shared with the hotel |
| checkin_date, checkout_date, checkin_ts, checkout_ts | |
| amount_minor | text u64 |
| tiers | json |
| fee_bps | int (snapshot) |
| booking_pda, vault | |
| status | `awaiting_signature` → `pending` → `confirmed` → `cancelled` \| `released` \| `disputed` → `resolved` \| `voided`; also `failed` (tx never landed) |
| refund_minor, hotel_minor, fee_minor | text u64, from chain on terminal |
| create_sig, confirm_sig, final_sig | |
| confirm_deadline_ts, release_after_ts | from chain |
| created_at, updated_at | |

Non-terminal statuses (`awaiting_signature` younger than the quote expiry, `pending`, `confirmed`, `disputed`) **occupy** their unit's nights.

### `booking_events` — audit / public-label mirror
| id pk | booking_id | type (`created`, `confirmed`, `cancelled`, `released`, `disputed`, `resolved`, `voided`, `sync_conflict`, …) | sig | data (json) | created_at |

### `auth_nonces`
| nonce pk | wallet | created_at | used |

Sessions are stateless: an HMAC-signed cookie (`AUTH_SECRET`) holding `{ wallet, iat, exp }`, 7-day expiry.

## Availability rule

Unit `u` is free for `[checkin, checkout)` iff no night in that range is covered by:
1. a `blocks` row of `u`;
2. a booking on `u` in a non-terminal status;
3. an `active`, unexpired quote holding `u` (other than the caller's own).

A room type is available if at least one of its active units is free. The quote endpoint picks the free unit with the lowest `label` (deterministic).

## Wallet history features (model inputs)

For a `buyer_wallet`, counted across all hotels from `bookings`:
- `previous_cancellations` = count with status `cancelled` (voids are the hotel's failure to confirm, never counted against the guest);
- `previous_bookings_not_canceled` = count `released` or `resolved`;
- `is_repeated_guest` = `previous_bookings_not_canceled > 0`.
