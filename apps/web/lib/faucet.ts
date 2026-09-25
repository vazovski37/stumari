import "server-only";
import type { Address } from "@solana/kit";
import { fetchMaybeMint, fetchMaybeToken, getCreateAssociatedTokenIdempotentInstruction, getMintToCheckedInstruction } from "@solana-program/token";
import { USDC_DECIMALS } from "@stumari/core";
import { findAta } from "@stumari/escrow-client";
import { ApiError } from "./api/errors";
import { enforceRateLimits } from "./api/rate";
import type { Db } from "./db/client";
import { FAUCET_DAILY_GLOBAL_LIMIT, GLOBAL_KEY } from "./rate-limit";
import { assertOperatorBalance } from "./solana/balance";
import type { Chain } from "./solana/context";
import { sendOperatorInstructions } from "./solana/send";

/** 500 test USDC per request (api.md "demo faucet"). */
export const FAUCET_AMOUNT_MINOR = 500_000_000n;

/** Demo mode only and never on mainnet, whatever the flag says (demoMode is already forced off there). */
export function assertFaucetEnabled(c: Pick<Chain, "env">): void {
  if (!c.env.demoMode || c.env.cluster === "mainnet-beta") {
    throw new ApiError(404, "NOT_FOUND", "The test-USDC faucet is only available on the demo deployment");
  }
}

/**
 * After the per-wallet and per-IP limits: 503 OPERATOR_LOW_BALANCE below 0.05 SOL, then one of the
 * deployment's 200 mints per day (each costs operator fees and possibly ATA rent).
 */
export async function consumeFaucetBudget(c: Pick<Chain, "rpc" | "operator">, db: Db, now?: number): Promise<void> {
  await assertOperatorBalance(c);
  await enforceRateLimits(db, [[FAUCET_DAILY_GLOBAL_LIMIT, GLOBAL_KEY]], "faucet requests today", now);
}

/** Mints mock USDC to the wallet's ATA; the operator is the mint authority and pays the ATA rent. */
export async function mintTestUsdc(c: Chain, wallet: Address): Promise<{ signature: string; balance_minor: string }> {
  assertFaucetEnabled(c);
  const mint = await fetchMaybeMint(c.rpc, c.mint, { commitment: "confirmed" });
  const authority = mint.exists ? mint.data.mintAuthority : null;
  if (!authority || authority.__option !== "Some" || authority.value !== c.operator.address) {
    throw new ApiError(503, "FAUCET_UNAVAILABLE", "The test mint is not controlled by this deployment");
  }
  const ata = await findAta(wallet, c.mint);
  const signature = await sendOperatorInstructions(c, [
    getCreateAssociatedTokenIdempotentInstruction({ payer: c.operator, ata, owner: wallet, mint: c.mint }),
    getMintToCheckedInstruction({
      mint: c.mint,
      token: ata,
      mintAuthority: c.operator,
      amount: FAUCET_AMOUNT_MINOR,
      decimals: USDC_DECIMALS,
    }),
  ]);
  const account = await fetchMaybeToken(c.rpc, ata, { commitment: "confirmed" });
  return { signature, balance_minor: (account.exists ? account.data.amount : 0n).toString() };
}
