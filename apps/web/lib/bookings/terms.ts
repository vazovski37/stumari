import type { Tier } from "@stumari/core";

/** Pure: shared by the booking view (server) and the checkout's refund timeline (browser). */

const formatters = new Map<string, Intl.DateTimeFormat>();

/** "Sat 14 Nov 2026, 14:00" in the hotel's timezone. */
export function formatHotelTime(unixSecs: number, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  // Assembled from parts: ICU versions (server vs browser) differ in punctuation.
  const p = Object.fromEntries(f.formatToParts(new Date(unixSecs * 1000)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
}

export const refundLabel = (refundBps: number) =>
  refundBps === 0 ? "no refund" : `${Number((refundBps / 100).toFixed(2))}% refund`;

/** One step of a refund schedule in absolute time: cancelling in `[from, until)` refunds `refund_bps`. */
export interface RefundStep {
  /** null = from now on. */
  from: number | null;
  until: number;
  refund_bps: number;
}

/** Tiers (secs_before descending, last 0) → absolute steps ending at check-in. */
export function refundSteps(tiers: readonly Tier[], checkinTs: number): RefundStep[] {
  return tiers.map((t, i) => ({
    from: i === 0 ? null : checkinTs - tiers[i - 1]!.secs_before,
    until: checkinTs - t.secs_before,
    refund_bps: t.refund_bps,
  }));
}

export interface TermsInput {
  tiers: readonly Tier[];
  checkinTs: number;
  releaseAfterTs: number | null;
  timeZone: string;
}

/** Plain-language terms (`terms.text` of the public booking view). */
export function termsText({ tiers, checkinTs, releaseAfterTs, timeZone }: TermsInput): string[] {
  const at = (ts: number) => formatHotelTime(ts, timeZone);
  const lines = refundSteps(tiers, checkinTs).map((step, i, steps) => {
    const refund = refundLabel(step.refund_bps);
    if (steps.length === 1) return `Cancel any time before check-in (${at(checkinTs)}): ${refund}.`;
    if (step.from === null) return `Cancel before ${at(step.until)}: ${refund}.`;
    if (i === steps.length - 1) return `Cancel from ${at(step.from)} until check-in (${at(checkinTs)}): ${refund}.`;
    return `Cancel from ${at(step.from)} until ${at(step.until)}: ${refund}.`;
  });
  lines.push("Until the hotel confirms the booking (within 2 hours of payment), cancelling refunds 100%.");
  if (releaseAfterTs !== null) {
    lines.push(
      `After check-in there is no cancellation. If something is wrong, open a dispute before ${at(releaseAfterTs)}; otherwise the payment is released to the hotel then.`,
    );
  }
  lines.push(`Times are the hotel's local time (${timeZone}).`);
  return lines;
}

/** "Sun 11 Oct 2026" for a calendar date (`YYYY-MM-DD`, already in the hotel's timezone). */
export function formatHotelDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return formatHotelTime(Date.UTC(y!, m! - 1, d!) / 1000, "UTC").replace(/, \d\d:\d\d$/, "");
}
