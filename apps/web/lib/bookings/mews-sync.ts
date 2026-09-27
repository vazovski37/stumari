import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { bookingEvents, bookings, quotes } from "../db/schema";
import { mewsFreeByRoomType, mewsMapping, minFree } from "../inventory/mews";
import { localDate, MewsError, stumariReservationNotes, type MewsPort, type MewsReservation } from "../mews/client";
import type { BookingRecord, BookingRow } from "./view";

/**
 * The Mews side of a booking at a Mews hotel (docs/architecture/mews-inventory.md "Confirm" and
 * "Cancel"). Idempotency: at most one Mews reservation per booking. One attempt at a time holds the
 * booking's lock and finishes well inside it (a total time budget); the booking's own guest profile
 * (one customer per booking) is created first and its id stored; the reservation id is stored as soon
 * as Mews returns it; and a retry that finds a stored customer but no reservation looks the
 * reservation up by that customer before creating one (a `reservations/add` that timed out may have
 * been applied).
 */

export type MewsReserveOutcome =
  | { kind: "reserved"; reservationId: string }
  /**
   * Mews will not take the stay: no free unit of the room type for some night, or `reservations/add`
   * refused it with a business-rule 403 (overbooking, minimum stay, closed to arrival, …).
   */
  | { kind: "unavailable"; free: number[]; refusal?: string }
  /** Transient or configuration problem: the booking stays pending and the sync cron retries. */
  | { kind: "retry"; reason: string };

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const wallNow = () => Math.floor(Date.now() / 1000);

const party = z.object({ adults: z.number().int().min(1).max(20), children: z.number().int().min(0).max(20).default(0) });

async function partyOf(db: Db, quoteId: string): Promise<{ adults: number; children: number }> {
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId), columns: { body: true } });
  const parsed = party.safeParse(quote?.body);
  return parsed.success ? parsed.data : { adults: 1, children: 0 };
}

/**
 * The guest profile sent to Mews: name only, a new profile per booking. The demo environment is a
 * public shared sandbox, so it only ever gets the fake guest "Test Stumari"; production gets the name
 * the guest gave us. The email is never sent to `customers/add` (Mews refuses a second customer with
 * an existing email, so a returning guest could not be booked); production puts it in the Notes.
 */
export function mewsGuest(row: Pick<BookingRow, "guest_name">, production: boolean): { lastName: string; firstName?: string } {
  if (!production) return { firstName: "Test", lastName: "Stumari" };
  const parts = (row.guest_name ?? "").trim().split(/\s+/).filter(Boolean);
  const lastName = parts.length > 0 ? parts[parts.length - 1]! : "Stumari guest";
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : undefined;
  return { lastName, ...(firstName ? { firstName } : {}) };
}

/** Reservation Notes: the prepayment line, plus the guest's name and email in production only. */
export function mewsNotes(row: Pick<BookingRow, "id" | "create_sig" | "guest_name" | "guest_email">, production: boolean): string {
  return stumariReservationNotes({
    bookingId: row.id,
    txSig: row.create_sig,
    guest: production ? { name: row.guest_name, email: row.guest_email } : null,
  });
}

async function event(db: Db, bookingId: string, type: "mews_reserved" | "mews_cancelled", data: Record<string, unknown>) {
  await db.insert(bookingEvents).values({ id: randomUUID(), booking_id: bookingId, type, sig: null, data, created_at: wallNow() });
}

/**
 * Stores the reservation id. `mews_cancelled_at` is cleared: a cancel that ran while the reservation
 * was not listed yet must not count as settled (the caller settles again when the booking has exited).
 */
async function storeReservation(db: Db, bookingId: string, reservationId: string, data: Record<string, unknown>) {
  await db.update(bookings).set({ mews_reservation_id: reservationId, mews_cancelled_at: null, updated_at: wallNow() }).where(eq(bookings.id, bookingId));
  await event(db, bookingId, "mews_reserved", { reservation_id: reservationId, ...data });
}

const isActive = (r: { state: string; cancelledUtc: string | null }) => r.state !== "Canceled" && r.cancelledUtc === null;

