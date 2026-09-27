import type { BookingView as ChainBooking } from "@stumari/escrow-client";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { FakeMews, MEWS_DOUBLE, MEWS_RATE, MEWS_SERVICE } from "@/test/fake-mews";
import type { Db } from "../db/client";
import { bookingEvents, bookings, hotels, quotes, roomTypes } from "../db/schema";

const chainState = vi.hoisted(() => ({ account: null as unknown, sent: [] as string[], failNextSend: false }));
const mews = vi.hoisted(() => ({ port: null as unknown, asked: 0 }));

vi.mock("@stumari/escrow-client", async (importActual) => ({
  ...(await importActual<typeof import("@stumari/escrow-client")>()),
  fetchMaybeBooking: async () => chainState.account,
  buildConfirmTx: async () => ({ txBase64: "confirm" }),
  buildVoidTx: async () => ({ txBase64: "void" }),
  sendBuiltTx: async (_rpc: unknown, built: { txBase64: string }) => {
    if (chainState.failNextSend) {
      chainState.failNextSend = false;
      throw new Error("blockhash expired");
    }
    chainState.sent.push(built.txBase64);
    const account = chainState.account as { status: string };
    account.status = built.txBase64 === "confirm" ? "confirmed" : "voided";
    return { signature: `5${built.txBase64}Sig` };
  },
}));
vi.mock("../solana/clock", () => ({ chainNow: async () => T0 + 60 }));
vi.mock("../solana/chain-config", () => ({ onchainConfig: async () => null }));
vi.mock("../mews/client", async (importActual) => ({
  ...(await importActual<typeof import("../mews/client")>()),
  mewsPort: () => {
    mews.asked++;
    return mews.port;
  },
}));

const { autoConfirm, syncFromChain } = await import("./lifecycle");
const { ensureMewsReservation, MEWS_CUSTOMER_GRACE_SECS, settleMewsAfterExit, unsettledMewsExits } = await import("./mews-sync");
const { loadBookingRecord } = await import("./store");
const { operatorAction } = await import("./operator");

const GUEST = "5BF9MezdLaLG2LRNWMnuEp8q53dW7cReMVcDFSKs5NDv";
let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
let fake: FakeMews;

beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
  fake = new FakeMews();
  mews.port = fake;
  mews.asked = 0;
  chainState.sent = [];
  chainState.failNextSend = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  t.close();
});

const chain = {
  rpc: {},
  operator: { address: "Operator11111111111111111111111111111111111" },
  admin: { address: "Admin111111111111111111111111111111111111111" },
  env: { cluster: "localnet", rpcUrl: "http://127.0.0.1:8899", siteUrl: "https://stumari.example", telegram: null },
} as never;

async function makeMewsHotel() {
  await db.update(hotels).set({ inventory_provider: "mews", mews_service_id: MEWS_SERVICE, mews_rate_id: MEWS_RATE }).where(eq(hotels.id, s.hotelId));
  await db.update(roomTypes).set({ mews_room_type_id: MEWS_DOUBLE }).where(eq(roomTypes.id, s.double));
}

function account(row: typeof bookings.$inferSelect, status: string): ChainBooking {
  return {
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
    status,
    refundAmount: 0n,
    hotelAmount: 0n,
    feeAmount: 0n,
    closedTs: 0n,
  } as unknown as ChainBooking;
}

