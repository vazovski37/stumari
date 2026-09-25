import type { NextRequest } from "next/server";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { bookingTxRequest, prepareBookingTx } from "@/lib/bookings/actions";
import { getDb } from "@/lib/db";
import { txLimits } from "@/lib/rate-limit";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";

/** Builds a guest-signed cancel / dispute / void transaction (the operator pays the fee). */
export const POST = handler(async (request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/tx">) => {
  const input = await readJson(request, bookingTxRequest);
  const c = await chain();
  const db = getDb();
  // The wallet budget is per (IP, wallet): `wallet` is only checked against the booking's guest
  // later, so a stranger naming it must not be able to spend the guest's budget.
  await enforceRateLimits(db, txLimits(requestIpHash(request), input.wallet), "transactions");
  return Response.json(await prepareBookingTx(c, db, (await ctx.params).id, input));
});
