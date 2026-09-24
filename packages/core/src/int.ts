import { CoreError } from "./errors";

const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

/** Timestamps and durations as the program sees them: i64, accepted as bigint or integer number. */
export function toI64(x: bigint | number, what: string): bigint {
  if (typeof x === "number" && !Number.isSafeInteger(x)) {
    throw new CoreError("InvalidInput", `${what} must be a safe integer, got ${x}`);
  }
  const v = BigInt(x);
  if (v < I64_MIN || v > I64_MAX) throw new CoreError("MathOverflow", `${what} ${v} is outside i64`);
  return v;
}

export function assertSafeInt(x: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < min || x > max) {
    throw new CoreError("InvalidInput", `${what} must be an integer in [${min}, ${max}], got ${String(x)}`);
  }
  return x;
}
