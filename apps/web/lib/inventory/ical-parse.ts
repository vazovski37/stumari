import { addDays, localDate } from "@stumari/core";
import ical from "node-ical";

/** A night range blocked by an imported calendar event (`end_date` exclusive). */
export interface ImportedBlock {
  uid: string | null;
  start_date: string;
  end_date: string;
  summary: string | null;
}

/** OTA feeds are small; a runaway feed is cut here rather than stored. */
const MAX_EVENTS = 2_000;
const MAX_SUMMARY = 120;
/** Our own export feed's UIDs (echoed back by OTAs that re-export imported calendars). */
const OWN_UID = /@stumari$/i;

type DateWithFlag = Date & { dateOnly?: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

/** node-ical gives a string, or `{ params, val }` when the property has parameters. */
function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { val?: unknown }).val === "string") {
    return (value as { val: string }).val;
  }
  return null;
}

/** DATE values are local midnight of the server; DATE-TIME values go to the hotel's timezone. */
function toDate(value: DateWithFlag, timeZone: string): string {
  if (value.dateOnly) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return localDate(Math.floor(value.getTime() / 1000), timeZone);
}

/**
 * VEVENTs → blocked night ranges (inventory-ical.md "Import"): DATE-TIME truncated to the hotel's
 * dates, DTEND exclusive, an event without an end (or ending on its start date) blocks one night,
 * `STATUS:CANCELLED` is ignored.
 */
export function parseIcalBlocks(text: string, timeZone: string): ImportedBlock[] {
  const parsed = ical.sync.parseICS(text);
  const blocks: ImportedBlock[] = [];
  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    if (String(component.status ?? "").toUpperCase() === "CANCELLED") continue;
    const uid = textValue(component.uid);
    if (uid && OWN_UID.test(uid)) continue;
    const start = component.start as DateWithFlag | undefined;
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) continue;
    const startDate = toDate(start, timeZone);
    const end = component.end as DateWithFlag | undefined;
    let endDate = end instanceof Date && !Number.isNaN(end.getTime()) ? toDate(end, timeZone) : startDate;
    if (endDate <= startDate) endDate = addDays(startDate, 1);
    const summary = textValue(component.summary)?.slice(0, MAX_SUMMARY) ?? null;
    blocks.push({ uid, start_date: startDate, end_date: endDate, summary });
    if (blocks.length >= MAX_EVENTS) break;
  }
  return blocks;
}
