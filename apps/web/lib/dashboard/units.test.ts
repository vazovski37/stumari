import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { blocks } from "../db/schema";
import { listPublicHotels } from "../hotels";
import { setImportUrls } from "./units";

let t: Awaited<ReturnType<typeof tempDb>>;
let db: Db;
let s: Seeded;
beforeEach(async () => {
  t = await tempDb();
  db = t.db;
  s = await seedHotel(db);
});
afterEach(() => t.close());

const AIRBNB = "https://www.airbnb.com/calendar/ical/1.ics";
const BOOKING = "https://admin.booking.com/hotel/ical/2.ics";

async function importedBlock(feedUrl: string) {
  await db.insert(blocks).values({ id: randomUUID(), room_id: s.units.D1, start_date: "2026-10-21", end_date: "2026-10-23", source: "ical", feed_url: feedUrl, updated_at: T0 });
}
const feedsOf = async () => (await db.select().from(blocks).where(eq(blocks.room_id, s.units.D1))).map((b) => b.feed_url ?? b.source);

describe("setImportUrls", () => {
  it("drops the blocks of a feed that is no longer listed, keeps the others and manual blocks", async () => {
    await importedBlock(AIRBNB);
    await importedBlock(BOOKING);
    await db.insert(blocks).values({ id: randomUUID(), room_id: s.units.D1, start_date: "2026-11-01", end_date: "2026-11-02", source: "manual", updated_at: T0 });
    await setImportUrls(db, s.units.D1, [BOOKING]);
    expect((await feedsOf()).sort()).toEqual([BOOKING, "manual"].sort());
  });

  it("removing every feed removes every imported block", async () => {
    await importedBlock(AIRBNB);
    await setImportUrls(db, s.units.D1, []);
    expect(await feedsOf()).toEqual([]);
  });
});

describe("listPublicHotels", () => {
  it("matches the city regardless of case and surrounding spaces", async () => {
    for (const city of ["Tbilisi", "tbilisi", " TBILISI "]) {
      expect((await listPublicHotels(db, city)).map((h) => h.slug)).toEqual(["test-hotel"]);
    }
    expect(await listPublicHotels(db, "Batumi")).toEqual([]);
  });
});
