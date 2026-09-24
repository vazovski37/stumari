/** USDC has 6 decimals: 1 USDC = 1,000,000 base units. */
export const USDC_DECIMALS = 6;
const UNIT = 10n ** BigInt(USDC_DECIMALS);

/** Formats base units as a USDC amount with two decimals, rounding toward zero ("104.73"). */
export function formatUsdc(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const abs = minor < 0n ? -minor : minor;
  const whole = (abs / UNIT).toLocaleString("en-US");
  const cents = ((abs % UNIT) / 10n ** BigInt(USDC_DECIMALS - 2)).toString().padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

/** Signed percentage change from `base` to `value`, two decimals, typographic minus ("+4.73%", "−4.11%"). */
export function formatChange(value: bigint, base: bigint): string {
  const bps = ((value - base) * 10_000n) / base;
  if (bps === 0n) return "0%";
  const abs = bps < 0n ? -bps : bps;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
  return bps < 0n ? `−${text}` : `+${text}`;
}
