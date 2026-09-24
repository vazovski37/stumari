import type { NextRequest } from "next/server";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { payRequest, preparePayment } from "@/lib/bookings/pay";
import { getDb } from "@/lib/db";
import { PAY_IP_LIMIT, PAY_WALLET_LIMIT } from "@/lib/rate-limit";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";

/** Builds the `create_booking` transaction for the wallet to sign (or returns the cached one). */
export const POST = handler(async (request: NextRequest, ctx: RouteContext<"/api/quotes/[id]/pay">) => {
  const { id } = await ctx.params;
  const input = await readJson(request, payRequest);
  const c = await chain();
  const db = getDb();
  await enforceRateLimits(
    db,
    [
      [PAY_IP_LIMIT, `ip:${requestIpHash(request)}`],
      [PAY_WALLET_LIMIT, `wallet:${input.payer}`],
    ],
    "payment attempts",
  );
  return Response.json(await preparePayment(c, db, id, input, Math.floor(Date.now() / 1000)));
});
