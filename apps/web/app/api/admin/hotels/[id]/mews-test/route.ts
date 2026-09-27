import { findHotel } from "@/lib/admin/hotels";
import { testMewsConnection } from "@/lib/admin/mews";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { requireMewsTestPort } from "@/lib/mews/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "Test Mews connection": read-only setup + next week's availability, checked against the hotel's mapping.
 * Short per-call timeouts, no retries and a 40 s budget: a slow or rate-limited Mews answers 502 MEWS_ERROR.
 */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]/mews-test">) => {
  await requireSession(request, "admin");
  const db = getDb();
  const hotel = await findHotel(db, (await ctx.params).id);
  return Response.json(await testMewsConnection(db, hotel, requireMewsTestPort(), Math.floor(Date.now() / 1000)));
});
