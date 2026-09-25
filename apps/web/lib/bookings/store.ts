import { randomUUID } from "node:crypto";
import { matchTemplate, type QuoteBody } from "@stumari/core";
import type { BookingView as ChainBooking } from "@stumari/escrow-client";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { CREATE_GRACE_SECS } from "../inventory/occupancy";
import { bookingEvents, bookings, hotels, quotes, roomTypes } from "../db/schema";
import type { BookingRecord, BookingRow, BookingStatus } from "./view";

export async function loadBookingRecord(db: Db, id: string): Promise<BookingRecord | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const [row] = await db
    .select({ booking: bookings, hotel: hotels, roomType: roomTypes })
    .from(bookings)
    .innerJoin(hotels, eq(hotels.id, bookings.hotel_id))
    .innerJoin(roomTypes, eq(roomTypes.id, bookings.room_type_id))
    .where(eq(bookings.id, id));
  return row ?? null;
}

export async function loadWalletBookings(db: Db, wallet: string): Promise<BookingRecord[]> {
  return db
    .select({ booking: bookings, hotel: hotels, roomType: roomTypes })
    .from(bookings)
    .innerJoin(hotels, eq(hotels.id, bookings.hotel_id))
    .innerJoin(roomTypes, eq(roomTypes.id, bookings.room_type_id))
    .where(and(eq(bookings.guest_wallet, wallet), inArray(bookings.status, VISIBLE_TO_WALLET)))
    .orderBy(desc(bookings.checkin_date));
}

/** A wallet's list skips attempts that never reached the chain. */
const VISIBLE_TO_WALLET: BookingStatus[] = ["pending", "confirmed", "cancelled", "released", "disputed", "resolved", "voided"];

const TERMINAL = new Set<BookingStatus>(["cancelled", "released", "resolved", "voided"]);
export const isTerminal = (s: BookingStatus) => TERMINAL.has(s) || s === "failed";

/** A signature to record with the chain state it produced. */
export type SigField = "create_sig" | "confirm_sig" | "final_sig";


/**
 * Mirrors the on-chain Booking into the DB row (the chain is the source of truth for money and
 * status) and records one event per status change. `account === null` means the account does not
 * exist: an `awaiting_signature` booking whose quote can no longer land becomes `failed`.
 */
export async function applyChainState(
  db: Db,
  row: BookingRow,
  account: ChainBooking | null,
  sig?: { field: SigField; value: string },
): Promise<BookingRow> {
  // DB timestamps are wall-clock time, even when a surfnet's chain clock runs ahead.
  const now = Math.floor(Date.now() / 1000);
  const events: (typeof bookingEvents.$inferInsert)[] = [];
  const event = (type: (typeof bookingEvents.$inferInsert)["type"], s: string | null, data?: Record<string, unknown>) =>
    events.push({ id: randomUUID(), booking_id: row.id, type, sig: s, data: data ?? null, created_at: now });

  let next: BookingRow;
  if (!account) {
    if (row.status !== "awaiting_signature") return row;
    const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, row.quote_id), columns: { expires_at: true } });
    if (!quote || quote.expires_at + CREATE_GRACE_SECS > now) return row;
    next = { ...row, status: "failed", updated_at: now };
    event("failed", null);
  } else {
    const status = account.status;
    const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, row.quote_id), columns: { body: true } });
    const option = (quote?.body as QuoteBody | undefined)?.options?.[account.optionIndex];
    const terminal = TERMINAL.has(status);
    next = {
      ...row,
      status,
      option_index: account.optionIndex,
      option_id: option?.id ?? matchTemplate(account.tiers) ?? "custom",
      amount_minor: account.amount.toString(),
      tiers: account.tiers,
      fee_bps: account.feeBps,
      hotel_authority: account.hotelAuthority,
      // The chain decides who paid (a second /pay with another payer may have been the one that landed).
      guest_wallet: account.guest,
      booking_pda: account.address,
      checkin_ts: Number(account.checkinTs),
      checkout_ts: Number(account.checkoutTs),
      confirm_deadline_ts: Number(account.confirmDeadlineTs),
      release_after_ts: Number(account.releaseAfterTs),
      refund_minor: terminal ? account.refundAmount.toString() : null,
      hotel_minor: terminal ? account.hotelAmount.toString() : null,
      fee_minor: terminal ? account.feeAmount.toString() : null,
      updated_at: now,
    };
    // Each column is written once, and only when the chain shows that step happened.
    const stepDone = sig?.field === "final_sig" ? terminal : sig?.field === "confirm_sig" ? status !== "pending" : true;
    if (sig && stepDone && !next[sig.field]) next[sig.field] = sig.value;
    if (row.status === "awaiting_signature" || row.status === "failed") event("created", next.create_sig);
    if (status !== row.status && status !== "pending") {
      event(status, status === "confirmed" ? next.confirm_sig : next.final_sig, terminal ? {
        refund_minor: next.refund_minor,
        hotel_minor: next.hotel_minor,
        fee_minor: next.fee_minor,
      } : undefined);
    }
  }

  if (sameExceptUpdatedAt(next, row)) return row;
  const writes = [
    db.update(bookings).set(next).where(eq(bookings.id, row.id)),
    ...(account ? [db.update(quotes).set({ status: "used" }).where(eq(quotes.id, row.quote_id))] : []),
    ...(events.length > 0 ? [db.insert(bookingEvents).values(events)] : []),
  ];
  const [first, ...rest] = writes;
  await db.batch([first!, ...rest]);
  return next;
}

function sameExceptUpdatedAt(a: BookingRow, b: BookingRow): boolean {
  return JSON.stringify({ ...a, updated_at: 0 }) === JSON.stringify({ ...b, updated_at: 0 });
}

/** Logs a calendar conflict once per booking (the dashboard and admin show it). */
export async function recordSyncConflict(db: Db, bookingId: string, data: Record<string, unknown>): Promise<void> {
  const existing = await db.query.bookingEvents.findFirst({
    where: and(eq(bookingEvents.booking_id, bookingId), eq(bookingEvents.type, "sync_conflict")),
    columns: { id: true },
  });
  if (existing) return;
  await db.insert(bookingEvents).values({ id: randomUUID(), booking_id: bookingId, type: "sync_conflict", sig: null, data, created_at: Math.floor(Date.now() / 1000) });
}
