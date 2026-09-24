import "server-only";
import { type Address } from "@solana/kit";
import { fetchMaybeToken } from "@solana-program/token";
import { deriveBookingId, formatUsdc, hexToBytes, parseMinor, uuidToBytes, type QuoteBody } from "@stumari/core";
import { buildCreateBookingTx, findAta, findVaultPda } from "@stumari/escrow-client";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { bookings, quotes } from "../db/schema";
import { hasConflicts, unitConflicts } from "../inventory/availability";
import { PAY_SYNC_MAX_AGE_SECS, syncUnitIfStale } from "../inventory/ical-sync";
import { effectiveStatus } from "../quotes/create";
import { chainNow } from "../solana/clock";
import { serverKeyAddresses, type Chain } from "../solana/context";
import { parseGuestWallet } from "../wallets";
import { discardBuiltTxs, reusableTx, saveBuiltTx } from "./built-txs";
import { bookingPdaOf, fetchChainBooking, viewOf } from "./lifecycle";
import { applyChainState, loadBookingRecord } from "./store";
import type { BookingRow } from "./view";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const payRequest = z.object({
  option_index: z.number().int().min(0).max(7),
  payer: z.string().max(64),
  guest_name: optionalText(100),
  guest_email: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "email address"),
  guest_phone: optionalText(40),
});
export type PayRequest = z.infer<typeof payRequest>;

export interface PayResponse {
  booking_id: string;
  booking_pda: string;
  tx: string;
  signer: string;
  lastValidBlockHeight: number;
}

/** Everything `/pay` checks that needs no chain access (quote-protocol.md "Lifecycle" 2). */
export function checkPayable(
  quote: { status: "active" | "used" | "expired"; expires_at: number; body: QuoteBody },
  input: { option_index: number; payer: string },
  { now, amountCapMinor }: { now: number; amountCapMinor: bigint },
) {
  if (effectiveStatus(quote, now) !== "active") {
    throw new ApiError(410, "QUOTE_EXPIRED", "This quote has expired; ask for new prices");
  }
  const option = quote.body.options[input.option_index];
  if (!option) throw new ApiError(400, "INVALID_OPTION", "No such option in this quote");
  if (quote.body.buyer_wallet !== null && input.payer !== quote.body.buyer_wallet) {
    throw new ApiError(403, "WALLET_MISMATCH", "This quote was priced for another wallet; only that wallet can pay");
  }
  const amount = parseMinor(option.price_minor);
  if (amount > amountCapMinor) {
    throw new ApiError(422, "AMOUNT_CAP", `Bookings are limited to ${formatUsdc(amountCapMinor)} during the pilot`);
  }
  return { option, amount };
}

async function alreadyPaid(c: Chain, db: Db, bookingId: string, now: number): Promise<ApiError> {
  const record = await loadBookingRecord(db, bookingId);
  return new ApiError(409, "ALREADY_PAID", "This quote has already been paid", {
    body: record ? { booking: viewOf(c, record, now) } : undefined,
  });
}

/**
 * POST /api/quotes/{id}/pay: builds (or returns the cached) `create_booking` for the quote's
 * deterministic booking id (ADR-0011), partially signed by the operator as fee payer + quote signer.
 */
