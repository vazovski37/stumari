import { randomUUID } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { blocks, hotels, rooms, roomTypes } from "../db/schema";
import { parseIcalBlocks } from "./ical-parse";
import { fetchPublicText } from "./ssrf";

export type FetchCalendar = (url: string) => Promise<string>;

export interface SyncResult {
  roomId: string;
  feeds: number;
  errors: string[];
}

/** On-demand sync before building a payment is skipped when the unit synced this recently. */
export const PAY_SYNC_MAX_AGE_SECS = 120;
/** The sync cron refreshes units older than this. */
export const CRON_SYNC_MAX_AGE_SECS = 600;

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Feed URLs can carry private tokens, so errors name only the host. */
function feedHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid URL";
  }
}

/**
 * Imports every calendar of one unit. Each feed that loads replaces its own `ical` blocks; a feed
 * that fails keeps its previous blocks; feeds no longer configured lose theirs. All writes, plus
 * `last_synced_at` / `sync_error`, go in one atomic batch.
 */
export async function syncUnit(
  db: Db,
  unit: { id: string; ical_import_urls: string[] },
  timeZone: string,
  { fetchCalendar = (url: string) => fetchPublicText(url), now = Math.floor(Date.now() / 1000) }: { fetchCalendar?: FetchCalendar; now?: number } = {},
): Promise<SyncResult> {
  const urls = unit.ical_import_urls;
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        return { url, blocks: parseIcalBlocks(await fetchCalendar(url), timeZone), error: null };
      } catch (e) {
        return { url, blocks: null, error: `${feedHost(url)}: ${describeError(e)}` };
      }
    }),
  );

  const writes = [];
  const stale = urls.length > 0 ? notInArray(blocks.feed_url, urls) : sql`1 = 1`;
  writes.push(db.delete(blocks).where(and(eq(blocks.room_id, unit.id), eq(blocks.source, "ical"), stale)));
  for (const r of results) {
    if (!r.blocks) continue;
    writes.push(
      db.delete(blocks).where(and(eq(blocks.room_id, unit.id), eq(blocks.source, "ical"), eq(blocks.feed_url, r.url))),
    );
    if (r.blocks.length > 0) {
      writes.push(
        db.insert(blocks).values(
          r.blocks.map((b) => ({
            id: randomUUID(),
            room_id: unit.id,
            start_date: b.start_date,
            end_date: b.end_date,
            source: "ical" as const,
            feed_url: r.url,
            external_uid: b.uid,
            summary: b.summary,
            updated_at: now,
          })),
        ),
      );
    }
  }
  const errors = results.flatMap((r) => (r.error ? [r.error] : []));
  writes.push(
    db
      .update(rooms)
      .set({ last_synced_at: now, sync_error: errors.length > 0 ? errors.join("; ") : null })
      .where(eq(rooms.id, unit.id)),
  );
  const [first, ...rest] = writes;
  await db.batch([first!, ...rest]);
  return { roomId: unit.id, feeds: urls.length, errors };
}

/** Units with import URLs whose last sync is older than `maxAgeSecs` (or that never synced). */
export async function staleUnits(db: Db, maxAgeSecs: number, limit: number, now = Math.floor(Date.now() / 1000)) {
  return db
    .select({ id: rooms.id, ical_import_urls: rooms.ical_import_urls, timezone: hotels.timezone })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
    .innerJoin(hotels, eq(hotels.id, roomTypes.hotel_id))
    .where(
      and(
        eq(rooms.active, true),
        sql`${rooms.ical_import_urls} != '[]'`,
        sql`(${rooms.last_synced_at} IS NULL OR ${rooms.last_synced_at} < ${now - maxAgeSecs})`,
      ),
    )
    .orderBy(sql`${rooms.last_synced_at} IS NOT NULL`, rooms.last_synced_at)
    .limit(limit);
}

/**
 * Syncs one unit unless it has no feeds or synced within `maxAgeSecs`. Never throws: callers
 * proceed with cached blocks and rely on the confirm step (inventory-ical.md).
 */
export async function syncUnitIfStale(
  db: Db,
  roomId: string,
  maxAgeSecs: number,
  options: { fetchCalendar?: FetchCalendar; now?: number } = {},
): Promise<SyncResult | null> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  try {
    const [unit] = await db
      .select({
        id: rooms.id,
        ical_import_urls: rooms.ical_import_urls,
        last_synced_at: rooms.last_synced_at,
        timezone: hotels.timezone,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.room_type_id))
      .innerJoin(hotels, eq(hotels.id, roomTypes.hotel_id))
      .where(eq(rooms.id, roomId));
    if (!unit || unit.ical_import_urls.length === 0) return null;
    if (unit.last_synced_at !== null && unit.last_synced_at > now - maxAgeSecs) return null;
    return await syncUnit(db, unit, unit.timezone, { ...options, now });
  } catch (e) {
    console.error(`iCal sync of unit ${roomId} failed`, e);
    return null;
  }
}
