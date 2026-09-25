import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, insertQuote, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { ApiError } from "../api/errors";
import { createDb, type Db } from "../db/client";
import { blocks, quotes } from "../db/schema";
import { freeUnitCounts, freeUnits, hasConflicts, unitConflicts } from "./availability";
import { insertQuoteHold, MAX_HOLDS_PER_IP, type QuoteHoldRow } from "./holds";
import { CREATE_GRACE_SECS } from "./occupancy";

const stay = { checkin: "2026-10-20", checkout: "2026-10-22" };
const now = T0;

let db: Db;
let s: Seeded;
let close: () => void;
let path: string;

beforeEach(async () => {
  ({ db, close, path } = await tempDb());
  s = await seedHotel(db);
});
afterEach(() => close());

const labels = async (clientId = "me", at = now) => (await freeUnits(db, s.double, stay, at, clientId)).map((u) => u.label);

function holdRow(clientId: string, roomTypeId = s.double, dates = stay): QuoteHoldRow {
  const id = randomUUID();
  return {
    id,
    hotel_id: s.hotelId,
    room_type_id: roomTypeId,
    checkin_date: dates.checkin,
    checkout_date: dates.checkout,
    body: { id },
    signature: "sig",
    hash: "hash",
    explain: {},
    booking_id: id.replaceAll("-", ""),
    buyer_type: "guest",
    buyer_wallet: null,
    client_id: clientId,
    ip_hash: null,
    expires_at: now + 600,
    created_at: now,
  };
}

describe("availability rule (data-model.md)", () => {
  it("offers free units lowest label first", async () => {
    expect(await labels()).toEqual(["D1", "D2"]);
    expect(await freeUnitCounts(db, s.hotelId, stay, now, "me")).toEqual(
      new Map([
        [s.double, 2],
        [s.twin, 1],
      ]),
    );
  });

  it("excludes units with a block on any night of the stay; checkout day and adjacent stays are free", async () => {
    const block = (start: string, end: string) => ({
      id: randomUUID(),
      room_id: s.units.D1,
      start_date: start,
      end_date: end,
      source: "manual" as const,
      updated_at: now,
    });
    await db.insert(blocks).values(block("2026-10-22", "2026-10-25")); // starts on checkout day
    await db.insert(blocks).values(block("2026-10-15", "2026-10-20")); // ends on checkin day
    expect(await labels()).toEqual(["D1", "D2"]);
    await db.insert(blocks).values(block("2026-10-21", "2026-10-22")); // the last night
    expect(await labels()).toEqual(["D2"]);
  });

  it("counts occupying bookings; cancelled, voided and failed free their nights", async () => {
    for (const status of ["cancelled", "voided", "failed"] as const) {
      await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status });
    }
    expect(await labels()).toEqual(["D1", "D2"]);
    for (const status of ["pending", "confirmed", "disputed", "released", "resolved"] as const) {
      const other = await tempDb();
      const seeded = await seedHotel(other.db);
      await insertBooking(other.db, seeded, { roomId: seeded.units.D1, roomTypeId: seeded.double, ...stay, status });
      const free = await freeUnits(other.db, seeded.double, stay, now, "me");
      expect(free.map((u) => u.label), status).toEqual(["D2"]);
      other.close();
    }
  });

  it("counts awaiting_signature bookings until their create can no longer land (quote expiry + grace)", async () => {
    await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "awaiting_signature", quoteExpiresAt: now + 300 });
    expect(await labels("me", now)).toEqual(["D2"]);
    expect(await labels("me", now + 300 + CREATE_GRACE_SECS - 1)).toEqual(["D2"]);
    expect(await labels("me", now + 300 + CREATE_GRACE_SECS)).toEqual(["D1", "D2"]);
  });

  it("counts other clients' active unexpired holds, never the caller's own", async () => {
    await insertQuote(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, clientId: "other", expiresAt: now + 600 });
    await insertQuote(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...stay, clientId: "me", expiresAt: now + 600 });
    expect(await labels("me")).toEqual(["D2"]);
    expect(await labels("other")).toEqual(["D1"]);
    expect(await labels("third")).toEqual([]);
    expect(await labels("third", now + 600)).toEqual(["D1", "D2"]);
  });

  it("ignores expired and used quotes as holds", async () => {
    await insertQuote(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, clientId: "other", expiresAt: now + 600, status: "expired" });
    await insertQuote(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...stay, clientId: "other", expiresAt: now + 600, status: "used" });
    expect(await labels()).toEqual(["D1", "D2"]);
  });
});