async function booking(status: "pending" | "confirmed", extra: Partial<typeof bookings.$inferInsert> = {}, roomId = s.units.D1) {
  const id = await insertBooking(db, s, { roomId, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status, guestWallet: GUEST });
  await db.update(bookings).set({ create_sig: "5CreateSig", guest_name: "Nino Beridze", guest_email: "nino@example.com", ...extra }).where(eq(bookings.id, id));
  const row = (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!;
  await db.update(quotes).set({ body: { adults: 2, children: 0 } }).where(eq(quotes.id, row.quote_id));
  chainState.account = account(row, status);
  return id;
}

const load = async (id: string) => (await db.query.bookings.findFirst({ where: eq(bookings.id, id) }))!;
const events = (id: string, type: (typeof bookingEvents.$inferSelect)["type"]) =>
  db.query.bookingEvents.findMany({ where: and(eq(bookingEvents.booking_id, id), eq(bookingEvents.type, type)) });

describe("Mews confirm", () => {
  it("creates exactly one Confirmed reservation, stores its id, then confirms on-chain", async () => {
    await makeMewsHotel();
    const id = await booking("pending");

    await autoConfirm(chain, db, id);
    await autoConfirm(chain, db, id); // the sync cron calls it again; the booking is confirmed by now

    expect(fake.calls.add).toBe(1);
    expect(fake.calls.customers).toBe(1);
    expect(fake.reservations).toHaveLength(1);
    const r = fake.reservations[0]!;
    expect(r.request).toMatchObject({ roomTypeId: MEWS_DOUBLE, rateId: MEWS_RATE, checkin: "2026-10-22", checkout: "2026-10-24", adults: 2, children: 0 });
    expect(r.request.notes).toBe(`Prepaid in USDC via Stumari, booking ${id}, tx 5CreateSig`);
    // Demo environment: never the guest's real name or email.
    expect(fake.customers[0]).toEqual({ id: "cust-1", firstName: "Test", lastName: "Stumari" });
    expect(chainState.sent).toEqual(["confirm"]);
    const row = await load(id);
    expect(row).toMatchObject({ status: "confirmed", confirm_sig: "5confirmSig", mews_reservation_id: "res-1", mews_customer_id: "cust-1" });
    expect(await events(id, "mews_reserved")).toHaveLength(1);
  });

  it("never creates a second reservation when a retry follows a failed on-chain confirm", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    // First run: the reservation is created, then confirm_booking fails to land.
    chainState.failNextSend = true;
    await autoConfirm(chain, db, id);
    expect(await load(id)).toMatchObject({ status: "pending", mews_reservation_id: "res-1" });

    await autoConfirm(chain, db, id);
    expect(fake.calls.add).toBe(1);
    expect((await load(id)).status).toBe("confirmed");
  });

  it("recovers the reservation of an add that timed out after Mews applied it", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.failAdd = "timeout-applied";

    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual([]);
    expect(await load(id)).toMatchObject({ status: "pending", mews_customer_id: "cust-1", mews_reservation_id: null });

    // An immediate retry waits out the cool-down (Mews lists a new reservation by customer only after a delay).
    await autoConfirm(chain, db, id);
    expect(fake.calls.lookups).toBe(0);
    expect((await load(id)).mews_lock_until).toBeGreaterThan(Math.floor(Date.now() / 1000));

    await db.update(bookings).set({ mews_lock_until: null }).where(eq(bookings.id, id)); // cool-down over
    await autoConfirm(chain, db, id); // the cron's retry
    expect(fake.calls.add).toBe(1);
    expect(fake.active).toHaveLength(1);
    expect(await load(id)).toMatchObject({ status: "confirmed", mews_reservation_id: "res-1" });
    expect((await events(id, "mews_reserved"))[0]?.data).toMatchObject({ recovered: true });
  });

  it("runs one attempt at a time: concurrent confirms create one reservation", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    await Promise.all([autoConfirm(chain, db, id), autoConfirm(chain, db, id), autoConfirm(chain, db, id)]);
    expect(fake.calls.customers).toBe(1);
    expect(fake.calls.add).toBe(1);
    expect(await load(id)).toMatchObject({ mews_reservation_id: "res-1", mews_lock_until: null });
  });

  it("does not void when an earlier attempt's reservation may not be listed yet", async () => {
    await makeMewsHotel();
    const id = await booking("pending", { mews_customer_id: "cust-lost" });
    fake.free.set(MEWS_DOUBLE, 0);
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual([]);
    expect((await load(id)).status).toBe("pending");
  });

  it("voids at once (full refund) when Mews has no free unit, without creating anything", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.free.set(MEWS_DOUBLE, 0);

    await autoConfirm(chain, db, id);

    expect(fake.calls.customers).toBe(0);
    expect(fake.calls.add).toBe(0);
    expect(chainState.sent).toEqual(["void"]);
    expect(await load(id)).toMatchObject({ status: "voided", final_sig: "5voidSig" });
    expect(await events(id, "sync_conflict")).toHaveLength(1);
  });

  it("voids when reservations/add refuses and Mews then shows no free unit", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.failAdd = "403";
    const original = fake.addReservation.bind(fake);
    fake.addReservation = async (...args) => {
      fake.free.set(MEWS_DOUBLE, 0); // another channel sold the last room meanwhile
      return original(...args);
    };

    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual(["void"]);
    expect((await load(id)).status).toBe("voided");
    expect(fake.active).toHaveLength(0);
  });

  it("stays pending on a transient Mews error, for the cron to retry", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.getSetup = async () => {
      throw new Error("Mews services/getAll: no response within 15000 ms");
    };
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual([]);
    expect((await load(id)).status).toBe("pending");
  });

  it("stays pending (no void) when the room type is not mapped to Mews", async () => {
    await makeMewsHotel();
    await db.update(roomTypes).set({ mews_room_type_id: null }).where(eq(roomTypes.id, s.double));
    const id = await booking("pending");
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual([]);
    expect(fake.calls.add).toBe(0);
  });
});

