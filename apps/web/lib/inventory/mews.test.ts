import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertBooking, insertQuote, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { FakeMews, MEWS_DOUBLE, MEWS_RATE, MEWS_SERVICE } from "@/test/fake-mews";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { bookings, hotels, roomTypes } from "../db/schema";

const mews = vi.hoisted(() => ({ port: null as unknown, asked: 0 }));
vi.mock("../mews/client", async (importActual) => ({
  ...(await importActual<typeof import("../mews/client")>()),
  mewsPort: () => {
    mews.asked++;
    return mews.port;
  },
}));

const { createQuote, quoteRequest } = await import("../quotes/create");
const { checkMewsStay, claimsNotInMews } = await import("./mews");

const seed = new Uint8Array(32).fill(7);
const signerPub = ed25519.getPublicKey(seed);
const signerSecret = new Uint8Array([...seed, ...signerPub]);

let db: Db;
let s: Seeded;
let close: () => void;
let fake: FakeMews;
beforeEach(async () => {
  ({ db, close } = await tempDb());
  s = await seedHotel(db);
  fake = new FakeMews();
  mews.port = fake;
  mews.asked = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  close();
});

const STAY = { checkin: "2026-10-22", checkout: "2026-10-24" };

async function makeMewsHotel() {
  await db.update(hotels).set({ inventory_provider: "mews", mews_service_id: MEWS_SERVICE, mews_rate_id: MEWS_RATE }).where(eq(hotels.id, s.hotelId));
  await db.update(roomTypes).set({ mews_room_type_id: MEWS_DOUBLE }).where(eq(roomTypes.id, s.double));
}

const quote = (clientId = "client-a") =>
  createQuote(
    {
      db,
      cluster: "localnet",
      programId: "6Y17gFD9dWPJF6GtpzABJZY7Pk8j5CLh268zZyW5U6nf",
      mint: "4rzT3ft7dAnwZgTMkfFydr5VwDiGHaMEW3gxS6u933wH",
      signerSecret,
      serverKeys: new Set([base58.encode(signerPub)]),
      clientId,
      ipHash: null,
      now: T0,
      amountCapMinor: 1_500_000_000n,
    },
    quoteRequest.parse({ hotel_slug: "test-hotel", room_type_id: s.double, checkin_date: STAY.checkin, checkout_date: STAY.checkout, adults: 2 }),
  );

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return "OK";
}

describe("claims not yet in Mews", () => {
  it("counts occupying bookings without a Mews reservation and, for quotes, other clients' holds", async () => {
    await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...STAY, status: "pending" });
    const inMews = await insertBooking(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...STAY, status: "confirmed" });
    await db.update(bookings).set({ mews_reservation_id: "res-9" }).where(eq(bookings.id, inMews));
    await insertBooking(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...STAY, status: "voided" });
    await insertBooking(db, s, { roomId: s.units.D2, roomTypeId: s.double, checkin: "2026-10-24", checkout: "2026-10-25", status: "pending" });
    await insertQuote(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...STAY, clientId: "client-b", expiresAt: T0 + 600 });
    await insertQuote(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...STAY, clientId: "client-a", expiresAt: T0 + 600 });

    expect(await claimsNotInMews(db, s.double, STAY, T0)).toBe(1);
    expect(await claimsNotInMews(db, s.double, STAY, T0, { holdsExceptClient: "client-a" })).toBe(2);
    expect(await claimsNotInMews(db, s.twin, STAY, T0, { holdsExceptClient: "client-a" })).toBe(0);
  });
});

describe("quotes at a Mews hotel", () => {
  it("need a Mews free unit beyond Stumari's claims not yet in Mews", async () => {
    await makeMewsHotel();
    fake.free.set(MEWS_DOUBLE, 0);
    expect(await code(quote())).toBe("UNAVAILABLE");

    fake.free.set(MEWS_DOUBLE, 1);
    const pending = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...STAY, status: "pending" });
    expect(await code(quote())).toBe("UNAVAILABLE");

    // Once that booking has its Mews reservation, Mews's own count already includes it.
    await db.update(bookings).set({ mews_reservation_id: "res-1" }).where(eq(bookings.id, pending));
    expect(await code(quote())).toBe("OK");
  });

  it("fail closed when Mews cannot answer or is not configured", async () => {
    await makeMewsHotel();
    fake.getAvailability = async () => {
      throw new Error("Mews services/getAvailability: HTTP 500");
    };
    expect(await code(quote())).toBe("INVENTORY_UNAVAILABLE");
    mews.port = null;
    expect(await code(quote())).toBe("INVENTORY_UNAVAILABLE");
  });

  it("refuse an unmapped room type", async () => {
    await makeMewsHotel();
    await db.update(roomTypes).set({ mews_room_type_id: null }).where(eq(roomTypes.id, s.double));
    expect(await code(quote())).toBe("UNAVAILABLE");
  });

  it("iCal hotels never ask Mews", async () => {
    mews.port = null;
    expect(await code(quote())).toBe("OK");
    expect(mews.asked).toBe(0);
  });
});

describe("the /pay re-check", () => {
  it("excludes the paying booking itself", async () => {
    await makeMewsHotel();
    fake.free.set(MEWS_DOUBLE, 1);
    const own = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...STAY, status: "awaiting_signature", quoteExpiresAt: T0 + 600 });
    const hotel = (await db.query.hotels.findFirst({ where: eq(hotels.id, s.hotelId) }))!;
    const rt = (await db.query.roomTypes.findFirst({ where: eq(roomTypes.id, s.double) }))!;
    expect((await checkMewsStay(db, fake, hotel, rt, STAY, T0, { excludeBookingId: own })).available).toBe(true);
    expect((await checkMewsStay(db, fake, hotel, rt, STAY, T0)).available).toBe(false);
  });
});
