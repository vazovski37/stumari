import { isAddress } from "@solana/kit";
import type { NextRequest } from "next/server";
import { handler, ApiError } from "@/lib/api/errors";
import { requestIpHash } from "@/lib/api/client";
import { enforceRateLimits } from "@/lib/api/rate";
import { issueNonce } from "@/lib/auth/siws";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { NONCE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ nonce, message }` for the wallet to sign; the host is the site's own (NEXT_PUBLIC_SITE_URL). */
export const GET = handler(async (request: NextRequest) => {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) throw new ApiError(400, "INVALID_WALLET", "Wallet must be a base58 Solana address");
  const db = getDb();
  await enforceRateLimits(db, [[NONCE_LIMIT, requestIpHash(request)]], "sign-in attempts");
  const now = Math.floor(Date.now() / 1000);
  const body = await issueNonce(db, { host: new URL(serverEnv().siteUrl).host, wallet, now });
  return Response.json(body, { headers: { "cache-control": "no-store" } });
});
