import { createRoomType, findHotel, roomTypeCreate } from "@/lib/admin/hotels";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** A room type with its nightly rate in USD base units (= USDC, 6 decimals). */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]/room-types">) => {
  await requireSession(request, "admin");
  const input = await readJson(request, roomTypeCreate);
  const db = getDb();
  const hotel = await findHotel(db, (await ctx.params).id);
  return Response.json(await createRoomType(db, hotel.id, input, Math.floor(Date.now() / 1000)), { status: 201 });
});
