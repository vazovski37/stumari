import type { Address } from "@solana/kit";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { getDb } from "@/lib/db";
import { assertFaucetEnabled, consumeFaucetBudget, FAUCET_AMOUNT_MINOR, mintTestUsdc } from "@/lib/faucet";
import { FAUCET_IP_LIMIT, FAUCET_WALLET_LIMIT } from "@/lib/rate-limit";
import { chain, serverKeyAddresses } from "@/lib/solana/context";
import { parseGuestWallet } from "@/lib/wallets";

export const runtime = "nodejs";

const body = z.object({ wallet: z.string().max(64) });

/**
 * Demo mode only, never mainnet: 500 test USDC; 3 per wallet and 10 per IP per hour, 200 per day
 * in all, and none while the operator holds under 0.05 SOL (503 OPERATOR_LOW_BALANCE).
 */
export const POST = handler(async (request: NextRequest) => {
  const input = await readJson(request, body);
  const c = await chain();
  assertFaucetEnabled(c);
  const wallet = parseGuestWallet(input.wallet, serverKeyAddresses(c)) as Address;
  const db = getDb();
  const ip = requestIpHash(request);
  await enforceRateLimits(
    db,
    [
      // keyed per (IP, wallet): a stranger must not be able to spend a victim's budget
      [FAUCET_WALLET_LIMIT, `ip:${ip}:wallet:${wallet}`],
      [FAUCET_IP_LIMIT, `ip:${ip}`],
    ],
    "faucet requests",
  );
  await consumeFaucetBudget(c, db);
  const result = await mintTestUsdc(c, wallet);
  return Response.json({ ...result, amount_minor: FAUCET_AMOUNT_MINOR.toString() });
});
