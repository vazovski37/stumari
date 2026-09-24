import { sql, type SQL } from "drizzle-orm";

/**
 * data-model.md "Availability rule" as SQL fragments over a unit expression (e.g. `r.id`).
 * Dates are `YYYY-MM-DD` strings, so `[a, b)` overlaps `[c, d)` iff `a < d AND c < b`.
 */
export const OCCUPYING_STATUSES = ["pending", "confirmed", "disputed", "released", "resolved"] as const;

const statusList = sql.join(
  OCCUPYING_STATUSES.map((s) => sql`${s}`),
  sql`, `,
);

export interface StayWindow {
  checkin: string;
  checkout: string;
}

/** A `blocks` row of the unit covers a night of the stay. */
export function blockedSql(unit: SQL, { checkin, checkout }: StayWindow): SQL {
  return sql`EXISTS (SELECT 1 FROM blocks bl WHERE bl.room_id = ${unit} AND bl.start_date < ${checkout} AND bl.end_date > ${checkin})`;
}

/**
 * The status/expiry part of "occupies" for a booking aliased `b` joined to its quote `bq`:
 * pending…resolved, or awaiting_signature while its quote has not expired.
 */
export function occupiesSql(now: number): SQL {
  return sql`(b.status IN (${statusList}) OR (b.status = 'awaiting_signature' AND bq.expires_at > ${now}))`;
}

/** Another booking occupies a night of the stay on this unit (optionally ignoring one booking). */
export function bookedSql(unit: SQL, { checkin, checkout }: StayWindow, now: number, excludeBookingId?: string): SQL {
  const exclude = excludeBookingId ? sql` AND b.id != ${excludeBookingId}` : sql``;
  return sql`EXISTS (SELECT 1 FROM bookings b JOIN quotes bq ON bq.id = b.quote_id
    WHERE b.room_id = ${unit} AND b.checkin_date < ${checkout} AND b.checkout_date > ${checkin}
    AND ${occupiesSql(now)}${exclude})`;
}

/** An active, unexpired quote of another client holds the unit for a night of the stay. */
export function heldSql(unit: SQL, { checkin, checkout }: StayWindow, now: number, clientId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM quotes hq WHERE hq.room_id = ${unit} AND hq.status = 'active'
    AND hq.expires_at > ${now} AND hq.client_id != ${clientId}
    AND hq.checkin_date < ${checkout} AND hq.checkout_date > ${checkin})`;
}

/** Unit `r` (aliased) is free for the stay from the point of view of `clientId`. */
export function unitFreeSql(stay: StayWindow, now: number, clientId: string): SQL {
  const unit = sql`r.id`;
  return sql`r.active = 1 AND NOT ${blockedSql(unit, stay)} AND NOT ${bookedSql(unit, stay, now)} AND NOT ${heldSql(unit, stay, now, clientId)}`;
}
