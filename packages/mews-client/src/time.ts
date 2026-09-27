/**
 * Stumari dates (YYYY-MM-DD in the property timezone) ⇄ Mews UTC timestamps.
 *
 * Mews books "Day" services in time units that start at local midnight of the enterprise's
 * timezone (`configuration/get` → `Enterprise.TimeZoneIdentifier`, IANA):
 *
 * - availability/pricing intervals take the UTC instant of a time unit's start, i.e. local 00:00
 *   of that date converted to UTC ("UTC timestamps must correspond to the start boundary of a
 *   time unit"); a stay from `checkin` to `checkout` covers the time units `checkin` …
 *   `checkout - 1 day` (one per night);
 * - a reservation's `StartUtc` = local 00:00 of `checkin` + the service's `StartOffset` and its
 *   `EndUtc` = local 00:00 of `checkout` (the end of the last night's time unit) + `EndOffset`
 *   (e.g. offsets `P0M0DT15H0M0S` / `P0M0DT12H0M0S` → check-in 15:00, check-out 12:00 local).
 *
 * Local wall-clock times are converted with Intl only (no tz database dependency), the same
 * two-pass method as `@stumari/core` `checkinTs`. Tbilisi has no DST; for DST zones a wall time
 * inside a spring-forward gap resolves to the later offset.
 */
import { MewsError } from "./errors";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SECS_PER_DAY = 86_400;

/** Days since 1970-01-01 of a `YYYY-MM-DD` date; throws on malformed or impossible dates. */
export function dayNumber(date: string): number {
  const m = DATE.exec(date);
  if (!m) throw new MewsError("input", "", `not a YYYY-MM-DD date: ${JSON.stringify(date)}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = ms / 86_400_000;
  if (dateFromDayNumber(day) !== date) throw new MewsError("input", "", `not a real date: ${date}`);
  return day;
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

export function nightsBetween(checkin: string, checkout: string): number {
  return dayNumber(checkout) - dayNumber(checkin);
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
      throw new MewsError("input", "", `unknown IANA timezone: ${JSON.stringify(tz)}`);
    }
    formatters.set(tz, f);
  }
  return f;
}

/** The wall-clock time in `tz` at `unixSecs`, read as if it were UTC (unix seconds). */
function wallClockAsUtc(unixSecs: number, tz: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(unixSecs * 1000))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return (
    Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) / 1000
  );
}

/** Unix seconds of local wall time `date` + `secsIntoDay` in `tz` (secsIntoDay may exceed a day or be negative). */
export function zonedTimeToUnix(date: string, secsIntoDay: number, tz: string): number {
  const local = dayNumber(date) * SECS_PER_DAY + secsIntoDay;
  const first = local - (wallClockAsUtc(local, tz) - local);
  return local - (wallClockAsUtc(first, tz) - first);
}

/** Local `YYYY-MM-DD` in `tz` at `unixSecs`. */
export function localDate(unixSecs: number, tz: string): string {
  return dateFromDayNumber(Math.floor(wallClockAsUtc(unixSecs, tz) / SECS_PER_DAY));
}

export function unixToIso(unixSecs: number): string {
  return new Date(unixSecs * 1000).toISOString().replace(".000Z", "Z");
}

export function isoToUnix(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new MewsError("input", "", `not an ISO 8601 timestamp: ${JSON.stringify(iso)}`);
  return Math.floor(ms / 1000);
}

/** UTC start (ISO) of the Day time unit for local `date` in `tz`, i.e. local 00:00. */
export function timeUnitStartUtc(date: string, tz: string): string {
  return unixToIso(zonedTimeToUnix(date, 0, tz));
}

const DURATION =
  /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Seconds in an ISO 8601 duration as Mews writes service offsets (`P0M0DT15H0M0S`). Years and
 * months must be zero (a day-service offset never spans months).
 */
export function durationSeconds(iso: string): number {
  const m = DURATION.exec(iso);
  if (!m || iso === "P" || iso.endsWith("T")) {
    throw new MewsError("input", "", `not an ISO 8601 duration: ${JSON.stringify(iso)}`);
  }
  const n = (i: number) => (m[i] === undefined ? 0 : Number(m[i]));
  if (n(2) !== 0 || n(3) !== 0) throw new MewsError("input", "", `duration with years/months: ${iso}`);
  const secs = ((n(4) * 7 + n(5)) * 24 + n(6)) * 3600 + n(7) * 60 + n(8);
  return m[1] ? -secs : secs;
}

export interface StayOffsets {
  /** ISO 8601 duration from local midnight of the check-in date (service `StartOffset`). */
  startOffset: string;
  /** ISO 8601 duration from local midnight of the check-out date (service `EndOffset`). */
  endOffset: string;
}

/** `StartUtc` / `EndUtc` of a stay for `reservations/add` and `reservations/price`. */
export function stayUtc(
  checkin: string,
  checkout: string,
  tz: string,
  offsets: StayOffsets,
): { startUtc: string; endUtc: string } {
  const nights = nightsBetween(checkin, checkout);
  if (nights < 1) throw new MewsError("input", "", `checkout ${checkout} must be after checkin ${checkin}`);
  const start = zonedTimeToUnix(checkin, durationSeconds(offsets.startOffset), tz);
  const end = zonedTimeToUnix(checkout, durationSeconds(offsets.endOffset), tz);
  if (end <= start) throw new MewsError("input", "", "stay ends before it starts (check service offsets)");
  return { startUtc: unixToIso(start), endUtc: unixToIso(end) };
}
