import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedHotel, T0, tempDb } from "@/test/db";
import type { Db } from "../db/client";
import { bookingEvents } from "../db/schema";
import { hotelOverview, listOperatorBookings } from "../dashboard/bookings";
import { createHotel, listHotels } from "./hotels";

let db: Db;
let close: () => void;
beforeEach(async () => ({ db, close } = await tempDb()));
afterEach(() => close());

describe("admin and dashboard lists (correlated subqueries)", () => {
  it("counts each hotel's own room types and units", async () => {
    await seedHotel(db, "seeded");
    await createHotel(db, { name: "Empty Draft" }, T0);
    const rows = await listHotels(db);
    expect(rows.map((h) => [h.slug, h.room_type_count, h.unit_count])).toEqual([
      ["empty-draft", 0, 0],
      ["seeded", 2, 3],
    ]);
  });

  it("flags only the booking with a sync_conflict event, and the overview lists it", async () => {
    const s = await seedHotel(db);
    const stay = { roomTypeId: s.double, checkin: "2026-10-20", checkout: "2026-10-22", status: "pending" as const };
    const clash = await insertBooking(db, s, { ...stay, roomId: s.units.D1 });
    await insertBooking(db, s, { ...stay, roomId: s.units.D2 });
    await db.insert(bookingEvents).values({ id: randomUUID(), booking_id: clash, type: "sync_conflict", sig: null, data: {}, created_at: T0 });

    const list = await listOperatorBookings(db, { hotelId: s.hotelId });
    expect(list.filter((b) => b.conflict).map((b) => b.id)).toEqual([clash]);
    const overview = await hotelOverview(db, { id: s.hotelId, timezone: "Asia/Tbilisi" }, T0);
    expect(overview.conflicts.map((b) => b.id)).toEqual([clash]);
    expect(overview.counts.pending).toBe(2);
    expect(overview.payouts.pending_minor).toBe("260000000");
  });
});