describe("Mews manual confirm (dashboard / admin)", () => {
  it("creates the Mews reservation first, and refuses when Mews has no room", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.free.set(MEWS_DOUBLE, 0);
    await expect(operatorAction(chain, db, id, "confirm")).rejects.toMatchObject({ code: "NOT_ALLOWED", extra: { body: { reason: "MEWS_UNAVAILABLE" } } });
    expect(chainState.sent).toEqual([]);

    fake.free.set(MEWS_DOUBLE, 1);
    const row = await operatorAction(chain, db, id, "confirm");
    expect(row.status).toBe("confirmed");
    expect(fake.calls.add).toBe(1);
    expect((await load(id)).mews_reservation_id).toBe("res-1");
  });
});

describe("Mews cancel", () => {
  async function reserved(status: "pending" | "confirmed") {
    await makeMewsHotel();
    const customerId = await fake.addCustomer({ lastName: "Stumari" });
    const setup = await fake.getSetup();
    const r = await fake.addReservation(setup, customerId, {
      roomTypeId: MEWS_DOUBLE,
      rateId: MEWS_RATE,
      checkin: "2026-10-22",
      checkout: "2026-10-24",
      adults: 2,
      children: 0,
      notes: "x",
    });
    return booking(status, { mews_customer_id: customerId, mews_reservation_id: r.reservationId });
  }

  it("a guest cancel on-chain cancels the Mews reservation once", async () => {
    const id = await reserved("confirmed");
    (chainState.account as { status: string }).status = "cancelled";

    await syncFromChain(chain, db, await load(id));
    await syncFromChain(chain, db, await load(id));

    expect(fake.calls.cancel).toBe(1);
    expect(fake.active).toHaveLength(0);
    const row = await load(id);
    expect(row.status).toBe("cancelled");
    expect(row.mews_cancelled_at).not.toBeNull();
    expect(await events(id, "mews_cancelled")).toHaveLength(1);
  });

  it("a void cancels it too; a failed cancel is retried by the cron", async () => {
    const id = await reserved("pending");
    (chainState.account as { status: string }).status = "voided";
    fake.failCancel = 1;

    await syncFromChain(chain, db, await load(id));
    expect(fake.active).toHaveLength(1);
    expect(await unsettledMewsExits(db, 20)).toEqual([id]);

    expect(await settleMewsAfterExit(db, id, () => fake)).toBe("settled");
    expect(fake.active).toHaveLength(0);
    expect(await unsettledMewsExits(db, 20)).toEqual([]);
  });

  it("treats a reservation the hotel already cancelled in Mews as settled", async () => {
    const id = await reserved("confirmed");
    fake.reservations[0]!.state = "Canceled";
    fake.reservations[0]!.cancelledUtc = "2026-09-28T00:00:00Z";
    (chainState.account as { status: string }).status = "cancelled";
    await syncFromChain(chain, db, await load(id));
    expect((await load(id)).mews_cancelled_at).not.toBeNull();
  });

  it("leaves the reservation of a released booking alone (the guest stayed)", async () => {
    const id = await reserved("confirmed");
    (chainState.account as { status: string }).status = "released";
    await syncFromChain(chain, db, await load(id));
    expect(fake.calls.cancel).toBe(0);
    expect(fake.active).toHaveLength(1);
  });
});

