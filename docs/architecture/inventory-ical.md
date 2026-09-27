# Inventory and iCal Sync

The MVP connects hotel inventory the way small properties already sync Booking.com and Airbnb: **iCal feeds**. No PMS integration.

## Model

- A **room type** (e.g. "Double room with balcony") has one or more **units** (`rooms`).
- Each unit has 0–5 **import URLs** (the iCal export links from Booking.com / Airbnb / the hotel's channel manager) and one **export feed** (`/api/ical/{export_token}`) containing Stumari bookings for that unit.
- The hotel pastes the export feed URL into Booking.com/Airbnb "import calendar" so OTAs block nights sold through Stumari.

## Import

- Fetch with a 10 s timeout, max 2 MB, `https:` only (the test-only `ICAL_ALLOW_LOOPBACK`, localnet only, admits plain-`http` loopback feeds for the E2E — ADR-0017); reject hosts that resolve to private, loopback or link-local addresses (SSRF guard, enforced inside the socket's own DNS lookup so a rebinding answer cannot slip past); follow ≤ 3 redirects re-checking each hop.
- Parse `VEVENT`s with `node-ical` (or equivalent): `DTSTART`/`DTEND` as DATE or DATE-TIME. DATE-TIME values are converted to the hotel's timezone and truncated to dates; `DTEND` is exclusive. Events with no `DTEND` block one night. Cancelled events (`STATUS:CANCELLED`) are ignored, and so are events whose `UID` ends in `@stumari`: an OTA that re-exports imported calendars would otherwise hand our own bookings back as blocks on the same unit.
- Each sync **replaces** all `blocks` rows of that `(room_id, feed_url)` in one transaction; `last_synced_at` / `sync_error` are updated on the unit. Removing a URL from a unit (`PUT …/ical`) deletes the blocks imported from it in the same batch.
- Freshness: cron every 10 min; plus an **on-demand sync of the chosen unit** before building a payment transaction (skipped if synced < 2 min ago). If the on-demand sync fails, proceed with cached data and rely on the confirm step.

## Export

`GET /api/ical/{export_token}` returns `VCALENDAR` with `PRODID:-//Stumari//Booking Feed//EN`, one all-day `VEVENT` per booking that **occupies** the unit (data-model.md) — excluding `awaiting_signature` — with `checkout_date` after today (hotel tz), (`UID:{booking_id}@stumari`, `SUMMARY:Stumari booking`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`) and per manual block. No guest names or contact data. `Cache-Control: no-store`.

## Confirmation (write-back safety)

OTAs poll imported calendars on their own schedule (Booking.com every 2 h, Airbnb every 3 h, Agoda "several times a day" — [research](../research/channel-managers.md)), so a Stumari booking can collide with an OTA booking made in the gap. Therefore every booking starts `Pending` on-chain:

1. After the payment transaction lands, the server re-syncs the unit's imports.
2. No overlap with (a) any `blocks` row of the unit and (b) any other booking on the unit that occupies it and either was created earlier or is already `confirmed`/`disputed`/`released`/`resolved` (a booking whose create landed unseen may be noticed after a later one was confirmed; it then stays pending and is voided) → server sends `confirm_booking` (operator key) → `Confirmed`. This must happen before `confirm_deadline_ts` (the program rejects later confirms).
3. Overlap found → booking stays `Pending`, a `sync_conflict` event is logged, the hotel dashboard and admin show it. The hotel can confirm manually (if it resolves the conflict by moving the other guest) or admin voids → full refund.
4. If nobody confirms within the 2 h confirm window, confirming becomes impossible and `void_booking` becomes permissionless; the release cron (or the next read of the booking) voids it → full refund.

**Known gaps (2026-09-25, [research](../research/channel-managers.md#gaps-in-todays-design-and-fixes)).** As implemented, step 2 runs seconds after payment (`autoConfirm`), so the Pending window catches OTA bookings made *before* ours (the backward gap) but not an OTA sale in the 2–3 h before that OTA next reads our export feed (the forward gap); such a collision hits a Confirmed booking and is not detected afterwards. A feed that fails to load at confirm time is treated as unchanged (fail-open), and a Confirmed booking has no on-chain full refund before check-in. Planned fixes: confirm only after every connected OTA has fetched our feed since the booking (per-OTA export tokens, ~4 h window), fail closed, a post-confirm conflict alert, and a hotel-signed full-refund ("walk") instruction — tracked in [backlog.md](../plan/backlog.md).

**Manual confirm mode** (`hotels.confirm_mode = manual`, set in `/admin`). For hotels whose rooms live in a system Stumari does not sync yet — e.g. a PMS such as Mews, where the founders have a staff login but no API access. Step 2 then never confirms automatically. The server logs a `confirm_requested` event and sends one Telegram alert (room type, unit, dates, amount, deadline, dashboard link). A person checks the dates in the hotel's system, creates the reservation there, and presses **Confirm** in the dashboard before `confirm_deadline_ts`. If the room is not free, nobody confirms (or an admin voids) and the guest gets a full refund. Availability shown on Stumari comes from manual blocks entered in the dashboard. Every booking still waits for a person, so the confirm window (2 h) must be staffed.

## Manual blocks

Hotels without any OTA calendars can block dates in the dashboard (the "native ledger") via the blocks endpoints in api.md. These appear in the export feed too.

## Known limitation — multi-unit room types

Booking.com allows calendar (iCal) sync only for properties with **≤ 20 room types, ≤ 1 unit per room type and no XML connectivity provider** (channel manager or PMS); Agoda likewise only for room types with exactly one room. So hotels with multi-unit room types, and every hotel already on a channel manager (OtelMS, Exely, HotelRunner, Beds24, Channex…), cannot connect Booking.com to Stumari over iCal. The application form asks `ical_single_unit` and `channel_manager`; those hotels use manual blocks until a channel-manager adapter exists ([research](../research/channel-managers.md#integration-routes): Exely Connect, OtelMS partnership, Beds24, Channex). Interim bridge where supported: paste Stumari's feed into the hotel's channel manager instead of each OTA. **Verify on a real extranet before promising iCal onboarding to a specific hotel.**
