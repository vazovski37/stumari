import type { Address } from "@solana/kit";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requestIpHash } from "@/lib/api/client";
import { handler, readJson } from "@/lib/api/errors";
import { enforceRateLimits } from "@/lib/api/rate";
import { getDb } from "@/lib/db";
import { assertFaucetEnabled, FAUCET_AMOUNT_MINOR, mintTestUsdc } from "@/lib/faucet";
import { FAUCET_IP_LIMIT, FAUCET_WALLET_LIMIT } from "@/lib/rate-limit";
import { chain, serverKeyAddresses } from "@/lib/solana/context";
import { parseGuestWallet } from "@/lib/wallets";

export const runtime = "nodejs";

const body = z.object({ wallet: z.string().max(64) });

/** Demo mode only, never mainnet: 500 test USDC; 3 per wallet and 10 per IP per hour. */
export const POST = handler(async (request: NextRequest) => {
  const input = await readJson(request, body);
  const c = await chain();
  assertFaucetEnabled(c);
  const wallet = parseGuestWallet(input.wallet, serverKeyAddresses(c)) as Address;
  await enforceRateLimits(
    getDb(),
    [
      [FAUCET_WALLET_LIMIT, `wallet:${wallet}`],
      [FAUCET_IP_LIMIT, `ip:${requestIpHash(request)}`],
    ],
    "faucet requests",
  );
  const result = await mintTestUsdc(c, wallet);
  return Response.json({ ...result, amount_minor: FAUCET_AMOUNT_MINOR.toString() });
});