/**
 * The booking's reservation among a customer's: same customer, room type and stay (local dates of
 * the scheduled start and end in the enterprise timezone). `reservations/getAll/2023-06-06` does not
 * return Notes, so the booking id in the Notes cannot be matched; the customer is created per booking,
 * which makes customer + room type + dates specific to it.
 */
function matchesBooking(
  r: MewsReservation,
  want: { customerId: string; roomTypeId: string; checkin: string; checkout: string; timeZone: string },
): boolean {
  if (!isActive(r)) return false;
  if (r.customerId !== null && r.customerId !== want.customerId) return false;
  if (r.roomTypeId !== want.roomTypeId || !r.scheduledStartUtc || !r.scheduledEndUtc) return false;
  const start = Date.parse(r.scheduledStartUtc);
  const end = Date.parse(r.scheduledEndUtc);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return localDate(Math.floor(start / 1000), want.timeZone) === want.checkin && localDate(Math.floor(end / 1000), want.timeZone) === want.checkout;
}

/** A confirm attempt holds the booking's Mews lock this long (a crashed attempt frees it by expiry). */
export const MEWS_LOCK_SECS = 180;
/**
 * Total time one confirm attempt may spend on Mews (every call, retries and waits included), well
 * under the lock: the lock cannot expire while the attempt still runs. Also shorter than the confirm
 * margin (lifecycle.ts MEWS_CONFIRM_MARGIN_SECS), so a reservation created by an attempt that started
 * before the margin leaves time for `confirm_booking`.
 */
export const MEWS_ATTEMPT_BUDGET_MS = 60_000;
/** `reservations/add` starts only with this much of the budget left (its own 15 s timeout plus slack). */
export const MEWS_ADD_MIN_MS = 20_000;
/**
 * After a `reservations/add` that may have been applied (timeout, network, 5xx), no new attempt for
 * this long: Mews lists a new reservation by customer only after a short delay (seen on the demo),
 * and the retry must find it rather than create a second one.
 */
export const MEWS_AMBIGUOUS_COOLDOWN_SECS = 120;
/**
 * A cancel trusts "this customer has no reservation" only this long after the customer was created:
 * by then any attempt that could have used it has ended (lock) and Mews lists what it created.
 */
export const MEWS_CUSTOMER_GRACE_SECS = MEWS_LOCK_SECS;

/** Takes the booking's Mews lock; null while another attempt holds it (or during a cool-down). */
async function takeLock(db: Db, bookingId: string, now: number): Promise<number | null> {
  const until = now + MEWS_LOCK_SECS;
  const result = await db
    .update(bookings)
    .set({ mews_lock_until: until })
    .where(and(eq(bookings.id, bookingId), or(isNull(bookings.mews_lock_until), lte(bookings.mews_lock_until, now))));
  // The value identifies this holder: a later holder can only take it at or after `until`, and sets a larger one.
  return result.rowsAffected === 1 ? until : null;
}

/** Compare-and-set: releases (or turns into a cool-down) only the lock this attempt took. */
async function releaseLock(db: Db, bookingId: string, lock: number, next: number | null): Promise<void> {
  await db
    .update(bookings)
    .set({ mews_lock_until: next })
    .where(and(eq(bookings.id, bookingId), eq(bookings.mews_lock_until, lock)));
}

/** A write that may have been applied although no answer came back. */
const ambiguous = (e: unknown) =>
  !(e instanceof MewsError) || e.kind === "timeout" || e.kind === "network" || e.kind === "invalid_response" || (e.status ?? 0) >= 500;

/** Mews refused on a business rule (docs "Responses": 403 = server-side validation): nothing was applied. */
const refusedByMews = (e: unknown) => e instanceof MewsError && e.kind === "http" && e.status === 403;

export interface EnsureMewsOptions {
  /** Total time budget of this attempt (default {@link MEWS_ATTEMPT_BUDGET_MS}). */
  budgetMs?: number;
}

