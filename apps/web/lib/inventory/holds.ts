import { sql } from "drizzle-orm";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { unitFreeSql } from "./occupancy";

/** The quote row written together with its hold; the unit is chosen by the statement itself. */
export interface QuoteHoldRow {
  id: string;
  hotel_id: string;
  room_type_id: string;
  checkin_date: string;
  checkout_date: string;
  body: unknown;
  signature: string;
  hash: string;
  explain: unknown;
  booking_id: string;
  buyer_type: "guest" | "agent";
  buyer_wallet: string | null;
  client_id: string;
  ip_hash: string | null;
  expires_at: number;
  created_at: number;
}

const BUSY_RETRIES = 6;

/**
 * Active, unexpired holds one `ip_hash` may keep for other hold owners at once (security.md:
 * a cookie-less client gets a fresh owner per request, so the owner alone cannot bound holds).
 */
export const MAX_HOLDS_PER_IP = 2;

function isBusy(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "SQLITE_BUSY" || e?.cause?.code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/.test(String(error));
}

/**
 * Inserts the quote holding the free unit with the lowest label, and expires the client's other
 * active quotes (one hold per client) — one atomic batch, no interactive transaction. Returns the
 * held unit, or null when no unit is free. The availability check and the insert are a single
 * `INSERT … SELECT`, so SQLite's write lock serializes concurrent holds: two requests can never
 * hold the same unit. `SQLITE_BUSY` from another process is retried with backoff.
 *
 * The same statement caps the caller's IP at `MAX_HOLDS_PER_IP` holds of other owners (the
 * caller's own active quotes do not count: this batch expires them); over it, 429 HOLD_LIMIT.
 */
export async function insertQuoteHold(db: Db, q: QuoteHoldRow, now: number = q.created_at): Promise<string | null> {
  const stay = { checkin: q.checkin_date, checkout: q.checkout_date };
  const ipHolds = sql`FROM quotes iq WHERE iq.ip_hash = ${q.ip_hash} AND iq.status = 'active'
    AND iq.expires_at > ${now} AND iq.client_id != ${q.client_id}`;
  const ipGuard = q.ip_hash === null ? sql`` : sql` AND (SELECT COUNT(*) ${ipHolds}) < ${MAX_HOLDS_PER_IP}`;
  const ipUsage =
    q.ip_hash === null
      ? sql`SELECT 0 AS n, NULL AS first_expiry`
      : sql`SELECT COUNT(*) AS n, MIN(iq.expires_at) AS first_expiry ${ipHolds}`;
  const insert = sql`
    INSERT INTO quotes (id, hotel_id, room_type_id, room_id, checkin_date, checkout_date, body, signature, hash,
      explain, booking_id, buyer_type, buyer_wallet, client_id, ip_hash, status, expires_at, created_at)
    SELECT ${q.id}, ${q.hotel_id}, ${q.room_type_id}, r.id, ${q.checkin_date}, ${q.checkout_date},
      ${JSON.stringify(q.body)}, ${q.signature}, ${q.hash}, ${JSON.stringify(q.explain)}, ${q.booking_id},
      ${q.buyer_type}, ${q.buyer_wallet}, ${q.client_id}, ${q.ip_hash}, 'active', ${q.expires_at}, ${q.created_at}
    FROM rooms r
    WHERE r.room_type_id = ${q.room_type_id} AND ${unitFreeSql(stay, now, q.client_id)}${ipGuard}
    ORDER BY r.label LIMIT 1`;
  const expireOthers = sql`
    UPDATE quotes SET status = 'expired'
    WHERE client_id = ${q.client_id} AND status = 'active' AND id != ${q.id}
      AND EXISTS (SELECT 1 FROM quotes WHERE id = ${q.id})`;
  const held = sql`SELECT room_id FROM quotes WHERE id = ${q.id}`;

  for (let attempt = 0; ; attempt++) {
    try {
      // The write comes first so the batch takes SQLite's write lock at once; the usage read after
      // it sees the same other-owner holds (this batch only adds or expires the caller's own).
      const [, , rows, usage] = await db.batch([
        db.run(insert),
        db.run(expireOthers),
        db.all<{ room_id: string }>(held),
        db.all<{ n: number; first_expiry: number | null }>(ipUsage),
      ]);
      const unit = rows[0]?.room_id ?? null;
      const { n, first_expiry } = usage[0] ?? { n: 0, first_expiry: null };
      if (unit === null && Number(n) >= MAX_HOLDS_PER_IP) {
        throw new ApiError(429, "HOLD_LIMIT", "You already hold rooms; finish or wait for those quotes to expire", {
          headers: { "retry-after": String(Math.max(1, Number(first_expiry ?? now + 1) - now)) },
        });
      }
      return unit;
    } catch (error) {
      if (!isBusy(error) || attempt >= BUSY_RETRIES) throw error;
      await new Promise((r) => setTimeout(r, 15 * 2 ** attempt + Math.random() * 15));
    }
  }
}
