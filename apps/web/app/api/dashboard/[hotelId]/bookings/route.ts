import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { listOperatorBookings } from "@/lib/dashboard/bookings";
import { getDb } from "@/lib/db";
import { bookingStatuses } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An empty `?status=` means any status, as in the admin list.
const query = z.object({ status: z.union([z.enum(bookingStatuses), z.literal("").transform(() => undefined)]).optional() });

/** The hotel's bookings with guest contact (never public). */
export const GET = handler(async (request: NextRequest, ctx: RouteContext<"/api/dashboard/[hotelId]/bookings">) => {
  const { hotel } = await requireSession(request, { hotelId: (await ctx.params).hotelId });
  const { status } = query.parse(Object.fromEntries(request.nextUrl.searchParams));
  const list = await listOperatorBookings(getDb(), { hotelId: hotel.id, status });
  return Response.json(list, { headers: { "cache-control": "no-store" } });
});
