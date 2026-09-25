import { localDate } from "@stumari/core";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { addManualBlock, blockRequest, hotelUnit, unitBlocks } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/dashboard/[hotelId]/units/[unitId]/blocks">;

/** Upcoming blocks of the unit (manual and imported). */
export const GET = handler(async (request: Request, ctx: Ctx) => {
  const { hotelId, unitId } = await ctx.params;
  const { hotel } = await requireSession(request, { hotelId });
  const db = getDb();
  const unit = await hotelUnit(db, hotel.id, unitId);
  return Response.json(await unitBlocks(db, unit.id, localDate(Math.floor(Date.now() / 1000), hotel.timezone)));
});

/** Adds a manual block `[start_date, end_date)`; it also appears in the unit's export feed. */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { hotelId, unitId } = await ctx.params;
  const { hotel } = await requireSession(request, { hotelId });
  const input = await readJson(request, blockRequest);
  const db = getDb();
  const unit = await hotelUnit(db, hotel.id, unitId);
  return Response.json(await addManualBlock(db, unit.id, input, Math.floor(Date.now() / 1000)), { status: 201 });
});
