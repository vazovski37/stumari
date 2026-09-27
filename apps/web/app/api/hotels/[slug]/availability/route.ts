import type { NextRequest } from "next/server";
import { z } from "zod";
import { existingClientId } from "@/lib/api/client";
import { ApiError, handler } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { findPublicHotel, fitsParty, parseStay, type HotelRow } from "@/lib/hotels";
import { freeUnitCounts } from "@/lib/inventory/availability";
import { isMewsHotel, mewsFreeByRoomType, minFree } from "@/lib/inventory/mews";
import { mewsPort } from "@/lib/mews/client";
import { basePriceMinor } from "@/lib/quotes/pricing";

export const runtime = "nodejs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const query = z.object({
  checkin: z.string().regex(DATE, "YYYY-MM-DD"),
  checkout: z.string().regex(DATE, "YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(20).default(0),
});

/**
 * Mews free units per Mews room type for a Mews hotel; null (no extra filter) for other hotels or
 * when Mews cannot answer — the quote re-checks and fails closed.
 */
async function mewsFree(hotel: HotelRow, stay: { checkin: string; checkout: string }) {
  const port = isMewsHotel(hotel) ? mewsPort() : null;
  if (!port) return null;
  try {
    return await mewsFreeByRoomType(port, hotel, stay);
  } catch (e) {
    console.warn(`Mews availability for hotel ${hotel.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Never holds anything; the caller's own hold does not count against them. Mews hotels also need Mews free units. */
export const GET = handler(async (request: NextRequest, ctx: RouteContext<"/api/hotels/[slug]/availability">) => {
  const q = query.parse(Object.fromEntries(request.nextUrl.searchParams));
  const db = getDb();
  const found = await findPublicHotel(db, (await ctx.params).slug);
  if (!found) throw new ApiError(404, "HOTEL_NOT_FOUND", "No such hotel");
  const now = Math.floor(Date.now() / 1000);
  const stay = parseStay(found.hotel, q.checkin, q.checkout, now);
  const free = await freeUnitCounts(db, found.hotel.id, stay, now, existingClientId(request));
  const mews = await mewsFree(found.hotel, stay);
  return Response.json(
    found.roomTypes.map((rt) => ({
      room_type_id: rt.id,
      available:
        fitsParty(rt, q.adults, q.children) &&
        (free.get(rt.id) ?? 0) > 0 &&
        (mews === null || (rt.mews_room_type_id !== null && minFree(mews.get(rt.mews_room_type_id)) > 0)),
      nights: stay.nights,
      base_price_minor: basePriceMinor(rt, stay).toString(),
    })),
  );
});
