import "server-only";
import { ApiError } from "../api/errors";
import type { Chain } from "./context";

/** 0.05 SOL: below this the demo stops spending operator SOL on new bookings and faucet mints. */
export const MIN_OPERATOR_LAMPORTS = 50_000_000n;
const CACHE_MS = 30_000;

const cache = new WeakMap<object, { at: number; address: string; lamports: bigint }>();

/** The operator's balance, read at most every 30 s per RPC client. */
async function operatorLamports(c: Pick<Chain, "rpc" | "operator">, nowMs: number): Promise<bigint> {
  const hit = cache.get(c.rpc);
  if (hit && hit.address === c.operator.address && nowMs - hit.at < CACHE_MS) return hit.lamports;
  const { value } = await c.rpc.getBalance(c.operator.address, { commitment: "confirmed" }).send();
  const lamports = BigInt(value);
  cache.set(c.rpc, { at: nowMs, address: c.operator.address, lamports });
  return lamports;
}

/**
 * Demo guard (security.md: operator SOL drain): 503 OPERATOR_LOW_BALANCE when the operator holds
 * less than `MIN_OPERATOR_LAMPORTS`. An unreadable balance does not block: the transaction that
 * follows needs the same RPC and fails on its own.
 */
export async function assertOperatorBalance(c: Pick<Chain, "rpc" | "operator">, nowMs: number = Date.now()): Promise<void> {
  let lamports: bigint;
  try {
    lamports = await operatorLamports(c, nowMs);
  } catch {
    return;
  }
  if (lamports < MIN_OPERATOR_LAMPORTS) {
    throw new ApiError(503, "OPERATOR_LOW_BALANCE", "The demo has run low on network fees; please try again later");
  }
}
