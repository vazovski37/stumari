import { isAddress } from "@solana/kit";
import { z } from "zod";
import { handler, readJson } from "@/lib/api/errors";
import { requestIpHash } from "@/lib/api/client";
import { enforceRateLimits } from "@/lib/api/rate";
import { encodeSession, sessionCookie } from "@/lib/auth/session";
import { verifySignIn } from "@/lib/auth/siws";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { NONCE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

const verifyRequest = z.object({
  wallet: z.string().refine(isAddress, { message: "Wallet must be a base58 Solana address" }),
  message: z.string().max(1_000),
  signature: z.string().max(128),
});

/** Checks the signed SIWS message and sets the `stumari_session` cookie (7 days). */
export const POST = handler(async (request: Request) => {
  const input = await readJson(request, verifyRequest);
  const env = serverEnv();
  const db = getDb();
  await enforceRateLimits(db, [[NONCE_LIMIT, requestIpHash(request)]], "sign-in attempts");
  const now = Math.floor(Date.now() / 1000);
  const wallet = await verifySignIn(db, { ...input, expectedHost: new URL(env.siteUrl).host, now });
  const cookie = sessionCookie(encodeSession(wallet, env.authSecret, now), env.nodeEnv === "production");
  return Response.json(
    { wallet, is_admin: env.adminWallets.includes(wallet) },
    { headers: { "set-cookie": cookie, "cache-control": "no-store" } },
  );
});
