import { CoreError } from "./errors";
import { assertSafeInt } from "./int";

/** Calendar dates are `YYYY-MM-DD` in the hotel timezone; timestamps are unix seconds. Intl only. */
export const SECS_PER_DAY = 86_400;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = SECS_PER_DAY * 1000;

/** Days since 1970-01-01 of a calendar date (validated, e.g. rejects 2026-02-30). */
export function dayNumber(date: string): number {
  const m = DATE.exec(date);
  const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new CoreError("InvalidInput", `not a YYYY-MM-DD date: ${JSON.stringify(date)}`);
  }
  return ms / MS_PER_DAY;
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + assertSafeInt(days, "days", -1e6, 1e6));
}

/** checkout − checkin in nights (may be ≤ 0; callers validate). */
export function nightsBetween(checkin: string, checkout: string): number {
  return dayNumber(checkout) - dayNumber(checkin);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayMon0(date: string): number {
  return (new Date(dayNumber(date) * MS_PER_DAY).getUTCDay() + 6) % 7;
}

/** 1–12. */
export function monthOf(date: string): number {
  dayNumber(date);
  return Number(date.slice(5, 7));
}

/** Nights whose start date is a Friday or Saturday (matches `room_types.weekend_rate`). */
export function weekendNights(checkin: string, checkout: string): number {
  const start = dayNumber(checkin);
  let count = 0;
  for (let d = start; d < dayNumber(checkout); d++) {
    const dow = (new Date(d * MS_PER_DAY).getUTCDay() + 6) % 7;
    if (dow === 4 || dow === 5) count++;
  }
  return count;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      throw new CoreError("InvalidInput", `unknown IANA timezone: ${JSON.stringify(tz)}`);
    }
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of an instant in `tz`, as if they were UTC (unix seconds). */
function wallClockAsUtc(unixSecs: number, tz: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(unixSecs * 1000))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const { year, month, day, hour, minute, second } = parts as Record<string, number>;
  return Date.UTC(year!, month! - 1, day!, hour!, minute!, second!) / 1000;
}

/** Calendar date of an instant in `tz`. */
export function localDate(unixSecs: number, tz: string): string {
  return new Date(wallClockAsUtc(unixSecs, tz) * 1000).toISOString().slice(0, 10);
}

/**
 * Unix seconds of wall-clock `time` (`HH:MM`) on `date` in `tz` — the check-in / check-out
 * timestamp. Two offset passes settle DST transitions (Asia/Tbilisi has none).
 */
export function checkinTs(date: string, time: string, tz: string): number {
  const t = TIME.exec(time);
  if (!t) throw new CoreError("InvalidInput", `not an HH:MM time: ${JSON.stringify(time)}`);
  const local = dayNumber(date) * SECS_PER_DAY + Number(t[1]) * 3600 + Number(t[2]) * 60;
  const first = local - (wallClockAsUtc(local, tz) - local);
  return local - (wallClockAsUtc(first, tz) - first);
}

/** L = ⌊(checkin_ts − issued_at) / 86400⌋ (pricing §2). */
export function leadTimeDays(issuedAt: number, checkin: number): number {
  assertSafeInt(issuedAt, "issued_at", -Number.MAX_SAFE_INTEGER);
  assertSafeInt(checkin, "checkin_ts", -Number.MAX_SAFE_INTEGER);
  return Math.floor((checkin - issuedAt) / SECS_PER_DAY);
}
