import { handler } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { requireSession } from "@/lib/auth/access";
import { syncHotel } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";
import { SYNC_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Imports every unit's calendars now; per-unit errors are returned and stored on the unit. */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/sync">) => {
  const { hotel } = await requireSession(request, { hotelId: (await ctx.params).hotelId });
  const db = getDb();
  await enforceRateLimits(db, [[SYNC_LIMIT, `hotel:${hotel.id}`]], "calendar syncs");
  const results = await syncHotel(db, hotel, Math.floor(Date.now() / 1000));
  return Response.json({ units: results.map((r) => ({ id: r.roomId, label: r.label, feeds: r.feeds, errors: r.errors })) });
});