/**
 * Makes sure the booking has its Confirmed Mews reservation (CheckOverbooking, no email to the
 * guest, notes "Prepaid in USDC via Stumari, booking …, tx …"). One attempt at a time per booking
 * (`mews_lock_until`), so the relay's confirm and the cron's never race; each attempt ends within
 * its time budget. If the booking was cancelled or voided meanwhile, a reservation that was just
 * created is cancelled right away. Never throws.
 */
export async function ensureMewsReservation(db: Db, record: BookingRecord, port: MewsPort | null, opts: EnsureMewsOptions = {}): Promise<MewsReserveOutcome> {
  const id = record.booking.id;
  const existing = await db.query.bookings.findFirst({ where: eq(bookings.id, id), columns: { mews_reservation_id: true } });
  if (!existing) return { kind: "retry", reason: "booking not found" };
  if (existing.mews_reservation_id) return { kind: "reserved", reservationId: existing.mews_reservation_id };
  if (!port) return { kind: "retry", reason: "Mews is not configured (MEWS_CLIENT_TOKEN / MEWS_ACCESS_TOKEN)" };
  const mapping = mewsMapping(record.hotel, record.roomType);
  if (!mapping) return { kind: "retry", reason: "hotel service/rate or room type is not mapped to Mews" };
  const lock = await takeLock(db, id, wallNow());
  if (lock === null) return { kind: "retry", reason: "another attempt is in progress or cooling down" };

  const budgetMs = opts.budgetMs ?? MEWS_ATTEMPT_BUDGET_MS;
  const attempt: Attempt = { lock, deadlineMs: Date.now() + budgetMs, signal: AbortSignal.timeout(budgetMs), ambiguous: false };
  let outcome: MewsReserveOutcome;
  try {
    outcome = await reserve(db, record, port, mapping, attempt);
  } catch (e) {
    outcome = { kind: "retry", reason: describe(e) };
  }
  try {
    await releaseLock(db, id, lock, attempt.ambiguous ? wallNow() + MEWS_AMBIGUOUS_COOLDOWN_SECS : null);
  } catch (e) {
    console.warn(`releasing the Mews lock of booking ${id} failed (it expires by itself): ${describe(e)}`);
  }
  if (outcome.kind === "reserved") await settleIfExited(db, id, port);
  return outcome;
}

interface Attempt {
  /** The lock value this attempt set. */
  lock: number;
  /** Wall-clock ms by which the attempt must be done. */
  deadlineMs: number;
  /** Aborts every Mews call at the deadline. */
  signal: AbortSignal;
  /** Set when `reservations/add` may have been applied without an answer (then a cool-down follows). */
  ambiguous: boolean;
}

/** A reservation created while the booking was cancelled/voided is cancelled at once (the cron retries on failure). */
async function settleIfExited(db: Db, bookingId: string, port: MewsPort): Promise<void> {
  const row = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), columns: { status: true } });
  if (row?.status === "cancelled" || row?.status === "voided") await settleMewsAfterExit(db, bookingId, () => port);
}

/** Why `reservations/add` must not start now, or null when it may. */
async function addBlocked(db: Db, bookingId: string, attempt: Attempt): Promise<string | null> {
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { mews_lock_until: true, status: true, mews_reservation_id: true },
  });
  if (!row || row.mews_lock_until !== attempt.lock) return "this attempt no longer holds the booking's Mews lock";
  if (row.status !== "pending") return `the booking is ${row.status}, not pending`;
  if (row.mews_reservation_id) return "the booking already has a Mews reservation";
  if (Date.now() + MEWS_ADD_MIN_MS > attempt.deadlineMs) return "the attempt's time budget is nearly spent; the next run continues";
  if (attempt.lock * 1000 <= attempt.deadlineMs) return "the lock would expire before the attempt ends";
  return null;
}

