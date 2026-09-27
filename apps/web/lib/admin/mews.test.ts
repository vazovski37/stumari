import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import { FakeMews, MEWS_DOUBLE, MEWS_RATE, MEWS_SERVICE } from "@/test/fake-mews";
import type { Db } from "../db/client";
import { hotels, roomTypes } from "../db/schema";
import { MEWS_TEST_LIMITS } from "../mews/client";
import { testMewsConnection } from "./mews";

let db: Db;
let s: Seeded;
let close: () => void;
let fake: FakeMews;
beforeEach(async () => {
  ({ db, close } = await tempDb());
  s = await seedHotel(db);
  fake = new FakeMews();
  await db.update(hotels).set({ inventory_provider: "mews", mews_service_id: MEWS_SERVICE, mews_rate_id: MEWS_RATE }).where(eq(hotels.id, s.hotelId));
  await db.update(roomTypes).set({ mews_room_type_id: MEWS_DOUBLE }).where(eq(roomTypes.id, s.double));
});
afterEach(() => close());

const hotel = async () => (await db.query.hotels.findFirst({ where: eq(hotels.id, s.hotelId) }))!;

describe("Test Mews connection", () => {
  it("reports setup, mapping and free units", async () => {
    const report = await testMewsConnection(db, await hotel(), fake, T0);
    expect(report).toMatchObject({ environment: "demo", timezone_matches: true, rate: { found: true } });
    expect(report.room_types.find((r) => r.mews_room_type_id === MEWS_DOUBLE)?.free).toEqual([3, 3, 3, 3, 3, 3, 3]);
  });

  it("answers 502 MEWS_ERROR within its budget when Mews does not answer (never a platform 504)", async () => {
    fake.hang.add("setup");
    const started = Date.now();
    await expect(testMewsConnection(db, await hotel(), fake, T0, 50)).rejects.toMatchObject({ status: 502, code: "MEWS_ERROR" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("uses a short per-call timeout and no retries", () => {
    expect(MEWS_TEST_LIMITS.maxRetries).toBe(0);
    // Four sequential calls at most (configuration, services, the parallel lists, availability) fit the route's 60 s.
    expect(MEWS_TEST_LIMITS.timeoutMs * 4).toBeLessThan(60_000);
  });
});
