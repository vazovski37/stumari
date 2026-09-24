import type { NextRequest } from "next/server";
import { handler } from "@/lib/api/errors";
import { currentBookingView } from "@/lib/bookings/public";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public booking view; lazily cranks release / void when due. Never includes guest data. */
export const GET = handler(async (_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]">) => {
  const view = await currentBookingView((await ctx.params).id, { force: false });
  return Response.json(view, { headers: { "cache-control": "no-store" } });
});
