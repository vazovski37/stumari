import type { BookingView as ChainBooking } from "@stumari/escrow-client";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { bookingEvents, bookings, hotels } from "../db/schema";

const chainState = vi.hoisted(() => ({ account: null as unknown, sent: 0 }));
vi.mock("@stumari/escrow-client", async (importActual) => ({
  ...(await importActual<typeof import("@stumari/escrow-client")>()),
  fetchMaybeBooking: async () => chainState.account,
  buildConfirmTx: async () => ({ txBase64: "tx" }),
  sendBuiltTx: async () => {
    chainState.sent += 1;
    return { signature: "5ConfirmSig" };
  },
}));
vi.mock("../solana/clock", () => ({ chainNow: async () => T0 + 60 }));

const { autoConfirm } = await import("./lifecycle");

const GUEST = "5BF9MezdLaLG2LRNWMnuEp8q53dW7cReMVcDFSKs5NDv"; // any valid public key
const telegramCalls: string[] = [];

let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
  chainState.sent = 0;
  telegramCalls.length = 0;
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    telegramCalls.push(JSON.parse(init.body).text as string);
    return new Response("{}");
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  t.close();
});

const chain = {
  rpc: {},
  operator: { address: "Operator11111111111111111111111111111111111" },
  env: { cluster: "localnet", rpcUrl: "http://127.0.0.1:8899", siteUrl: "https://stumari.example", telegram: { botToken: "t", chatId: "c" } },
} as never;

async function pendingBooking() {
  const id = await insertBooking(db, s, {
    roomId: s.units.D1,
    roomTypeId: s.double,
    checkin: "2026-10-22",
    checkout: "2026-10-24",
    status: "pending",
    guestWallet: GUEST,
  });
  const row = (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!;
  chainState.account = {
    address: "BookingPda111111111111111111111111111111111",
    guest: GUEST,
    hotelAuthority: "11111111111111111111111111111111",
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
  return id;
}

const requests = (id: string) =>
  db.query.bookingEvents.findMany({ where: and(eq(bookingEvents.booking_id, id), eq(bookingEvents.type, "confirm_requested")) });

describe("confirm mode", () => {
  it("manual: never confirms by itself, alerts once with the dates and the dashboard link", async () => {
    await db.update(hotels).set({ confirm_mode: "manual" }).where(eq(hotels.id, s.hotelId));
    const id = await pendingBooking();

    await autoConfirm(chain, db, id);
    await autoConfirm(chain, db, id); // the sync cron calls it again for pending bookings

    expect(chainState.sent).toBe(0);
    expect(await requests(id)).toHaveLength(1);
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0]).toContain("Booking to confirm: Test Guesthouse");
    expect(telegramCalls[0]).toContain("unit D1");
    expect(telegramCalls[0]).toContain(`https://stumari.example/dashboard/${s.hotelId}`);
  });

  it("auto: confirms after a clean check and sends no alert", async () => {
    const id = await pendingBooking();
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toBe(1);
    expect(await requests(id)).toHaveLength(0);
    expect(telegramCalls).toHaveLength(0);
  });
});