const wall = () => Math.floor(Date.now() / 1000);
const ensure = async (id: string, opts?: { budgetMs?: number }) => ensureMewsReservation(db, (await loadBookingRecord(db, id))!, fake, opts);

describe("Mews: a cancel or void while a confirm attempt runs", () => {
  it("settle waits while reservations/add is in flight, and the late reservation is cancelled at once", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    const settledDuringAdd: string[] = [];
    fake.before.add = async () => {
      // The guest is refunded (admin void) while the add is on its way to Mews.
      await db.update(bookings).set({ status: "voided" }).where(eq(bookings.id, id));
      settledDuringAdd.push(await settleMewsAfterExit(db, id, () => fake));
    };

    expect(await ensure(id)).toEqual({ kind: "reserved", reservationId: "res-1" });

    expect(settledDuringAdd).toEqual(["failed"]); // not "settled" with nothing to cancel
    expect(fake.reservations).toHaveLength(1);
    expect(fake.active).toHaveLength(0); // the late reservation was cancelled right away
    const row = await load(id);
    expect(row).toMatchObject({ mews_reservation_id: "res-1", mews_lock_until: null });
    expect(row.mews_cancelled_at).not.toBeNull();
    expect(await unsettledMewsExits(db, 20)).toEqual([]);
  });

  it("never starts reservations/add for a booking that is no longer pending", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.before.customers = async () => {
      await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id));
    };
    expect(await ensure(id)).toMatchObject({ kind: "retry", reason: expect.stringContaining("cancelled") });
    expect(fake.calls.add).toBe(0);
  });

  it("a customer with nothing listed counts as settled only after the grace period", async () => {
    await makeMewsHotel();
    const id = await booking("pending", { status: "voided", mews_customer_id: "cust-9", mews_customer_at: wall() - 10 });
    expect(await settleMewsAfterExit(db, id, () => fake)).toBe("failed");
    expect(await unsettledMewsExits(db, 20)).toEqual([id]);

    await db.update(bookings).set({ mews_customer_at: wall() - MEWS_CUSTOMER_GRACE_SECS }).where(eq(bookings.id, id));
    expect(await settleMewsAfterExit(db, id, () => fake)).toBe("settled");
    expect(await unsettledMewsExits(db, 20)).toEqual([]);
  });

  it("settle waits during a cool-down after an ambiguous add", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.failAdd = "timeout-applied";
    await ensure(id);
    await db.update(bookings).set({ status: "voided" }).where(eq(bookings.id, id));
    expect(await settleMewsAfterExit(db, id, () => fake)).toBe("failed");
    expect(fake.active).toHaveLength(1);

    await db.update(bookings).set({ mews_lock_until: null }).where(eq(bookings.id, id)); // cool-down over
    expect(await settleMewsAfterExit(db, id, () => fake)).toBe("settled");
    expect(fake.active).toHaveLength(0);
  });
});

describe("Mews: returning guests and recovery", () => {
  it("books a returning guest: one customer per booking, no email sent to Mews, contact in the Notes", async () => {
    await makeMewsHotel();
    fake.production = true;
    const a = await booking("pending");
    const b = await booking("pending", {}, s.units.D2); // the same guest (name and email) again

    expect((await ensure(a)).kind).toBe("reserved");
    expect((await ensure(b)).kind).toBe("reserved");

    expect(fake.customers).toEqual([
      { id: "cust-1", firstName: "Nino", lastName: "Beridze" },
      { id: "cust-2", firstName: "Nino", lastName: "Beridze" },
    ]);
    expect(fake.reservations.map((r) => r.request.notes)).toEqual([
      `Prepaid in USDC via Stumari, booking ${a}, tx 5CreateSig. Guest: Nino Beridze <nino@example.com>`,
      `Prepaid in USDC via Stumari, booking ${b}, tx 5CreateSig. Guest: Nino Beridze <nino@example.com>`,
    ]);
  });

  it("adopts only a reservation of this stay; any other reservation of the customer blocks a new add", async () => {
    await makeMewsHotel();
    const setup = await fake.getSetup();
    const customerId = await fake.addCustomer({ lastName: "Stumari" });
    await fake.addReservation(setup, customerId, { roomTypeId: MEWS_DOUBLE, rateId: MEWS_RATE, checkin: "2026-11-02", checkout: "2026-11-04", adults: 1, children: 0, notes: "other" });
    const id = await booking("pending", { mews_customer_id: customerId, mews_customer_at: wall() - 600 });

    expect(await ensure(id)).toMatchObject({ kind: "retry", reason: expect.stringContaining("do not match") });
    expect(fake.calls.add).toBe(1); // only the setup above
    expect((await load(id)).mews_reservation_id).toBeNull();
  });
});

