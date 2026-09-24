import type { NextRequest } from "next/server";
import { ApiError, handler } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { findPublicHotel, hotelProfile } from "@/lib/hotels";

export const runtime = "nodejs";

export const GET = handler(async (_request: NextRequest, ctx: RouteContext<"/api/hotels/[slug]">) => {
  const found = await findPublicHotel(getDb(), (await ctx.params).slug);
  if (!found) throw new ApiError(404, "HOTEL_NOT_FOUND", "No such hotel");
  return Response.json(hotelProfile(found.hotel, found.roomTypes));
});
