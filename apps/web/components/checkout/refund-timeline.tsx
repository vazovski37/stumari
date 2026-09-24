import type { Tier } from "@stumari/core";
import { formatHotelTime, refundLabel, refundSteps } from "@/lib/bookings/terms";

/** Refund level → one hue, light to dark (magnitude), always paired with a text label. */
function tone(refundBps: number): string {
  if (refundBps >= 10_000) return "bg-vine";
  if (refundBps > 0) return "bg-vine/45";
  return "bg-line";
}

/**
 * The refund schedule from now until check-in: a proportional bar plus one labelled line per
 * step still ahead. Steps already in the past are dropped.
 */
export function RefundTimeline({
  tiers,
  checkinTs,
  now,
  timeZone,
  label,
}: {
  tiers: readonly Tier[];
  checkinTs: number;
  now: number;
  timeZone: string;
  label: string;
}) {
  const steps = refundSteps(tiers, checkinTs)
    .map((s) => ({ ...s, from: Math.max(s.from ?? now, now) }))
    .filter((s) => s.until > s.from);
  const short = (ts: number) => formatHotelTime(ts, timeZone).replace(/ \d{4},/, ",");

  if (steps.length === 0) return null;
  return (
    <figure aria-label={label} className="space-y-2">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {steps.map((s) => (
          <span
            key={s.until}
            className={`${tone(s.refund_bps)} first:rounded-l-full last:rounded-r-full`}
            style={{ flexGrow: s.until - s.from, flexBasis: 0, minWidth: "0.5rem" }}
          />
        ))}
      </div>
      <ol className="space-y-1 text-xs text-ink-soft">
        {steps.map((s, i) => (
          <li key={s.until} className="flex items-baseline gap-2">
            <span aria-hidden="true" className={`size-2 shrink-0 translate-y-[-1px] rounded-full ${tone(s.refund_bps)}`} />
            <span>
              {i === steps.length - 1 ? "Until check-in" : `Until ${short(s.until)}`}:{" "}
              <span className="font-medium text-ink">{refundLabel(s.refund_bps)}</span>
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">
        {label}: {steps.map((s) => `${refundLabel(s.refund_bps)} until ${formatHotelTime(s.until, timeZone)}`).join("; ")}.
      </figcaption>
    </figure>
  );
}
