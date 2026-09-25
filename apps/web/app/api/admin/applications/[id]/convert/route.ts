import { convertApplication } from "@/lib/admin/applications";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Draft hotel prefilled from the application (409 ALREADY_CONVERTED + `hotel_id` on repeat). */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/applications/[id]/convert">) => {
  await requireSession(request, "admin");
  const hotel = await convertApplication(getDb(), (await ctx.params).id, Math.floor(Date.now() / 1000));
  return Response.json(hotel, { status: 201 });
});
