import type { NextRequest } from "next/server";
import { handler } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { listPublicHotels } from "@/lib/hotels";

export const runtime = "nodejs";

export const GET = handler(async (request: NextRequest) => {
  const city = request.nextUrl.searchParams.get("city")?.trim() || undefined;
  return Response.json(await listPublicHotels(getDb(), city?.slice(0, 80)));
});
