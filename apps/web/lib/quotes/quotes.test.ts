import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import {
  addDays,
  bookingIdHex,
  hashQuote,
  priceMenu,
  verifyQuote,
  walletHistoryFeatures,
  type QuoteBody,
} from "@stumari/core";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { ApiError } from "../api/errors";
import { checkPayable } from "../bookings/pay";
import type { Db } from "../db/client";
import { hotels, quotes } from "../db/schema";
import { createQuote, quoteRequest, type QuoteContext } from "./create";
import { basePriceMinor, hazardProvider } from "./pricing";

const seed = new Uint8Array(32).fill(7);
const signerPub = ed25519.getPublicKey(seed);
const signerSecret = new Uint8Array([...seed, ...signerPub]);
const signer = base58.encode(signerPub);
const wallet = (n: number) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(n)));
const MINT = "4rzT3ft7dAnwZgTMkfFydr5VwDiGHaMEW3gxS6u933wH";
const PROGRAM = "6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf";

let db: Db;
let s: Seeded;
let close: () => void;

beforeEach(async () => {
  ({ db, close } = await tempDb());
  s = await seedHotel(db);
});
afterEach(() => close());

const ctx = (over: Partial<QuoteContext> = {}): QuoteContext => ({
  db,
  cluster: "localnet",
  programId: PROGRAM,
  mint: MINT,
  signerSecret,
  serverKeys: new Set([signer]),
  clientId: "client-a",
  ipHash: "ip",
  now: T0,
  ...over,
});

const request = (over: Record<string, unknown> = {}) =>
  quoteRequest.parse({
    hotel_slug: "test-hotel",
    room_type_id: s.double,
    checkin_date: "2026-10-23", // Friday and Saturday nights: both at the weekend rate
    checkout_date: "2026-10-25",
    adults: 2,
    ...over,
  });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  throw new Error("expected an ApiError");
}

describe("pricing wiring", () => {
  it("sums nightly rates with the weekend rate on Friday and Saturday nights", () => {
    const rt = { base_rate_minor: "65000000", weekend_rate_minor: "75000000" };
    expect(basePriceMinor(rt, { checkin: "2026-10-22", checkout: "2026-10-26" })).toBe(65_000_000n * 2n + 75_000_000n * 2n);
    expect(basePriceMinor({ ...rt, weekend_rate_minor: null }, { checkin: "2026-10-23", checkout: "2026-10-25" })).toBe(130_000_000n);
  });

  it("signs a v1 quote priced by @stumari/core with the hotel's policy and holds a unit", async () => {
    const env = await createQuote(ctx(), request());
    expect(verifyQuote(env, signer)).toBe(true);
    expect(env.hash).toBe(hashQuote(env.quote).hex);
    const body: QuoteBody = env.quote;
    expect(body).toMatchObject({ cluster: "localnet", program_id: PROGRAM, mint: MINT, nights: 2, base_price_minor: "150000000" });
    expect(body.expires_at - body.issued_at).toBe(600);
    expect(body.checkin_ts).toBe(Date.UTC(2026, 9, 23, 10) / 1000); // 14:00 in Tbilisi
    const standard = body.options.find((o) => o.id === "standard");
    expect(standard?.price_minor).toBe("150000000"); // the reference template costs the base rate
    expect(env.explain.options.map((o) => o.id)).toEqual(["flexible", "standard", "nonrefundable"]);

    const [row] = await db.select().from(quotes).where(eq(quotes.id, body.id));
    expect(row).toMatchObject({ room_id: s.units.D1, status: "active", booking_id: bookingIdHex(body.id), client_id: "client-a" });
  });

  it("uses the buyer wallet's released bookings (capped at 3) and nothing else", async () => {
    const w = wallet(9);
    for (const status of ["released", "released", "released", "released", "cancelled", "resolved"] as const) {
      await insertBooking(db, s, { roomId: s.units.T1, roomTypeId: s.twin, checkin: "2026-09-01", checkout: "2026-09-02", status, guestWallet: w });
    }
    const priced = await createQuote(ctx(), request({ buyer_wallet: w }));
    expect(priced.quote.buyer_wallet).toBe(w);
    expect(priced.explain.features).toMatchObject({ is_repeated_guest: 1, previous_bookings_not_canceled: 3 });

    const expected = priceMenu({
      provider: hazardProvider(),
      policy: (await db.query.hotels.findFirst())!.policy,
      basePriceMinor: 150_000_000n,
      request: {
        issued_at: T0,
        checkin_ts: priced.quote.checkin_ts,
        checkin_date: "2026-10-23",
        checkout_date: "2026-10-25",
        adults: 2,
        children: 0,
        buyer_type: "guest",
        hotel_type: "City Hotel",
        meal: "BB",
        ...walletHistoryFeatures(w, 4),
      },
    });
    expect(priced.quote.options).toEqual(expected.options);

    const anonymous = await createQuote(ctx({ clientId: "client-b" }), request());
    expect(anonymous.explain.features).toMatchObject({ is_repeated_guest: 0, previous_bookings_not_canceled: 0 });
  });

  it("anchors on the hotel's own reference template and enabled contracts", async () => {
    await db
      .update(hotels)
      .set({
        policy: {
          reference_template: "flexible",
          enabled_templates: ["flexible", "nonrefundable"],
          resale_bps: [5000, 4000, 3000, 2000, 1000, 0],
          min_mult_bps: 8500,
          max_mult_bps: 13000,
        },
      })
      .where(eq(hotels.id, s.hotelId));
    const env = await createQuote(ctx(), request());
    expect(env.quote.options.map((o) => o.id)).toEqual(["flexible", "nonrefundable"]);
    expect(env.quote.options[0]?.price_minor).toBe("150000000");
    expect(env.explain.resale_bps).toEqual([5000, 4000, 3000, 2000, 1000, 0]);
  });

  it("refuses bad dates, too many guests, server wallets and full inventory", async () => {
    expect(await code(createQuote(ctx(), request({ checkout_date: "2026-10-23" })))).toBe("INVALID_DATES");
    expect(await code(createQuote(ctx(), request({ checkin_date: "2026-02-30" })))).toBe("INVALID_DATES");
    expect(await code(createQuote(ctx({ now: Date.UTC(2026, 9, 23, 10) / 1000 }), request()))).toBe("INVALID_DATES");
    expect(await code(createQuote(ctx(), request({ checkout_date: addDays("2026-10-23", 31) })))).toBe("INVALID_DATES");
    expect(await code(createQuote(ctx(), request({ adults: 3 })))).toBe("TOO_MANY_GUESTS");
    expect(await code(createQuote(ctx(), request({ buyer_wallet: signer })))).toBe("INVALID_WALLET");
    expect(await code(createQuote(ctx(), request({ hotel_slug: "nope" })))).toBe("HOTEL_NOT_FOUND");

    await createQuote(ctx({ clientId: "x" }), request({ room_type_id: s.twin }));
    expect(await code(createQuote(ctx({ clientId: "y" }), request({ room_type_id: s.twin })))).toBe("UNAVAILABLE");
  });

  it("allows a same-day check-in until the check-in time", async () => {
    const morning = Date.UTC(2026, 9, 23, 6) / 1000; // 10:00 in Tbilisi
    const env = await createQuote(ctx({ now: morning }), request());
    expect(env.quote.checkin_ts - morning).toBe(4 * 3600);
  });
});

