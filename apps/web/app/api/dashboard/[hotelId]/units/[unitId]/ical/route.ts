import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { hotelUnit, icalRequest, setImportUrls } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Replaces a unit's iCal import URLs (https, ≤ 5); the next sync applies them. */
export const PUT = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/units/[unitId]/ical">) => {
  const { hotelId, unitId } = await ctx.params;
  const { hotel } = await requireSession(request, { hotelId });
  const { import_urls } = await readJson(request, icalRequest);
  const db = getDb();
  const unit = await hotelUnit(db, hotel.id, unitId);
  await setImportUrls(db, unit.id, import_urls);
  return Response.json({ import_urls });
});
