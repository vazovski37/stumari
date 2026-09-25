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
/**
 * POST /api/quotes/{id}/pay, keyed `ip:` and `ip:…:wallet:` (security.md: operator SOL drain).
 * The wallet is not proven when the limit is consumed, so its budget is per (IP, wallet): a
 * stranger naming a victim's wallet spends only their own.
 */
export const PAY_IP_LIMIT: RateLimit = { bucket: "pay", limit: 30, windowSecs: 600 };
export const PAY_WALLET_LIMIT: RateLimit = { bucket: "pay", limit: 20, windowSecs: 600 };
/** POST /api/bookings/{id}/tx and /api/tx/send (wallet budget per (IP, wallet), as for /pay). */
export const TX_IP_LIMIT: RateLimit = { bucket: "tx", limit: 60, windowSecs: 600 };
export const TX_WALLET_LIMIT: RateLimit = { bucket: "tx", limit: 30, windowSecs: 600 };
/** POST /api/demo/faucet: 3 per wallet and 10 per IP per hour (api.md). */
export const FAUCET_WALLET_LIMIT: RateLimit = { bucket: "faucet", limit: 3, windowSecs: 3600 };
export const FAUCET_IP_LIMIT: RateLimit = { bucket: "faucet", limit: 10, windowSecs: 3600 };

/**
 * Demo mode only (security.md: operator SOL drain): every new `create_booking` build leaves the
 * operator paying Booking rent it never gets back, and every faucet call pays fees and ATA rent.
 * Daily caps per IP and for the whole deployment (key `global`).
 */
export const PAY_DAILY_IP_LIMIT: RateLimit = { bucket: "pay_daily", limit: 20, windowSecs: 86_400 };
export const PAY_DAILY_GLOBAL_LIMIT: RateLimit = { bucket: "pay_daily", limit: 300, windowSecs: 86_400 };
export const FAUCET_DAILY_GLOBAL_LIMIT: RateLimit = { bucket: "faucet_daily", limit: 200, windowSecs: 86_400 };
export const GLOBAL_KEY = "global";

/** The (IP, wallet) key of a wallet-scoped budget. */
export const ipWalletKey = (ipHash: string, wallet: string) => `ip:${ipHash}:wallet:${wallet}`;

/** `/pay` limits in consumption order: the caller's IP, then its (IP, payer) budget. */
export function payLimits(ipHash: string, payer: string): [RateLimit, string][] {
  return [
    [PAY_IP_LIMIT, `ip:${ipHash}`],
    [PAY_WALLET_LIMIT, ipWalletKey(ipHash, payer)],
  ];
}

/** `/bookings/{id}/tx` limits in consumption order: the caller's IP, then its (IP, wallet) budget. */
export function txLimits(ipHash: string, wallet: string): [RateLimit, string][] {
  return [
    [TX_IP_LIMIT, `ip:${ipHash}`],
    [TX_WALLET_LIMIT, ipWalletKey(ipHash, wallet)],
  ];
}
/** GET /api/auth/nonce: 20 per IP per 10 minutes. */
export const NONCE_LIMIT: RateLimit = { bucket: "nonce", limit: 20, windowSecs: 600 };

/** Dashboard "Sync now" (outbound iCal fetches): 10 per hotel per 10 minutes. */
export const SYNC_LIMIT: RateLimit = { bucket: "sync", limit: 10, windowSecs: 600 };
/** Longest window above; the sync cron deletes older events. */
export const RATE_EVENT_RETENTION_SECS = 86_400;

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
