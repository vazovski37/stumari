import { isAddress } from "@solana/kit";
import { z } from "zod";

/**
 * Shapes of the public REST API (docs/architecture/api.md) as the MCP server consumes them.
 * Unknown fields are stripped; every string that reaches the model is either strongly typed
 * here or clipped later (text.ts).
 */

export const u64String = z.string().regex(/^(0|[1-9][0-9]*)$/, "u64 decimal string");
export const address = z.string().refine((s) => isAddress(s), "base58 address");
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
export const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "hotel slug");
export const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "lowercase UUID");
export const bookingId = z.string().regex(/^[0-9a-f]{32}$/, "32 hex chars");
export const txSignature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "base58 signature");
export const base64Tx = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64").max(4096);
const int = z.number().int().refine(Number.isSafeInteger, "safe integer");
const cluster = z.enum(["devnet", "mainnet-beta", "localnet"]);

export const tier = z.object({ secs_before: int.min(0), refund_bps: int.min(0).max(10_000) });

export const publicConfig = z.object({
  cluster,
  program_id: address,
  mint: address.nullable(),
  quote_signer: address.nullable(),
  demo_mode: z.boolean(),
});
export type PublicConfig = z.infer<typeof publicConfig>;

export const hotelList = z.array(
  z.object({
    slug,
    name: z.string(),
    city: z.string(),
    room_types: z.array(
      z.object({
        id: uuid,
        name: z.string(),
        max_adults: int,
        max_children: int,
        meal: z.string(),
      }),
    ),
  }),
);
export type HotelList = z.infer<typeof hotelList>;

export const availability = z.array(
  z.object({ room_type_id: uuid, available: z.boolean(), nights: int.min(1), base_price_minor: u64String }),
);

/** The signed body — strict, so the object we verify is exactly the one we were sent. */
export const quoteBody = z.strictObject({
  v: z.literal(1),
  id: uuid,
  cluster,
  program_id: address,
  hotel_id: uuid,
  hotel_slug: slug,
  room_type_id: uuid,
  checkin_date: date,
  checkout_date: date,
  checkin_ts: int,
  checkout_ts: int,
  nights: int.min(1),
  adults: int.min(1),
  children: int.min(0),
  buyer_type: z.enum(["guest", "agent"]),
  buyer_wallet: address.nullable(),
  mint: address,
  decimals: int,
  base_price_minor: u64String,
  options: z
    .array(
      z.strictObject({
        id: z.enum(["flexible", "standard", "nonrefundable"]),
        price_minor: u64String,
        deposit_bps: int,
        tiers: z.array(z.strictObject({ secs_before: int, refund_bps: int })).min(1).max(8),
      }),
    )
    .min(1),
  issued_at: int,
  expires_at: int,
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
});
export type QuoteBody = z.infer<typeof quoteBody>;

export const envelope = z.object({
  quote: quoteBody,
  signer: address,
  signature: z.string().max(100),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  explain: z
    .object({
      model_version: z.string().optional(),
      p_cancel: z.number().min(0).max(1).optional(),
    })
    .optional(),
});
export type Envelope = z.infer<typeof envelope>;

export const quoteRecord = z.object({ envelope, status: z.enum(["active", "used", "expired"]) });

export const payResponse = z.object({
  booking_id: bookingId,
  booking_pda: address,
  tx: base64Tx,
  signer: address,
  lastValidBlockHeight: z.union([int, u64String]),
});

export const bookingTxResponse = z.object({
  tx: base64Tx,
  signer: address,
  lastValidBlockHeight: z.union([int, u64String]),
  refund_minor: u64String.optional(),
});

export const BOOKING_STATUSES = [
  "awaiting_signature",
  "pending",
  "confirmed",
  "cancelled",
  "released",
  "disputed",
  "resolved",
  "voided",
  "failed",
] as const;

export const bookingView = z.object({
  id: bookingId,
  status: z.enum(BOOKING_STATUSES),
  hotel: z.object({
    name: z.string(),
    address: z.string().nullish(),
    checkin_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullish(),
  }),
  room_type: z.union([z.string(), z.object({ name: z.string() })]),
  checkin_date: date,
  checkout_date: date,
  amount_minor: u64String,
  option_id: z.string(),
  terms: z.object({ tiers: z.array(tier).min(1).max(8) }),
  refund_if_cancel_now_minor: u64String.nullish(),
  can_cancel: z.boolean(),
  can_dispute: z.boolean(),
  can_void: z.boolean(),
  confirm_deadline_ts: int.nullish(),
  release_after_ts: int.nullish(),
  booking_pda: address,
  /** The chain clock (unix seconds) the view was built at; optional for older servers. */
  now: int.optional(),
});
export type BookingView = z.infer<typeof bookingView>;

export const sendResponse = z.object({ signature: txSignature, booking: z.unknown() });

export const apiError = z.object({
  error: z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), message: z.string() }),
});
