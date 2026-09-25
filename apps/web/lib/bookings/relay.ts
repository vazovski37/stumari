import "server-only";
import { AccountRole, getBase58Encoder, type Address, type Signature } from "@solana/kit";
import {
  decodeWireTx,
  generated,
  sendAndConfirm,
  STUMARI_ESCROW_PROGRAM_ADDRESS,
  verifySignatures,
  type DecodedWireTx,
} from "@stumari/escrow-client";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { chainNow } from "../solana/clock";
import type { Chain } from "../solana/context";
import { allowedTx, type BuiltTxRow } from "./built-txs";
import { syncFromChain, viewOf } from "./lifecycle";
import { loadBookingRecord, type SigField } from "./store";
import type { PublicBookingView } from "./view";

export const sendRequest = z.object({
  tx: z
    .string()
    .max(4096)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64"),
});

const RELAY_TIMEOUT_MS = 30_000;

/**
 * api.md contract step 4: only transactions whose fee payer is the operator and whose message we
 * built (unexpired `built_txs` row) are relayed, and only with every signature valid. A message we
 * did not build but that carries a failing operator signature is one a wallet changed (added
 * instructions or priority fees): WALLET_MODIFIED_TX rather than FOREIGN_TX.
 */
export async function checkRelayable(
  db: Db,
  operator: string,
  txBase64: string,
  now: number,
): Promise<{ decoded: DecodedWireTx; row: BuiltTxRow }> {
  let decoded: DecodedWireTx;
  try {
    decoded = await decodeWireTx(txBase64);
  } catch {
    throw new ApiError(400, "INVALID_TX", "Not a valid Solana transaction");
  }
  if (decoded.feePayer !== operator) throw new ApiError(400, "FOREIGN_TX", "This transaction was not built by Stumari");
  const row = await allowedTx(db, decoded.messageHashHex, now);
  const check = await verifySignatures(decoded);
  if (!row) {
    if (check.invalid.includes(decoded.feePayer)) {
      throw new ApiError(400, "WALLET_MODIFIED_TX", "Your wallet changed the transaction, so it can no longer be sent; try again or use another wallet");
    }
    throw new ApiError(400, "FOREIGN_TX", "This transaction was not built by Stumari, or it has expired");
  }
  if (!check.valid) {
    throw new ApiError(400, "WALLET_MODIFIED_TX", check.missing.length > 0 ? "The transaction is missing a signature" : "A signature does not match the transaction");
  }
  return { decoded, row };
}

/** Which booking column a landed transaction fills; a dispute is not an exit, so it fills none. */
const SIG_FIELD: Record<BuiltTxRow["action"], SigField | null> = {
  create: "create_sig",
  cancel: "final_sig",
  void: "final_sig",
  dispute: null,
};

const { StumariEscrowInstruction: Ix } = generated;
const FIELD_BY_INSTRUCTION = new Map<number, SigField | null>([
  [Ix.CreateBooking, "create_sig"],
  [Ix.ConfirmBooking, "confirm_sig"],
  [Ix.CancelBooking, "final_sig"],
  [Ix.Release, "final_sig"],
  [Ix.ResolveDispute, "final_sig"],
  [Ix.VoidBooking, "final_sig"],
  [Ix.FlagDispute, null],
]);

export interface JsonInstruction {
  programIdIndex: number;
  accounts: readonly number[];
  data: string;
}

/**
 * The booking column a confirmed transaction fills, from its own escrow instruction: the one whose
 * `booking` account (at its IDL position, read with the generated Codama parser) is this booking's
 * PDA. Anchor ignores extra accounts, so a PDA listed anywhere else proves nothing. `undefined`
 * when no escrow instruction acts on the booking.
 */