describe("quote holds", () => {
  it("holds the lowest free unit and expires the client's other active quotes", async () => {
    const first = holdRow("me");
    expect(await insertQuoteHold(db, first)).toBe(s.units.D1);
    // The same client may re-quote the same dates: its own hold does not block it.
    const second = holdRow("me");
    expect(await insertQuoteHold(db, second)).toBe(s.units.D1);
    const rows = await db.select().from(quotes);
    expect(rows.find((q) => q.id === first.id)?.status).toBe("expired");
    expect(rows.find((q) => q.id === second.id)?.status).toBe("active");
  });

  it("keeps the client's existing hold when the new request finds nothing free", async () => {
    const mine = holdRow("me", s.twin);
    expect(await insertQuoteHold(db, mine)).toBe(s.units.T1);
    await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "confirmed" });
    await insertBooking(db, s, { roomId: s.units.D2, roomTypeId: s.double, ...stay, status: "confirmed" });
    expect(await insertQuoteHold(db, holdRow("me"))).toBeNull();
    const [row] = await db.select().from(quotes).where(eq(quotes.id, mine.id));
    expect(row?.status).toBe("active");
  });

  it("caps one IP at MAX_HOLDS_PER_IP holds across hold owners (fresh cookies, agent wallets)", async () => {
    const fromIp = (clientId: string, ip: string | null, roomTypeId = s.double, at = now) => ({
      ...holdRow(clientId, roomTypeId),
      ip_hash: ip,
      created_at: at,
      expires_at: at + 600,
    });
    expect(MAX_HOLDS_PER_IP).toBe(2);
    expect(await insertQuoteHold(db, fromIp("a", "ip-1"))).toBe(s.units.D1);
    expect(await insertQuoteHold(db, fromIp("b", "ip-1"))).toBe(s.units.D2);

    // A third owner from the same IP is refused although the Twin unit is free…
    const refused = await insertQuoteHold(db, fromIp("c", "ip-1", s.twin)).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ status: 429, code: "HOLD_LIMIT" });
    expect(new Headers((refused as ApiError).extra?.headers).get("retry-after")).toBe("600");
    expect(await db.select().from(quotes).where(eq(quotes.client_id, "c"))).toEqual([]);

    // …while another IP (or a request without one) still gets it.
    expect(await insertQuoteHold(db, fromIp("d", "ip-2", s.twin))).toBe(s.units.T1);

    // An owner's own active quote does not count: the same batch expires it.
    expect(await insertQuoteHold(db, fromIp("a", "ip-1"))).toBe(s.units.D1);
    const active = await db.select().from(quotes).where(eq(quotes.status, "active"));
    expect(active.filter((q) => q.ip_hash === "ip-1")).toHaveLength(2);

    // Expired holds free the IP's slots.
    expect(await insertQuoteHold(db, fromIp("c", "ip-1", s.double, now + 600))).toBe(s.units.D1);
  });

  it("answers null (not HOLD_LIMIT) when the IP is under the cap but nothing is free", async () => {
    await insertBooking(db, s, { roomId: s.units.T1, roomTypeId: s.twin, ...stay, status: "confirmed" });
    expect(await insertQuoteHold(db, { ...holdRow("a", s.twin), ip_hash: "ip-1" })).toBeNull();
  });

  it("never double-holds a unit under concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => insertQuoteHold(db, holdRow(`client-${i}`))));
    const held = results.filter((r): r is string => r !== null);
    expect(held.sort()).toEqual([s.units.D1, s.units.D2].sort());
    const active = await db.select().from(quotes).where(eq(quotes.status, "active"));
    expect(active).toHaveLength(2);
  });

  it("never double-holds across separate connections to the same file", async () => {
    const others = Array.from({ length: 3 }, () => createDb(`file:${path}`));
    try {
      const clients = [db, ...others];
      const results = await Promise.all(
        Array.from({ length: 16 }, (_, i) => insertQuoteHold(clients[i % clients.length]!, holdRow(`client-${i}`))),
      );
      const held = results.filter((r): r is string => r !== null);
      expect(held.sort()).toEqual([s.units.D1, s.units.D2].sort());
    } finally {
      for (const o of others) o.$client.close();
    }
  });
});

describe("unit conflicts (confirm and /pay checks)", () => {
  it("reports blocks and other occupying bookings, optionally only earlier ones", async () => {
    const mine = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "pending", createdAt: now + 10 });
    const base = { roomId: s.units.D1, stay, now, bookingId: mine };
    expect(hasConflicts(await unitConflicts(db, base))).toBe(false);

    const later = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "pending", createdAt: now + 20 });
    expect((await unitConflicts(db, base)).bookings).toEqual([later]);
    expect(hasConflicts(await unitConflicts(db, { ...base, createdBefore: { createdAt: now + 10 } }))).toBe(false);

    const earlier = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "confirmed", createdAt: now });
    expect((await unitConflicts(db, { ...base, createdBefore: { createdAt: now + 10 } })).bookings).toEqual([earlier]);

    await db.insert(blocks).values({ id: randomUUID(), room_id: s.units.D1, start_date: "2026-10-21", end_date: "2026-10-23", source: "ical", updated_at: now });
    expect((await unitConflicts(db, base)).blocks).toHaveLength(1);
  });

  it("always counts a confirmed booking, even one created (or first seen) after the booking being confirmed", async () => {
    // A's create landed unseen; meanwhile B was quoted, paid and confirmed on the same unit.
    const a = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "pending", createdAt: now });
    const b = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, ...stay, status: "confirmed", createdAt: now + 900 });
    const conflicts = await unitConflicts(db, { roomId: s.units.D1, stay, now: now + 1_000, bookingId: a, createdBefore: { createdAt: now } });
    expect(conflicts.bookings).toEqual([b]);
  });
});
