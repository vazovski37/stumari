# Inventory and iCal Sync

The MVP connects hotel inventory the way small properties already sync Booking.com and Airbnb: **iCal feeds**. No PMS integration.

## Model

- A **room type** (e.g. "Double room with balcony") has one or more **units** (`rooms`).
- Each unit has 0–5 **import URLs** (the iCal export links from Booking.com / Airbnb / the hotel's channel manager) and one **export feed** (`/api/ical/{export_token}`) containing Stumari bookings for that unit.
- The hotel pastes the export feed URL into Booking.com/Airbnb "import calendar" so OTAs block nights sold through Stumari.

## Import

- Fetch with a 10 s timeout, max 2 MB, `https:` only; reject hosts that resolve to private, loopback or link-local addresses (SSRF guard); follow ≤ 3 redirects re-checking each hop.
- Parse `VEVENT`s with `node-ical` (or equivalent): `DTSTART`/`DTEND` as DATE or DATE-TIME. DATE-TIME values are converted to the hotel's timezone and truncated to dates; `DTEND` is exclusive. Events with no `DTEND` block one night. Cancelled events (`STATUS:CANCELLED`) are ignored.
- Each sync **replaces** all `blocks` rows of that `(room_id, feed_url)` in one transaction; `last_synced_at` / `sync_error` are updated on the unit.
- Freshness: cron every 10 min; plus an **on-demand sync of the chosen unit** before building a payment transaction (skipped if synced < 2 min ago). If the on-demand sync fails, proceed with cached data and rely on the confirm step.

## Export

`GET /api/ical/{export_token}` returns `VCALENDAR` with `PRODID:-//Stumari//Booking Feed//EN`, one all-day `VEVENT` per non-terminal booking (`UID:{booking_id}@stumari`, `SUMMARY:Stumari booking`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`) and per manual block. No guest names or contact data. `Cache-Control: no-store`.

## Confirmation (write-back safety)

OTAs poll imported calendars on their own schedule (often hourly), so a Stumari booking can collide with an OTA booking made in the gap. Therefore every booking starts `Pending` on-chain:

1. After the payment transaction lands, the server re-syncs the unit's imports.
2. No overlapping block → server sends `confirm_booking` (operator key) → `Confirmed`.
3. Overlap found → booking stays `Pending`, a `sync_conflict` event is logged, the hotel dashboard and admin show it. The hotel can confirm manually (if it resolves the conflict by moving the other guest) or admin voids → full refund.
4. If nobody confirms within the 2 h confirm window, `void_booking` becomes permissionless; the release cron voids it automatically → full refund.

## Manual blocks

Hotels without any OTA calendars can block dates in the dashboard (the "native ledger"). These appear in the export feed too.
