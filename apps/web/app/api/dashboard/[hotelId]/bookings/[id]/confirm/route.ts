import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { operatorAction } from "@/lib/bookings/operator";
import { getDb } from "@/lib/db";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The operator sends `confirm_booking` (only before the confirm deadline), e.g. once a conflict is resolved. */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/bookings/[id]/confirm">) => {
  const { hotelId, id } = await ctx.params;
  const { hotel } = await requireSession(request, { hotelId });
  const row = await operatorAction(await chain(), getDb(), id, "confirm", { hotelId: hotel.id });
  return Response.json({ id: row.id, status: row.status });
});
