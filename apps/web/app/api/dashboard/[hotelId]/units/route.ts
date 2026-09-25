import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { hotelUnits } from "@/lib/dashboard/units";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Room types, units, export feed URLs, import URLs, last sync and upcoming blocks. */
export const GET = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/units">) => {
  const { hotel } = await requireSession(request, { hotelId: (await ctx.params).hotelId });
  const types = await hotelUnits(getDb(), hotel, serverEnv().siteUrl, Math.floor(Date.now() / 1000));
  return Response.json(types, { headers: { "cache-control": "no-store" } });
});
