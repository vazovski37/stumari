import { after, type NextRequest } from "next/server";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { autoConfirm } from "@/lib/bookings/lifecycle";
import { relay, sendRequest } from "@/lib/bookings/relay";
import { getDb } from "@/lib/db";
import { TX_IP_LIMIT } from "@/lib/rate-limit";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Relays a wallet-signed transaction we built; after a payment lands, confirms it in the background. */
export const POST = handler(async (request: NextRequest) => {
  const { tx } = await readJson(request, sendRequest);
  const c = await chain();
  const db = getDb();
  await enforceRateLimits(db, [[TX_IP_LIMIT, `ip:${requestIpHash(request)}`]], "transactions");
  const { signature, row, booking } = await relay(c, db, tx);
  if (row.action === "create") after(() => autoConfirm(c, db, row.booking_id));
  return Response.json({ signature, booking });
});
