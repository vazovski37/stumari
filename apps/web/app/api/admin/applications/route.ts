import type { NextRequest } from "next/server";
import { z } from "zod";
import { listApplications } from "@/lib/admin/applications";
import { handler } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { applicationStatuses } from "@/lib/application-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ status: z.enum(applicationStatuses).optional() });

/** The applications pipeline, newest first. */
export const GET = handler(async (request: NextRequest) => {
  await requireSession(request, "admin");
  const { status } = query.parse(Object.fromEntries(request.nextUrl.searchParams));
  return Response.json(await listApplications(getDb(), status), { headers: { "cache-control": "no-store" } });
});
