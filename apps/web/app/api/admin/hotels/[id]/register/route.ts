import { findHotel, registerHotel } from "@/lib/admin/hotels";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Payout ATA + `register_hotel` (idempotent), then status `active`. */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]/register">) => {
  await requireSession(request, "admin");
  const c = await chain();
  const db = getDb();
  const hotel = await findHotel(db, (await ctx.params).id);
  return Response.json(await registerHotel(c, db, hotel, Math.floor(Date.now() / 1000)));
});
