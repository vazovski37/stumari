import type { Db } from "../db/client";
import { fitsParty, parseStay, type HotelRow, type RoomTypeRow } from "../hotels";
import { mewsPort } from "../mews/client";
import { basePriceMinor } from "../quotes/pricing";
import { freeUnitCounts } from "./availability";
import { isMewsHotel, mewsFreeByRoomType, minFree } from "./mews";

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

export interface AvailabilityQuery {
  checkin: string;
  checkout: string;
  adults: number;
  children: number;
}

export interface AvailabilityRow {
  room_type_id: string;
  available: boolean;
  nights: number;
  base_price_minor: string;
}

/**
 * Which of a hotel's room types are free for a stay (`GET /api/hotels/{slug}/availability` and the
 * AI concierge). Never holds anything; the caller's own hold does not count against them.
 */
export async function availabilityRows(
  db: Db,
  found: { hotel: HotelRow; roomTypes: RoomTypeRow[] },
  q: AvailabilityQuery,
  clientId: string,
  now: number,
): Promise<AvailabilityRow[]> {
  const stay = parseStay(found.hotel, q.checkin, q.checkout, now);
  const free = await freeUnitCounts(db, found.hotel.id, stay, now, clientId);
  const mews = await mewsFree(found.hotel, stay);
  return found.roomTypes.map((rt) => ({
    room_type_id: rt.id,
    available:
      fitsParty(rt, q.adults, q.children) &&
      (free.get(rt.id) ?? 0) > 0 &&
      (mews === null || (rt.mews_room_type_id !== null && minFree(mews.get(rt.mews_room_type_id)) > 0)),
    nights: stay.nights,
    base_price_minor: basePriceMinor(rt, stay).toString(),
  }));
}
