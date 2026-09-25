# Inventory and iCal Sync

The MVP connects hotel inventory the way small properties already sync Booking.com and Airbnb: **iCal feeds**. No PMS integration.

## Model

- A **room type** (e.g. "Double room with balcony") has one or more **units** (`rooms`).
- Each unit has 0–5 **import URLs** (the iCal export links from Booking.com / Airbnb / the hotel's channel manager) and one **export feed** (`/api/ical/{export_token}`) containing Stumari bookings for that unit.
- The hotel pastes the export feed URL into Booking.com/Airbnb "import calendar" so OTAs block nights sold through Stumari.

## Import

- Fetch with a 10 s timeout, max 2 MB, `https:` only (the test-only `ICAL_ALLOW_LOOPBACK`, localnet only, admits plain-`http` loopback feeds for the E2E — ADR-0017); reject hosts that resolve to private, loopback or link-local addresses (SSRF guard, enforced inside the socket's own DNS lookup so a rebinding answer cannot slip past); follow ≤ 3 redirects re-checking each hop.
- Parse `VEVENT`s with `node-ical` (or equivalent): `DTSTART`/`DTEND` as DATE or DATE-TIME. DATE-TIME values are converted to the hotel's timezone and truncated to dates; `DTEND` is exclusive. Events with no `DTEND` block one night. Cancelled events (`STATUS:CANCELLED`) are ignored, and so are events whose `UID` ends in `@stumari`: an OTA that re-exports imported calendars would otherwise hand our own bookings back as blocks on the same unit.
- Each sync **replaces** all `blocks` rows of that `(room_id, feed_url)` in one transaction; `last_synced_at` / `sync_error` are updated on the unit.
- Freshness: cron every 10 min; plus an **on-demand sync of the chosen unit** before building a payment transaction (skipped if synced < 2 min ago). If the on-demand sync fails, proceed with cached data and rely on the confirm step.

## Export

`GET /api/ical/{export_token}` returns `VCALENDAR` with `PRODID:-//Stumari//Booking Feed//EN`, one all-day `VEVENT` per booking that **occupies** the unit (data-model.md) — excluding `awaiting_signature` — with `checkout_date` after today (hotel tz), (`UID:{booking_id}@stumari`, `SUMMARY:Stumari booking`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`) and per manual block. No guest names or contact data. `Cache-Control: no-store`.

## Confirmation (write-back safety)

OTAs poll imported calendars on their own schedule (often hourly), so a Stumari booking can collide with an OTA booking made in the gap. Therefore every booking starts `Pending` on-chain:

1. After the payment transaction lands, the server re-syncs the unit's imports.
2. No overlap with (a) any `blocks` row of the unit and (b) any other booking on the unit that occupies it and was created earlier → server sends `confirm_booking` (operator key) → `Confirmed`. This must happen before `confirm_deadline_ts` (the program rejects later confirms).
3. Overlap found → booking stays `Pending`, a `sync_conflict` event is logged, the hotel dashboard and admin show it. The hotel can confirm manually (if it resolves the conflict by moving the other guest) or admin voids → full refund.
4. If nobody confirms within the 2 h confirm window, confirming becomes impossible and `void_booking` becomes permissionless; the release cron (or the next read of the booking) voids it → full refund.

## Manual blocks

Hotels without any OTA calendars can block dates in the dashboard (the "native ledger") via the blocks endpoints in api.md. These appear in the export feed too.

## Known limitation — multi-unit room types

Booking.com's calendar (iCal) sync is designed for single-unit listings; multi-unit room types may not offer iCal export/import. The application form asks `ical_single_unit`; hotels with multi-unit room types use manual blocks or a channel manager (a Channex adapter is roadmap). **Verify on a real extranet before promising iCal onboarding to a specific hotel.**
