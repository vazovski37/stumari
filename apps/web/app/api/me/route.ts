import { handler } from "@/lib/api/errors";
import { hotelsOf, requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ wallet, is_admin, hotels }` of the signed-in wallet. */
export const GET = handler(async (request: Request) => {
  const session = await requireSession(request, "user");
  const hotels = await hotelsOf(getDb(), session.wallet);
  return Response.json({ wallet: session.wallet, is_admin: session.isAdmin, hotels }, { headers: { "cache-control": "no-store" } });
});
