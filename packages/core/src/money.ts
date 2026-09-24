import { CoreError } from "./errors";

/** Money is bigint base units in TS, u64 on-chain, decimal strings in JSON/DB. */
export const U64_MAX = (1n << 64n) - 1n;
export const BPS_DENOM = 10_000;
export const USDC_DECIMALS = 6;

const DECIMAL_U64 = /^(0|[1-9][0-9]*)$/;

export function assertU64(value: bigint, what = "amount"): bigint {
  if (value < 0n || value > U64_MAX) {
    throw new CoreError("InvalidAmount", `${what} ${value} is outside u64`);
  }
  return value;
}

/** Parses a u64 decimal string ("123450000"). No signs, no leading zeros, no decimals. */
export function parseMinor(s: string): bigint {
  if (typeof s !== "string" || !DECIMAL_U64.test(s)) {
    throw new CoreError("InvalidAmount", `not a u64 decimal string: ${JSON.stringify(s)}`);
  }
  return assertU64(BigInt(s));
}

export function formatMinor(value: bigint): string {
  return assertU64(value).toString();
}

/** "123.45" → 123450000n (6 decimals). Rejects more fractional digits than `decimals`. */
export function toMinor(display: string, decimals = USDC_DECIMALS): bigint {
  const m = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(display);
  const whole = m?.[1];
  const frac = m?.[2] ?? "";
  if (whole === undefined || frac.length > decimals) {
    throw new CoreError("InvalidAmount", `not a ${decimals}-decimal amount: ${JSON.stringify(display)}`);
  }
  return assertU64(BigInt(whole + frac.padEnd(decimals, "0")));
}

/** 123450000n → "123.45 USDC"; at least two fraction digits, more only when non-zero. */
export function formatUsdc(minor: bigint, decimals = USDC_DECIMALS): string {
  assertU64(minor);
  const digits = minor.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
  frac = frac.padEnd(Math.min(2, decimals), "0");
  return `${frac ? `${whole}.${frac}` : whole} USDC`;
}

/** floor(value · bps / 10_000) — the program's u128 `mul_bps`. */
export function mulBpsFloor(value: bigint, bps: number): bigint {
  const r = (assertU64(value) * BigInt(bps)) / BigInt(BPS_DENOM);
  if (r > U64_MAX) throw new CoreError("MathOverflow", "mul_bps result exceeds u64");
  return r;
}

/** B · m_bps / 10⁴ rounded **up** to a whole cent (10_000 base units): pricing §5. */
export function priceFromMultiplier(baseMinor: bigint, mBps: number): bigint {
  if (!Number.isSafeInteger(mBps) || mBps < 0) {
    throw new CoreError("InvalidBps", `multiplier bps must be a non-negative integer, got ${mBps}`);
  }
  const price = ((assertU64(baseMinor, "base price") * BigInt(mBps) + 99_999_999n) / 100_000_000n) * 10_000n;
  return assertU64(price, "price");
}
