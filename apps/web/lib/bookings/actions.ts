import "server-only";
import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder, type Address } from "@solana/kit";
import { minRefundForCancel } from "@stumari/core";
import {
  buildCancelTx,
  buildDisputeTx,
  buildVoidTx,
  generated,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  type BookingView as ChainBooking,
  type BuiltTx,
} from "@stumari/escrow-client";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { onchainConfig } from "../solana/chain-config";
import { chainNow } from "../solana/clock";
import type { Chain } from "../solana/context";
import { reusableTx, saveBuiltTx } from "./built-txs";
import { syncFromChain } from "./lifecycle";
import { loadBookingRecord } from "./store";

export const bookingTxRequest = z.object({
  action: z.enum(["cancel", "dispute", "void"]),
  wallet: z.string().max(64),
});
export type BookingAction = z.infer<typeof bookingTxRequest>["action"];

export interface BookingTxResponse {
  tx: string;
  signer: string;
  lastValidBlockHeight: number;
  refund_minor?: string;
}

const notAllowed = (reason: string, message: string) => new ApiError(409, "NOT_ALLOWED", message, { body: { reason } });

/** The program's clock rules for each guest action (escrow-program.md "Status machine"). */
export function assertActionAllowed(action: BookingAction, account: ChainBooking, now: bigint): void {
  const { status } = account;
  if (action === "cancel") {
    if (status !== "pending" && status !== "confirmed") throw notAllowed("STATUS", `A ${status} booking cannot be cancelled`);
    if (now >= account.checkinTs) throw notAllowed("TOO_LATE", "Check-in time has passed; cancellation is closed");
  } else if (action === "dispute") {
    if (status !== "confirmed") throw notAllowed("STATUS", `A ${status} booking cannot be disputed`);
    if (now < account.checkinTs) throw notAllowed("TOO_EARLY", "Disputes open at check-in time");
    if (now >= account.releaseAfterTs) throw notAllowed("TOO_LATE", "The dispute window has closed");
  } else {
    if (status !== "pending") throw notAllowed("STATUS", `Only an unconfirmed booking can be voided`);
    if (now < account.confirmDeadlineTs) throw notAllowed("TOO_EARLY", "The hotel still has time to confirm this booking");
  }
}

/** `min_refund` of the `cancel_booking` instruction inside a built transaction. */
export function cancelMinRefund(txBase64: string): bigint {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(txBase64));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (message.version === 1) throw new Error("unexpected v1 transaction");
  const discriminator = generated.CANCEL_BOOKING_DISCRIMINATOR;
  for (const ix of message.instructions) {
    const data = ix.data;
    if (message.staticAccounts[ix.programAddressIndex] !== STUMARI_ESCROW_PROGRAM_ADDRESS || !data) continue;
    if (discriminator.every((b, i) => data[i] === b)) {
      return generated.getCancelBookingInstructionDataDecoder().decode(data).minRefund;
    }
  }
  throw new Error("no cancel_booking instruction");
}

/**
 * POST /api/bookings/{id}/tx: a guest-signed cancel (with `min_refund` = the refund by the tiers at
 * now + 90 s), dispute or void, operator as fee payer; cached per `(booking, action)`.
 */
export async function prepareBookingTx(
  c: Chain,
  db: Db,
  bookingId: string,
  input: { action: BookingAction; wallet: string },
): Promise<BookingTxResponse> {
  const record = await loadBookingRecord(db, bookingId);
  if (!record) throw new ApiError(404, "NOT_FOUND", "No such booking");
  const now = await chainNow(c.rpc);
  const { account } = await syncFromChain(c, db, record.booking);
  if (!account) throw notAllowed("NOT_ON_CHAIN", "This booking has not been paid yet");
  if (input.wallet !== account.guest) {
    throw new ApiError(403, "WALLET_MISMATCH", "Only the wallet that paid for this booking can do this");
  }
  assertActionAllowed(input.action, account, BigInt(now));

  const wallNow = Math.floor(Date.now() / 1000);
  const cached = await reusableTx(db, bookingId, input.action, wallNow, () => c.rpc.getBlockHeight({ commitment: "confirmed" }).send());
  if (cached) {
    return {
      tx: cached.tx_base64,
      signer: account.guest,
      lastValidBlockHeight: cached.last_valid_block_height,
      ...(input.action === "cancel" ? { refund_minor: cancelMinRefund(cached.tx_base64).toString() } : {}),
    };
  }

  const ctx = { rpc: c.rpc, operator: c.operator, booking: account };
  const config = (await onchainConfig(c.rpc)) ?? undefined;
  let built: BuiltTx;
  let refund: bigint | undefined;
  if (input.action === "cancel") {
    refund = minRefundForCancel({ booking: account, now: BigInt(now) });
    built = await buildCancelTx({ ...ctx, config, minRefund: refund });
  } else if (input.action === "dispute") {
    built = await buildDisputeTx(ctx);
  } else {
    built = await buildVoidTx({ ...ctx, config, authority: account.guest as Address });
  }
  await saveBuiltTx(db, { bookingId, quoteId: record.booking.quote_id, action: input.action, built, now: wallNow });
  return {
    tx: built.txBase64,
    signer: account.guest,
    lastValidBlockHeight: Number(built.lastValidBlockHeight),
    ...(refund !== undefined ? { refund_minor: refund.toString() } : {}),
  };
}
