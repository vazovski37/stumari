import type { Db } from "../db/client";
import { consumeRateLimit, type RateLimit } from "../rate-limit";
import { rateLimited } from "./errors";

/** Consumes each `[limit, key]` in order; throws 429 on the first that is exhausted. */
export async function enforceRateLimits(db: Db, checks: [RateLimit, string][], what: string, now?: number): Promise<void> {
  for (const [limit, key] of checks) {
    const result = await consumeRateLimit(db, limit, key, now);
    if (!result.ok) throw rateLimited(result.retryAfterSecs, what);
  }
}
