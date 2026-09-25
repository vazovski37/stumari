import { adminBookingAction, resolveRequest } from "@/lib/admin/bookings";
import { ApiError, handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { operatorAction } from "@/lib/bookings/operator";
import { getDb } from "@/lib/db";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Admin operations: `resolve { guest_bps }` (arbiter stub, ADR-0006), `void` (pending, full refund,
 * any time), `confirm` (before the deadline), `release` (once due).
 */
export const POST = handler(async (request: Request, ctx: RouteContext<"/api/admin/bookings/[id]/[action]">) => {
  await requireSession(request, "admin");
  const { id, action: rawAction } = await ctx.params;
  const parsed = adminBookingAction.safeParse(rawAction);
  if (!parsed.success) throw new ApiError(404, "NOT_FOUND", "Unknown booking action");
  const action = parsed.data;
  const guestBps = action === "resolve" ? (await readJson(request, resolveRequest)).guest_bps : undefined;
  const row = await operatorAction(await chain(), getDb(), id, action, { guestBps });
  return Response.json({ id: row.id, status: row.status, final_sig: row.final_sig, confirm_sig: row.confirm_sig });
});
