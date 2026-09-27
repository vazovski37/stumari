# Mews (PMS) — how Stumari can connect a Mews hotel

Research of 2026-09-28 (two researchers + an adversarial fact-check against docs.mews.com, help.mews.com, Mews terms). Prompted by the pilot prospect **Episode** (Tbilisi), which runs Mews.

## TL;DR

- **A staff login is not API access, and must not be automated.** Mews T&C §5.4 forbids extracting data from Mews "via automated means", §3.3 forbids sharing a username/password with third parties, and Master Terms (v5.0, 2025-02-26) §6.1 forbids giving third parties access "by any technical means". Scripting Mews Operations with Episode's login would put the hotel's account at risk.
- **The legitimate route is a Mews "private integration"** through the Connector API ([private integration](https://docs.mews.com/connector-api/your-journey/private-integration.md)):
  1. Stumari fills in the partner form and gets a Partner ID and a demo login.
  2. Stumari builds and tests on the **demo environment** with a unique Client name (`Stumari 0.1.0`).
  3. Stumari submits the private-integration certification form, then runs **48 h on demo** with the certification token.
  4. Stumari books a review with the Mews Marketplace team.
  5. Mews emails a production **ClientToken** (per integration) and **AccessToken** (per hotel). Go-live can be within 24 h of approval.
  - The review turnaround is not published, so live Episode data before 2026-10-12 is a stretch goal.
- **Gate:** the hotel must be on **Mews Enterprise** or have the **Connectivity Add-on** ([pricing](https://www.mews.com/en/pricing) shows the Open API only under Enterprise). No fee for API access or certification is stated; the plan upgrade price is not public. A small hotel may well be on a lower tier. **Ask first.**
- **Today, without anyone's approval:** Mews publishes demo tokens and demo hotels ([environments](https://docs.mews.com/connector-api/guidelines/environments), `https://api.mews-demo.com`, "NO REAL DATA"). We can build and demo the full integration against it: availability → create reservation → cancel.
- The **Booking Engine API** (Enterprise only, no certification, register a Client name with support) has availability and `reservationGroups/create` but **no cancel**, so it fits worse.

## Operations Stumari uses (Connector API)

| Stumari step | Mews operation | Notes |
|---|---|---|
| Setup / mapping | `services/getAll`, `resourceCategories/getAll`, `rates/getAll`, `ageCategories/getAll`, `configuration/get` | Service id, room types (resource categories), rates, age categories |
| Quote: availability | `services/getAvailability/2024-01-22` (metrics such as `UsableResources`, `Occupied`, `ConfirmedReservations`, `OptionalReservations`, `OutOfOrderBlocks`, `PublicAvailabilityAdjustment`), or the older unversioned `services/getAvailability` | No webhook for availability changes: re-query at quote time |
| Quote: price (optional) | `reservations/price` or `rates/getPricing` | Stumari's base price can come from the hotel's Mews rate |
| Escrow funded → confirm | `customers/add` → `reservations/add` (`State: Confirmed`, `CheckOverbooking: true`, `SendConfirmationEmail: false`, Notes "Prepaid in USDC via Stumari …") | `CheckOverbooking` defaults to true unless the property disabled it, so it is not a guaranteed atomic check. `customers/add` with `OverwriteExisting: false` refuses an existing email, so Stumari sends name only (one customer per booking). Business-rule refusals (overbooking, restrictions) are HTTP 403. `reservations/getAll/2023-06-06` does not return `Notes` |
| Guest cancels / void | `reservations/cancel` (`Notes` required, `PostCancellationFee: false`, `SendEmail: false`) | Refunds happen in the escrow, not in Mews |
| Payment record | `payments/addExternal` exists, but has no crypto type, and external payments **cannot be refunded via API** | MVP: don't record the payment; put it in reservation Notes |
| Change feed | Webhooks (`ServiceOrderUpdated`, …) / WebSockets | One webhook URL per integration |

Rate limit: 200 requests per AccessToken per 30 s (sliding window); handle `429` with `Retry-After`.

**Optional reservations as holds:** `State: Optional` with `ReleasedUtc` blocks the room, and `reservations/confirm` confirms it. But it auto-cancels only if the hotel enabled "automatic cancellation for optional reservations", and Mews does not sync Optional reservations to channel managers by default. So the MVP creates the reservation as **Confirmed** once the escrow is funded.

**Channel managers:** Mews pushes inventory deltas to the hotel's connected channel manager automatically, so a Confirmed reservation closes the room on OTAs. That is inferred from the docs, not stated explicitly.

## Plan

1. Build the Mews client, CLI and web integration against the demo environment. This is the hackathon demo ("works with Mews"), and it is the traffic the certification review needs.
2. Episode call: ask about Enterprise or the Connectivity Add-on; ask for consent to connect Stumari as a private integration; pilot on **manual confirm** meanwhile. Never ask for or use their staff login for automation.
3. If yes: partner form, then the certification form, then 48 h on demo, then review, then production tokens by email.
4. Read the Mews API Terms referenced by Master Terms §7.1 before signing anything.