async function reserve(
  db: Db,
  record: BookingRecord,
  port: MewsPort,
  mapping: NonNullable<ReturnType<typeof mewsMapping>>,
  attempt: Attempt,
): Promise<MewsReserveOutcome> {
  const { hotel } = record;
  const { signal } = attempt;
  // Always the stored row, read under the lock: the caller's copy may predate an earlier attempt.
  const row = (await db.query.bookings.findFirst({ where: eq(bookings.id, record.booking.id) }))!;
  if (row.mews_reservation_id) return { kind: "reserved", reservationId: row.mews_reservation_id };
  if (row.status !== "pending") return { kind: "retry", reason: `the booking is ${row.status}, not pending: no reservation is created` };
  const stay = { checkin: row.checkin_date, checkout: row.checkout_date };
  const freeNights = async () => (await mewsFreeByRoomType(port, hotel, stay, { signal })).get(mapping.mewsRoomTypeId) ?? [];

  const setup = await port.getSetup(mapping.serviceId, { signal });
  if (setup.timeZone !== hotel.timezone) {
    return { kind: "retry", reason: `Mews enterprise timezone ${setup.timeZone} differs from the hotel's ${hotel.timezone}` };
  }
  const ours = (list: MewsReservation[], customerId: string) =>
    list.find((r) => matchesBooking(r, { customerId, roomTypeId: mapping.mewsRoomTypeId, ...stay, timeZone: setup.timeZone }));

  if (row.mews_customer_id) {
    const list = await port.reservationsOfCustomer(row.mews_customer_id, { signal });
    const found = ours(list, row.mews_customer_id);
    if (found) {
      await storeReservation(db, row.id, found.id, { number: found.number, recovered: true });
      return { kind: "reserved", reservationId: found.id };
    }
    const others = list.filter(isActive);
    if (others.length > 0) {
      // The booking's own customer holds a reservation that is not this stay (changed in Mews?).
      // Never add a second one; the deadline void refunds the guest and Cancel removes it.
      return { kind: "retry", reason: `Mews customer ${row.mews_customer_id} has ${others.length} active reservation(s) that do not match this booking; not creating another` };
    }
  }
  const free = await freeNights();
  if (minFree(free) < 1) {
    if (!row.mews_customer_id) return { kind: "unavailable", free };
    // An earlier attempt got as far as the customer: "no room" may be our own reservation that Mews
    // does not list by customer yet. Only after the grace period is "none listed" trusted.
    const settled = row.mews_customer_at !== null && wallNow() - row.mews_customer_at >= MEWS_CUSTOMER_GRACE_SECS;
    return settled ? { kind: "unavailable", free } : { kind: "retry", reason: "no free unit, and an earlier attempt may still show up" };
  }

  let customerId = row.mews_customer_id;
  if (!customerId) {
    customerId = await port.addCustomer(mewsGuest(row, port.production), { signal });
    await db.update(bookings).set({ mews_customer_id: customerId, mews_customer_at: wallNow(), updated_at: wallNow() }).where(eq(bookings.id, row.id));
  }
  const { adults, children } = await partyOf(db, row.quote_id);
  const blocked = await addBlocked(db, row.id, attempt);
  if (blocked) return { kind: "retry", reason: blocked };
  let created;
  try {
    created = await port.addReservation(
      setup,
      customerId,
      {
        roomTypeId: mapping.mewsRoomTypeId,
        rateId: mapping.rateId,
        checkin: row.checkin_date,
        checkout: row.checkout_date,
        adults,
        children,
        notes: mewsNotes(row, port.production),
      },
      { signal },
    );
  } catch (e) {
    if (ambiguous(e)) {
      attempt.ambiguous = true;
      throw e;
    }
    if (refusedByMews(e)) {
      // A business rule refused the stay (no room, minimum stay, closed to arrival, …) and nothing was
      // applied. Unless the customer already has this stay, retrying for hours cannot help: void now.
      const found = ours(await port.reservationsOfCustomer(customerId, { signal }), customerId);
      if (found) {
        await storeReservation(db, row.id, found.id, { number: found.number, recovered: true });
        return { kind: "reserved", reservationId: found.id };
      }
      const after = await freeNights().catch(() => [] as number[]);
      return { kind: "unavailable", free: after, refusal: describe(e) };
    }
    // Other refusals (400, 404, 409, …): no room after all is still a clear answer.
    const after = await freeNights();
    if (minFree(after) < 1) return { kind: "unavailable", free: after, refusal: describe(e) };
    throw e;
  }
  // Mews has the reservation now: if storing its id fails, the lock must still cool down so a follow-up
  // attempt finds it through the customer instead of adding a second one within the listing delay.
  attempt.ambiguous = true;
  await storeReservation(db, row.id, created.reservationId, { number: created.number, state: created.state });
  attempt.ambiguous = false;
  return { kind: "reserved", reservationId: created.reservationId };
}

