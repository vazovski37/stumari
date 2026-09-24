import { bookingIdHex, buildQuoteBody, signQuote, USDC_DECIMALS, type HazardProvider, type QuoteBody, type QuoteEnvelope } from "@stumari/core";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { quotes } from "../db/schema";
import type { Cluster } from "../env-schema";
import { assertFits, findPublicHotel, hotelPolicy, parseStay, SLUG } from "../hotels";
import { insertQuoteHold } from "../inventory/holds";
import { parseGuestWallet } from "../wallets";
import { hazardProvider, priceRequest } from "./pricing";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const quoteRequest = z.object({
  hotel_slug: z.string().regex(SLUG, "hotel slug"),
  room_type_id: z.string().regex(UUID, "room type id"),
  checkin_date: z.string().regex(DATE, "YYYY-MM-DD"),
  checkout_date: z.string().regex(DATE, "YYYY-MM-DD"),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  buyer_type: z.enum(["guest", "agent"]).default("guest"),
  buyer_wallet: z.string().max(64).nullish(),
});
export type QuoteRequest = z.infer<typeof quoteRequest>;

export interface QuoteContext {
  db: Db;
  cluster: Cluster;
  programId: string;
  mint: string;
  /** Operator = quote signer (64-byte keypair). */
  signerSecret: Uint8Array;
  serverKeys: ReadonlySet<string>;
  /** Hold owner (data-model.md `quotes.client_id`). */
  clientId: string;
  ipHash: string | null;
  now: number;
  hazard?: HazardProvider;
}

/**
 * POST /api/quotes (quote-protocol.md "Lifecycle" 1): prices the menu for this request, signs it
 * and stores it together with a 10-minute hold on one unit.
 */
export async function createQuote(ctx: QuoteContext, input: QuoteRequest): Promise<QuoteEnvelope> {
  const { db, now } = ctx;
  const found = await findPublicHotel(db, input.hotel_slug);
  if (!found) throw new ApiError(404, "HOTEL_NOT_FOUND", "No such hotel");
  const { hotel } = found;
  if (!hotel.onchain_hotel) throw new ApiError(409, "UNAVAILABLE", "This hotel is not accepting bookings yet");
  const roomType = found.roomTypes.find((rt) => rt.id === input.room_type_id);
  if (!roomType) throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "No such room type at this hotel");
  const stay = parseStay(hotel, input.checkin_date, input.checkout_date, now);
  assertFits(roomType, input.adults, input.children);
  const buyerWallet = input.buyer_wallet ? parseGuestWallet(input.buyer_wallet, ctx.serverKeys) : null;

  const menu = await priceRequest(
    db,
    {
      hotel,
      roomType,
      stay,
      adults: input.adults,
      children: input.children,
      buyerType: input.buyer_type,
      buyerWallet,
      issuedAt: now,
      policy: hotelPolicy(hotel),
    },
    ctx.hazard ?? hazardProvider(),
  );
  const body = buildQuoteBody({
    cluster: ctx.cluster,
    program_id: ctx.programId,
    hotel_id: hotel.id,
    hotel_slug: hotel.slug,
    room_type_id: roomType.id,
    checkin_date: stay.checkin,
    checkout_date: stay.checkout,
    checkin_ts: stay.checkinTs,
    checkout_ts: stay.checkoutTs,
    adults: input.adults,
    children: input.children,
    buyer_type: input.buyer_type,
    buyer_wallet: buyerWallet,
    mint: ctx.mint,
    decimals: USDC_DECIMALS,
    base_price_minor: menu.basePrice.toString(),
    options: menu.options,
    issued_at: now,
  });
  const signed = signQuote(body, ctx.signerSecret);
  const envelope: QuoteEnvelope = { ...signed, explain: menu.explain };

  const unit = await insertQuoteHold(db, {
    id: body.id,
    hotel_id: hotel.id,
    room_type_id: roomType.id,
    checkin_date: stay.checkin,
    checkout_date: stay.checkout,
    body,
    signature: signed.signature,
    hash: signed.hash,
    explain: menu.explain,
    booking_id: bookingIdHex(body.id),
    buyer_type: input.buyer_type,
    buyer_wallet: buyerWallet,
    client_id: ctx.clientId,
    ip_hash: ctx.ipHash,
    expires_at: body.expires_at,
    created_at: now,
  });
  if (!unit) throw new ApiError(409, "UNAVAILABLE", `No ${roomType.name} is free for these dates`);
  return envelope;
}

export type QuoteRow = typeof quotes.$inferSelect;
export type QuoteStatus = QuoteRow["status"];

/** Lazy expiry (quote-protocol.md "Lifecycle" 4): an active quote past `expires_at` reads as expired. */
export function effectiveStatus(q: Pick<QuoteRow, "status" | "expires_at">, now: number): QuoteStatus {
  return q.status === "active" && q.expires_at <= now ? "expired" : q.status;
}

/** Marks every active quote past its expiry as expired (cron); returns how many. */
export async function expireQuotes(db: Db, now: number): Promise<number> {
  const result = await db
    .update(quotes)
    .set({ status: "expired" })
    .where(and(eq(quotes.status, "active"), lte(quotes.expires_at, now)));
  return result.rowsAffected;
}

/** The stored envelope of a quote (the explain block is kept with it). */
export function envelopeOf(q: QuoteRow, signer: string): QuoteEnvelope {
  return {
    quote: q.body as unknown as QuoteBody,
    signer,
    signature: q.signature,
    hash: q.hash,
    explain: q.explain as unknown as QuoteEnvelope["explain"],
  };
}
