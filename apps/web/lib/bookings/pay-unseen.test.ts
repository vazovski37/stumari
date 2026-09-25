import type { Address } from "@solana/kit";
import type { BookingView as ChainBooking } from "@stumari/escrow-client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { bookings, quotes } from "../db/schema";

const landed = vi.hoisted(() => ({ account: null as unknown }));
vi.mock("./lifecycle", async (importActual) => ({
  ...(await importActual<typeof import("./lifecycle")>()),
  fetchChainBooking: async () => landed.account,
}));
vi.mock("../solana/clock", () => ({ chainNow: async () => T0 + 3_600 }));

const { preparePayment } = await import("./pay");

const GUEST = "5BF9MezdLaLG2LRNWMnuEp8q53dW7cReMVcDFSKs5NDv" as Address; // any valid public key

let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
});
afterEach(() => {
  t.close();
  landed.account = null;
});

const chain = {
  operator: { address: "Operator11111111111111111111111111111111111" },
  admin: { address: "Admin111111111111111111111111111111111111111" },
  env: { cluster: "localnet", rpcUrl: "http://127.0.0.1:8899", demoMode: false },
} as never;

describe("/pay after a create that landed unseen", () => {
  it("answers ALREADY_PAID with the booking, not QUOTE_EXPIRED, once the quote has expired", async () => {
    const id = await insertBooking(db, s, {
      roomId: s.units.D1,
      roomTypeId: s.double,
      checkin: "2026-10-22",
      checkout: "2026-10-24",
      status: "awaiting_signature",
      quoteExpiresAt: T0 + 600,
      guestWallet: GUEST,
    });
    const row = (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!;
    await db.update(quotes).set({ booking_id: id }).where(eq(quotes.id, row.quote_id)); // the fixture draws them separately
    landed.account = {
      address: "BookingPda111111111111111111111111111111111",
      guest: GUEST,
      hotel: "Hote1111111111111111111111111111111111111111",
      hotelAuthority: "11111111111111111111111111111111",
      rentPayer: "11111111111111111111111111111111",
      mint: "11111111111111111111111111111111",
      amount: 130_000_000n,
      feeBps: 0,
      checkinTs: BigInt(row.checkin_ts),
      checkoutTs: BigInt(row.checkout_ts),
      createdTs: BigInt(T0),
      confirmDeadlineTs: BigInt(T0 + 7_200),
      releaseAfterTs: BigInt(row.checkin_ts + 120),
      optionIndex: 0,
      tiers: [{ secs_before: 0, refund_bps: 0 }],
      status: "pending",
      refundAmount: 0n,
      hotelAmount: 0n,
      feeAmount: 0n,
      closedTs: 0n,
    } as unknown as ChainBooking;

    const error = await preparePayment(chain, db, row.quote_id, { option_index: 0, payer: GUEST, guest_name: null, guest_email: null, guest_phone: null }, T0 + 3_600, "ip").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("ALREADY_PAID");
    expect((await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!.status).toBe("pending");
  });
});
