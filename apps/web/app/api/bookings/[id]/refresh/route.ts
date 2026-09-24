import type { NextRequest } from "next/server";
import { handler } from "@/lib/api/errors";
import { currentBookingView } from "@/lib/bookings/public";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-reads the chain, updates the DB, cranks when due, returns the public view. */
export const POST = handler(async (_request: NextRequest, ctx: RouteContext<"/api/bookings/[id]/refresh">) =>
  Response.json(await currentBookingView((await ctx.params).id, { force: true })),
);
