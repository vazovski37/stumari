/**
 * Text that reaches the model from hotel-controlled fields is stripped of control characters and
 * length-limited (security.md, prompt-injection row). Terms and links are rebuilt by us.
 */
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+", "g");

export function clip(value: string | null | undefined, max: number): string {
  const clean = (value ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** USDC base units (6 decimals, decimal string) → "123.45 USDC". */
export function usdc(minor: string): string {
  const v = BigInt(minor);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${frac} USDC`;
}

/** A human USDC amount (e.g. 120.5) → base units as a decimal string; rejects negatives and NaN. */
export function usdcToMinor(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new RangeError("amount out of range");
  return (BigInt(Math.round(amount * 100)) * 10_000n).toString();
}
