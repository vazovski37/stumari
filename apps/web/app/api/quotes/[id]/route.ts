import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError, handler } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { quotes } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { effectiveStatus, envelopeOf } from "@/lib/quotes/create";

export const runtime = "nodejs";

export const GET = handler(async (_request: NextRequest, ctx: RouteContext<"/api/quotes/[id]">) => {
  const { id } = await ctx.params;
  const signer = serverEnv().operator?.publicKey;
  const quote = /^[0-9a-f-]{36}$/.test(id) ? await getDb().query.quotes.findFirst({ where: eq(quotes.id, id) }) : undefined;
  if (!quote || !signer) throw new ApiError(404, "QUOTE_NOT_FOUND", "No such quote");
  return Response.json({ envelope: envelopeOf(quote, signer), status: effectiveStatus(quote, Math.floor(Date.now() / 1000)) });
});
