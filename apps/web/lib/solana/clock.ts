import "server-only";
import { fetchEncodedAccount, type Address } from "@solana/kit";
import type { SolanaRpc } from "./context";

const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;
const CACHE_MS = 2_000;

let cached: { at: number; offset: number } | undefined;

/**
 * `Clock.unix_timestamp`: the time the program checks deadlines against. It equals wall time on
 * devnet but runs ahead on a surfnet after time travel, so cranks, cancel refunds and the
 * `can_*` flags use it. Falls back to wall time if the sysvar cannot be read.
 */
export async function chainNow(rpc: SolanaRpc): Promise<number> {
  const wall = Date.now();
  if (cached && wall - cached.at < CACHE_MS) return Math.floor(wall / 1000) + cached.offset;
  try {
    const clock = await fetchEncodedAccount(rpc, CLOCK_SYSVAR, { commitment: "confirmed" });
    if (!clock.exists) throw new Error("Clock sysvar missing");
    const unix = Number(new DataView(clock.data.buffer, clock.data.byteOffset).getBigInt64(32, true));
    cached = { at: wall, offset: unix - Math.floor(wall / 1000) };
    return unix;
  } catch {
    return Math.floor(wall / 1000);
  }
}
