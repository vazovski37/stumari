import type { NextRequest } from "next/server";
import { holdOwner, requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { getDb } from "@/lib/db";
import { createQuote, quoteRequest } from "@/lib/quotes/create";
import { QUOTE_LIMIT } from "@/lib/rate-limit";
import { chain, serverKeyAddresses } from "@/lib/solana/context";

export const runtime = "nodejs";

/** Prices the menu, signs the quote and holds one unit for 10 minutes. */
export const POST = handler(async (request: NextRequest) => {
  const input = await readJson(request, quoteRequest);
  const c = await chain();
  const db = getDb();
  const ip = requestIpHash(request);
  await enforceRateLimits(db, [[QUOTE_LIMIT, ip]], "price requests");
  const owner = holdOwner(request, { type: input.buyer_type, wallet: input.buyer_wallet ?? null });
  const envelope = await createQuote(
    {
      db,
      cluster: c.env.cluster,
      programId: c.env.programId,
      mint: c.mint,
      signerSecret: c.operatorSecret,
      serverKeys: serverKeyAddresses(c),
      clientId: owner.clientId,
      ipHash: ip,
      now: Math.floor(Date.now() / 1000),
    },
    input,
  );
  return Response.json(envelope, { status: 201, headers: owner.setCookie ? { "set-cookie": owner.setCookie } : undefined });
});
