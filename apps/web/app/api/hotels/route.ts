import type { NextRequest } from "next/server";
import { handler } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { filterHotels, listPublicHotels } from "@/lib/hotels";

export const runtime = "nodejs";

const MEALS = ["BB", "HB", "FB", "SC"] as const;

/**
 * Active hotels. Optional requirement filters: `text`, `neighborhood`, `amenities` (comma list),
 * `max_nightly_minor` (decimal string) and `meal`. Cheapest first when any filter is given.
 */
export const GET = handler(async (request: NextRequest) => {
  const p = request.nextUrl.searchParams;
  const city = p.get("city")?.trim() || undefined;
  const hotels = await listPublicHotels(getDb(), city?.slice(0, 80));
  const maxRaw = p.get("max_nightly_minor")?.trim();
  const meal = p.get("meal")?.trim().toUpperCase();
  const filtered = ["text", "neighborhood", "amenities", "max_nightly_minor", "meal"].some((k) => p.get(k)?.trim());
  if (!filtered) return Response.json(hotels);
  return Response.json(
    filterHotels(hotels, {
      text: p.get("text")?.slice(0, 200),
      neighborhood: p.get("neighborhood")?.slice(0, 80),
      amenities: p.get("amenities")?.split(",").slice(0, 12),
      max_nightly_minor: maxRaw && /^\d{1,15}$/.test(maxRaw) ? maxRaw : undefined,
      meal: MEALS.find((m) => m === meal),
    }),
  );
});
