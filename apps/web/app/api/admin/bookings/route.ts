import type { NextRequest } from "next/server";
import { adminBookingQuery } from "@/lib/admin/bookings";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { listOperatorBookings } from "@/lib/dashboard/bookings";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bookings across hotels: `status`, `hotel_id`, `checkin_from`, `checkin_to` (YYYY-MM-DD). */
export const GET = handler(async (request: NextRequest) => {
  await requireSession(request, "admin");
  const f = adminBookingQuery.parse(Object.fromEntries(request.nextUrl.searchParams));
  const list = await listOperatorBookings(getDb(), { status: f.status, hotelId: f.hotel_id, checkinFrom: f.checkin_from, checkinTo: f.checkin_to });
  return Response.json(list, { headers: { "cache-control": "no-store" } });
});
