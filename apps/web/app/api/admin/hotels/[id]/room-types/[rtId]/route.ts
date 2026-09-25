import { patchRoomType, roomTypePatch } from "@/lib/admin/hotels";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Rates, capacity, meal plan, `active`. */
export const PATCH = handler(async (request: Request, ctx: RouteContext<"/api/admin/hotels/[id]/room-types/[rtId]">) => {
  await requireSession(request, "admin");
  const patch = await readJson(request, roomTypePatch);
  const { id, rtId } = await ctx.params;
  return Response.json(await patchRoomType(getDb(), id, rtId, patch));
});
