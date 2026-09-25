import { createHotel, hotelCreate, listHotels } from "@/lib/admin/hotels";
import { handler, readJson } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every hotel (any status) with room type and unit counts. */
export const GET = handler(async (request: Request) => {
  await requireSession(request, "admin");
  return Response.json(await listHotels(getDb()), { headers: { "cache-control": "no-store" } });
});

/** A new draft hotel (slug derived from the name unless given). */
export const POST = handler(async (request: Request) => {
  await requireSession(request, "admin");
  const input = await readJson(request, hotelCreate);
  return Response.json(await createHotel(getDb(), input, Math.floor(Date.now() / 1000)), { status: 201 });
});