/**
 * After a Mews-linked booking is cancelled or voided on-chain: cancel its Mews reservation
 * (PostCancellationFee false, SendEmail false), or the ones its stored customer turns out to have.
 * Released/resolved bookings keep theirs (the guest stayed). Sets `mews_cancelled_at` once done.
 * Returns "failed" (the sync cron retries) on errors, and while the answer could still change: a
 * confirm attempt holds the lock (its `reservations/add` may be in flight, or cooling down), or only
 * a customer is stored, Mews lists nothing for it, and it was created less than
 * {@link MEWS_CUSTOMER_GRACE_SECS} ago. Never throws.
 */
export async function settleMewsAfterExit(db: Db, bookingId: string, getPort: () => MewsPort | null): Promise<"settled" | "skipped" | "failed"> {
  const row = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: {
      id: true,
      status: true,
      mews_customer_id: true,
      mews_customer_at: true,
      mews_reservation_id: true,
      mews_cancelled_at: true,
      mews_lock_until: true,
    },
  });
  if (!row || (row.status !== "cancelled" && row.status !== "voided")) return "skipped";
  if (row.mews_cancelled_at !== null || (!row.mews_reservation_id && !row.mews_customer_id)) return "skipped";
  const now = wallNow();
  // A confirm attempt is running or cooling down: its reservation may appear any moment. The attempt
  // cancels what it creates for an exited booking itself; otherwise the next cron run does.
  if (row.mews_lock_until !== null && row.mews_lock_until > now) return "failed";
  const port = getPort();
  if (!port) {
    console.warn(`booking ${bookingId} has a Mews reservation to cancel, but Mews is not configured`);
    return "failed";
  }
  const notes = `Stumari booking ${bookingId} ${row.status === "voided" ? "voided (guest refunded in full)" : "cancelled by the guest"}`;
  try {
    let ids: string[];
    if (row.mews_reservation_id) {
      ids = [row.mews_reservation_id];
    } else {
      // The customer is this booking's own profile, so every active reservation it has is this booking's.
      ids = (await port.reservationsOfCustomer(row.mews_customer_id!)).filter(isActive).map((r) => r.id);
      const young = row.mews_customer_at !== null && now - row.mews_customer_at < MEWS_CUSTOMER_GRACE_SECS;
      if (ids.length === 0 && young) return "failed";
    }
    for (const id of ids) {
      try {
        await port.cancelReservation(id, notes);
      } catch (e) {
        // Already cancelled in Mews (e.g. by the hotel)? Then there is nothing left to do.
        const known = row.mews_customer_id ? await port.reservationsOfCustomer(row.mews_customer_id) : [];
        const found = known.find((r) => r.id === id);
        if (!found || isActive(found)) throw e;
      }
    }
    // Only if nothing stored a reservation meanwhile; otherwise the next run cancels that one too.
    const marked = await db
      .update(bookings)
      .set({ mews_cancelled_at: wallNow() })
      .where(
        and(
          eq(bookings.id, bookingId),
          isNull(bookings.mews_cancelled_at),
          row.mews_reservation_id ? eq(bookings.mews_reservation_id, row.mews_reservation_id) : isNull(bookings.mews_reservation_id),
        ),
      );
    if (marked.rowsAffected !== 1) return "failed";
    await event(db, bookingId, "mews_cancelled", { reservation_ids: ids });
    return "settled";
  } catch (e) {
    console.warn(`Mews cancel for booking ${bookingId} failed (the sync cron retries): ${describe(e)}`);
    return "failed";
  }
}

/** Cancelled/voided bookings whose Mews side is not settled yet (sync cron). */
export async function unsettledMewsExits(db: Db, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ["cancelled", "voided"]),
        isNull(bookings.mews_cancelled_at),
        or(isNotNull(bookings.mews_reservation_id), isNotNull(bookings.mews_customer_id)),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
