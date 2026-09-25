import { randomUUID } from "node:crypto";
import { dayNumber, isCoreError, localDate } from "@stumari/core";
import { and, asc, eq, gt, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../api/errors";
import type { Db } from "../db/client";
import { blocks, hotels, rooms, roomTypes } from "../db/schema";
import { syncUnit, type SyncResult } from "../inventory/ical-sync";
import { serverEnv } from "../env";
import { assertSafeUrl, UnsafeUrlError } from "../inventory/ssrf";

/** iCal import URLs of one unit: https, public host, at most 5, no duplicates (inventory-ical.md). */
export const importUrls = z
  .array(z.string().trim().max(2_000))
  .max(5, { message: "At most 5 calendars per unit" })
  .transform((urls, ctx) => {
    const out: string[] = [];
    for (const raw of urls) {
      if (raw === "") continue;
      try {
        const url = assertSafeUrl(raw, { allowLoopback: serverEnv().icalAllowLoopback }).toString();
        if (!out.includes(url)) out.push(url);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof UnsafeUrlError ? `${e.message}` : "not a valid URL" });
        return z.NEVER;
      }
    }
    return out;
  });

export const icalRequest = z.object({ import_urls: importUrls });

export const exportUrl = (siteUrl: string, token: string) => `${siteUrl}/api/ical/${token}`;

export interface UnitBlock {
  id: string;
  source: "ical" | "manual";
  start_date: string;
  end_date: string;
  summary: string | null;
}

export interface DashboardUnit {
  id: string;
  label: string;
  active: boolean;
  import_urls: string[];
  export_url: string;
  last_synced_at: number | null;
  sync_error: string | null;
  /** Blocks whose last night is today or later (hotel timezone). */
  blocks: UnitBlock[];
}

export interface DashboardRoomType {
  id: string;
  name: string;
  meal: string;
  max_adults: number;
  max_children: number;
  base_rate_minor: string;
  weekend_rate_minor: string | null;
  active: boolean;
  units: DashboardUnit[];
}

/** Room types + units + export URLs + last sync + upcoming blocks (GET …/units). */
export async function hotelUnits(db: Db, hotel: { id: string; timezone: string }, siteUrl: string, now: number): Promise<DashboardRoomType[]> {
  const types = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.hotel_id, hotel.id))
    .orderBy(asc(roomTypes.sort), asc(roomTypes.name));
  if (types.length === 0) return [];
  const units = await db
    .select()
    .from(rooms)
    .where(inArray(rooms.room_type_id, types.map((t) => t.id)))
    .orderBy(asc(rooms.label));
  const today = localDate(now, hotel.timezone);
  const upcoming =
    units.length === 0
      ? []
      : await db
          .select()
          .from(blocks)
          .where(and(inArray(blocks.room_id, units.map((u) => u.id)), gt(blocks.end_date, today)))
          .orderBy(asc(blocks.start_date));

  return types.map((t) => ({
    id: t.id,
    name: t.name,
    meal: t.meal,
    max_adults: t.max_adults,
    max_children: t.max_children,
    base_rate_minor: t.base_rate_minor,
    weekend_rate_minor: t.weekend_rate_minor,
    active: t.active,
    units: units
      .filter((u) => u.room_type_id === t.id)
      .map((u) => ({
        id: u.id,
        label: u.label,
        active: u.active,
        import_urls: u.ical_import_urls,
        export_url: exportUrl(siteUrl, u.export_token),
        last_synced_at: u.last_synced_at,
        sync_error: u.sync_error,
        blocks: upcoming
          .filter((b) => b.room_id === u.id)
          .map((b) => ({ id: b.id, source: b.source, start_date: b.start_date, end_date: b.end_date, summary: b.summary })),
      })),
  }));
}

/** A unit of this hotel, or 404. */
export async function hotelUnit(db: Db, hotelId: string, unitId: string) {
  const [unit] = await db
    .select({ id: rooms.id, ical_import_urls: rooms.ical_import_urls, timezone: hotels.timezone })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
    .innerJoin(hotels, eq(hotels.id, roomTypes.hotel_id))
    .where(and(eq(rooms.id, unitId), eq(hotels.id, hotelId)));
  if (!unit) throw new ApiError(404, "NOT_FOUND", "No such unit");
  return unit;
}