export async function preparePayment(c: Chain, db: Db, quoteId: string, input: PayRequest, now: number): Promise<PayResponse> {
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, quoteId) });
  if (!quote) throw new ApiError(404, "QUOTE_NOT_FOUND", "No such quote");
  const payer = parseGuestWallet(input.payer, serverKeyAddresses(c));
  const bookingId = quote.booking_id;
  const existing = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
  const chainClock = () => chainNow(c.rpc);
  if (existing && existing.status !== "awaiting_signature" && existing.status !== "failed") {
    throw await alreadyPaid(c, db, bookingId, await chainClock());
  }
  const body = quote.body as unknown as QuoteBody;
  const { option, amount } = checkPayable({ ...quote, body }, { option_index: input.option_index, payer }, { now, amountCapMinor: c.env.amountCapMinor });
  if (body.mint !== c.mint || body.program_id !== c.env.programId) {
    throw new ApiError(410, "QUOTE_EXPIRED", "This quote was issued for another deployment; ask for new prices");
  }

  const bookingPda = await bookingPdaOf(bookingId);
  const account = await fetchChainBooking(c, bookingId);
  if (account) {
    if (existing) await applyChainState(db, existing, account);
    throw await alreadyPaid(c, db, bookingId, await chainClock());
  }

  const sameRequest = existing?.guest_wallet === payer && existing.option_index === input.option_index;
  if (existing && sameRequest) {
    const cached = await reusableTx(db, bookingId, "create", now, () => c.rpc.getBlockHeight({ commitment: "confirmed" }).send());
    if (cached) {
      await updateGuestContact(db, existing, input, now);
      return {
        booking_id: bookingId,
        booking_pda: bookingPda,
        tx: cached.tx_base64,
        signer: payer,
        lastValidBlockHeight: cached.last_valid_block_height,
      };
    }
  }

  await syncUnitIfStale(db, quote.room_id, PAY_SYNC_MAX_AGE_SECS);
  const conflicts = await unitConflicts(db, {
    roomId: quote.room_id,
    stay: { checkin: quote.checkin_date, checkout: quote.checkout_date },
    now,
    bookingId,
  });
  if (hasConflicts(conflicts)) throw new ApiError(409, "HOLD_LOST", "The room was just booked elsewhere; please choose other dates");

  const balance = await fetchMaybeToken(c.rpc, await findAta(payer as Address, c.mint), { commitment: "confirmed" });
  const held = balance.exists ? balance.data.amount : 0n;
  if (held < amount) {
    throw new ApiError(409, "INSUFFICIENT_FUNDS", `This wallet holds ${formatUsdc(held)}; the booking costs ${formatUsdc(amount)}`, {
      body: { balance_minor: held.toString(), amount_minor: amount.toString() },
    });
  }

  const built = await buildCreateBookingTx({
    rpc: c.rpc,
    operator: c.operator,
    guest: payer as Address,
    hotelId: uuidToBytes(body.hotel_id),
    mint: c.mint,
    bookingId: deriveBookingId(quote.id),
    amount,
    checkinTs: BigInt(body.checkin_ts),
    checkoutTs: BigInt(body.checkout_ts),
    quoteHash: hexToBytes(quote.hash),
    optionIndex: input.option_index,
    tiers: option.tiers,
    quoteExpiresTs: BigInt(body.expires_at),
  });

  const row = {
    quote_id: quote.id,
    option_index: input.option_index,
    option_id: option.id,
    hotel_id: quote.hotel_id,
    room_type_id: quote.room_type_id,
    room_id: quote.room_id,
    guest_wallet: payer,
    guest_name: input.guest_name,
    guest_email: input.guest_email,
    guest_phone: input.guest_phone,
    checkin_date: body.checkin_date,
    checkout_date: body.checkout_date,
    checkin_ts: body.checkin_ts,
    checkout_ts: body.checkout_ts,
    amount_minor: amount.toString(),
    tiers: option.tiers,
    booking_pda: bookingPda,
    vault: await findVaultPda(bookingPda),
    status: "awaiting_signature" as const,
    updated_at: now,
  };
  await db
    .insert(bookings)
    .values({ id: bookingId, ...row, created_at: now })
    .onConflictDoUpdate({ target: bookings.id, set: row });
  if (!sameRequest) await discardBuiltTxs(db, bookingId, "create");
  await saveBuiltTx(db, { bookingId, quoteId: quote.id, action: "create", built, now });
  return {
    booking_id: bookingId,
    booking_pda: bookingPda,
    tx: built.txBase64,
    signer: payer,
    lastValidBlockHeight: Number(built.lastValidBlockHeight),
  };
}

async function updateGuestContact(db: Db, row: BookingRow, input: PayRequest, now: number): Promise<void> {
  if (row.guest_name === input.guest_name && row.guest_email === input.guest_email && row.guest_phone === input.guest_phone) return;
  await db
    .update(bookings)
    .set({ guest_name: input.guest_name, guest_email: input.guest_email, guest_phone: input.guest_phone, updated_at: now })
    .where(eq(bookings.id, row.id));
}
