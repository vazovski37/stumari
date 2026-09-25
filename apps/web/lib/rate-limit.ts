import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, min, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rateEvents, type RateBucket } from "./db/schema";

export type RateLimit = { bucket: RateBucket; limit: number; windowSecs: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSecs: number };

/** POST /api/applications: 5 per ip_hash per 10 minutes. */
export const APPLY_LIMIT: RateLimit = { bucket: "apply", limit: 5, windowSecs: 600 };
/** POST /api/quotes: 10 per ip_hash per 10 minutes (data-model.md). */
export const QUOTE_LIMIT: RateLimit = { bucket: "quote", limit: 10, windowSecs: 600 };
/** POST /api/quotes/{id}/pay, keyed `ip:` and `wallet:` (security.md: operator SOL drain). */
export const PAY_IP_LIMIT: RateLimit = { bucket: "pay", limit: 30, windowSecs: 600 };
export const PAY_WALLET_LIMIT: RateLimit = { bucket: "pay", limit: 20, windowSecs: 600 };
/** POST /api/bookings/{id}/tx and /api/tx/send. */
export const TX_IP_LIMIT: RateLimit = { bucket: "tx", limit: 60, windowSecs: 600 };
export const TX_WALLET_LIMIT: RateLimit = { bucket: "tx", limit: 30, windowSecs: 600 };
/** POST /api/demo/faucet: 3 per wallet and 10 per IP per hour (api.md). */
export const FAUCET_WALLET_LIMIT: RateLimit = { bucket: "faucet", limit: 3, windowSecs: 3600 };
export const FAUCET_IP_LIMIT: RateLimit = { bucket: "faucet", limit: 10, windowSecs: 3600 };
/** GET /api/auth/nonce: 20 per IP per 10 minutes. */
export const NONCE_LIMIT: RateLimit = { bucket: "nonce", limit: 20, windowSecs: 600 };

/** Dashboard "Sync now" (outbound iCal fetches): 10 per hotel per 10 minutes. */
export const SYNC_LIMIT: RateLimit = { bucket: "sync", limit: 10, windowSecs: 600 };
/** Longest window above; the sync cron deletes older events. */
export const RATE_EVENT_RETENTION_SECS = 3600;

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

/** Deletes events older than every window (run by the sync cron). */
export async function pruneRateEvents(db: Db, now: number = Math.floor(Date.now() / 1000)): Promise<number> {
  const result = await db.delete(rateEvents).where(lt(rateEvents.created_at, now - RATE_EVENT_RETENTION_SECS));
  return result.rowsAffected;
}
