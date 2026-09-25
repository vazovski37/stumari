import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";
import { ApiError } from "./api/errors";
import { pruneNonces } from "./auth/siws";
import { autoConfirm, crankIfDue, syncFromChain } from "./bookings/lifecycle";
import type { Db } from "./db/client";
import { bookings } from "./db/schema";
import { CRON_SYNC_MAX_AGE_SECS, staleUnits, syncUnit } from "./inventory/ical-sync";
import { expireQuotes } from "./quotes/create";
import { pruneRateEvents } from "./rate-limit";
import { chainNow } from "./solana/clock";
import type { Chain } from "./solana/context";

/** api.md "Cron": at most 20 units/bookings per call, 4 at a time. */
export const CRON_BATCH = 20;
export const CRON_CONCURRENCY = 4;

/** Runs `fn` over `items` with at most `concurrency` in flight; failures are counted, not thrown. */
export async function pool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<unknown>): Promise<{ ok: number; failed: number }> {
  let next = 0;
  let ok = 0;
  let failed = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        await fn(item);
        ok++;
      } catch (e) {
        failed++;
        console.error("cron item failed", e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { ok, failed };
}

/** `Authorization: Bearer ${CRON_SECRET}`, compared in constant time; refuses when no secret is set. */
export function authorizeCron(request: Request, secret: string | null): void {
  if (!secret) throw new ApiError(503, "CRON_NOT_CONFIGURED", "CRON_SECRET is not set");
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or wrong cron token");
  }
}

/**
 * `sync`: iCal imports for stale units, quote expiry, reconciliation of `awaiting_signature` and
 * `pending` bookings with the chain (auto-confirming pending ones without conflicts), and pruning
 * of old rate-limit events and sign-in nonces.
 */
export async function runSyncJob(c: Chain, db: Db) {
  const wallNow = Math.floor(Date.now() / 1000);
  const units = await staleUnits(db, CRON_SYNC_MAX_AGE_SECS, CRON_BATCH, wallNow);
  const synced = await pool(units, CRON_CONCURRENCY, (u) => syncUnit(db, u, u.timezone, { now: wallNow }));
  const quotesExpired = await expireQuotes(db, wallNow);

  const open = await db
    .select()
    .from(bookings)
    .where(inArray(bookings.status, ["awaiting_signature", "pending"]))
    .orderBy(asc(bookings.updated_at))
    .limit(CRON_BATCH);
  const reconciled = await pool(open, CRON_CONCURRENCY, async (row) => {
    const { row: next } = await syncFromChain(c, db, row);
    if (next.status === "pending") await autoConfirm(c, db, next.id);
  });
  // Rows the chain did not change keep their updated_at; bump it so the next run moves on to
  // other open bookings instead of re-reading the same stuck ones.
  if (open.length > 0) {
    await db
      .update(bookings)
      .set({ updated_at: wallNow })
      .where(and(inArray(bookings.id, open.map((r) => r.id)), lt(bookings.updated_at, wallNow)));
  }
  const pruned = await pruneRateEvents(db, wallNow);
  const noncesPruned = await pruneNonces(db, wallNow);
  return {
    units: synced,
    quotes_expired: quotesExpired,
    bookings: reconciled,
    rate_events_pruned: pruned,
    nonces_pruned: noncesPruned,
  };
}

/** `release`: releases confirmed bookings past `release_after_ts`; voids pending ones past the confirm deadline. */
export async function runReleaseJob(c: Chain, db: Db) {
  const now = await chainNow(c.rpc);
  const due = await db
    .select()
    .from(bookings)
    .where(
      or(
        and(eq(bookings.status, "confirmed"), lte(bookings.release_after_ts, now)),
        and(eq(bookings.status, "pending"), lte(bookings.confirm_deadline_ts, now)),
      ),
    )
    .orderBy(asc(bookings.updated_at))
    .limit(CRON_BATCH);
  const cranked = await pool(due, CRON_CONCURRENCY, async (row) => {
    const { row: synced, account } = await syncFromChain(c, db, row);
    await crankIfDue(c, db, synced, account, now);
  });
  return { bookings: cranked };
}
