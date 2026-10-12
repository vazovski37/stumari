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
| 10 | Contract choices | `hotels.policy` | `enabled_templates`: which contracts to offer (`flexible`, `standard`, `nonrefundable`; at least one). `reference_template`: the policy they use today, default `standard`, which is always priced at exactly the base rate. Price bounds `min_mult_bps` / `max_mult_bps`: default 8500 / 13000, i.e. 0.85×–1.30× of the base rate ([pricing-and-risk-model.md §5](../architecture/pricing-and-risk-model.md#5-pricing-price-room-and-terms-together)). |
| 10b | Typical occupancy | `hotels.policy.resale_bps` | Ask: "What is your typical occupancy over the next few months?" 70% or more: keep the default `[9000, 8000, 6500, 4500, 2500, 1000]`. Below 70%: use `[5000, 4000, 3000, 2000, 1000, 0]`. This is the chance that a cancelled night gets resold. |
| 11 | Contact email / Telegram | `hotels.contact_email`, `contact_telegram` | For conflict and dispute notices |
| 12 | Pilot-hotel permission | [leads.csv](leads.csv) `notes` | "May we name you as a pilot hotel?" Record yes or no. |

### Installing Phantom (if they have no wallet)

1. Install Phantom from the official App Store / Google Play listing only. Check that the publisher is Phantom.
2. Create a new wallet. **The owner writes the recovery phrase on paper, alone.** We never see, type or photograph it.
3. Ask the owner to copy the Solana address (Receive → Solana) and send it to you by message. Read it back to them and compare the first and last 4 characters.
4. If you will test on devnet with their wallet: Settings → Developer Settings → Testnet Mode → Solana Devnet ([runbook](../plan/runbook.md#9-phantom-on-devnet)).

## 2. Admin setup (`/admin`)

Follow this order. Each step matches an admin endpoint in [api.md](../architecture/api.md#admin).

- [ ] **Convert** the application into a draft hotel (`POST /api/admin/applications/{id}/convert`). Fill in items 1–4 and 9–11 (including 10b).
- [ ] **Room types** with nightly rates (`POST /api/admin/hotels/{id}/room-types`).
- [ ] **Units** per room type, with iCal import URLs (`POST …/room-types/{rtId}/units`). Each unit returns its **export URL**.
- [ ] **Hotel on a PMS we don't sync (e.g. Mews, OtelMS, Exely) or multi-unit room types without iCal:** in Details set **Booking confirmation = Manual**, make sure `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set, and agree who answers the alerts. For each alert: check the dates in the hotel's system, create the reservation there (guest name, dates, "paid via Stumari, USDC"), then press **Confirm** in `/dashboard/{hotelId}` within 2 hours. Room not free: don't confirm; the guest is refunded automatically. Keep Stumari's calendar roughly right with manual blocks for sold-out dates.
- [ ] Run a **sync** (`POST /api/dashboard/{hotelId}/sync`). Check that each unit shows `last_synced_at` and no `sync_error`, and that blocked dates match the hotel's Booking.com/Airbnb calendar for the next few weeks.
- [ ] Set the **payout wallet** (the hotel's Phantom address).
- [ ] **Register on-chain** (`POST /api/admin/hotels/{id}/register`). This creates the wallet's USDC account and runs `register_hotel`, and the hotel becomes `active`. Save the Explorer link.
- [ ] **Pause the hotel right away** (`PATCH /api/admin/hotels/{id}` with `status: paused`, which sends `update_hotel(active = false)`). On the devnet deployment a real pilot hotel stays `paused` except during a supervised test booking (section 4), so nobody can make a devnet booking on its real inventory.
- [ ] Update the application status to `pilot`.

## 3. Export feeds wait for go-live

- [ ] Show the hotel each unit's **export URL** in the dashboard, but **do not paste it into Booking.com / Airbnb yet**. Every booking on Stumari, including devnet test bookings, blocks its nights in the export feed. Pasted now, a devnet test booking would block real nights on the OTAs. The feeds are pasted at go-live (section 5).
- [ ] The import direction (their Booking.com/Airbnb calendars → Stumari) stays connected from item 8, so availability on Stumari is already correct.

## 4. Test booking (supervised)

- [ ] The owner signs in to their dashboard (`/dashboard/{hotelId}`) with their Phantom. Check that the rooms, rates and export URLs are right.
- [ ] Set the hotel `active` for the test only (`status: active`).
- [ ] Open `/h/{slug}` and make a **test booking with the devnet test wallet** ("Test wallet — test USDC, not real money"). Use dates far in the future.
- [ ] Show them the booking in the dashboard and in the export feed (open the export URL in the browser), then **cancel it right away**.
- [ ] Show the refund on Explorer.
- [ ] Set the hotel back to `paused` before you hang up.

## 5. Go live

- [ ] Real USDC bookings start only after the mainnet decision (roadmap M7: security review, pilot amount cap). Until then the hotel stays `paused` on devnet and takes no real bookings. Tell the hotel this clearly.
- [ ] At go-live, on the deployment that takes real bookings: set the hotel `active`, then the hotel pastes each unit's **export URL** into the matching Booking.com / Airbnb listing's "import calendar" / "sync calendars" setting. Menu names vary, so find it together on their screen.
- [ ] Tell them: Booking.com/Airbnb read the feed on their own schedule, often hourly. Every Stumari booking starts *pending* and is confirmed only after we re-check their calendar ([objections.md](objections.md#what-about-double-bookings-with-bookingcom)).
- [ ] Send the hotel their booking link `/h/{slug}` to share with guests who can't pay by card, and a short "how guests pay" note (USDC in Phantom; USDT holders swap to USDC in Phantom first).
- [ ] Book the feedback call for after their first real bookings. Update [leads.csv](leads.csv).
