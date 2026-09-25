import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { occupiesSql, unitFreeSql, type StayWindow } from "./occupancy";

/** Free units of a room type for the stay, lowest label first (the one a quote holds). */
export async function freeUnits(
  db: Db,
  roomTypeId: string,
  stay: StayWindow,
  now: number,
  clientId: string,
): Promise<{ id: string; label: string }[]> {
  return db.all<{ id: string; label: string }>(sql`
    SELECT r.id, r.label FROM rooms r
    WHERE r.room_type_id = ${roomTypeId} AND ${unitFreeSql(stay, now, clientId)}
    ORDER BY r.label
  `);
}

/** Number of free units per active room type of a hotel. Never holds anything. */
export async function freeUnitCounts(
  db: Db,
  hotelId: string,
  stay: StayWindow,
  now: number,
  clientId: string,
): Promise<Map<string, number>> {
  const rows = await db.all<{ room_type_id: string; free: number }>(sql`
    SELECT rt.id AS room_type_id,
      (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id AND ${unitFreeSql(stay, now, clientId)}) AS free
    FROM room_types rt WHERE rt.hotel_id = ${hotelId} AND rt.active = 1
  `);
  return new Map(rows.map((r) => [r.room_type_id, Number(r.free)]));
}

export interface UnitConflicts {
  /** `blocks` rows (iCal or manual) covering a night of the stay. */
  blocks: { id: string; source: string; start_date: string; end_date: string }[];
  /** Other bookings occupying a night of the stay on the unit. */
  bookings: string[];
}

/**
 * What stands in the way of a booking on its unit (inventory-ical.md "Confirmation"). With
 * `createdBefore` (the confirm rule), an unconfirmed booking counts only if it was created
 * earlier, but a confirmed, disputed or settled one always counts, however late it was seen;
 * otherwise every other occupying booking does (the `/pay` hold check).
 */
export async function unitConflicts(
  db: Db,
  opts: {
    roomId: string;
    stay: StayWindow;
    now: number;
    bookingId: string;
    createdBefore?: { createdAt: number };
  },
): Promise<UnitConflicts> {
  const { roomId, stay, now, bookingId, createdBefore } = opts;
  const blocks = await db.all<UnitConflicts["blocks"][number]>(sql`
    SELECT bl.id, bl.source, bl.start_date, bl.end_date FROM blocks bl
    WHERE bl.room_id = ${roomId} AND bl.start_date < ${stay.checkout} AND bl.end_date > ${stay.checkin}
  `);
  const earlier = createdBefore
    ? sql` AND (b.status IN ('confirmed', 'disputed', 'released', 'resolved') OR b.created_at < ${createdBefore.createdAt} OR (b.created_at = ${createdBefore.createdAt} AND b.id < ${bookingId}))`
    : sql``;
  const bookings = await db.all<{ id: string }>(sql`
    SELECT b.id FROM bookings b JOIN quotes bq ON bq.id = b.quote_id
    WHERE b.room_id = ${roomId} AND b.id != ${bookingId}
      AND b.checkin_date < ${stay.checkout} AND b.checkout_date > ${stay.checkin}
      AND ${occupiesSql(now)}${earlier}
  `);
  return { blocks, bookings: bookings.map((b) => b.id) };
}

export const hasConflicts = (c: UnitConflicts) => c.blocks.length > 0 || c.bookings.length > 0;
