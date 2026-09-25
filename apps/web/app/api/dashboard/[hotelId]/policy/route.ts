import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { parsePolicy, policyRequest, savePolicy } from "@/lib/dashboard/policy";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Contract menu and price bounds, validated exactly like pricing (`validatePolicy`). */
export const PATCH = handler(async (request: Request, ctx: RouteContext<"/api/dashboard/[hotelId]/policy">) => {
  const { hotel } = await requireSession(request, { hotelId: (await ctx.params).hotelId });
  const policy = parsePolicy(await readJson(request, policyRequest));
  await savePolicy(getDb(), hotel.id, policy, Math.floor(Date.now() / 1000));
  return Response.json(policy);
});
