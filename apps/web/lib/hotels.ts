import { checkinTs, isCoreError, nightsBetween, TEMPLATES, validatePolicy, type PricingPolicy, type Tier } from "@stumari/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ApiError } from "./api/errors";
import type { Db } from "./db/client";
import { hotels, roomTypes } from "./db/schema";

export type HotelRow = typeof hotels.$inferSelect;
export type RoomTypeRow = typeof roomTypes.$inferSelect;

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Longest stay a quote may cover, and how far ahead check-in may be. */
export const MAX_NIGHTS = 30;
export const MAX_LEAD_DAYS = 365;

/** An active hotel and its active room types (sorted), or null. Draft and paused hotels are not public. */
export async function findPublicHotel(db: Db, slug: string): Promise<{ hotel: HotelRow; roomTypes: RoomTypeRow[] } | null> {
  if (!SLUG.test(slug)) return null;
  const hotel = await db.query.hotels.findFirst({ where: and(eq(hotels.slug, slug), eq(hotels.status, "active")) });
  if (!hotel) return null;
  const types = await db
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.hotel_id, hotel.id), eq(roomTypes.active, true)))
    .orderBy(asc(roomTypes.sort), asc(roomTypes.name));
  return { hotel, roomTypes: types };
}

export function hotelPolicy(hotel: HotelRow): PricingPolicy {
  return validatePolicy(hotel.policy);
}

/** The enabled contracts in menu order, with plain-language terms (hotel profile, checkout). */
export function hotelContracts(policy: PricingPolicy) {
  return policy.enabled_templates.map((id) => ({
    id,
    name: TEMPLATES[id].name,
    terms: TEMPLATES[id].description,
    tiers: TEMPLATES[id].tiers.map((t): Tier => ({ ...t })),
    reference: id === policy.reference_template,
  }));
}

function roomTypeSummary(rt: RoomTypeRow) {
  return {
    id: rt.id,
    name: rt.name,
    max_adults: rt.max_adults,
    max_children: rt.max_children,
    base_rate_minor: rt.base_rate_minor,
    meal: rt.meal,
  };
}

/** `GET /api/hotels` rows. */
export async function listPublicHotels(db: Db, city?: string) {
  const rows = await db
    .select()
    .from(hotels)
    .where(and(eq(hotels.status, "active"), city ? eq(hotels.city, city) : undefined))
    .orderBy(asc(hotels.name));
  if (rows.length === 0) return [];
  const types = await db
    .select()
    .from(roomTypes)
    .where(and(inArray(roomTypes.hotel_id, rows.map((h) => h.id)), eq(roomTypes.active, true)))
    .orderBy(asc(roomTypes.sort), asc(roomTypes.name));
  return rows.map((h) => {
    const own = types.filter((t) => t.hotel_id === h.id);
    const from = own.reduce<bigint | null>((min, t) => {
      const rate = BigInt(t.base_rate_minor);
      return min === null || rate < min ? rate : min;
    }, null);
    return {
      slug: h.slug,
      name: h.name,
      city: h.city ?? "",
      from_price_minor: from === null ? null : from.toString(),
      room_types: own.map(roomTypeSummary),
    };
  });
}

/** `GET /api/hotels/{slug}`: public profile — never the payout wallet or contact data. */
export function hotelProfile(hotel: HotelRow, types: RoomTypeRow[]) {
  return {
    slug: hotel.slug,
    name: hotel.name,
    city: hotel.city ?? "",
    country: hotel.country,
    address: hotel.address,
    phone: hotel.phone,
    timezone: hotel.timezone,
    checkin_time: hotel.checkin_time,
    checkout_time: hotel.checkout_time,
    room_types: types.map((rt) => ({
      ...roomTypeSummary(rt),
      description: rt.description,
      weekend_rate_minor: rt.weekend_rate_minor,
      photo_url: rt.photo_url,
    })),
    contracts: hotelContracts(hotelPolicy(hotel)),
  };
}

export interface Stay {
  checkin: string;
  checkout: string;
  nights: number;
  checkinTs: number;
  checkoutTs: number;
}

/**
 * Validates requested dates for a hotel (400 INVALID_DATES): real dates, 1–30 nights, check-in
 * within a year, and — same-day allowed — before the hotel's check-in time.
 */
export function parseStay(hotel: HotelRow, checkin: string, checkout: string, now: number): Stay {
  const invalid = (why: string) => new ApiError(400, "INVALID_DATES", why);
  let nights: number;
  let inTs: number;
  let outTs: number;
  try {
    nights = nightsBetween(checkin, checkout);
    inTs = checkinTs(checkin, hotel.checkin_time, hotel.timezone);
    outTs = checkinTs(checkout, hotel.checkout_time, hotel.timezone);
  } catch (e) {
    if (isCoreError(e)) throw invalid("Dates must be real calendar dates (YYYY-MM-DD)");
    throw e;
  }
  if (nights < 1) throw invalid("Check-out must be after check-in");
  if (nights > MAX_NIGHTS) throw invalid(`Stays are limited to ${MAX_NIGHTS} nights`);
  if (now >= inTs) throw invalid("The check-in time for that date has already passed");
  if (inTs - now > MAX_LEAD_DAYS * 86_400) throw invalid(`Check-in must be within ${MAX_LEAD_DAYS} days`);
  return { checkin, checkout, nights, checkinTs: inTs, checkoutTs: outTs };
}

/** 400 TOO_MANY_GUESTS unless the party fits the room type. */
export function assertFits(rt: RoomTypeRow, adults: number, children: number): void {
  if (adults > rt.max_adults || children > rt.max_children) {
    throw new ApiError(
      400,
      "TOO_MANY_GUESTS",
      `${rt.name} sleeps up to ${rt.max_adults} adult(s)${rt.max_children > 0 ? ` and ${rt.max_children} child(ren)` : ""}`,
    );
  }
}

export const fitsParty = (rt: RoomTypeRow, adults: number, children: number) =>
  adults <= rt.max_adults && children <= rt.max_children;
