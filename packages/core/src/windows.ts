/**
 * The six cancellation windows (pricing-and-risk-model.md §1), k = 0 earliest.
 * Window k covers lower_k ≤ d < upper_k days before check-in; window 0's upper bound is L.
 */
export const WINDOW_COUNT = 6;
export const WINDOW_LOWER_DAYS: readonly number[] = [30, 14, 7, 3, 1, 0];
const WINDOW_UPPER_DAYS: readonly number[] = [Infinity, 30, 14, 7, 3, 1];

export const WINDOW_LABELS: readonly string[] = [
  "30+ days",
  "14–30 days",
  "7–14 days",
  "3–7 days",
  "1–3 days",
  "last day",
];

/** Window k is reachable iff L ≥ lower_days[k]. */
export function isReachable(leadTime: number, k: number): boolean {
  return leadTime >= WINDOW_LOWER_DAYS[k]!;
}

export function reachableWindows(leadTime: number): boolean[] {
  return WINDOW_LOWER_DAYS.map((lower) => leadTime >= lower);
}

/** e_k = max(0, min(L, upper_k) − lower_k) days. */
export function exposureDays(leadTime: number, k: number): number {
  return Math.max(0, Math.min(leadTime, WINDOW_UPPER_DAYS[k]!) - WINDOW_LOWER_DAYS[k]!);
}