const SYNC_CONCURRENCY = 4;

/** "Sync now": imports every calendar of the hotel's active units, 4 units at a time. */
export async function syncHotel(db: Db, hotel: { id: string; timezone: string }, now: number): Promise<(SyncResult & { label: string })[]> {
  const units = await db
    .select({ id: rooms.id, label: rooms.label, ical_import_urls: rooms.ical_import_urls })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
    .where(and(eq(roomTypes.hotel_id, hotel.id), eq(rooms.active, true)))
    .orderBy(asc(rooms.label));
  const withFeeds = units.filter((u) => u.ical_import_urls.length > 0);
  const results: (SyncResult & { label: string })[] = [];
  for (let i = 0; i < withFeeds.length; i += SYNC_CONCURRENCY) {
    const batch = withFeeds.slice(i, i + SYNC_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(async (u) => ({ ...(await syncUnit(db, u, hotel.timezone, { now })), label: u.label })))));
  }
  return results;
}

/**
 * New import URLs; the unit is marked never-synced so the next sync (or cron) picks it up. Blocks
 * imported from a URL that is no longer listed are removed at once: no sync would ever revisit them.
 */
export async function setImportUrls(db: Db, unitId: string, urls: string[]): Promise<void> {
  const dropped = and(
    eq(blocks.room_id, unitId),
    eq(blocks.source, "ical"),
    urls.length > 0 ? notInArray(blocks.feed_url, urls) : undefined,
  );
  await db.batch([
    db.update(rooms).set({ ical_import_urls: urls, last_synced_at: null, sync_error: null }).where(eq(rooms.id, unitId)),
    db.delete(blocks).where(dropped),
  ]);
}

const MAX_BLOCK_NIGHTS = 366;

const date = z.string().refine(
  (v) => {
    try {
      dayNumber(v);
      return true;
    } catch (e) {
      if (isCoreError(e)) return false;
      throw e;
    }
  },
  { message: "Use a real date (YYYY-MM-DD)" },
);

export const blockRequest = z
  .object({
    start_date: date,
    end_date: date,
    summary: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  })
  .refine((b) => b.end_date > b.start_date, { message: "The end date (exclusive) must be after the start date", path: ["end_date"] })
  .refine((b) => dayNumber(b.end_date) - dayNumber(b.start_date) <= MAX_BLOCK_NIGHTS, {
    message: `A block covers at most ${MAX_BLOCK_NIGHTS} nights`,
    path: ["end_date"],
  });

export async function unitBlocks(db: Db, unitId: string, today: string): Promise<UnitBlock[]> {
  return db
    .select({ id: blocks.id, source: blocks.source, start_date: blocks.start_date, end_date: blocks.end_date, summary: blocks.summary })
    .from(blocks)
    .where(and(eq(blocks.room_id, unitId), gt(blocks.end_date, today)))
    .orderBy(asc(blocks.start_date));
}

export async function addManualBlock(db: Db, unitId: string, input: z.output<typeof blockRequest>, now: number): Promise<UnitBlock> {
  const block = { id: randomUUID(), source: "manual" as const, ...input };
  await db.insert(blocks).values({ ...block, room_id: unitId, feed_url: null, external_uid: null, updated_at: now });
  return block;
}

/** Deletes a manual block (imported blocks come back on the next sync, so they are not deletable). */
export async function deleteManualBlock(db: Db, unitId: string, blockId: string): Promise<void> {
  const block = await db.query.blocks.findFirst({ where: and(eq(blocks.id, blockId), eq(blocks.room_id, unitId)) });
  if (!block) throw new ApiError(404, "NOT_FOUND", "No such block");
  if (block.source !== "manual") {
    throw new ApiError(409, "NOT_MANUAL", "Imported blocks follow the calendar they came from; change them there");
  }
  await db.delete(blocks).where(eq(blocks.id, blockId));
}