describe("Mews: lock and time budget", () => {
  it("an attempt ends within its budget when Mews hangs, and frees the lock", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.hang.add("setup");
    const started = Date.now();
    expect((await ensure(id, { budgetMs: 50 })).kind).toBe("retry");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(fake.signals.setup?.[0]).toBeInstanceOf(AbortSignal);
    expect((await load(id)).mews_lock_until).toBeNull();
  });

  it("passes the attempt's deadline to every Mews call", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    await ensure(id);
    for (const op of ["setup", "availability", "customers", "add"] as const) {
      expect(fake.signals[op]?.every((signal) => signal instanceof AbortSignal)).toBe(true);
    }
  });

  it("does not add a reservation once the lock belongs to someone else, and leaves their lock alone", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    const theirs = wall() + 999;
    fake.before.customers = async () => {
      // As if this attempt stalled past the lock and another attempt took it over.
      await db.update(bookings).set({ mews_lock_until: theirs }).where(eq(bookings.id, id));
    };
    expect(await ensure(id)).toMatchObject({ kind: "retry", reason: expect.stringContaining("lock") });
    expect(fake.calls.add).toBe(0);
    expect((await load(id)).mews_lock_until).toBe(theirs); // released by compare-and-set only
  });
});

describe("Mews: rate restrictions", () => {
  it("voids at once when reservations/add is refused by a restriction although units are free", async () => {
    await makeMewsHotel();
    const id = await booking("pending");
    fake.failAdd = "403-restriction";

    await autoConfirm(chain, db, id);

    expect(fake.free.get(MEWS_DOUBLE)).toBe(3);
    expect(chainState.sent).toEqual(["void"]);
    expect((await load(id)).status).toBe("voided");
    const conflict = (await events(id, "sync_conflict"))[0]?.data as { mews: { refusal?: string } };
    expect(conflict.mews.refusal).toContain("restriction");
  });

  it("with a customer from an earlier attempt, no room voids only after the grace period", async () => {
    await makeMewsHotel();
    const id = await booking("pending", { mews_customer_id: "cust-lost", mews_customer_at: wall() - MEWS_CUSTOMER_GRACE_SECS });
    fake.free.set(MEWS_DOUBLE, 0);
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual(["void"]);
  });
});

describe("iCal and manual hotels", () => {
  it("never talk to Mews on confirm or cancel", async () => {
    const id = await booking("pending");
    await autoConfirm(chain, db, id);
    expect(chainState.sent).toEqual(["confirm"]);
    (chainState.account as { status: string }).status = "cancelled";
    await syncFromChain(chain, db, await load(id));

    await db.update(hotels).set({ confirm_mode: "manual" }).where(eq(hotels.id, s.hotelId));
    const other = await insertBooking(db, s, { roomId: s.units.D2, roomTypeId: s.double, checkin: "2026-10-22", checkout: "2026-10-24", status: "pending", guestWallet: GUEST });
    chainState.account = account(await load(other), "pending");
    await autoConfirm(chain, db, other);

    expect(mews.asked).toBe(0);
    expect(fake.calls).toEqual({ setup: 0, availability: 0, customers: 0, add: 0, lookups: 0, cancel: 0 });
    expect((await load(other)).status).toBe("pending");
  });
});
