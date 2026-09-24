import { formatUsdc, parseMinor, type Tier } from "@stumari/core";

/**
 * Free text that came from the API (hotel names, error messages) is untrusted: it may carry
 * prompt-injection attempts (security.md). Strip control characters and cap the length before
 * it reaches the model.
 */
export function clip(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** "143000000" → "143.00 USDC". */
export function usdc(minor: string): string {
  return formatUsdc(parseMinor(minor));
}

function duration(secs: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (secs % 86_400 === 0) return plural(secs / 86_400, "day");
  if (secs % 3_600 === 0) return plural(secs / 3_600, "hour");
  return plural(Math.ceil(secs / 60), "minute");
}

/**
 * Plain-language refund schedule. Tiers are strictly descending in `secs_before` and end at 0;
 * a cancellation `s` seconds before check-in gets the first tier with `s ≥ secs_before`.
 */
export function describeTiers(tiers: readonly Tier[]): string {
  if (tiers.every((t) => t.refund_bps === 0)) return "No refund after booking.";
  const pct = (bps: number) => `${bps / 100}%`;
  const parts = tiers.map((t, i) => {
    const refund = i === 0 ? `${pct(t.refund_bps)} refund` : pct(t.refund_bps);
    return t.secs_before === 0
      ? `${i === 0 ? "" : "after that, "}${refund} until check-in`
      : `${refund} if cancelled at least ${duration(t.secs_before)} before check-in`;
  });
  return `${parts.join("; ")}. No cancellation after check-in.`;
}
