import type { Address } from "@solana/kit";
import type { BookingView as ChainBooking } from "@stumari/escrow-client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { bookings } from "../db/schema";
import { applyChainState } from "./store";

const PAYER = "PayerWa11et11111111111111111111111111111111" as Address;
const TIERS = [{ secs_before: 0, refund_bps: 0 }];

let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
});
afterEach(() => t.close());

const chain = (over: Partial<ChainBooking>): ChainBooking => ({
  address: "BookingPda111111111111111111111111111111111" as Address,
  bookingId: new Uint8Array(16),
  bookingIdHex: "00".repeat(16),
  hotel: "Hote1111111111111111111111111111111111111111" as Address,
  hotelAuthority: "11111111111111111111111111111111" as Address,
  guest: PAYER,
  rentPayer: "11111111111111111111111111111111" as Address,
  mint: "11111111111111111111111111111111" as Address,
  amount: 130_000_000n,
  feeBps: 0,
  checkinTs: BigInt(T0 + 86_400 * 30),
  checkoutTs: BigInt(T0 + 86_400 * 32),
  createdTs: BigInt(T0),
  confirmDeadlineTs: BigInt(T0 + 7_200),
  releaseAfterTs: BigInt(T0 + 86_400 * 30 + 120),
  quoteHash: new Uint8Array(32),
  optionIndex: 0,
  tiers: TIERS,
  status: "confirmed",
  refundAmount: 0n,
  hotelAmount: 0n,
  feeAmount: 0n,
  closedTs: 0n,
  ...over,
});

async function row(id: string) {
  return (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!;
}

describe("applyChainState", () => {
  it("takes the paying wallet from the chain, not from the last /pay call", async () => {
    const id = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status: "awaiting_signature" });
    const next = await applyChainState(db, await row(id), chain({ status: "pending" }));
    expect(next.guest_wallet).toBe(PAYER);
  });

  it("records an exit signature only once the booking is closed on-chain", async () => {
    const id = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status: "confirmed" });
    // e.g. someone posts the public create signature to /submitted for an open booking
    const open = await applyChainState(db, await row(id), chain({ status: "confirmed" }), { field: "final_sig", value: "5NotAnExit" });
    expect(open.final_sig).toBeNull();

    const closed = await applyChainState(db, await row(id), chain({ status: "cancelled", closedTs: BigInt(T0 + 100) }), { field: "final_sig", value: "5CancelSig" });
    expect(closed.final_sig).toBe("5CancelSig");

    const later = await applyChainState(db, await row(id), chain({ status: "cancelled", closedTs: BigInt(T0 + 100) }), { field: "final_sig", value: "5Other" });
    expect(later.final_sig).toBe("5CancelSig");
  });

  it("never writes the Mews columns back from a stale row", async () => {
    const id = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status: "pending" });
    const stale = await row(id);
    // meanwhile the Mews sync stored a customer
    await db.update(bookings).set({ mews_customer_id: "cust-1", mews_customer_at: T0 + 30 }).where(eq(bookings.id, id));
    await applyChainState(db, stale, chain({ status: "confirmed" }));
    const after = await row(id);
    expect(after.mews_customer_id).toBe("cust-1");
    expect(after.mews_customer_at).toBe(T0 + 30);
  });

  it("records a confirm signature only once the chain shows the booking confirmed", async () => {
    const id = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status: "pending" });
    const pending = await applyChainState(db, await row(id), chain({ status: "pending" }), { field: "confirm_sig", value: "5Early" });
    expect(pending.confirm_sig).toBeNull();
    const confirmed = await applyChainState(db, await row(id), chain({ status: "confirmed" }), { field: "confirm_sig", value: "5Confirm" });
    expect(confirmed.confirm_sig).toBe("5Confirm");
  });
});
