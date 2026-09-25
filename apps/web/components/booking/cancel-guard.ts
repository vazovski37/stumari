/**
 * The guest confirmed a cancel for the refund on the page; the server then builds the cancel with
 * its own `min_refund` (tiers at chain now + 90 s). If that is lower, a refund step passed in
 * between: the page must show the new amount and ask again instead of submitting.
 * Returns the lower amount to show, or null when the built transaction keeps the promise.
 */
export function refundDroppedTo(shownMinor: string | null, builtMinor: string | undefined): string | null {
  if (shownMinor === null || builtMinor === undefined) return null;
  return BigInt(builtMinor) < BigInt(shownMinor) ? builtMinor : null;
}
