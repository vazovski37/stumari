import { sql } from "drizzle-orm";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import type { HotelRow, RoomTypeRow } from "../hotels";
import type { MewsCallOptions, MewsPort } from "../mews/client";
import { occupiesSql, type StayWindow } from "./occupancy";

/**
 * Availability of hotels whose inventory lives in Mews (docs/architecture/mews-inventory.md).
 *
 * The Stumari unit model stays: a Mews room type (resource category) maps to one Stumari room type,
 * whose units are *virtual slots*. They bound how many Stumari bookings of that room type may hold
 * a night at once (holds, pending and confirmed bookings each take a slot, as for iCal hotels); they
 * are not rooms and carry no iCal imports. On top of the slot, a stay needs Mews free units:
 *
 *   min over the stay's nights of Mews free units  >  Stumari claims on the room type not yet in Mews
 *
 * where a claim is an occupying booking without a Mews reservation (plus, for a new quote, another
 * client's active hold). A booking that has its Mews reservation is already inside the Mews count.
 * The rule is conservative (a claim on any night counts against every night); the confirm step's
 * `reservations/add` with `CheckOverbooking` is the final word.
 */

export const isMewsHotel = (hotel: Pick<HotelRow, "inventory_provider">) => hotel.inventory_provider === "mews";

export interface MewsMapping {
  serviceId: string;
  rateId: string;
  mewsRoomTypeId: string;
}

/** The hotel's Mews service/rate and the room type's Mews resource category; null when any is missing. */
export function mewsMapping(
  hotel: Pick<HotelRow, "mews_service_id" | "mews_rate_id">,
  roomType: Pick<RoomTypeRow, "mews_room_type_id">,
): MewsMapping | null {
  if (!hotel.mews_service_id || !hotel.mews_rate_id || !roomType.mews_room_type_id) return null;
  return { serviceId: hotel.mews_service_id, rateId: hotel.mews_rate_id, mewsRoomTypeId: roomType.mews_room_type_id };
}

/**
 * Mews free units for every night of the stay, per Mews room type (one `services/getAvailability`
 * call). Nights are the hotel's local dates, so the hotel timezone must equal the Mews enterprise
 * timezone (the client rejects time units that do not start at local midnight).
 */
export async function mewsFreeByRoomType(
  port: MewsPort,
  hotel: Pick<HotelRow, "mews_service_id" | "timezone">,
  stay: StayWindow,
  opts: MewsCallOptions = {},
): Promise<Map<string, number[]>> {
  if (!hotel.mews_service_id) throw new ApiError(409, "UNAVAILABLE", "This hotel is not accepting bookings yet");
  const av = await port.getAvailability({ serviceId: hotel.mews_service_id, timeZone: hotel.timezone }, stay.checkin, stay.checkout, opts);
  return new Map(av.roomTypes.map((r) => [r.roomTypeId, r.free]));
}

/** Bookable Mews units for the whole stay: the lowest nightly free count (0 when Mews does not list the room type). */
export const minFree = (free: readonly number[] | undefined) => (free && free.length > 0 ? Math.min(...free) : 0);

/**
 * Stumari's claims on a room type for the stay that Mews does not know about yet (see the rule
 * above). `holdsExceptClient`: also count other clients' active holds (a new quote); `/pay` counts
 * bookings only, like the iCal hold check.
 */
export async function claimsNotInMews(
  db: Db,
  roomTypeId: string,
  stay: StayWindow,
  now: number,
  opts: { excludeBookingId?: string; excludeQuoteId?: string; holdsExceptClient?: string } = {},
): Promise<number> {
  const excludeBooking = opts.excludeBookingId ? sql` AND b.id != ${opts.excludeBookingId}` : sql``;
  const bookings = await db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM bookings b JOIN quotes bq ON bq.id = b.quote_id
    WHERE b.room_type_id = ${roomTypeId} AND b.checkin_date < ${stay.checkout} AND b.checkout_date > ${stay.checkin}
      AND b.mews_reservation_id IS NULL AND ${occupiesSql(now)}${excludeBooking}
  `);
  let holds = 0;
  if (opts.holdsExceptClient !== undefined) {
    const excludeQuote = opts.excludeQuoteId ? sql` AND hq.id != ${opts.excludeQuoteId}` : sql``;
    const rows = await db.all<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM quotes hq
      WHERE hq.room_type_id = ${roomTypeId} AND hq.status = 'active' AND hq.expires_at > ${now}
        AND hq.client_id != ${opts.holdsExceptClient}
        AND hq.checkin_date < ${stay.checkout} AND hq.checkout_date > ${stay.checkin}
        AND NOT EXISTS (SELECT 1 FROM bookings hb WHERE hb.quote_id = hq.id)${excludeQuote}
    `);
    holds = Number(rows[0]?.n ?? 0);
  }
  return Number(bookings[0]?.n ?? 0) + holds;
}

export interface MewsStayCheck {
  /** Lowest nightly Mews free count for the stay. */
  free: number;
  /** Stumari claims not yet in Mews. */
  claims: number;
  available: boolean;
}

/**
 * The rule above for one room type and stay. Throws ApiError 409 UNAVAILABLE when the hotel or room
 * type is not mapped to Mews, and passes Mews/network errors through (callers decide fail-open or closed).
 */
export async function checkMewsStay(
  db: Db,
  port: MewsPort,
  hotel: HotelRow,
  roomType: RoomTypeRow,
  stay: StayWindow,
  now: number,
  opts: Parameters<typeof claimsNotInMews>[4] = {},
): Promise<MewsStayCheck> {
  const mapping = mewsMapping(hotel, roomType);
  if (!mapping) throw new ApiError(409, "UNAVAILABLE", `${roomType.name} is not bookable online yet`);
  const free = minFree((await mewsFreeByRoomType(port, hotel, stay)).get(mapping.mewsRoomTypeId));
  const claims = await claimsNotInMews(db, roomType.id, stay, now, opts);
  return { free, claims, available: free > claims };
}
