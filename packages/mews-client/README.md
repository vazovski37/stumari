# @stumari/mews-client

A small typed client for the parts of the [Mews Connector API](https://docs.mews.com/connector-api)
Stumari needs to sync a hotel on Mews: property setup, free units per room type per night, stay
price, and creating and cancelling reservations. It uses `fetch`, validates responses with zod
(only the fields we read), and has no Solana dependencies.

```sh
pnpm --filter @stumari/mews-client test        # vitest with a fake fetch, no network
pnpm --filter @stumari/mews-client typecheck
pnpm --filter @stumari/scripts mews setup      # CLI against the demo environment (scripts/README.md)
```

## Access and environments

- **Demo** (`https://api.mews-demo.com`, the default): Mews publishes the demo `ClientToken`/`AccessToken`
  pairs on [Environments](https://docs.mews.com/connector-api/guidelines/environments). These are a public
  shared sandbox, so use **fake data only** (for example the guest "Test Stumari").
- **Production** (`https://api.mews.com`) needs a certified private integration: the hotel must be on
  Enterprise or have the Connectivity Add-on. Mews terms forbid automating a staff login.
  `configFromEnv` treats every host except `api.mews-demo.com` as production and refuses it unless
  `MEWS_ALLOW_PRODUCTION` is `1` or `true` (`allowProductionFlag`; the web app accepts the same values).

Env: `MEWS_PLATFORM_URL` (default demo), `MEWS_CLIENT_TOKEN`, `MEWS_ACCESS_TOKEN`, `MEWS_CLIENT`
(default `Stumari 0.1.0`). Tokens appear only in request bodies. Errors never include them: a Mews
error message that echoes a token is redacted to `***`.

## API

```ts
import { MewsClient, configFromEnv, stumariReservationNotes } from "@stumari/mews-client";

const mews = new MewsClient(configFromEnv(process.env));
const setup = await mews.getSetup();                        // enterprise, tz, service, room types, rates, age categories
const av = await mews.getAvailability(setup, "2026-11-03", "2026-11-05"); // nights 11-03, 11-04
const total = await mews.price(setup, { roomTypeId, rateId, checkin, checkout, adults: 2 });
const r = await mews.createReservation(setup, {
  roomTypeId, rateId, checkin, checkout, adults: 2, children: 0,
  guestFirstName: "Test", guestLastName: "Stumari",
  notes: stumariReservationNotes({ bookingId, txSig }),       // "Prepaid in USDC via Stumari, booking …, tx …"
});                                                         // state "Confirmed" by default
await mews.cancelReservation(r.reservationId, "Stumari booking refunded");
```

| Helper | Mews operations | Notes |
|---|---|---|
| `getSetup({ serviceId? })` | `configuration/get`, `services/getAll`, `resourceCategories/getAll`, `rates/getAll`, `ageCategories/getAll` | Takes the given `serviceId`. Otherwise it picks the first active bookable service with a `Day` time unit, preferring one named "Accommodation", then one whose name contains "Stay", "Room" or "Lodging". `bookableServices` lists the alternatives. Room types = active resource categories; rates = active, enabled and not `AvailabilityBlock`, default rate first. All `getAll` calls follow cursor pagination (`Limitation.Count` 1000). |
| `getAvailability(target, from, to)` | `services/getAvailability` | One entry per night from `from` to `to - 1 day`. See "Free units" below. |
| `getAvailabilityMetrics(target, from, to, metrics?)` | `services/getAvailability/2024-01-22` | Raw metrics, for diagnostics |
| `price(setup, stay)` | `reservations/price` | `TotalAmount` as decimal strings `{ currency, gross, net }`. Mews does not check capacity here. |
| `createReservation(setup, params)` | `customers/add` → `reservations/add` | A new customer each time, name only: `guestEmail` is appended to the Notes, never sent to `customers/add` (with `OverwriteExisting: false` Mews refuses a second customer with an existing email, so a returning guest could not be booked). `CheckOverbooking: true`, `SendConfirmationEmail: false`, `State` default `Confirmed`. Returns the reservation id, number and customer id. |
| `confirmReservation(id)` | `reservations/confirm` | Only for reservations created as `Optional` |
| `cancelReservation(id, notes)` | `reservations/cancel` | `PostCancellationFee: false`, `SendEmail: false`, `Notes` required |
| `getReservations(ids)` | `reservations/getAll/2023-06-06` | State, room type, customer, scheduled start/end, cancelled time. This version does **not** return `Notes`, so a reservation cannot be found by the booking id in its notes |

**No payments are posted in Mews.** `payments/addExternal` has no crypto payment type, and Mews
cannot refund external payments through the API. The USDC prepayment is recorded only in the
reservation `Notes` (`stumariReservationNotes`).

## Dates and timezones

Stumari dates are `YYYY-MM-DD` in the hotel's timezone. Mews "Day" time units start at local midnight
in the enterprise timezone (`configuration/get` → `Enterprise.TimeZoneIdentifier`, IANA), and all
conversions use that zone. For a real Tbilisi hotel it should be `Asia/Tbilisi`. Check it against
`hotels.timezone` before syncing.

- **Availability and pricing intervals** send `FirstTimeUnitStartUtc` = local 00:00 of `from` in UTC,
  and `LastTimeUnitStartUtc` = local 00:00 of the last night (`to - 1 day`). Mews only accepts
  time-unit boundaries. Each returned `TimeUnitStartsUtc` must equal the expected local midnight,
  otherwise the call fails with `invalid_response`. This catches a timezone mismatch.
- **Reservations** send `StartUtc` = local 00:00 of `checkin` + service `StartOffset`, and
  `EndUtc` = local 00:00 of `checkout` + service `EndOffset`. `EndOffset` counts from the end of the
  last night's time unit, which is midnight at the start of the checkout date. With the demo
  Accommodation service (`P0M0DT15H0M0S` / `P0M0DT11H0M0S`, Europe/Budapest), 2026-11-03 → 11-05 is sent as
  `2026-11-03T14:00:00Z` → `2026-11-05T10:00:00Z` (CET).
- Conversions use `Intl` only (no tz database dependency). The DST-crossing case is covered by the tests.

## Free units

`getAvailability` uses the pre-2024 `services/getAvailability`, whose `Availabilities` is Mews's
absolute availability per room type and night, with availability adjustments already applied. That
is the number the property can still sell. `free = max(0, availability)` and `raw` keeps negative
values (overbooking). The docs do not mark this endpoint deprecated.

Cross-check on the demo property (2026-09-28, 31 nights × 5 room types): every value equalled
`UsableResources − Occupied − OtherServiceReservationCount` from `getAvailability/2024-01-22`.
`UsableResources` already excludes out-of-order units. `PublicAvailabilityAdjustment` and the block
metrics were 0 on all of those nights, so their sign in the formula was not observed. Rely on the
endpoint's own number, not the formula. A stay is bookable when the minimum `free` over its nights is
≥ 1. The checkout date is not a night of the stay.

## Errors, retries, timeouts

Every failure is a `MewsError` with `kind` (`config`, `input`, `http`, `rate_limited`, `timeout`,
`aborted`, `network`, `invalid_response`), `operation` (for example `reservations/add`), `status` and
Mews `requestId`. Its message looks like `Mews reservations/add: HTTP 403: <Mews message>`. Mews
answers business-rule violations (overbooking, rate restrictions) with **403** and malformed requests
with 400 (docs "Responses").

Every helper takes optional `RequestOptions`: `signal` (for example `AbortSignal.timeout(ms)`, a
total budget for the call including retries and `Retry-After` waits), and per-call `timeoutMs` and
`maxRetries`. When the signal fires before a request is sent or while waiting to retry, the call fails
with kind `aborted` (nothing was applied). When it fires while a request is in flight, the call fails
with kind `timeout`, because a write may have been applied.

- **429**: retried for every operation, because the request was rejected and never executed. The
  client waits for `Retry-After` (seconds or an HTTP date, capped at 60 s). Without the header it
  backs off 1 s, 2 s, 4 s… (capped at 30 s, ±20 % jitter). It makes up to 4 retries by default. The
  limit is 200 requests per AccessToken per sliding 30 s.
- **408, 5xx, timeouts, network errors**: retried only for reads (setup, availability, price,
  getAll). Writes (`customers/add`, `reservations/add`, `reservations/confirm`,
  `reservations/cancel`) are never blindly retried, because the first attempt may have been applied
  and a retry could create a duplicate reservation. The caller should check with `getReservations`
  first.
- **Timeouts**: 30 s per attempt by default (`timeoutMs`).
- If `reservations/add` fails after `customers/add` succeeded, the customer profile stays in Mews.
