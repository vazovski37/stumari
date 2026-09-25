import { createUnit, unitCreate } from "@/lib/admin/hotels";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/** `{ label, ical_import_urls? }` → `{ id, export_url }` */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]/room-types/[rtId]/units">) => {
  await requireSession(request, "admin");
  const input = await readJson(request, unitCreate);
  const { id, rtId } = await ctx.params;
  return Response.json(await createUnit(getDb(), id, rtId, input, serverEnv().siteUrl), { status: 201 });
});
