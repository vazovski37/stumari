import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { deleteManualBlock, hotelUnit } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Deletes a manual block (imported ones answer 409 NOT_MANUAL). */
export const DELETE = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/units/[unitId]/blocks/[blockId]">) => {
  const { hotelId, unitId, blockId } = await ctx.params;
  const { hotel } = await requireSession(request, { hotelId });
  const db = getDb();
  const unit = await hotelUnit(db, hotel.id, unitId);
  await deleteManualBlock(db, unit.id, blockId);
  return new Response(null, { status: 204 });
});
