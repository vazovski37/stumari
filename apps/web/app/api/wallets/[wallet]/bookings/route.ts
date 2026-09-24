import { isAddress } from "@solana/kit";
import type { NextRequest } from "next/server";
import { ApiError, handler } from "@/lib/api/errors";
import { viewOf } from "@/lib/bookings/lifecycle";
import { loadWalletBookings } from "@/lib/bookings/store";
import { getDb } from "@/lib/db";
import { chainNow } from "@/lib/solana/clock";
import { chain } from "@/lib/solana/context";

export const runtime = "nodejs";

/** Public views of a wallet's bookings (the same data is on-chain anyway), latest check-in first. */
export const GET = handler(async (_request: NextRequest, ctx: RouteContext<"/api/wallets/[wallet]/bookings">) => {
  const { wallet } = await ctx.params;
  if (!isAddress(wallet)) throw new ApiError(400, "INVALID_WALLET", "Wallet must be a base58 Solana address");
  const c = await chain();
  const now = await chainNow(c.rpc);
  const records = await loadWalletBookings(getDb(), wallet);
  return Response.json(
    records.map((r) => viewOf(c, r, now)),
    { headers: { "cache-control": "no-store" } },
  );
});
