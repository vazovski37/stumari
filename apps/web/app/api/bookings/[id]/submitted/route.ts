import { after, type NextRequest } from "next/server";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { autoConfirm } from "@/lib/bookings/lifecycle";
import { recordSubmitted, submittedRequest } from "@/lib/bookings/relay";
import { getDb } from "@/lib/db";
import { TX_IP_LIMIT } from "@/lib/rate-limit";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** For wallets that only sign-and-send: record the signature and mirror the chain (idempotent). */
export const POST = handler(async (request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/submitted">) => {
  const { signature } = await readJson(request, submittedRequest);
  const c = await chain();
  const db = getDb();
  // Each call may poll the RPC for up to 20 s: same per-IP budget as relaying a transaction.
  await enforceRateLimits(db, [[TX_IP_LIMIT, `ip:${requestIpHash(request)}`]], "transactions");
  const view = await recordSubmitted(c, db, (await ctx.params).id, signature);
  if (view.status === "pending") after(() => autoConfirm(c, db, view.id));
  return Response.json(view);
});
