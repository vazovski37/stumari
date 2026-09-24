import { localDate } from "@stumari/core";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { blocks, bookings, hotels, rooms, roomTypes } from "../db/schema";
import { OCCUPYING_STATUSES } from "./occupancy";

export interface FeedEvent {
  uid: string;
  start_date: string;
  end_date: string;
  summary: string;
}

const compactDate = (date: string) => date.replaceAll("-", "");

function utcStamp(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1: lines longer than 75 octets continue on lines starting with a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + ch, "utf8") > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The export calendar (inventory-ical.md "Export"): all-day events, no guest data. */
export function buildIcalFeed(events: FeedEvent[], now: number): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stumari//Booking Feed//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(e.start_date)}`,
      `DTEND;VALUE=DATE:${compactDate(e.end_date)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/**
 * Events for one unit's export feed: bookings that occupy it (excluding `awaiting_signature`) and
 * manual blocks, whose last night is today or later in the hotel's timezone. Null for an unknown token.
 */
export async function loadFeedEvents(db: Db, exportToken: string, now: number): Promise<FeedEvent[] | null> {
  const [unit] = await db
    .select({ id: rooms.id, timezone: hotels.timezone })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
    .innerJoin(hotels, eq(hotels.id, roomTypes.hotel_id))
    .where(eq(rooms.export_token, exportToken));
  if (!unit) return null;
  const today = localDate(now, unit.timezone);

  const booked = await db
    .select({ id: bookings.id, start_date: bookings.checkin_date, end_date: bookings.checkout_date })
    .from(bookings)
    .where(
      and(
        eq(bookings.room_id, unit.id),
        gt(bookings.checkout_date, today),
        inArray(bookings.status, [...OCCUPYING_STATUSES]),
      ),
    )
    .orderBy(bookings.checkin_date);
  const manual = await db
    .select({ id: blocks.id, start_date: blocks.start_date, end_date: blocks.end_date })
    .from(blocks)
    .where(and(eq(blocks.room_id, unit.id), eq(blocks.source, "manual"), gt(blocks.end_date, today)))
    .orderBy(blocks.start_date);

  return [
    ...booked.map((b) => ({ uid: `${b.id}@stumari`, start_date: b.start_date, end_date: b.end_date, summary: "Stumari booking" })),
    ...manual.map((b) => ({ uid: `block-${b.id}@stumari`, start_date: b.start_date, end_date: b.end_date, summary: "Blocked" })),
  ];
}
