import { addDays, localDate } from "@stumari/core";
import { asc, eq } from "drizzle-orm";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { roomTypes } from "../db/schema";
import type { HotelRow } from "../hotels";
import { mewsFreeByRoomType } from "../inventory/mews";
import { MewsError, type MewsPort } from "../mews/client";

/** Nights of availability shown by "Test Mews connection", from tomorrow (hotel time). */
export const MEWS_TEST_NIGHTS = 7;
/** The whole test answers within this (the route's maxDuration is 60 s): a slow Mews is a 502, not a 504. */
export const MEWS_TEST_BUDGET_MS = 40_000;

export interface MewsTestResult {
  environment: "demo" | "production";
  host: string;
  enterprise: { id: string; name: string; timezone: string; currency: string | null };
  /** The Mews enterprise timezone must equal the hotel's: nights are local dates on both sides. */
  timezone_matches: boolean;
  service: { id: string; name: string; configured: boolean };
  bookable_services: { id: string; name: string }[];
  mews_room_types: { id: string; name: string; capacity: number | null }[];
  rates: { id: string; name: string; is_default: boolean }[];
  rate: { id: string | null; found: boolean };
  /** Each Stumari room type with its Mews mapping and, when mapped, free units per night. */
  room_types: { id: string; name: string; mews_room_type_id: string | null; mews_name: string | null; free: number[] | null }[];
  nights: string[];
  problems: string[];
}

/**
 * Admin "Test Mews connection": `getSetup` (enterprise, service, room types, rates) and
 * `services/getAvailability` for the next week, checked against the hotel's mapping. Read-only.
 * Bounded by `budgetMs`; use it with a no-retry, short-timeout port (`requireMewsTestPort`).
 */
export async function testMewsConnection(db: Db, hotel: HotelRow, port: MewsPort, now: number, budgetMs = MEWS_TEST_BUDGET_MS): Promise<MewsTestResult> {
  port.clearCache?.();
  const signal = AbortSignal.timeout(budgetMs);
  const problems: string[] = [];
  let setup;
  try {
    setup = await port.getSetup(hotel.mews_service_id ?? undefined, { signal });
  } catch (e) {
    // MewsError messages name the operation and never carry the tokens.
    if (e instanceof MewsError) throw new ApiError(502, "MEWS_ERROR", e.message);
    throw e;
  }
  const types = await db.select().from(roomTypes).where(eq(roomTypes.hotel_id, hotel.id)).orderBy(asc(roomTypes.sort), asc(roomTypes.name));
  const timezoneMatches = setup.timeZone === hotel.timezone;
  if (!timezoneMatches) problems.push(`Mews timezone ${setup.timeZone} ≠ hotel timezone ${hotel.timezone}: change the hotel's timezone first`);
  if (!hotel.mews_service_id) problems.push(`No Mews service saved; the default is "${setup.serviceName}" (${setup.serviceId})`);
  const rateFound = hotel.mews_rate_id !== null && setup.rates.some((r) => r.id === hotel.mews_rate_id);
  if (!hotel.mews_rate_id) problems.push("No Mews rate saved");
  else if (!rateFound) problems.push(`Rate ${hotel.mews_rate_id} is not an active rate of this service`);
  const mewsName = new Map(setup.roomTypes.map((r) => [r.id, r.name]));
  for (const rt of types) {
    if (!rt.active) continue;
    if (!rt.mews_room_type_id) problems.push(`${rt.name}: no Mews room type`);
    else if (!mewsName.has(rt.mews_room_type_id)) problems.push(`${rt.name}: Mews room type ${rt.mews_room_type_id} not found in this service`);
  }

  const from = addDays(localDate(now, hotel.timezone), 1);
  const nights = Array.from({ length: MEWS_TEST_NIGHTS }, (_, i) => addDays(from, i));
  let free = new Map<string, number[]>();
  if (timezoneMatches) {
    try {
      free = await mewsFreeByRoomType(
        port,
        { mews_service_id: setup.serviceId, timezone: hotel.timezone },
        { checkin: from, checkout: addDays(from, MEWS_TEST_NIGHTS) },
        { signal },
      );
    } catch (e) {
      problems.push(`Availability: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    environment: port.production ? "production" : "demo",
    host: port.host,
    enterprise: { id: setup.enterpriseId, name: setup.enterpriseName, timezone: setup.timeZone, currency: setup.currency },
    timezone_matches: timezoneMatches,
    service: { id: setup.serviceId, name: setup.serviceName, configured: hotel.mews_service_id === setup.serviceId },
    bookable_services: setup.bookableServices,
    mews_room_types: setup.roomTypes.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })),
    rates: setup.rates.map((r) => ({ id: r.id, name: r.name, is_default: r.isDefault })),
    rate: { id: hotel.mews_rate_id, found: rateFound },
    room_types: types.map((rt) => ({
      id: rt.id,
      name: rt.name,
      mews_room_type_id: rt.mews_room_type_id,
      mews_name: rt.mews_room_type_id ? (mewsName.get(rt.mews_room_type_id) ?? null) : null,
      free: rt.mews_room_type_id ? (free.get(rt.mews_room_type_id) ?? null) : null,
    })),
    nights,
    problems,
  };
}
