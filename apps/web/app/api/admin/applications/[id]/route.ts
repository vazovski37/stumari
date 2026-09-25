import { applicationPatch, patchApplication } from "@/lib/admin/applications";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** `{ status?, notes? }` */
export const PATCH = handler(async (request: Request, ctx: RouteContext<"/api/admin/applications/[id]">) => {
  await requireSession(request, "admin");
  const patch = await readJson(request, applicationPatch);
  return Response.json(await patchApplication(getDb(), (await ctx.params).id, patch));
});
