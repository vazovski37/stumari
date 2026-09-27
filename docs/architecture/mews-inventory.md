# Mews as an inventory provider

For a hotel whose rooms live in **Mews**, Stumari reads availability from the Mews Connector API and turns each paid booking into a Confirmed Mews reservation. Everything else (quotes, holds, the escrow, refunds) is unchanged. Client: `packages/mews-client` (typed, zod-validated, 429-aware, per-call deadlines). The web app's wrapper is `apps/web/lib/mews/client.ts`, which imports the package by relative path because apps/web does not list it as a dependency ([ADR-0018](../decisions/README.md)).

Access: the Mews terms forbid automating a staff login. Production needs a certified **private integration**, and the hotel must be on Enterprise or have the Connectivity Add-on. Until a hotel has that, everything runs against the public **demo** environment (`https://api.mews-demo.com`), with fake data only.

## Configuration

- **Env** (single pilot hotel): `MEWS_PLATFORM_URL` (default demo), `MEWS_CLIENT_TOKEN`, `MEWS_ACCESS_TOKEN`, `MEWS_CLIENT` (default `Stumari 0.1.0`). Set both tokens or neither. The URL must be https. Any host other than `api.mews-demo.com` counts as production and is refused unless `MEWS_ALLOW_PRODUCTION` is `1` or `true` (any case; `0`, `false` or unset refuse). The web app, the CLI and `packages/mews-client` accept the same values. Tokens never appear in errors or logs.
- **A bad Mews setting disables Mews only.** One token without the other, a URL that is not https, a production host without the flag, or an unknown flag value leaves the rest of the app running: Mews is off, startup logs `[stumari] Mews is disabled: …` (the setting's name and the rule, never its value), quotes at Mews hotels answer `503 INVENTORY_UNAVAILABLE`, and "Test Mews connection" answers `503 MEWS_NOT_CONFIGURED` with the same reason.
- **Hotel** (`/admin` → Hotel details): `inventory_provider` = `ical` (default) | `mews`, `mews_service_id` (the bookable service, usually "Accommodation"), `mews_rate_id` (the rate every Stumari reservation uses).
- **Room type**: `mews_room_type_id` = the Mews resource category it sells. One Mews room type maps to one Stumari room type.
- **Timezone**: the hotel's `timezone` must equal the Mews enterprise timezone. Nights are local dates on both sides, and the client rejects time units that do not start at local midnight.
- **Test Mews connection** (`POST /api/admin/hotels/{id}/mews-test`, admin only, read-only): enterprise, timezone check, services, room types, rates, the mapping's problems, and the next 7 nights of free units per mapped room type. It uses its own connection with an 8 s timeout per call, no retries and a 40 s budget in total, so a slow or rate-limited Mews answers `502 MEWS_ERROR`, never a platform timeout.
- `confirm_mode` is ignored for Mews hotels. For them, the Mews reservation is the check.

## Availability rule

Stumari keeps its unit model. The units of a Mews room type are **virtual slots**, not rooms, and have no iCal imports. Every hold and every occupying booking takes a slot for its nights, as at iCal hotels. The number of slots therefore caps how many Stumari bookings of that room type can share a night. On top of a free slot, a stay needs:

> min over the stay's nights of Mews free units  **>**  Stumari claims on the room type that Mews does not know about yet

A **claim** is a booking that occupies (data-model.md) and has no `mews_reservation_id`. For a new quote, another client's active hold with no booking yet also counts. A booking that already has its Mews reservation is inside the Mews count. The rule is conservative: a claim on any night of the stay counts against every night.

- **Quote** (`POST /api/quotes`): checked before the hold. Fails closed: `409 UNAVAILABLE` when there is no room or the room type is unmapped, and `503 INVENTORY_UNAVAILABLE` when Mews cannot answer or is not configured.
- **Pay** (`POST /api/quotes/{id}/pay`): checked again after the iCal/booking check, counting bookings only and excluding the paying booking itself (`409 HOLD_LOST`). Fails open on Mews errors, like the iCal re-sync, because the confirm step decides.
- **Hotel page** (`GET /api/hotels/{slug}/availability`): a Mews room type shows as available only when Mews has a free unit for every night. It fails open, and the quote re-checks.

Mews free units come from `services/getAvailability` (absolute availability, adjustments already applied; negative values are reported as 0).

Rate restrictions (minimum stay, closed to arrival, …) are not checked at quote time. The Connector API documents the restriction check (`CheckRateApplicability`, on by default) only for `reservations/add`, so an early check would need extra restriction reads per quote; that is not worth it for the pilot. A refusal at confirm voids the booking at once with a full refund (below).

## Confirm

`autoConfirm` (right after payment, then every sync cron run while the booking is pending):

1. The usual Stumari-side check on the virtual unit (manual blocks, other bookings). A conflict leaves the booking pending (`sync_conflict`).
2. **Ensure the reservation** (`ensureMewsReservation`). Guarantee: **at most one Mews reservation per booking**, as long as every attempt finishes inside its lock (below) and Mews lists a new reservation by customer within the 120 s cool-down.
   - **Lock and budget.** An attempt takes the booking's lock (`mews_lock_until` = now + 180 s) only if it is free or expired, so the relay's confirm and the cron's confirm never run at once. Each attempt has a **60 s budget**: an `AbortSignal` passed to every Mews call (retries and `Retry-After` waits included), so it ends long before the lock expires. Right before `reservations/add` it re-reads the row and goes on only if the lock still holds the value this attempt set, the booking is still `pending`, and at least 20 s of the budget are left. It releases the lock by compare-and-set on that value, so an attempt never frees a lock another attempt holds.
   - If `mews_reservation_id` is already set, it is done. A booking that is no longer `pending` gets no new reservation.
   - **One customer per booking.** `customers/add` sends the name only (on the demo always "Test Stumari") and never the email: with `OverwriteExisting: false`, Mews refuses a second customer with an existing email, which would block every returning guest. Its id and creation time (`mews_customer_id`, `mews_customer_at`) are stored before `reservations/add`.
   - **Recovery.** If an earlier attempt stored a customer, the attempt first lists that customer's reservations (`reservations/getAll/2023-06-06` by `AccountIds`) and adopts an active one only if it has the booking's room type and stay (local dates of the scheduled start and end in the enterprise timezone), logging `mews_reserved` with `recovered: true`. This version of `reservations/getAll` does not return `Notes`, so the booking id in the Notes cannot be matched; the customer being the booking's own makes customer + room type + dates specific to it. If the customer has an active reservation that does **not** match, the attempt creates nothing and retries (the deadline void then refunds the guest, and Cancel removes that reservation).
   - It reads Mews free units. With 0 free and no earlier customer, the outcome is **no availability**. With an earlier customer, 0 free may be our own reservation not listed yet, so it waits until 180 s after the customer was created before concluding **no availability**.
   - `reservations/add` with `State: Confirmed`, `CheckOverbooking: true`, `SendConfirmationEmail: false`, the quote's adults and children, and Notes `Prepaid in USDC via Stumari, booking {id}, tx {create_sig}`. In production the Notes also carry `. Guest: {name} <{email}>`; on the demo they never carry guest data.
   - A **403** from `reservations/add` is a business-rule refusal (overbooking, minimum stay, closed to arrival, …; Mews docs "Responses") and nothing was applied. Unless the customer already has a matching reservation, the outcome is **no availability** at once, with the refusal in the `sync_conflict` event. Other 4xx answers (400, 404, 409) count as no availability only when Mews then shows 0 free units; otherwise the attempt retries.
   - A timeout, network error, 5xx or unreadable answer on `reservations/add` (including the budget cutting it while in flight) may still have been applied. After one of these, the lock stays for a 120 s **cool-down**, because Mews lists a new reservation by customer only after a delay of about 1–2 s on the demo. The next attempt then finds it instead of creating another.
   - No payment is posted in Mews: there is no crypto payment type, and the API cannot refund external payments.
3. **Reserved** → store `mews_reservation_id` (clearing `mews_cancelled_at`) → `confirm_booking` (operator). If that transaction fails, the next run confirms and reuses the stored reservation. If the booking was cancelled or voided while the attempt ran, the attempt cancels the reservation it just stored right after releasing the lock (see Cancel).
4. **No availability** → `sync_conflict` `{ mews: { free, refusal? } }`, and the admin key voids at once (`void_booking`; the program lets the admin void a pending booking at any time) → full refund.
5. **Transient or configuration problem** (Mews down, unmapped, timezone mismatch, lock held) → the booking stays pending and the cron retries.

**Deadline margin.** No attempt starts within 120 s of `confirm_deadline_ts` unless the reservation already exists. The attempt budget (60 s) is shorter than that margin, so a reservation created by an attempt that started just before it still leaves about a minute for `confirm_booking`. After the deadline, the permissionless void refunds the guest, and Cancel removes any reservation that was made.

## Cancel

When a Mews-linked booking becomes `cancelled` (guest cancel) or `voided` on-chain, whatever path observed it (`syncFromChain`: relay, lazy crank, release cron, dashboard), Stumari calls `reservations/cancel` with `PostCancellationFee: false`, `SendEmail: false` and Notes naming the booking (`settleMewsAfterExit`). If only a customer is stored, it cancels that customer's active reservations (the customer is the booking's own). A reservation already cancelled in Mews (for example by the hotel) counts as done. Success sets `mews_cancelled_at` and logs a `mews_cancelled` event. On failure, the sync cron retries. The demo sometimes answers `403 "Someone else just changed this bill"` on a reservation created seconds earlier, and a retry succeeds.

