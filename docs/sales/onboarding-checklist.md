# Concierge onboarding checklist

> **DRAFT — founders confirm before sending.** We onboard each pilot hotel ourselves on the 20-minute setup call. The steps follow the onboarding sequence in [api.md](../architecture/api.md#admin). Promise nothing outside [offer.md](offer.md).

**Before the call:** the hotel has applied at `/apply`, or you create the application for them. You are signed in to `/admin` with an admin wallet (`ADMIN_WALLETS`). Open the hotel's application.

## 1. Collect (on the call)

| # | Item | Where it goes | Notes |
|---|---|---|---|
| 1 | Legal / display name | `hotels.name` | The display name is also used for the URL slug `/h/{slug}` |
| 2 | Address, phone | `hotels.address`, `hotels.phone` | Shown to guests on the hotel page and the booking page |
| 3 | Check-in / check-out times | `hotels.checkin_time`, `checkout_time` | `HH:MM`, Tbilisi time. Defaults 14:00 / 12:00. Refund deadlines and payout timing count from check-in time. |
| 4 | City or resort property | `hotels.hotel_type` | `City Hotel` for Tbilisi. It is a model input. |
| 5 | Room types | `room_types` | Name, max adults, max children, meal (`BB`/`HB`/`FB`/`SC`) |
| 6 | Nightly rate per room type **in USD** | `base_rate_minor` (+ optional `weekend_rate_minor` for Fri/Sat nights) | Enter as USDC base units: 45 USD = `45000000`. The hotel sets the price; we don't advise on it. |
| 7 | Units per room type | `rooms` (label per unit, e.g. "101") | One unit = one physical room |
| 8 | iCal **export** link per unit from Booking.com / Airbnb | `rooms.ical_import_urls` (≤ 5, https) | The hotel logs in to their own extranet; we never ask for their password. First check that each unit is its own listing (`ical_single_unit`). **Multi-unit room types: do not promise iCal.** Use manual blocks in the dashboard, or pause onboarding ([inventory-ical.md](../architecture/inventory-ical.md#known-limitation--multi-unit-room-types)). |
| 9 | Payout wallet | `hotels.payout_wallet` | Self-custody Phantom on the owner's phone. **Never an exchange deposit address.** The same wallet signs in to the dashboard. |
| 10 | Contract choices | `hotels.policy` | Which contracts to offer (`flexible`, `standard`, `nonrefundable`), the reference contract (the policy they use today, default `standard`), and price bounds (default 0.85×–1.30× of the base rate) |
| 11 | Contact email / Telegram | `hotels.contact_email`, `contact_telegram` | For conflict and dispute notices |
| 12 | Pilot-hotel permission | [leads.csv](leads.csv) `notes` | "May we name you as a pilot hotel?" Record yes or no. |

### Installing Phantom (if they have no wallet)

1. Install Phantom from the official App Store / Google Play listing only. Check that the publisher is Phantom.
2. Create a new wallet. **The owner writes the recovery phrase on paper, alone.** We never see, type or photograph it.
3. Ask the owner to copy the Solana address (Receive → Solana) and send it to you by message. Read it back to them and compare the first and last 4 characters.
4. If you will test on devnet with their wallet: Settings → Developer Settings → Testnet Mode → Solana Devnet ([runbook](../plan/runbook.md#phantom-on-devnet)).

## 2. Admin setup (`/admin`)

Follow this order. Each step matches an admin endpoint in [api.md](../architecture/api.md#admin).

- [ ] **Convert** the application into a draft hotel (`POST /api/admin/applications/{id}/convert`). Fill in items 1–4 and 9–11.
- [ ] **Room types** with nightly rates (`POST /api/admin/hotels/{id}/room-types`).
- [ ] **Units** per room type, with iCal import URLs (`POST …/room-types/{rtId}/units`). Each unit returns its **export URL**.
- [ ] Run a **sync** (`POST /api/dashboard/{hotelId}/sync`). Check that each unit shows `last_synced_at` and no `sync_error`, and that blocked dates match the hotel's Booking.com/Airbnb calendar for the next few weeks.
- [ ] Set the **payout wallet** (the hotel's Phantom address).
- [ ] **Register on-chain** (`POST /api/admin/hotels/{id}/register`). This creates the wallet's USDC account and runs `register_hotel`, and the hotel becomes `active`. Save the Explorer link.
- [ ] Update the application status to `pilot`.

## 3. Hotel pastes the export feeds (on the call)

- [ ] For each unit, the hotel pastes that unit's **export URL** into the matching Booking.com / Airbnb listing's "import calendar" / "sync calendars" setting. Menu names vary, so find it together on their screen.
- [ ] Tell them: Booking.com/Airbnb read the feed on their own schedule, often hourly. Every Stumari booking starts *pending* and is confirmed only after we re-check their calendar ([objections.md](objections.md#what-about-double-bookings-with-bookingcom)).

## 4. Test booking

- [ ] The owner signs in to their dashboard (`/dashboard/{hotelId}`) with their Phantom. Check that the rooms, rates and export URLs are right.
- [ ] Open `/h/{slug}` and make a **test booking with the devnet test wallet** ("Test wallet — devnet, not real money"). Use dates far in the future.
- [ ] Show them the booking in the dashboard and in the export feed, then **cancel it right away**. A test booking blocks those nights in the export feed, and so on Booking.com, until it is cancelled.
- [ ] Show the refund on Explorer.

## 5. Go live

- [ ] Real USDC bookings start only after the mainnet decision (roadmap M7: security review, pilot amount cap). Until then the hotel's page runs on devnet with test money. Tell the hotel this clearly.
- [ ] When live: send the hotel their booking link `/h/{slug}` to share with guests who can't pay by card, and a short "how guests pay" note (USDC in Phantom; USDT holders swap to USDC in Phantom first).
- [ ] Book the feedback call for after their first real bookings. Update [leads.csv](leads.csv).
