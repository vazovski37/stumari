import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { bookings } from "../db/schema";
import { hotelOverview } from "./bookings";

let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
});
afterEach(() => t.close());

async function settled(status: "released" | "resolved" | "cancelled", hotelMinor: string, checkin: string, checkout: string) {
  const id = await insertBooking(db, s, { roomId: s.units.D1, roomTypeId: s.double, checkin, checkout, status });
  await db.update(bookings).set({ hotel_minor: hotelMinor }).where(eq(bookings.id, id));
}

describe("hotelOverview payouts", () => {
  it("counts the hotel's share of cancellations as paid out, next to released and resolved stays", async () => {
    await settled("released", "130000000", "2026-10-01", "2026-10-02");
    await settled("resolved", "97500000", "2026-10-03", "2026-10-04");
    await settled("cancelled", "65000000", "2026-10-05", "2026-10-06");
    const overview = await hotelOverview(db, { id: s.hotelId, timezone: "Asia/Tbilisi" }, T0);
    expect(overview.payouts.released_minor).toBe("292500000");
  });
});
