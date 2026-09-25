import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { assertOperatorBalance, MIN_OPERATOR_LAMPORTS } from "./balance";

/** A chain stub whose RPC answers `getBalance` with the given lamports (or throws). */
function balanceChain(lamports: bigint | (() => never), address = "Operator1111111111111111111111111111111111") {
  const getBalance = vi.fn(() => ({
    send: async () => ({ value: typeof lamports === "function" ? lamports() : lamports }),
  }));
  return { chain: { rpc: { getBalance } as never, operator: { address } as never }, getBalance };
}

const code = (p: Promise<void>) => p.then(() => "OK", (e: unknown) => (e instanceof ApiError ? `${e.status} ${e.code}` : String(e)));

describe("operator low-balance guard", () => {
  it("answers 503 OPERATOR_LOW_BALANCE below 0.05 SOL", async () => {
    expect(MIN_OPERATOR_LAMPORTS).toBe(50_000_000n);
    expect(await code(assertOperatorBalance(balanceChain(MIN_OPERATOR_LAMPORTS).chain))).toBe("OK");
    expect(await code(assertOperatorBalance(balanceChain(MIN_OPERATOR_LAMPORTS - 1n).chain))).toBe("503 OPERATOR_LOW_BALANCE");
  });

  it("reads the balance at most every 30 s", async () => {
    const { chain, getBalance } = balanceChain(1_000_000_000n);
    const t = 1_000_000;
    await assertOperatorBalance(chain, t);
    await assertOperatorBalance(chain, t + 29_999);
    expect(getBalance).toHaveBeenCalledTimes(1);
    await assertOperatorBalance(chain, t + 30_000);
    expect(getBalance).toHaveBeenCalledTimes(2);
  });

  it("does not block when the balance cannot be read", async () => {
    const { chain } = balanceChain(() => {
      throw new Error("rpc down");
    });
    expect(await code(assertOperatorBalance(chain))).toBe("OK");
  });
});