**Cancel while a confirm is in flight.** A guest cancel or admin void can land while `reservations/add` is on its way. So Cancel does not settle (the cron retries) while:

- a confirm attempt holds the lock (`mews_lock_until` in the future: an attempt is running, or the cool-down after an ambiguous add is active), or
- only a customer is stored, Mews lists no active reservation for it, and it was created less than 180 s ago (the listing may lag).

Storing a reservation clears `mews_cancelled_at`, and an attempt whose booking has exited cancels its reservation right away, so a late reservation is always cancelled (at the latest by the next cron run). The Mews side of a booking voided a moment after its customer was created therefore settles a few minutes later.

`released` and `resolved` bookings keep their reservation, because the guest stayed. The hotel handles a `disputed` booking in Mews itself.

## Limits

- Credentials are single-tenant (env) for now. Per-hotel tokens need encrypted storage and are a backlog item.
- **Stumari records no payment in Mews**, so the reservation shows an unpaid balance. The hotel must treat the Notes "Prepaid in USDC via Stumari" as paid and not charge the guest again. Reversing anything in Mews (a refund, a changed stay) is manual.
- **Mews-side changes by the hotel are not read back yet** (a moved or cancelled reservation). A Stumari refund still needs the on-chain flow.
- A crash after `customers/add` and before its id is stored can leave an orphan **customer profile** in Mews (name only), never a reservation: `reservations/add` runs only after the customer id is stored. A crash after `reservations/add` and before its id is stored is covered by the customer lookup.
- The one-reservation guarantee assumes Mews lists a new reservation by customer within the 120 s cool-down (1–2 s observed on the demo) and that a process does not stall for more than the 120 s between its lock check and `reservations/add`. If either fails, a second reservation for the same customer is possible; its Notes carry the booking id for manual cleanup, and Cancel cancels every active reservation of the booking's customer.

## Smoke test (demo only)

`pnpm --filter web exec tsx scripts/mews-smoke.ts` (with the demo tokens in the shell) runs on a throwaway database. It performs the Test Mews connection report and the free-unit check, reserves a room and re-runs the reservation (still one reservation), recovers a reservation whose answer was "lost", then cancels both as after a void. It refuses any host except the demo.
