import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { buildIcalFeed, loadFeedEvents } from "@/lib/inventory/ical-export";
import { apiError } from "@/lib/request";

export const runtime = "nodejs";

/** A unit's export calendar for Booking.com / Airbnb to import (inventory-ical.md "Export"). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/ical/[token]">) {
  const { token } = await ctx.params;
  const now = Math.floor(Date.now() / 1000);
  const events = /^[0-9a-f]{64}$/.test(token) ? await loadFeedEvents(getDb(), token, now) : null;
  if (!events) return apiError(404, "NOT_FOUND", "No such calendar");
  return new Response(buildIcalFeed(events, now), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="stumari.ics"',
      "cache-control": "no-store",
    },
  });
}
