import { randomUUID } from "node:crypto";
import { and, eq, gt, min, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rateEvents, type RateBucket } from "./db/schema";

export type RateLimit = { bucket: RateBucket; limit: number; windowSecs: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSecs: number };

/** POST /api/applications: 5 per ip_hash per 10 minutes. */
export const APPLY_LIMIT: RateLimit = { bucket: "apply", limit: 5, windowSecs: 600 };

/**
 * Records one event for `key` if fewer than `limit` exist in the sliding window.
 * Persisted in `rate_events` (serverless-safe). The count and the insert are one
 * SQL statement, so concurrent requests cannot both take the last slot and no
 * interactive transaction is needed (local SQLite would answer SQLITE_BUSY).
 */
export async function consumeRateLimit(
  db: Db,
  { bucket, limit, windowSecs }: RateLimit,
  key: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<RateLimitResult> {
  const windowStart = now - windowSecs;
  const inserted = await db.run(sql`
    INSERT INTO ${rateEvents} (id, bucket, key, created_at)
    SELECT ${randomUUID()}, ${bucket}, ${key}, ${now}
    WHERE (
      SELECT COUNT(*) FROM ${rateEvents}
      WHERE bucket = ${bucket} AND key = ${key} AND created_at > ${windowStart}
    ) < ${limit}
  `);
  if (inserted.rowsAffected === 1) return { ok: true };

  const [row] = await db
    .select({ oldest: min(rateEvents.created_at) })
    .from(rateEvents)
    .where(and(eq(rateEvents.bucket, bucket), eq(rateEvents.key, key), gt(rateEvents.created_at, windowStart)));
  const oldest = row?.oldest ?? now;
  return { ok: false, retryAfterSecs: Math.max(1, oldest + windowSecs - now) };
}
