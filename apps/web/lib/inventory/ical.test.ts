import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import ical from "node-ical";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertBooking, seedHotel, T0, tempDb, type Seeded } from "@/test/db";
import type { Db } from "../db/client";
import { blocks, rooms } from "../db/schema";
import { buildIcalFeed, loadFeedEvents } from "./ical-export";
import { parseIcalBlocks } from "./ical-parse";
import { syncUnit } from "./ical-sync";

const TZ = "Asia/Tbilisi";
const calendar = (...events: string[][]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

describe("parseIcalBlocks", () => {
  it("reads all-day events with an exclusive DTEND", () => {
    const text = calendar(["UID:a@booking.com", "DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261104", "SUMMARY:CLOSED - Not available"]);
    expect(parseIcalBlocks(text, TZ)).toEqual([
      { uid: "a@booking.com", start_date: "2026-11-01", end_date: "2026-11-04", summary: "CLOSED - Not available" },
    ]);
  });

  it("converts DATE-TIME values to the hotel's dates", () => {
    // 21:30 UTC is 01:30 next day in Tbilisi (UTC+4); DTEND 07:00 UTC is 11:00 local.
    const text = calendar(["UID:b", "DTSTART:20261110T213000Z", "DTEND:20261112T070000Z"]);
    expect(parseIcalBlocks(text, TZ)[0]).toMatchObject({ start_date: "2026-11-11", end_date: "2026-11-12" });
    const berlin = calendar(["UID:c", "DTSTART;TZID=Europe/Berlin:20261201T150000", "DTEND;TZID=Europe/Berlin:20261203T100000"]);
    expect(parseIcalBlocks(berlin, TZ)[0]).toMatchObject({ start_date: "2026-12-01", end_date: "2026-12-03" });
  });

  it("blocks one night for an event without DTEND, ignores cancelled events and our own echoed feed", () => {
    const text = calendar(
      ["UID:d", "DTSTART;VALUE=DATE:20261120"],
      ["UID:e", "DTSTART;VALUE=DATE:20261201", "DTEND;VALUE=DATE:20261205", "STATUS:CANCELLED"],
      ["UID:0123abcd@stumari", "DTSTART;VALUE=DATE:20261210", "DTEND;VALUE=DATE:20261212"],
    );
    expect(parseIcalBlocks(text, TZ)).toEqual([{ uid: "d", start_date: "2026-11-20", end_date: "2026-11-21", summary: null }]);
  });
});

describe("buildIcalFeed", () => {
  const feed = buildIcalFeed(
    [
      { uid: "0123@stumari", start_date: "2026-10-20", end_date: "2026-10-22", summary: "Stumari booking" },
      { uid: "block-1@stumari", start_date: "2026-11-01", end_date: "2026-11-02", summary: "Blocked; staff, only" },
    ],
    T0,
  );

  it("is a CRLF VCALENDAR with the Stumari PRODID and all-day events", () => {
    expect(feed.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Stumari//Booking Feed//EN\r\n")).toBe(true);
    expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(feed).toContain("DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261022\r\n");
    expect(feed).toContain("UID:0123@stumari\r\n");
    expect(feed).toContain("SUMMARY:Blocked\\; staff\\, only\r\n");
    expect(feed.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it("round-trips through an iCal parser (what OTAs import)", () => {
    const events = Object.values(ical.sync.parseICS(feed)).filter((c) => c?.type === "VEVENT");
    expect(events).toHaveLength(2);
    expect(parseIcalBlocks(feed.replaceAll("@stumari", "@ota"), TZ).map((b) => [b.start_date, b.end_date])).toEqual([
      ["2026-10-20", "2026-10-22"],
      ["2026-11-01", "2026-11-02"],
    ]);
  });
});

describe("export feed contents and import sync (DB)", () => {
  let db: Db;
  let s: Seeded;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = await tempDb());
    s = await seedHotel(db);
  });
  afterEach(() => close());

  it("exports occupying bookings (not awaiting_signature or cancelled) and manual blocks, from today on", async () => {
    const unit = { roomId: s.units.D1, roomTypeId: s.double };
    const confirmed = await insertBooking(db, s, { ...unit, checkin: "2026-10-20", checkout: "2026-10-22", status: "confirmed" });
    const pending = await insertBooking(db, s, { ...unit, checkin: "2026-10-25", checkout: "2026-10-26", status: "pending" });
    await insertBooking(db, s, { ...unit, checkin: "2026-10-27", checkout: "2026-10-28", status: "awaiting_signature", quoteExpiresAt: T0 + 9_999 });
    await insertBooking(db, s, { ...unit, checkin: "2026-10-29", checkout: "2026-10-30", status: "cancelled" });
    await insertBooking(db, s, { ...unit, checkin: "2026-09-01", checkout: "2026-09-03", status: "released" }); // in the past
    await db.insert(blocks).values([
      { id: "m1", room_id: s.units.D1, start_date: "2026-11-01", end_date: "2026-11-03", source: "manual", updated_at: T0 },
      { id: "i1", room_id: s.units.D1, start_date: "2026-11-05", end_date: "2026-11-06", source: "ical", feed_url: "https://x.example/a.ics", updated_at: T0 },
    ]);
    const [unitRow] = await db.select().from(rooms).where(eq(rooms.id, s.units.D1));
    const events = await loadFeedEvents(db, unitRow!.export_token, T0);
    expect(events?.map((e) => e.uid)).toEqual([`${confirmed}@stumari`, `${pending}@stumari`, "block-m1@stumari"]);
    expect(await loadFeedEvents(db, "0".repeat(64), T0)).toBeNull();
  });

  it("replaces each feed's blocks, keeps a failing feed's old blocks and drops removed feeds", async () => {
    const feedA = "https://a.example/a.ics";
    const feedB = "https://b.example/b.ics";
    const old = { room_id: s.units.D1, source: "ical" as const, updated_at: T0 };
    await db.insert(blocks).values([
      { ...old, id: randomUUID(), start_date: "2026-10-01", end_date: "2026-10-02", feed_url: feedA },
      { ...old, id: randomUUID(), start_date: "2026-10-05", end_date: "2026-10-06", feed_url: feedB },
      { ...old, id: randomUUID(), start_date: "2026-10-08", end_date: "2026-10-09", feed_url: "https://gone.example/c.ics" },
      { id: randomUUID(), room_id: s.units.D1, start_date: "2026-12-01", end_date: "2026-12-02", source: "manual", updated_at: T0 },
    ]);
    const fetchCalendar = async (url: string) => {
      if (url === feedB) throw new Error("HTTP 503");
      return calendar(["UID:new", "DTSTART;VALUE=DATE:20261015", "DTEND;VALUE=DATE:20261017"]);
    };
    const result = await syncUnit(db, { id: s.units.D1, ical_import_urls: [feedA, feedB] }, TZ, { fetchCalendar, now: T0 + 60 });
    expect(result.errors).toEqual(["b.example: HTTP 503"]);

    const rows = await db.select().from(blocks).where(eq(blocks.room_id, s.units.D1));
    const summary = rows.map((b) => `${b.source}:${b.feed_url ?? "-"}:${b.start_date}`).sort();
    expect(summary).toEqual([
      `ical:${feedA}:2026-10-15`,
      `ical:${feedB}:2026-10-05`,
      "manual:-:2026-12-01",
    ]);
    const [unit] = await db.select().from(rooms).where(eq(rooms.id, s.units.D1));
    expect(unit?.last_synced_at).toBe(T0 + 60);
    expect(unit?.sync_error).toBe("b.example: HTTP 503");
  });
});