export function fieldOfTransaction(
  keys: readonly string[],
  instructions: readonly JsonInstruction[],
  bookingPda: string,
): SigField | null | undefined {
  for (const ix of instructions) {
    if (keys[ix.programIdIndex] !== STUMARI_ESCROW_PROGRAM_ADDRESS) continue;
    try {
      const parsed = generated.parseStumariEscrowInstruction({
        programAddress: STUMARI_ESCROW_PROGRAM_ADDRESS,
        // Roles do not matter for parsing: only each account's position does.
        accounts: ix.accounts.map((i) => ({ address: keys[i] as Address, role: AccountRole.READONLY })),
        data: getBase58Encoder().encode(ix.data),
      });
      if (!FIELD_BY_INSTRUCTION.has(parsed.instructionType)) continue;
      const booking = (parsed.accounts as { booking?: { address: string } }).booking;
      if (booking?.address === bookingPda) return FIELD_BY_INSTRUCTION.get(parsed.instructionType);
    } catch {
      // not one of our instructions, or too few accounts / malformed data for it
    }
  }
  return undefined;
}

/** Relays a wallet-signed transaction, waits for `confirmed`, and mirrors the booking. */
export async function relay(c: Chain, db: Db, txBase64: string): Promise<{ signature: string; row: BuiltTxRow; booking: PublicBookingView | null }> {
  const { row } = await checkRelayable(db, c.operator.address, txBase64, Math.floor(Date.now() / 1000));
  const { signature } = await sendAndConfirm(c.rpc, txBase64, {
    lastValidBlockHeight: BigInt(row.last_valid_block_height),
    timeoutMs: RELAY_TIMEOUT_MS,
  });
  return { signature, row, booking: await recordSignature(c, db, row.booking_id, row.action, signature) };
}

/** Mirrors the chain after a transaction of ours landed; returns the public view. */
export async function recordSignature(
  c: Chain,
  db: Db,
  bookingId: string,
  action: BuiltTxRow["action"],
  signature: string,
): Promise<PublicBookingView | null> {
  const record = await loadBookingRecord(db, bookingId);
  if (!record) return null;
  const now = await chainNow(c.rpc);
  const field = SIG_FIELD[action];
  const { row } = await syncFromChain(c, db, record.booking, field ? { field, value: signature } : undefined);
  return viewOf(c, { ...record, booking: row }, now);
}

export const submittedRequest = z.object({
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "base58 signature"),
});

const SUBMITTED_WAIT_MS = 20_000;

/**
 * POST /api/bookings/{id}/submitted — for wallets that only sign-and-send: waits for the
 * signature, checks that the transaction touched this booking, then mirrors the chain. Idempotent.
 */
export async function recordSubmitted(c: Chain, db: Db, bookingId: string, signature: string): Promise<PublicBookingView> {
  const record = await loadBookingRecord(db, bookingId);
  if (!record?.booking.booking_pda) throw new ApiError(404, "NOT_FOUND", "No such booking");
  const sig = signature as Signature;
  const deadline = Date.now() + SUBMITTED_WAIT_MS;
  for (;;) {
    const { value } = await c.rpc.getSignatureStatuses([sig]).send();
    const status = value[0];
    if (status?.err) throw new ApiError(409, "TX_FAILED", "The transaction failed on-chain");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    if (Date.now() > deadline) throw new ApiError(504, "CONFIRMATION_TIMEOUT", "The transaction is not confirmed yet; refresh shortly");
    await new Promise((r) => setTimeout(r, 800));
  }
  const tx = await c.rpc.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "json" }).send();
  const keys: readonly string[] = tx?.transaction.message.accountKeys ?? [];
  const instructions = (tx?.transaction.message.instructions ?? []) as readonly JsonInstruction[];
  // The column comes from the transaction's own escrow instruction, never from the booking's
  // status: anyone may call this route with any signature that touched the booking.
  const field = fieldOfTransaction(keys, instructions, record.booking.booking_pda);
  if (field === undefined) {
    throw new ApiError(400, "SIGNATURE_MISMATCH", "That transaction does not belong to this booking");
  }
  const now = await chainNow(c.rpc);
  const { row } = await syncFromChain(c, db, record.booking, field ? { field, value: signature } : undefined);
  return viewOf(c, { ...record, booking: row }, now);
}
