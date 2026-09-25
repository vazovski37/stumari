import { isCoreError, validatePolicy } from "@stumari/core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { hotels, type HotelPolicy } from "../db/schema";

/**
 * PATCH …/policy body. zod only names the fields; every rule is `@stumari/core` `validatePolicy`
 * (pricing-and-risk-model.md §5), the same function checkout prices with, so the API accepts
 * exactly the policies pricing accepts.
 */
export const policyRequest = z.object({
  enabled_templates: z.unknown(),
  reference_template: z.unknown(),
  resale_bps: z.unknown(),
  min_mult_bps: z.unknown(),
  max_mult_bps: z.unknown(),
});

/** The normalized policy, or 400 INVALID_POLICY with validatePolicy's reason. */
export function parsePolicy(input: z.output<typeof policyRequest>): HotelPolicy {
  try {
    return validatePolicy(input) as HotelPolicy;
  } catch (e) {
    if (isCoreError(e)) throw new ApiError(400, "INVALID_POLICY", e.message.slice(e.code.length + 2));
    throw e;
  }
}

export async function savePolicy(db: Db, hotelId: string, policy: HotelPolicy, now: number): Promise<void> {
  await db.update(hotels).set({ policy, updated_at: now }).where(eq(hotels.id, hotelId));
}