describe("pay checks (quote-protocol.md Lifecycle 2)", () => {
  const body = (over: Partial<QuoteBody> = {}) =>
    ({
      buyer_wallet: null,
      options: [{ id: "standard", price_minor: "140000000", deposit_bps: 10000, tiers: [{ secs_before: 0, refund_bps: 0 }] }],
      ...over,
    }) as QuoteBody;
  const quote = (over: Partial<QuoteBody> = {}, status: "active" | "used" | "expired" = "active") => ({
    status,
    expires_at: T0 + 600,
    body: body(over),
  });
  const limits = { now: T0, amountCapMinor: 1_500_000_000n };
  const payCode = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as ApiError).code;
    }
    return "OK";
  };

  it("enforces expiry, option, wallet binding and the pilot amount cap", () => {
    expect(payCode(() => checkPayable(quote(), { option_index: 0, payer: wallet(1) }, limits))).toBe("OK");
    expect(payCode(() => checkPayable(quote(), { option_index: 0, payer: wallet(1) }, { ...limits, now: T0 + 600 }))).toBe("QUOTE_EXPIRED");
    expect(payCode(() => checkPayable(quote({}, "expired"), { option_index: 0, payer: wallet(1) }, limits))).toBe("QUOTE_EXPIRED");
    expect(payCode(() => checkPayable(quote(), { option_index: 1, payer: wallet(1) }, limits))).toBe("INVALID_OPTION");
    expect(payCode(() => checkPayable(quote({ buyer_wallet: wallet(2) }), { option_index: 0, payer: wallet(1) }, limits))).toBe("WALLET_MISMATCH");
    expect(payCode(() => checkPayable(quote({ buyer_wallet: wallet(2) }), { option_index: 0, payer: wallet(2) }, limits))).toBe("OK");
    expect(payCode(() => checkPayable(quote(), { option_index: 0, payer: wallet(1) }, { ...limits, amountCapMinor: 139_990_000n }))).toBe("AMOUNT_CAP");
    expect(payCode(() => checkPayable(quote(), { option_index: 0, payer: wallet(1) }, { ...limits, amountCapMinor: 140_000_000n }))).toBe("OK");
  });

  it("maps the cap to HTTP 422", () => {
    try {
      checkPayable(quote(), { option_index: 0, payer: wallet(1) }, { ...limits, amountCapMinor: 1n });
    } catch (e) {
      expect((e as ApiError).status).toBe(422);
    }
  });
});
