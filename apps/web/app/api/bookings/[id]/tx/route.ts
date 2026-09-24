import type { NextRequest } from "next/server";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { bookingTxRequest, prepareBookingTx } from "@/lib/bookings/actions";
import { getDb } from "@/lib/db";
import { TX_IP_LIMIT, TX_WALLET_LIMIT } from "@/lib/rate-limit";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";

/** Builds a guest-signed cancel / dispute / void transaction (the operator pays the fee). */
export const POST = handler(async (request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/tx">) => {
  const input = await readJson(request, bookingTxRequest);
  const c = await chain();
  const db = getDb();
  await enforceRateLimits(
    db,
    [
      [TX_IP_LIMIT, `ip:${requestIpHash(request)}`],
      [TX_WALLET_LIMIT, `wallet:${input.wallet}`],
    ],
    "transactions",
  );
  return Response.json(await prepareBookingTx(c, db, (await ctx.params).id, input));
});
