import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { crankHotel } from "@/lib/bookings/operator";
import { hotelOverview } from "@/lib/dashboard/bookings";
import { getDb, type Db } from "@/lib/db";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Counts, upcoming arrivals, payouts, conflicts; releases / voids due bookings first. */
export const GET = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/overview">) => {
  const { hotel } = await requireSession(request, { hotelId: (await ctx.params).hotelId });
  const db = getDb();
  await crankDue(db, hotel.id);
  return Response.json(await hotelOverview(db, hotel, Math.floor(Date.now() / 1000)), { headers: { "cache-control": "no-store" } });
});

/** The overview still answers when the chain is unreachable or not configured. */
async function crankDue(db: Db, hotelId: string) {
  try {
    await crankHotel(await chain(), db, hotelId);
  } catch (e) {
    console.warn("dashboard crank skipped", e instanceof Error ? e.message : e);
  }
}
