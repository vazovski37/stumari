import { findHotel, hotelPatch, patchHotel, serverKeysOf } from "@/lib/admin/hotels";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Details, `status` and `payout_wallet`. On a registered hotel, active ⇄ paused sends
 * `update_hotel(active)` and a new payout wallet `update_hotel(authority)` (new bookings only).
 */
export const PATCH = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]">) => {
  await requireSession(request, "admin");
  const patch = await readJson(request, hotelPatch);
  const db = getDb();
  const hotel = await findHotel(db, (await ctx.params).id);
  const result = await patchHotel(db, hotel, patch, { chain, serverKeys: serverKeysOf(serverEnv()), now: Math.floor(Date.now() / 1000) });
  return Response.json(result);
});
