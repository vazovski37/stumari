import { localDate, splitRelease } from "@stumari/core";
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookingEvents, bookings, bookingStatuses, hotels, rooms, roomTypes } from "../db/schema";
import type { BookingStatus } from "../bookings/view";

/** A booking as the hotel (and admin) sees it: with the guest's contact data, never public. */
export interface OperatorBooking {
  id: string;
  hotel: { id: string; name: string };
  status: BookingStatus;
  room_type: string;
  unit: string;
  checkin_date: string;
  checkout_date: string;
  amount_minor: string;
  fee_bps: number | null;
  option_id: string;
  guest: { name: string | null; email: string | null; phone: string | null; wallet: string };
  confirm_deadline_ts: number | null;
  release_after_ts: number | null;
  settled: { refund_minor: string; hotel_minor: string; fee_minor: string } | null;
  /** A `sync_conflict` was logged: the unit's calendar overlaps this booking. */
  conflict: boolean;
  created_at: number;
}

/** Attempts that never reached the chain are hidden unless asked for by status. */
export const PAID_STATUSES: BookingStatus[] = bookingStatuses.filter((s) => s !== "awaiting_signature" && s !== "failed");

export interface BookingFilter {
  hotelId?: string;
  status?: BookingStatus;
  checkinFrom?: string;
  checkinTo?: string;
  limit?: number;
}

export async function listOperatorBookings(db: Db, f: BookingFilter): Promise<OperatorBooking[]> {
  const where: (SQL | undefined)[] = [
    f.hotelId ? eq(bookings.hotel_id, f.hotelId) : undefined,
    f.status ? eq(bookings.status, f.status) : inArray(bookings.status, PAID_STATUSES),
    f.checkinFrom ? gte(bookings.checkin_date, f.checkinFrom) : undefined,
    f.checkinTo ? lte(bookings.checkin_date, f.checkinTo) : undefined,
  ];
  const rows = await db
    .select({
      b: bookings,
      hotelName: hotels.name,
      roomType: roomTypes.name,
      unit: rooms.label,
      conflict: sql<number>`EXISTS (SELECT 1 FROM ${bookingEvents} e WHERE e.booking_id = ${bookings}.id AND e.type = 'sync_conflict')`,
    })
    .from(bookings)
    .innerJoin(hotels, eq(hotels.id, bookings.hotel_id))
    .innerJoin(roomTypes, eq(roomTypes.id, bookings.room_type_id))
    .innerJoin(rooms, eq(rooms.id, bookings.room_id))
    .where(and(...where))
    .orderBy(desc(bookings.checkin_date), desc(bookings.created_at))
    .limit(f.limit ?? 200);
  return rows.map(({ b, hotelName, roomType, unit, conflict }) => ({
    id: b.id,
    hotel: { id: b.hotel_id, name: hotelName },
    status: b.status,
    room_type: roomType,
    unit,
    checkin_date: b.checkin_date,
    checkout_date: b.checkout_date,
    amount_minor: b.amount_minor,
    fee_bps: b.fee_bps,
    option_id: b.option_id,
    guest: { name: b.guest_name, email: b.guest_email, phone: b.guest_phone, wallet: b.guest_wallet },
    confirm_deadline_ts: b.confirm_deadline_ts,
    release_after_ts: b.release_after_ts,
    settled:
      b.refund_minor !== null && b.hotel_minor !== null && b.fee_minor !== null
        ? { refund_minor: b.refund_minor, hotel_minor: b.hotel_minor, fee_minor: b.fee_minor }
        : null,
    conflict: Number(conflict) === 1,
    created_at: b.created_at,
  }));
}

export interface HotelOverview {
  counts: Partial<Record<BookingStatus, number>>;
  /** Paid bookings arriving today or later, soonest first. */
  upcoming: OperatorBooking[];
  payouts: {
    /** Paid out to the hotel: released and resolved stays plus its share of cancellations. */
    released_minor: string;
    /** Held in escrow for pending and confirmed bookings, net of the fee snapshot. */
    pending_minor: string;
    /** Held in escrow for disputed bookings (the arbiter decides the split). */
    disputed_minor: string;
  };
  /** Pending bookings whose unit's calendar overlaps them (the hotel confirms or admin voids). */
  conflicts: OperatorBooking[];
}

const UPCOMING_LIMIT = 10;

export async function hotelOverview(db: Db, hotel: { id: string; timezone: string }, now: number): Promise<HotelOverview> {
  const statusRows = await db
    .select({ status: bookings.status, n: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(eq(bookings.hotel_id, hotel.id))
    .groupBy(bookings.status);
  const counts = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)])) as HotelOverview["counts"];

  const money = await db
    .select({ status: bookings.status, amount: bookings.amount_minor, fee: bookings.fee_bps, hotelMinor: bookings.hotel_minor })
    .from(bookings)
    .where(and(eq(bookings.hotel_id, hotel.id), inArray(bookings.status, ["pending", "confirmed", "disputed", "released", "resolved", "cancelled"])));
  let released = 0n;
  let pending = 0n;
  let disputed = 0n;
  for (const m of money) {
    if (m.status === "released" || m.status === "resolved" || m.status === "cancelled") released += BigInt(m.hotelMinor ?? "0");
    else if (m.status === "disputed") disputed += BigInt(m.amount);
    else pending += splitRelease({ amount: BigInt(m.amount), feeBps: m.fee ?? 0 }).hotelNet;
  }

  const today = localDate(now, hotel.timezone);
  const active = await listOperatorBookings(db, { hotelId: hotel.id, checkinFrom: today, limit: 500 });
  const upcoming = active
    .filter((b) => b.status === "pending" || b.status === "confirmed")
    .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date))
    .slice(0, UPCOMING_LIMIT);
  const conflicts = (await listOperatorBookings(db, { hotelId: hotel.id, status: "pending" })).filter((b) => b.conflict);

  return {
    counts,
    upcoming,
    payouts: { released_minor: released.toString(), pending_minor: pending.toString(), disputed_minor: disputed.toString() },
    conflicts,
  };
}

/** Bookings of a hotel that a crank would act on now: release or void (api.md lazy crank). */
export async function dueBookings(db: Db, hotelId: string, now: number, limit: number) {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.hotel_id, hotelId),
        or(
          and(eq(bookings.status, "confirmed"), lte(bookings.release_after_ts, now)),
          and(eq(bookings.status, "pending"), lte(bookings.confirm_deadline_ts, now)),
        ),
      ),
    )
    .orderBy(asc(bookings.updated_at))
    .limit(limit);
}
